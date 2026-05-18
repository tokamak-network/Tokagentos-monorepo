/**
 * Plugin.init / Plugin.dispose for the tokagent-billing plugin (v2.0.0).
 *
 * v1.x: built a pg.Pool, ran Drizzle migrations, constructed viem clients
 * including a wallet client signed by the operator EOA.
 * v2.x: builds nothing of that. The hosted gateway owns ledger, auth, chain
 * writes, and operator key. The CLI is a forwarder.
 *
 * What init still does:
 *   1. Reads BILLING_* + TOKAGENT_GATEWAY_* settings into a NodeJS.ProcessEnv
 *      shape and runs `loadBillingConfig`.
 *   2. If BILLING_ENABLED=false → log + return (no-op mode).
 *   3. Logs a one-time deprecation warning when the v1.x env vars are still
 *      present (BILLING_DATABASE_URL, BILLING_OPERATOR_PRIVATE_KEY,
 *      BILLING_AUTH_SECRET). The values are NOT honored — the gateway is
 *      the source of truth.
 *   4. Constructs the gateway client + stashes shared state.
 *
 * No DB connection, no migration, no chain RPC handshake. The TWAP refresh
 * service still owns its own mainnet RPC for the local /v1/estimate cache,
 * but that's wired separately inside the service.
 */

import { logger, type IAgentRuntime } from '@tokagentos/core';
import { loadBillingConfig } from '@tokagentos/billing';
import {
  setBillingState,
  clearBillingState,
  isBillingStateInitialized,
} from './state.js';
import { createGatewayClient, resetGatewayClient } from './lib/gateway-proxy.js';

const log = logger.child({ src: 'billing:init' });

const BILLING_KEYS = [
  // ---- Gateway thin-client (v2.0.0+) ----
  'TOKAGENT_GATEWAY_URL',
  'TOKAGENT_GATEWAY_TIMEOUT_MS',
  // ---- Feature flags ----
  'BILLING_ENABLED',
  'BILLING_AUTH_REQUIRED',
  // ---- TWAP / oracle ----
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
  // ---- Margin (display) ----
  'BILLING_MARGIN_BPS',
  'BILLING_MARGIN_FLOOR_BPS',
  'BILLING_PROMOTION_DISCOUNT_BPS',
  // ---- Chain identification (display + EIP-712 preview) ----
  'BILLING_CHAIN_RPC_URL',
  'BILLING_CHAIN_ID',
  'BILLING_VAULT_ADDRESS',
  'BILLING_PTON_ADDRESS',
  // ---- LiteLLM passthrough fallback (CLI-local) ----
  'BILLING_LITELLM_BASE_URL',
  'BILLING_LITELLM_API_KEY',
  // ---- Deprecated v1.x envs (read to warn, NOT honored) ----
  'BILLING_DATABASE_URL',
  'BILLING_OPERATOR_PRIVATE_KEY',
  'BILLING_AUTH_SECRET',
] as const;

function buildEnv(runtime: IAgentRuntime): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const k of BILLING_KEYS) {
    const procVal = process.env[k];
    const val =
      procVal !== undefined && procVal !== '' ? procVal : runtime.getSetting(k);
    if (val !== null && val !== undefined) {
      env[k] = String(val);
    }
  }
  return env as NodeJS.ProcessEnv;
}

/** Has the boot path already emitted the v1.x deprecation warning? */
let _v1WarningEmitted = false;

function emitV1DeprecationWarnings(cfg: {
  deprecatedDatabaseUrl?: string;
  deprecatedOperatorPrivateKey?: string;
  deprecatedAuthSecret?: string;
}): void {
  if (_v1WarningEmitted) return;
  if (
    !cfg.deprecatedDatabaseUrl &&
    !cfg.deprecatedOperatorPrivateKey &&
    !cfg.deprecatedAuthSecret
  ) {
    return;
  }
  _v1WarningEmitted = true;

  if (cfg.deprecatedDatabaseUrl) {
    log.warn(
      'BILLING_DATABASE_URL is no longer used. Billing is now served by ' +
        'the gateway at TOKAGENT_GATEWAY_URL. ' +
        'See https://docs.tokagent.ai/migrate-v2.',
    );
  }
  if (cfg.deprecatedOperatorPrivateKey) {
    log.warn(
      'BILLING_OPERATOR_PRIVATE_KEY is no longer used by the CLI in v2.x. ' +
        'The gateway holds the operator key. Remove this env var. ' +
        'See https://docs.tokagent.ai/migrate-v2.',
    );
  }
  if (cfg.deprecatedAuthSecret) {
    log.warn(
      'BILLING_AUTH_SECRET is no longer used by the CLI in v2.x. ' +
        'The gateway mints JWTs. Remove this env var. ' +
        'See https://docs.tokagent.ai/migrate-v2.',
    );
  }
}

export async function initBillingPlugin(runtime: IAgentRuntime): Promise<void> {
  const env = buildEnv(runtime);
  const config = loadBillingConfig(env);

  // Always emit v1.x deprecation warnings — even when billing is disabled —
  // so an upgrader sees the message regardless of feature-flag state.
  emitV1DeprecationWarnings(config);

  if (!config.enabled) {
    log.info(
      'BILLING_ENABLED=false — billing plugin running in no-op mode; ' +
        'middleware and routes are inactive',
    );
    return;
  }

  log.info(
    { gatewayUrl: config.gatewayUrl },
    'billing plugin initializing as thin-client forwarder',
  );

  const gateway = createGatewayClient({
    baseUrl: config.gatewayUrl,
    timeoutMs: config.gatewayTimeoutMs,
  });

  setBillingState({ config, gateway });

  log.info('billing plugin initialized — forwarding to gateway');
}

export async function disposeBillingPlugin(): Promise<void> {
  if (!isBillingStateInitialized()) {
    return;
  }
  log.info('billing plugin disposing');
  await clearBillingState();
  resetGatewayClient();
  log.info('billing plugin disposed');
}
