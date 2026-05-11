/**
 * DB-backed pre-signed authorization (preauth) slot store (Phase 4 —
 * replaces in-memory TopupBatchStore from proxy/src/topupBatch.ts).
 *
 * Preauth slots are EIP-3009 TransferWithAuthorization signatures stored
 * up-front so the proxy can auto-deposit when a wallet's balance is
 * insufficient, without requiring a fresh signature mid-session.
 *
 * State machine: available → consumed  (after on-chain deposit succeeds)
 *                available → poisoned  (after on-chain deposit reverts)
 *                available → expired   (after valid_before passes, via sweep)
 */

import { and, eq, lt, lte, asc, sql } from "drizzle-orm";
import type { Address, Hex } from "viem";
import { topupPreauthSlots, type BillingDatabase } from "./schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreauthSlot {
  nonce: Hex;
  amountPton: bigint;
  v: number;
  r: Hex;
  s: Hex;
  validAfter: Date;
  validBefore: Date;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a pre-signed EIP-3009 authorization for a wallet.
 * Duplicate (wallet, nonce) pairs are rejected by the PK constraint.
 */
export async function depositPreauthSlot(
  db: BillingDatabase,
  args: {
    wallet: Address;
    nonce: Hex;
    amountPton: bigint;
    validAfter: Date;
    validBefore: Date;
    v: number;
    r: Hex;
    s: Hex;
  },
): Promise<void> {
  await db.insert(topupPreauthSlots).values({
    wallet: args.wallet.toLowerCase(),
    nonce: args.nonce.toLowerCase(),
    amountPton: args.amountPton,
    validAfter: args.validAfter,
    validBefore: args.validBefore,
    v: args.v,
    r: args.r.toLowerCase(),
    s: args.s.toLowerCase(),
    state: "available",
  });
}

/**
 * Return the oldest viable (valid_after ≤ now < valid_before, state =
 * 'available') slot for the wallet. Returns `null` if none available.
 *
 * The slot is NOT marked consumed — the caller must call `markConsumed()`
 * after a successful on-chain deposit.
 */
export async function nextAvailableSlot(
  db: BillingDatabase,
  wallet: Address,
  now: Date,
): Promise<PreauthSlot | null> {
  const walletKey = wallet.toLowerCase();

  const rows = await db
    .select()
    .from(topupPreauthSlots)
    .where(
      and(
        eq(topupPreauthSlots.wallet, walletKey),
        eq(topupPreauthSlots.state, "available"),
        lte(topupPreauthSlots.validAfter, now),
        // valid_before > now (not yet expired)
        sql`${topupPreauthSlots.validBefore} > ${now}`,
      ),
    )
    .orderBy(asc(topupPreauthSlots.validBefore)) // oldest-expiring first
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0]!;
  return {
    nonce: row.nonce as Hex,
    amountPton: row.amountPton,
    v: row.v,
    r: row.r as Hex,
    s: row.s as Hex,
    validAfter: row.validAfter,
    validBefore: row.validBefore,
  };
}

/**
 * Mark a slot as consumed (successful on-chain deposit). Only transitions a
 * slot in the `available` state — throws if the slot does not exist, has been
 * poisoned, or has already been consumed/expired. Concurrent callers cannot
 * race because the WHERE clause filters on `state = 'available'` and at most
 * one UPDATE will return a row.
 */
export async function markConsumed(
  db: BillingDatabase,
  wallet: Address,
  nonce: Hex,
): Promise<void> {
  const result = await db
    .update(topupPreauthSlots)
    .set({ state: "consumed" })
    .where(
      and(
        eq(topupPreauthSlots.wallet, wallet.toLowerCase()),
        eq(topupPreauthSlots.nonce, nonce.toLowerCase()),
        eq(topupPreauthSlots.state, "available"),
      ),
    )
    .returning();

  if (result.length === 0) {
    throw new Error(
      `preauth slot not available for transition: ${wallet}/${nonce}`,
    );
  }
}

/**
 * Mark a slot as poisoned (on-chain deposit reverted for an unexpected reason).
 * Only transitions a slot in the `available` state — throws if the slot does
 * not exist, has been consumed, or has already been poisoned/expired. The
 * proxy will not retry poisoned slots.
 */
export async function markPoisoned(
  db: BillingDatabase,
  wallet: Address,
  nonce: Hex,
): Promise<void> {
  const result = await db
    .update(topupPreauthSlots)
    .set({ state: "poisoned" })
    .where(
      and(
        eq(topupPreauthSlots.wallet, wallet.toLowerCase()),
        eq(topupPreauthSlots.nonce, nonce.toLowerCase()),
        eq(topupPreauthSlots.state, "available"),
      ),
    )
    .returning();

  if (result.length === 0) {
    throw new Error(
      `preauth slot not available for transition: ${wallet}/${nonce}`,
    );
  }
}

/**
 * Expire all available slots whose `valid_before` has passed.
 * Returns the number of slots transitioned to 'expired'.
 */
export async function sweepExpired(
  db: BillingDatabase,
  now: Date,
): Promise<number> {
  const result = await db
    .update(topupPreauthSlots)
    .set({ state: "expired" })
    .where(
      and(
        eq(topupPreauthSlots.state, "available"),
        lt(topupPreauthSlots.validBefore, now),
      ),
    )
    .returning();

  return result.length;
}
