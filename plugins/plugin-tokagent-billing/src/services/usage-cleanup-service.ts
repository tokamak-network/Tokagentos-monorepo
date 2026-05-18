/**
 * UsageCleanupService — elizaOS Service wrapper for the usage-cleanup worker.
 *
 * Owns the setInterval timer that periodically calls `sweepAllExpired(deps, now)`.
 * The pure sweep logic lives in
 * `@tokagentos/billing/workers/usage-cleanup.ts`.
 *
 * Decision D18: Service wrappers own timers; pure workers own logic.
 * Decision D19: Deps injected from runtime settings via `resolveBillingRuntime`.
 */

import { Service, logger, type IAgentRuntime } from "@tokagentos/core";
import { sweepAllExpired, type UsageCleanupDeps } from "@tokagentos/billing";
import { resolveBillingRuntime, type BillingRuntimeDeps } from "./_runtime-deps.js";

const log = logger.child({ src: "billing:service:usage-cleanup" });

export class UsageCleanupService extends Service {
  static serviceType = "tokagent-billing-usage-cleanup";
  capabilityDescription =
    "Periodic sweep of expired call_log / nonces / quotes / preauth";

  private timer: ReturnType<typeof setInterval> | null = null;
  private cleanupDeps!: UsageCleanupDeps;
  private runtimeDeps!: BillingRuntimeDeps;

  static async start(runtime: IAgentRuntime): Promise<UsageCleanupService> {
    const instance = new UsageCleanupService(runtime);
    await instance._init();
    return instance;
  }

  private async _init(): Promise<void> {
    this.runtimeDeps = await resolveBillingRuntime(this.runtime);
    const { db, config } = this.runtimeDeps;

    this.cleanupDeps = {
      db,
      retentionDays: config.usageRetentionDays,
    };

    this.timer = setInterval(() => {
      void sweepAllExpired(this.cleanupDeps, new Date())
        .then((counts) => {
          // No-op ticks (all counts zero) are the common case — log at debug
          // to avoid daily info-level noise with `{callLog:0, nonces:0, ...}`.
          const anySwept = Object.values(counts).some((c) => c > 0);
          if (anySwept) {
            log.info({ ...counts }, "usage cleanup sweep complete");
          } else {
            log.debug({ ...counts }, "usage cleanup sweep complete (no-op)");
          }
        })
        .catch((err: unknown) =>
          log.error({ err }, "usage cleanup tick failed"),
        );
    }, config.usageCleanupIntervalMs);

    log.info(
      {
        intervalMs: config.usageCleanupIntervalMs,
        retentionDays: config.usageRetentionDays,
      },
      "UsageCleanupService started",
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
    log.info("UsageCleanupService stopped");
  }
}
