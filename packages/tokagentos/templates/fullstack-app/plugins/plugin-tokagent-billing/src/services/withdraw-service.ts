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

import { Service, logger, type IAgentRuntime } from "@elizaos/core";
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
  /** Pending resubscribe timer; `null` when no reconnect is scheduled. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Current backoff attempt count; resets on a successful subscription. */
  private reconnectAttempt = 0;
  /** `true` once `stop()` has been called; suppresses further reconnects. */
  private stopped = false;
  private static readonly RECONNECT_BASE_MS = 2_000;
  private static readonly RECONNECT_MAX_MS = 60_000;
  private static readonly RECONNECT_MAX_ATTEMPTS = 8;
  /** Captured at init so the resubscribe path can rebuild the subscription. */
  private workerDeps!: WithdrawWatcherDeps;

  static async start(runtime: IAgentRuntime): Promise<WithdrawWatcherService> {
    const instance = new WithdrawWatcherService(runtime);
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

    this.subscribe();
    log.info(
      { vault: config.vaultAddress },
      "WithdrawWatcherService started",
    );
  }

  /**
   * (Re)attach the viem event subscription. Called once during `_init` and
   * again from the `onError` reconnect path. Idempotent: tears down any
   * existing subscription before creating a new one.
   */
  private subscribe(): void {
    if (this.stopped) return;
    if (this.unwatch) {
      try {
        this.unwatch();
      } catch {
        /* ignore — previous subscription already broken */
      }
      this.unwatch = null;
    }
    const { clients, config } = this.runtimeDeps;
    this.unwatch = clients.publicClient.watchContractEvent({
      address: config.vaultAddress,
      abi: CLAUDE_VAULT_ABI,
      eventName: "WithdrawRequested",
      onLogs: (logs) => {
        // First successful event delivery clears the backoff counter.
        if (this.reconnectAttempt > 0) {
          log.info(
            { attempts: this.reconnectAttempt },
            "withdraw watcher resubscribed successfully",
          );
          this.reconnectAttempt = 0;
        }
        for (const lg of logs) {
          void handleWithdrawRequested(
            this.workerDeps,
            lg as Parameters<typeof handleWithdrawRequested>[1],
          ).catch((err: unknown) =>
            log.error({ err }, "withdraw handler error (best-effort; ignoring)"),
          );
        }
      },
      onError: (err) => {
        if (this.stopped) return;
        this.scheduleReconnect(err);
      },
    });
  }

  /**
   * Schedule a reconnect with exponential backoff (capped). After
   * RECONNECT_MAX_ATTEMPTS the watcher stays disconnected and ops must
   * restart the service — the consume worker's regular cadence is the
   * correctness backstop per source semantics.
   */
  private scheduleReconnect(err: Error): void {
    if (this.reconnectTimer) return; // already scheduled
    this.reconnectAttempt += 1;
    if (this.reconnectAttempt > WithdrawWatcherService.RECONNECT_MAX_ATTEMPTS) {
      log.error(
        { err: err.message, attempts: this.reconnectAttempt },
        "withdraw watcher subscription error — max reconnects exhausted, giving up",
      );
      return;
    }
    const delay = Math.min(
      WithdrawWatcherService.RECONNECT_BASE_MS *
        2 ** (this.reconnectAttempt - 1),
      WithdrawWatcherService.RECONNECT_MAX_MS,
    );
    log.warn(
      { err: err.message, attempt: this.reconnectAttempt, delayMs: delay },
      "withdraw watcher subscription error — scheduling reconnect",
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.subscribe();
    }, delay);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
