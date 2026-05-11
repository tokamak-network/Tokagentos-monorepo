/**
 * Consume worker — pure flush logic, no setInterval, no global state.
 *
 * Two OR triggers per wallet:
 *   (1) accrued >= consumeBatchMinPton          (size threshold)
 *   (2) now - firstAccrualAt >= consumeMaxAgeMs (idle safety)
 *
 * The timer / interval lives in the Service wrapper
 * (`plugins/plugin-tokagent-billing/src/services/consume-service.ts`).
 * This module is tested in isolation against a PGLite DB (no anvil required
 * for unit tests).
 *
 * Decision Z21: semantics are preserved verbatim from the source
 * `proxy/src/consumeWorker.ts`. Changes vs source:
 *   - Dead-letter persists in `billing_consume_batches.state = 'dead_letter'`
 *     instead of an in-process array.
 *   - DB writes are split: "submitted" written before the chain call (short
 *     lock), "confirmed" / "dead_letter" written after (avoids holding a
 *     SERIALIZABLE TX open across the chain call latency).
 *   - `firstAccrualAt` is a `Date`, not a raw epoch ms number, matching
 *     the DB schema (timestamp column).
 */

import { keccak256, stringToHex } from "viem";
import type { Address, Hex } from "viem";
import { eq } from "drizzle-orm";
import { logger } from "@tokagentos/core";
import type { BillingDatabase } from "../ledger/schema.js";
import { creditState, consumeBatches } from "../ledger/schema.js";
import { withSerializableRetry } from "../ledger/retry.js";
import { flushAccrued } from "../ledger/ledger.js";
import { consumeCredits } from "../chain/vault.js";
import type { BillingClients } from "../chain/clients.js";

const log = logger.child({ src: "billing:worker:consume" });

const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsumeWorkerConfig {
  consumeBatchMinPton: bigint;
  consumeMaxAgeMs: number;
  consumeMaxPerCycle: number;
}

export interface ConsumeWorkerDeps {
  db: BillingDatabase;
  clients: BillingClients;
  vaultAddress: Address;
  config: ConsumeWorkerConfig;
}

export interface FlushCandidate {
  wallet: Address;
  amount: bigint;
  firstAccrualAt: Date;
  batchId: Hex;
}

export interface FlushOptions {
  /**
   * When set, this wallet is flushed regardless of size/age thresholds, as
   * long as it currently has accrued > 0. Used by the withdraw watcher to
   * pre-empt a user's pending withdraw. Other eligible wallets in the same
   * scan still get processed alongside it.
   */
  priorityWallet?: Address;
}

export interface FlushResult {
  attempted: number;
  succeeded: number;
  deadLettered: number;
}

// ---------------------------------------------------------------------------
// batchId computation
// ---------------------------------------------------------------------------

/**
 * Deterministic batch ID — keccak256 of a canonical string.
 * Matches the source's `computeBatchId` exactly (Decision Z21).
 *
 * `firstAccrualAt.getTime()` produces the Unix epoch ms integer, mirroring the
 * source's `entry.firstAccrualAt` which was already stored as ms (not Date).
 */
export function computeBatchId(
  wallet: Address,
  firstAccrualAt: Date,
  amount: bigint,
): Hex {
  return keccak256(
    stringToHex(
      `consume:${wallet.toLowerCase()}:${firstAccrualAt.getTime()}:${amount.toString()}`,
    ),
  );
}

// ---------------------------------------------------------------------------
// shouldFlush helper
// ---------------------------------------------------------------------------

function shouldFlush(
  accrued: bigint,
  firstAccrualAt: Date | null,
  now: Date,
  config: ConsumeWorkerConfig,
): boolean {
  if (accrued <= 0n) return false;
  if (accrued >= config.consumeBatchMinPton) return true;
  if (
    firstAccrualAt !== null &&
    now.getTime() - firstAccrualAt.getTime() >= config.consumeMaxAgeMs
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// selectFlushable
// ---------------------------------------------------------------------------

/**
 * Query `billing_credit_state` for wallets that satisfy either the size or age
 * flush trigger. Returns up to `consumeMaxPerCycle` candidates, with the
 * priority wallet (if any) sorted first.
 *
 * Does NOT call the chain — pure DB read.
 */
export async function selectFlushable(
  deps: ConsumeWorkerDeps,
  now: Date,
  opts: FlushOptions = {},
): Promise<FlushCandidate[]> {
  const { db, config } = deps;
  const priorityKey = opts.priorityWallet
    ? opts.priorityWallet.toLowerCase()
    : null;

  // Read all wallets that have accrued > 0. The table is small in practice
  // (one row per active wallet); a full table scan is acceptable.
  const rows = await db
    .select()
    .from(creditState)
    .where(eq(creditState.accrued, creditState.accrued)); // all rows (drizzle has no "all" shorthand for where-less selects)

  const candidates: FlushCandidate[] = [];

  for (const row of rows) {
    if (row.accrued <= 0n) continue;

    const wallet = row.wallet as Address;
    const isPriority =
      priorityKey !== null && wallet.toLowerCase() === priorityKey;

    if (
      !isPriority &&
      !shouldFlush(row.accrued, row.firstAccrualAt ?? null, now, config)
    ) {
      continue;
    }

    if (row.firstAccrualAt === null) {
      // Shouldn't happen (accrued > 0 implies firstAccrualAt was set), but
      // guard defensively — skip rather than crash.
      log.warn({ wallet }, "accrued > 0 but firstAccrualAt is null; skipping");
      continue;
    }

    candidates.push({
      wallet,
      amount: row.accrued,
      firstAccrualAt: row.firstAccrualAt,
      batchId: computeBatchId(wallet, row.firstAccrualAt, row.accrued),
    });
  }

  // Priority wallet first, then rest. Within non-priority, stable order.
  if (priorityKey !== null) {
    candidates.sort((a, b) => {
      const aIsPrio = a.wallet.toLowerCase() === priorityKey;
      const bIsPrio = b.wallet.toLowerCase() === priorityKey;
      if (aIsPrio && !bIsPrio) return -1;
      if (!aIsPrio && bIsPrio) return 1;
      return 0;
    });
  }

  return candidates.slice(0, config.consumeMaxPerCycle);
}

// ---------------------------------------------------------------------------
// flushOne (private)
// ---------------------------------------------------------------------------

/**
 * Attempt to flush a single candidate. State machine:
 *
 *   1. Check for existing batch record with same batchId.
 *      - "confirmed": already done → skip (return `{ skipped: true }`).
 *      - "submitted": in-flight from a prior run → skip.
 *      - "dead_letter": already exhausted → skip.
 *      - "pending" (or missing): proceed.
 *   2. Upsert "submitted" row (short DB TX).
 *   3. Call vault.consumeCredits (outside any DB TX).
 *   4. On success: update to "confirmed" + call ledger.flushAccrued (second short TX).
 *   5. On failure: increment attempts; if >= MAX_ATTEMPTS, set "dead_letter".
 *
 * Returns true on success, false on failure.
 */
async function flushOne(
  deps: ConsumeWorkerDeps,
  candidate: FlushCandidate,
): Promise<boolean> {
  const { db, clients, vaultAddress } = deps;
  const { wallet, amount, batchId, firstAccrualAt } = candidate;

  // ---- Step 1: Check existing batch record ----
  const existing = await db
    .select()
    .from(consumeBatches)
    .where(eq(consumeBatches.batchId, batchId));

  if (existing.length > 0) {
    const row = existing[0]!;
    if (
      row.state === "confirmed" ||
      row.state === "submitted" ||
      row.state === "dead_letter"
    ) {
      log.debug(
        { batchId, state: row.state, wallet },
        "consume batch already in terminal/in-flight state; skipping",
      );
      return row.state === "confirmed";
    }
    // state === "pending": fall through to attempt
  }

  // ---- Step 2: Upsert "submitted" (short TX, D21) ----
  const now = new Date();

  await withSerializableRetry(db, async (tx) => {
    const check = await tx
      .select()
      .from(consumeBatches)
      .where(eq(consumeBatches.batchId, batchId));

    if (check.length === 0) {
      await tx.insert(consumeBatches).values({
        batchId,
        wallet: wallet.toLowerCase(),
        amountPton: amount,
        state: "submitted",
        attempts: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
      });
    } else {
      const current = check[0]!;
      if (current.state === "dead_letter" || current.state === "confirmed") {
        // raced with another worker tick — bail out
        return;
      }
      await tx
        .update(consumeBatches)
        .set({
          state: "submitted",
          attempts: current.attempts + 1,
          lastAttemptAt: now,
        })
        .where(eq(consumeBatches.batchId, batchId));
    }
  });

  // ---- Step 3: Call chain (outside any DB TX) ----
  let txHash: Hex;
  try {
    txHash = await consumeCredits(clients, vaultAddress, {
      user: wallet,
      amount,
      batchId,
    });
  } catch (chainErr) {
    // ---- Step 5: On failure ----
    log.error(
      {
        err: (chainErr as Error).message,
        wallet,
        amount: amount.toString(),
        batchId,
      },
      "consume flush chain call failed",
    );

    await withSerializableRetry(db, async (tx) => {
      const check = await tx
        .select()
        .from(consumeBatches)
        .where(eq(consumeBatches.batchId, batchId));

      const row = check[0];
      const attempts = row ? row.attempts : 1;
      const newState = attempts >= MAX_ATTEMPTS ? "dead_letter" : "pending";

      await tx
        .update(consumeBatches)
        .set({ state: newState, lastAttemptAt: new Date() })
        .where(eq(consumeBatches.batchId, batchId));

      if (newState === "dead_letter") {
        log.error(
          { wallet, batchId, attempts },
          "consume batch moved to dead_letter after MAX_ATTEMPTS",
        );
      }
    });

    return false;
  }

  // ---- Step 4: On success ----
  await withSerializableRetry(db, async (tx) => {
    await tx
      .update(consumeBatches)
      .set({ state: "confirmed", txHash, lastAttemptAt: new Date() })
      .where(eq(consumeBatches.batchId, batchId));
  });

  // Zero the ledger's accrued for this wallet.
  await flushAccrued(db, wallet);

  log.info(
    { txHash, wallet, amount: amount.toString(), batchId },
    "consume flushed",
  );

  return true;
}

// ---------------------------------------------------------------------------
// flushNow (public entry point)
// ---------------------------------------------------------------------------

/**
 * Run one consume scan: select flush-eligible wallets and dispatch up to
 * `consumeMaxPerCycle` chain calls.
 *
 * This is the function the Service wrapper calls on each interval tick.
 * Also the entry point for the anvil integration test.
 */
export async function flushNow(
  deps: ConsumeWorkerDeps,
  opts: FlushOptions = {},
): Promise<FlushResult> {
  const now = new Date();
  const candidates = await selectFlushable(deps, now, opts);

  if (candidates.length === 0) {
    return { attempted: 0, succeeded: 0, deadLettered: 0 };
  }

  let succeeded = 0;
  let deadLettered = 0;

  for (const candidate of candidates) {
    const ok = await flushOne(deps, candidate);
    if (ok) {
      succeeded += 1;
    } else {
      // Check if it went to dead_letter
      const row = await deps.db
        .select()
        .from(consumeBatches)
        .where(eq(consumeBatches.batchId, candidate.batchId));
      if (row[0]?.state === "dead_letter") {
        deadLettered += 1;
      }
    }
  }

  return { attempted: candidates.length, succeeded, deadLettered };
}
