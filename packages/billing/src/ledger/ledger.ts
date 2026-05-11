/**
 * DB-backed credit ledger (Phase 4 — replaces in-memory Map from
 * proxy/src/credits.ts). Semantics are preserved from the source; the
 * implementation moves from a CreditLedger class to pure functions that
 * accept an explicit `BillingDatabase` (Decision D11).
 *
 * All mutating operations run inside SERIALIZABLE transactions with automatic
 * retry on code 40001 (Decision D15).
 *
 * Balance invariant (per-wallet, until consume flush):
 *   onChainCredits == balance + reserved + accrued
 *   onChainCredits == balance + reserved  (after consumeCredits tx)
 */

import { eq, and, isNull } from "drizzle-orm";
import type { Address } from "viem";
import { logger } from "@tokagentos/core";
import {
  creditState,
  reservations,
  type BillingDatabase,
} from "./schema.js";
import { withSerializableRetry } from "./retry.js";

const log = logger.child({ src: "billing:ledger" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReserveSuccess {
  ok: true;
  reservationId: string;
  available: bigint;
}

export interface ReserveFailure {
  ok: false;
  available: bigint;
}

export type ReserveResult = ReserveSuccess | ReserveFailure;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Upsert a credit_state row if missing. Returns the current row.
 * Must be called inside a SERIALIZABLE transaction (the `tx` argument).
 */
async function getOrCreateState(
  tx: BillingDatabase,
  wallet: string,
): Promise<{ balance: bigint; reserved: bigint; accrued: bigint; firstAccrualAt: Date | null }> {
  const rows = await tx
    .select()
    .from(creditState)
    .where(eq(creditState.wallet, wallet));

  if (rows.length > 0) {
    const r = rows[0]!;
    return {
      balance: r.balance,
      reserved: r.reserved,
      accrued: r.accrued,
      firstAccrualAt: r.firstAccrualAt ?? null,
    };
  }

  // Row doesn't exist — insert zero state.
  await tx.insert(creditState).values({
    wallet,
    balance: 0n,
    reserved: 0n,
    accrued: 0n,
    firstAccrualAt: null,
    lastHydratedAt: null,
    updatedAt: new Date(),
  });

  return { balance: 0n, reserved: 0n, accrued: 0n, firstAccrualAt: null };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reserve `amount` atto-PTON for an in-flight request.
 *
 * Returns `ok: true` with a `reservationId` on success, or `ok: false` if
 * the wallet's balance is insufficient. The caller should respond 402 with
 * a topup quote on failure.
 *
 * Runs under SERIALIZABLE isolation so concurrent reserve calls for the same
 * wallet are serialized — no double-spending.
 */
export async function reserve(
  db: BillingDatabase,
  args: { wallet: Address; amount: bigint; requestId: string },
): Promise<ReserveResult> {
  const wallet = args.wallet.toLowerCase();

  return withSerializableRetry(db, async (tx) => {
    const state = await getOrCreateState(tx, wallet);

    if (state.balance < args.amount) {
      return { ok: false as const, available: state.balance };
    }

    const newBalance = state.balance - args.amount;
    const newReserved = state.reserved + args.amount;

    await tx
      .update(creditState)
      .set({
        balance: newBalance,
        reserved: newReserved,
        updatedAt: new Date(),
      })
      .where(eq(creditState.wallet, wallet));

    const inserted = await tx
      .insert(reservations)
      .values({
        wallet,
        amountPton: args.amount,
        requestId: args.requestId,
        createdAt: new Date(),
      })
      .returning();

    const reservationId = inserted[0]!.id;

    return {
      ok: true as const,
      reservationId,
      available: newBalance,
    };
  });
}

/**
 * Release a reservation after a failed or aborted request.
 *
 * The reservation's amount is returned to the wallet's spendable balance.
 * Idempotent: re-releasing a already-released reservation throws an error
 * (the reservation row has `released_at` set).
 *
 * `outcome` distinguishes clean cancellation from error scenarios:
 *   - `released_complete` — request finished but no cost was committed
 *   - `released_abort`    — request was aborted by the client
 *   - `released_error`    — upstream returned an error before any spend
 */
export async function release(
  db: BillingDatabase,
  reservationId: string,
  outcome: "released_complete" | "released_abort" | "released_error",
): Promise<void> {
  await withSerializableRetry(db, async (tx) => {
    const rows = await tx
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.id, reservationId),
          isNull(reservations.releasedAt),
        ),
      );

    if (rows.length === 0) {
      throw new Error(
        `release: reservation ${reservationId} not found or already released`,
      );
    }

    const reservation = rows[0]!;
    const wallet = reservation.wallet;
    const amount = reservation.amountPton;

    // Restore balance, decrement reserved
    const state = await getOrCreateState(tx, wallet);
    await tx
      .update(creditState)
      .set({
        balance: state.balance + amount,
        reserved: state.reserved - amount,
        updatedAt: new Date(),
      })
      .where(eq(creditState.wallet, wallet));

    // Mark reservation as released
    await tx
      .update(reservations)
      .set({ releasedAt: new Date(), outcome })
      .where(eq(reservations.id, reservationId));
  });
}

/**
 * Commit a reservation: record the actual charge and move the cost to the
 * `accrued` accumulator for later batching via `consumeCredits`.
 *
 * `totalPton` is the actual cost (may differ from `amountPton`; excess is
 * forfeited back to balance). The accrued field is incremented by `totalPton`,
 * NOT by the reservation amount.
 */
export async function commit(
  db: BillingDatabase,
  reservationId: string,
  totalPton: bigint,
): Promise<void> {
  await withSerializableRetry(db, async (tx) => {
    const rows = await tx
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.id, reservationId),
          isNull(reservations.releasedAt),
        ),
      );

    if (rows.length === 0) {
      throw new Error(
        `commit: reservation ${reservationId} not found or already committed/released`,
      );
    }

    const reservation = rows[0]!;
    const wallet = reservation.wallet;
    const reservedAmount = reservation.amountPton;

    const state = await getOrCreateState(tx, wallet);

    // Any excess reservation beyond the actual cost is refunded to balance.
    const actualCharge = totalPton > reservedAmount ? reservedAmount : totalPton;
    const refund = reservedAmount - actualCharge;

    const newReserved = state.reserved - reservedAmount;
    const newBalance = state.balance + refund;
    const newAccrued = state.accrued + actualCharge;

    const now = new Date();
    const firstAccrualAt =
      state.firstAccrualAt === null && actualCharge > 0n
        ? now
        : state.firstAccrualAt;

    await tx
      .update(creditState)
      .set({
        reserved: newReserved,
        balance: newBalance,
        accrued: newAccrued,
        firstAccrualAt,
        updatedAt: now,
      })
      .where(eq(creditState.wallet, wallet));

    await tx
      .update(reservations)
      .set({ releasedAt: now, outcome: "committed" })
      .where(eq(reservations.id, reservationId));
  });
}

/**
 * Hydrate the ledger balance from an authoritative on-chain reading.
 *
 * Sets `balance = max(0, onChainCredits - reserved - accrued)`. If on-chain is
 * lower than local committed amounts (outside-withdraw race), clamps balance to
 * zero and logs a warning — the consume worker will handle the reconciliation.
 */
export async function hydrate(
  db: BillingDatabase,
  wallet: Address,
  onChainCredits: bigint,
): Promise<void> {
  const walletKey = wallet.toLowerCase();

  await withSerializableRetry(db, async (tx) => {
    const state = await getOrCreateState(tx, walletKey);

    const localCommitted = state.reserved + state.accrued;
    let newBalance: bigint;

    if (onChainCredits >= localCommitted) {
      newBalance = onChainCredits - localCommitted;
    } else {
      log.warn(
        {
          wallet: walletKey,
          onChainCredits: onChainCredits.toString(),
          localCommitted: localCommitted.toString(),
        },
        "ledger sync: on-chain credit below committed (race?), clamping balance to 0",
      );
      newBalance = 0n;
    }

    await tx
      .update(creditState)
      .set({
        balance: newBalance,
        lastHydratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creditState.wallet, walletKey));
  });
}

/**
 * Flush the accrued amount for a wallet, returning it and the `firstAccrualAt`
 * timestamp for the consume worker to use as the batch identifier.
 *
 * Zeros the `accrued` column and clears `firstAccrualAt`. Returns `null` if
 * there is nothing to flush (accrued === 0n).
 *
 * Does NOT touch the on-chain state — the consume worker is responsible for
 * calling `vault.consumeCredits` with the returned data.
 */
export async function flushAccrued(
  db: BillingDatabase,
  wallet: Address,
): Promise<{ amount: bigint; firstAccrualAt: Date | null } | null> {
  const walletKey = wallet.toLowerCase();

  return withSerializableRetry(db, async (tx) => {
    const state = await getOrCreateState(tx, walletKey);

    if (state.accrued === 0n) return null;

    const amount = state.accrued;
    const firstAccrualAt = state.firstAccrualAt;

    await tx
      .update(creditState)
      .set({
        accrued: 0n,
        firstAccrualAt: null,
        updatedAt: new Date(),
      })
      .where(eq(creditState.wallet, walletKey));

    return { amount, firstAccrualAt };
  });
}
