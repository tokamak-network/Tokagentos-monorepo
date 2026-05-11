/**
 * WithdrawWatcherService — elizaOS Service wrapper for the withdraw watcher.
 *
 * Subscribes to `WithdrawRequested` events on ClaudeVault via
 * `viem.watchContractEvent`. On each event, calls `handleWithdrawRequested`
 * from the pure worker module.
 *
 * Decision D18: Service wrappers own the viem subscription; pure workers
 * own the per-event handling logic.
 */

import { Service, logger, type IAgentRuntime } from "@tokagentos/core";
import {
  handleWithdrawRequested,
  type WithdrawWatcherDeps,
} from "@tokagentos/billing";
import { CLAUDE_VAULT_ABI } from "@tokagentos/billing";
import { resolveBillingRuntime, type BillingRuntimeDeps } from "./_runtime-deps.js";

const log = logger.child({ src: "billing:service:withdraw-watcher" });

export class WithdrawWatcherService extends Service {
  static serviceType = "tokagent-billing-withdraw";
  capabilityDescription =
    "Watches vault.WithdrawRequested events to pre-empt consume flush";

  private unwatch: (() => void) | null = null;
  private runtimeDeps!: BillingRuntimeDeps;

  static async start(runtime: IAgentRuntime): Promise<WithdrawWatcherService> {
    const instance = new WithdrawWatcherService(runtime);
    await instance._init();
    return instance;
  }

  private async _init(): Promise<void> {
    this.runtimeDeps = await resolveBillingRuntime(this.runtime);
    const { db, clients, config } = this.runtimeDeps;

    const workerDeps: WithdrawWatcherDeps = {
      db,
      clients,
      vaultAddress: config.vaultAddress,
      config: {
        consumeBatchMinPton: config.consumeBatchMinPton,
        consumeMaxAgeMs: config.consumeMaxAgeMs,
        consumeMaxPerCycle: config.consumeMaxPerCycle,
      },
    };

    this.unwatch = clients.publicClient.watchContractEvent({
      address: config.vaultAddress,
      abi: CLAUDE_VAULT_ABI,
      eventName: "WithdrawRequested",
      onLogs: (logs) => {
        for (const lg of logs) {
          void handleWithdrawRequested(workerDeps, lg as Parameters<typeof handleWithdrawRequested>[1]).catch(
            (err: unknown) =>
              log.error({ err }, "withdraw handler error (best-effort; ignoring)"),
          );
        }
      },
      onError: (err) => {
        log.error({ err: err.message }, "withdraw watcher subscription error");
      },
    });

    log.info(
      { vault: config.vaultAddress },
      "WithdrawWatcherService started",
    );
  }

  async stop(): Promise<void> {
    if (this.unwatch) {
      try {
        this.unwatch();
      } catch (e) {
        log.warn({ err: (e as Error).message }, "withdraw watcher unwatch threw");
      }
      this.unwatch = null;
    }
    if (this.runtimeDeps) {
      await this.runtimeDeps.stop();
    }
    log.info("WithdrawWatcherService stopped");
  }
}
