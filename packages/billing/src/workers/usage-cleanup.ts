/**
 * Usage-cleanup worker — pure sweep functions, no setInterval, no global state.
 *
 * Ported from source `proxy/src/usageRecorder.ts:129` (`runUsageCleanup` /
 * `startUsageCleanupWorker`). The Service wrapper owns the timer; this module
 * contains the stateless sweep logic.
 *
 * `sweepAllExpired` is the single public entry point called by the Service
 * wrapper on each tick. Individual sweeps can also be called in isolation
 * for testing.
 */

import { lt } from "drizzle-orm";
import { logger } from "@tokagentos/core";
import type { BillingDatabase } from "../ledger/schema.js";
import { callLog } from "../ledger/schema.js";
import { sweepExpiredNonces } from "../auth/nonces.js";
import { sweepExpiredQuotes } from "../pricing/quotes.js";
import { sweepExpired as sweepExpiredPreauth } from "../ledger/preauth.js";

const log = logger.child({ src: "billing:worker:usage-cleanup" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsageCleanupDeps {
  db: BillingDatabase;
  retentionDays: number;
}

export interface SweepAllResult {
  callLog: number;
  nonces: number;
  quotes: number;
  preauth: number;
}

// ---------------------------------------------------------------------------
// sweepOldCallLog
// ---------------------------------------------------------------------------

/**
 * DELETE rows from `billing_call_log` older than `retentionDays` days.
 *
 * @returns Count of rows deleted.
 */
export async function sweepOldCallLog(
  deps: UsageCleanupDeps,
  now: Date,
): Promise<number> {
  const cutoffMs =
    now.getTime() - deps.retentionDays * 24 * 60 * 60 * 1_000;
  const cutoff = new Date(cutoffMs);

  try {
    const result = await deps.db
      .delete(callLog)
      .where(lt(callLog.ts, cutoff))
      .returning();

    if (result.length > 0) {
      log.info(
        { removed: result.length, cutoff: cutoff.toISOString(), retentionDays: deps.retentionDays },
        "call log retention sweep removed rows",
      );
    }

    return result.length;
  } catch (e) {
    log.warn({ err: (e as Error).message }, "call log retention sweep failed");
    return 0;
  }
}

// ---------------------------------------------------------------------------
// sweepAllExpired
// ---------------------------------------------------------------------------

/**
 * Run all expiry sweeps in one pass. Called by the UsageCleanupService on
 * each cleanup tick (default: every 24 hours).
 *
 *   - `billing_call_log` rows older than `retentionDays` days
 *   - `billing_auth_nonces` rows past their `expires_at`
 *   - `billing_topup_quotes` rows past their `expires_at` (unconsumed)
 *   - `billing_topup_preauth_slots` with `valid_before` in the past
 *
 * Each sweep swallows its own errors after logging so a single sweep failure
 * doesn't block the others.
 */
export async function sweepAllExpired(
  deps: UsageCleanupDeps,
  now: Date,
): Promise<SweepAllResult> {
  const [callLogCount, noncesCount, quotesCount, preauthCount] =
    await Promise.all([
      sweepOldCallLog(deps, now),
      sweepExpiredNonces(deps.db, now).catch((e: unknown) => {
        log.warn({ err: (e as Error).message }, "nonces sweep failed");
        return 0;
      }),
      sweepExpiredQuotes(deps.db, now).catch((e: unknown) => {
        log.warn({ err: (e as Error).message }, "quotes sweep failed");
        return 0;
      }),
      sweepExpiredPreauth(deps.db, now).catch((e: unknown) => {
        log.warn({ err: (e as Error).message }, "preauth sweep failed");
        return 0;
      }),
    ]);

  return {
    callLog: callLogCount,
    nonces: noncesCount,
    quotes: quotesCount,
    preauth: preauthCount,
  };
}
