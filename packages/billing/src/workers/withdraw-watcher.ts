/**
 * Withdraw-watcher event handler — pure per-event logic, no viem
 * subscription, no global state.
 *
 * The `viem.watchContractEvent` subscription lives in the Service wrapper
 * (`plugins/plugin-tokagent-billing/src/services/withdraw-service.ts`).
 * This module only contains the per-event handler so it is testable
 * without a real chain connection.
 *
 * Decision Z21: semantics preserved from source `proxy/src/withdrawWatcher.ts`.
 * The watcher is best-effort — failures are logged but never propagate.
 */

import type { Address } from "viem";
import { eq } from "drizzle-orm";
import { logger } from "@tokagentos/core";
import type { BillingDatabase } from "../ledger/schema.js";
import { creditState } from "../ledger/schema.js";
import type { BillingClients } from "../chain/clients.js";
import type { ConsumeWorkerConfig } from "./consume-worker.js";
import { flushNow } from "./consume-worker.js";

const log = logger.child({ src: "billing:worker:withdraw-watcher" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WithdrawWatcherDeps {
  db: BillingDatabase;
  clients: BillingClients;
  vaultAddress: Address;
  config: ConsumeWorkerConfig;
}

export interface WithdrawRequestedEvent {
  args: {
    user?: Address;
    amount?: bigint;
    unlockAt?: bigint;
  };
}

// ---------------------------------------------------------------------------
// handleWithdrawRequested
// ---------------------------------------------------------------------------

/**
 * Called for each `WithdrawRequested` event. Checks the local ledger accrued
 * balance for the requesting user; if > 0, triggers an immediate priority
 * flush via `flushNow` to pre-empt the withdraw.
 *
 * Best-effort: any error is swallowed after logging. The regular consume
 * worker tick is the correctness backstop.
 */
export async function handleWithdrawRequested(
  deps: WithdrawWatcherDeps,
  event: WithdrawRequestedEvent,
): Promise<void> {
  const user = event.args.user;
  const amount = event.args.amount;

  if (!user) {
    log.warn("WithdrawRequested event missing user field; skipping");
    return;
  }

  // Check local ledger accrued for this user.
  const rows = await deps.db
    .select({ accrued: creditState.accrued })
    .from(creditState)
    .where(eq(creditState.wallet, user.toLowerCase()));

  const accrued = rows[0]?.accrued ?? 0n;

  if (accrued <= 0n) {
    // No-op: user has nothing accrued, so pre-emption is unnecessary. This is
    // the common case (most WithdrawRequested events arrive for users whose
    // accrued has already been swept by the size trigger). Log at debug to
    // avoid info-level spam per withdraw event.
    log.debug(
      { user, requestedAmount: amount?.toString() },
      "withdraw requested but no accrued balance; nothing to pre-flush",
    );
    return;
  }

  log.info(
    { user, accrued: accrued.toString(), requestedAmount: amount?.toString() },
    "withdraw requested → forcing priority consume flush",
  );

  try {
    const result = await flushNow(deps, { priorityWallet: user });
    log.info({ user, ...result }, "priority consume flush completed");
  } catch (e) {
    // Best-effort — failure is logged but not propagated.
    log.error(
      { err: (e as Error).message, user },
      "priority consume flush failed; regular worker retry will handle it",
    );
  }
}
