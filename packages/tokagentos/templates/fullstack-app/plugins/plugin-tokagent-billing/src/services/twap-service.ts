/**
 * TwapRefreshService — elizaOS Service wrapper for the TWAP refresh worker.
 *
 * Owns the setInterval timer that periodically calls `refreshTwap(deps)`.
 * The pure refresh logic lives in
 * `@tokagentos/billing/workers/twap-refresh.ts`.
 *
 * The TwapCache instance is owned by this service. Phase 6 route handlers
 * that need the current price should call `getCachedTonUsd` directly with
 * the same cache — or the plugin can expose a getter. For now the cache
 * is managed internally here.
 *
 * Decision D18: Service wrappers own timers; pure workers own logic.
 */

import { Service, logger, type IAgentRuntime } from "@elizaos/core";
import { refreshTwap, TwapCache, type TwapRefreshDeps } from "@tokagentos/billing";
import { resolveBillingRuntime, type BillingRuntimeDeps } from "./_runtime-deps.js";
import { registerTwapCache } from "../state.js";

const log = logger.child({ src: "billing:service:twap" });

export class TwapRefreshService extends Service {
  static serviceType = "tokagent-billing-twap";
  capabilityDescription = "Periodic refresh of composite TON/USD TWAP price";

  private timer: ReturnType<typeof setInterval> | null = null;
  private runtimeDeps!: BillingRuntimeDeps;
  readonly cache = new TwapCache();

  static async start(runtime: IAgentRuntime): Promise<TwapRefreshService> {
    const instance = new TwapRefreshService(runtime);
    await instance._init();
    return instance;
  }

  private async _init(): Promise<void> {
    this.runtimeDeps = await resolveBillingRuntime(this.runtime);
    const { clients, config } = this.runtimeDeps;

    const deps: TwapRefreshDeps = {
      mainnetClient: clients.mainnetClient,
      oracleConfig: {
        wtonWethPool: config.wtonWethPool,
        wethUsdcPool: config.wethUsdcPool,
        twapWindowSeconds: config.twapWindowSeconds,
        cacheMs: config.priceCacheMs,
        maxStalenessMs: config.maxPriceStalenessMs,
        sanity: {
          minUsd: config.priceSanityMinUsd,
          maxUsd: config.priceSanityMaxUsd,
        },
        fixedPrice: config.fixedTonUsd,
      },
      cache: this.cache,
      fixedTonUsd: config.fixedTonUsd,
    };

    // Register the cache with the shared plugin state so the billing gate can
    // read the current price without holding a service reference (Decision Z28).
    registerTwapCache(this.cache);

    // Prime the cache immediately on start.
    const initial = await refreshTwap(deps);
    if (initial) {
      log.info({ tonUsd: initial.tonUsd, source: initial.source }, "twap primed");
    } else {
      log.warn(
        "initial twap refresh failed — price routes will 503 until it succeeds",
      );
    }

    // Phase 5.2 Fix 6: when BILLING_FIXED_TON_USD is set, the cached value is
    // a constant — every subsequent refresh is a no-op that still pays the
    // RPC round-trip cost. Skip the interval entirely in dev/test mode.
    if (config.fixedTonUsd !== undefined) {
      log.info(
        { fixedTonUsd: config.fixedTonUsd },
        "TwapRefreshService: fixed price override active — refresh timer not started",
      );
      return;
    }

    this.timer = setInterval(() => {
      void refreshTwap(deps).catch((err: unknown) =>
        log.error({ err }, "twap service tick failed"),
      );
    }, config.priceRefreshIntervalMs);

    log.info(
      { intervalMs: config.priceRefreshIntervalMs },
      "TwapRefreshService started",
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
    log.info("TwapRefreshService stopped");
  }
}
