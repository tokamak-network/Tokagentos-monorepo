/**
 * ConsumeService — elizaOS Service wrapper for the consume worker.
 *
 * Owns the setInterval timer that periodically calls `flushNow(deps)`.
 * The pure flush logic lives in `@tokagentos/billing/workers/consume-worker.ts`.
 *
 * Decision D18: Service wrappers own timers; pure workers own logic.
 * Decision D19: Deps injected from runtime settings via `resolveBillingRuntime`.
 */

import { Service, logger, type IAgentRuntime } from "@tokagentos/core";
import { flushNow, type ConsumeWorkerDeps } from "@tokagentos/billing";
import { resolveBillingRuntime, type BillingRuntimeDeps } from "./_runtime-deps.js";

const log = logger.child({ src: "billing:service:consume" });

export class ConsumeService extends Service {
  static serviceType = "tokagent-billing-consume";
  capabilityDescription =
    "Periodic flush of accrued credits to ClaudeVault.consumeCredits";

  private timer: ReturnType<typeof setInterval> | null = null;
  private workerDeps!: ConsumeWorkerDeps;
  private runtimeDeps!: BillingRuntimeDeps;

  static async start(runtime: IAgentRuntime): Promise<ConsumeService> {
    const instance = new ConsumeService(runtime);
    await instance._init();
    return instance;
  }

  private async _init(): Promise<void> {
    this.runtimeDeps = await resolveBillingRuntime(this.runtime);
    const { db, clients, config } = this.runtimeDeps;

    this.workerDeps = {
      db,
      clients,
      vaultAddress: config.vaultAddress,
      config: {
        consumeBatchMinPton: config.consumeBatchMinPton,
        consumeMaxAgeMs: config.consumeMaxAgeMs,
        consumeMaxPerCycle: config.consumeMaxPerCycle,
      },
    };

    this.timer = setInterval(() => {
      void flushNow(this.workerDeps).catch((err: unknown) =>
        log.error({ err }, "consume service tick failed"),
      );
    }, config.consumeScanIntervalMs);

    log.info(
      {
        intervalMs: config.consumeScanIntervalMs,
        minBatchPton: config.consumeBatchMinPton.toString(),
        maxAgeMs: config.consumeMaxAgeMs,
      },
      "ConsumeService started",
    );
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.runtimeDeps) {
      await this.runtimeDeps.stop();
    }
    log.info("ConsumeService stopped");
  }
}
