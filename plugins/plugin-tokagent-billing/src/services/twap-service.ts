/**
 * TwapRefreshService — owns the timer that keeps the local TWAP cache warm
 * (v2.0.0).
 *
 * The CLI keeps a local TWAP price ONLY for the offline `/v1/estimate` and
 * `/v1/messages/count_tokens` paths. Charged calls (`/v1/messages`) hit the
 * gateway, which has its own canonical TWAP. This service is purely a UX
 * win: it lets the CLI show "this request will cost ~X PTON" without a
 * round-trip per render.
 *
 * Requirements:
 *   - BILLING_MAINNET_RPC_URL must be set (else the service no-ops; the
 *     estimate route falls back to the gateway).
 *   - The pool addresses (BILLING_WTON_*_POOL_ADDRESS) must be configured.
 *
 * When BILLING_FIXED_TON_USD is set we prime the cache once and skip the
 * timer entirely — a fixed price never needs refreshing.
 */

import { Service, logger, type IAgentRuntime } from '@tokagentos/core';
import {
  refreshTwap,
  TwapCache,
  createTwapClient,
  loadBillingConfig,
  type TwapRefreshDeps,
  type BillingConfig,
} from '@tokagentos/billing';
import { registerTwapCache, isBillingStateInitialized } from '../state.js';

const log = logger.child({ src: 'billing:service:twap' });

const TWAP_KEYS = [
  'BILLING_MAINNET_RPC_URL',
  'BILLING_WTON_WETH_POOL_ADDRESS',
  'BILLING_WTON_IS_TOKEN0_IN_WETH_POOL',
  'BILLING_WTON_DECIMALS',
  'BILLING_WETH_USDC_POOL_ADDRESS',
  'BILLING_WETH_IS_TOKEN0_IN_USDC_POOL',
  'BILLING_WETH_DECIMALS',
  'BILLING_USDC_DECIMALS',
  'BILLING_TWAP_WINDOW_SECONDS',
  'BILLING_PRICE_CACHE_MS',
  'BILLING_MAX_PRICE_STALENESS_MS',
  'BILLING_PRICE_SANITY_MIN_USD',
  'BILLING_PRICE_SANITY_MAX_USD',
  'BILLING_PRICE_REFRESH_INTERVAL_MS',
  'BILLING_FIXED_TON_USD',
  'BILLING_ENABLED',
  'TOKAGENT_GATEWAY_URL',
] as const;

function buildEnv(runtime: IAgentRuntime): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const k of TWAP_KEYS) {
    const procVal = process.env[k];
    const v = procVal !== undefined && procVal !== '' ? procVal : runtime.getSetting(k);
    if (v !== null && v !== undefined) env[k] = String(v);
  }
  return env as NodeJS.ProcessEnv;
}

export class TwapRefreshService extends Service {
  static serviceType = 'tokagent-billing-twap';
  capabilityDescription =
    'Refreshes the local TON/USD TWAP cache so the CLI can quote /v1/estimate offline.';

  private timer: ReturnType<typeof setInterval> | null = null;
  readonly cache = new TwapCache();
  private billingConfig: BillingConfig | null = null;

  static async start(runtime: IAgentRuntime): Promise<TwapRefreshService> {
    const instance = new TwapRefreshService(runtime);
    await instance._init();
    return instance;
  }

  private async _init(): Promise<void> {
    const env = buildEnv(this.runtime);
    this.billingConfig = loadBillingConfig(env);

    if (!this.billingConfig.enabled) {
      log.info('BILLING_ENABLED=false — TwapRefreshService idle');
      return;
    }

    // Register the cache so the shared state knows about it (even when the
    // refresh path can't run — the estimate route can still use whatever
    // primer values land here via tests / manual seeding).
    if (isBillingStateInitialized()) {
      registerTwapCache(this.cache);
    }

    if (this.billingConfig.fixedTonUsd !== undefined) {
      // Prime once with the fixed override; no need for a timer.
      const tonUsd = this.billingConfig.fixedTonUsd;
      this.cache.set({
        tonUsd,
        source: 'fixed',
        fetchedAt: Date.now(),
        ageMs: 0,
      });
      log.info({ fixedTonUsd: tonUsd }, 'TwapRefreshService: fixed price primed');
      return;
    }

    if (
      !this.billingConfig.mainnetRpcUrl ||
      !this.billingConfig.wtonWethPool ||
      !this.billingConfig.wethUsdcPool
    ) {
      log.warn(
        'TwapRefreshService: mainnet RPC or pool addresses not configured — ' +
          'offline /v1/estimate will fall back to the gateway',
      );
      return;
    }

    const mainnetClient = createTwapClient({ mainnetRpcUrl: this.billingConfig.mainnetRpcUrl });
    const deps: TwapRefreshDeps = {
      mainnetClient,
      oracleConfig: {
        wtonWethPool: this.billingConfig.wtonWethPool,
        wethUsdcPool: this.billingConfig.wethUsdcPool,
        twapWindowSeconds: this.billingConfig.twapWindowSeconds,
        cacheMs: this.billingConfig.priceCacheMs,
        maxStalenessMs: this.billingConfig.maxPriceStalenessMs,
        sanity: {
          minUsd: this.billingConfig.priceSanityMinUsd,
          maxUsd: this.billingConfig.priceSanityMaxUsd,
        },
        fixedPrice: this.billingConfig.fixedTonUsd,
      },
      cache: this.cache,
      fixedTonUsd: this.billingConfig.fixedTonUsd,
    };

    const initial = await refreshTwap(deps);
    if (initial) {
      log.info({ tonUsd: initial.tonUsd, source: initial.source }, 'twap primed');
    } else {
      log.warn(
        'initial twap refresh failed — /v1/estimate will forward to gateway until next tick succeeds',
      );
    }

    this.timer = setInterval(() => {
      void refreshTwap(deps).catch((err: unknown) =>
        log.error({ err }, 'twap service tick failed'),
      );
    }, this.billingConfig.priceRefreshIntervalMs);

    log.info(
      { intervalMs: this.billingConfig.priceRefreshIntervalMs },
      'TwapRefreshService started',
    );
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info('TwapRefreshService stopped');
  }
}
