/**
 * Billing config — v2.0.0 (post-gateway migration).
 *
 * The CLI no longer owns billing state: ledger, auth, workers, and on-chain
 * writes live in the hosted gateway. What remains here is the config the CLI
 * still needs for offline /v1/estimate quoting (TWAP oracle), for showing the
 * user the EIP-712 domain they're about to sign, and the gateway URL the
 * thin-client routes forward to.
 *
 * Backwards compat: `BILLING_DATABASE_URL` is read so we can detect the v1.x
 * env shape and emit a one-time deprecation warning at boot — but it is NOT
 * honored. Setting it has no effect. See plan §6.5.
 */

import { z } from 'zod';
import type { Address } from 'viem';

// ---------------------------------------------------------------------------
// Zod helpers
// ---------------------------------------------------------------------------

const numFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number(v)))
    .pipe(z.number().finite());

/**
 * Same as `numFromEnv` but rejects zero and negative values.
 */
const positiveNumFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number(v)))
    .pipe(z.number().finite().positive());

const optionalHexAddress = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v))
  .pipe(
    z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, 'expected 0x-prefixed address')
      .optional(),
  );

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const BillingConfigSchema = z.object({
  // ---- Gateway thin-client envs (v2.0.0+) ---------------------------------

  /** Hosted gateway base URL. CLI routes forward here. */
  TOKAGENT_GATEWAY_URL: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? 'https://gateway.tokagent.ai' : v))
    .pipe(z.string().url()),

  /** Per-request timeout for the gateway fetch wrapper. */
  TOKAGENT_GATEWAY_TIMEOUT_MS: positiveNumFromEnv(30_000),

  // ---- Master feature flag ------------------------------------------------

  /**
   * When false the billing gate + routes are inactive. v2.x default is true
   * once a gateway URL exists. The flag is retained so the agent runtime can
   * still surface "billing is off" UX consistently with v1.x.
   */
  BILLING_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  /**
   * Whether auth is required on gated paths. Defaults to true.
   * The CLI does NOT enforce auth itself — it forwards the headers as-is to
   * the gateway, which is canonical. This flag is kept so the wizard / setup
   * panel UI can render meaningfully.
   */
  BILLING_AUTH_REQUIRED: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? true : v !== 'false')),

  // ---- TWAP / price oracle (used by offline /v1/estimate) -----------------

  BILLING_MAINNET_RPC_URL: z.string().url().optional(),

  BILLING_WTON_WETH_POOL_ADDRESS: optionalHexAddress,
  BILLING_WTON_IS_TOKEN0_IN_WETH_POOL: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  BILLING_WTON_DECIMALS: numFromEnv(27),

  BILLING_WETH_USDC_POOL_ADDRESS: optionalHexAddress,
  BILLING_WETH_IS_TOKEN0_IN_USDC_POOL: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  BILLING_WETH_DECIMALS: numFromEnv(18),
  BILLING_USDC_DECIMALS: numFromEnv(6),

  BILLING_TWAP_WINDOW_SECONDS: positiveNumFromEnv(1800),
  BILLING_PRICE_CACHE_MS: numFromEnv(60_000),
  BILLING_MAX_PRICE_STALENESS_MS: numFromEnv(600_000),
  BILLING_PRICE_SANITY_MIN_USD: numFromEnv(0.05),
  BILLING_PRICE_SANITY_MAX_USD: numFromEnv(10),
  BILLING_PRICE_REFRESH_INTERVAL_MS: positiveNumFromEnv(60_000),

  // ---- Margin / promotion (display-only for offline estimate) -------------

  BILLING_MARGIN_BPS: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : Number(v)))
    .pipe(z.number().finite().optional()),
  BILLING_MARGIN_FLOOR_BPS: numFromEnv(0),
  BILLING_PROMOTION_DISCOUNT_BPS: numFromEnv(0),

  // ---- Test override ------------------------------------------------------

  BILLING_FIXED_TON_USD: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : Number(v))),

  // ---- Chain identification (for EIP-712 preview signing) -----------------
  // The CLI does not write to chain in v2.x; these are kept so the CLI can
  // render the EIP-3009/SIWE domain a user is about to sign on the wizard
  // and so the offline /v1/estimate can show the right vault/asset addresses.

  BILLING_CHAIN_RPC_URL: z.string().url().optional(),
  BILLING_CHAIN_ID: z.coerce.number().int().positive().optional(),
  BILLING_VAULT_ADDRESS: optionalHexAddress,
  BILLING_PTON_ADDRESS: optionalHexAddress,

  // ---- LiteLLM passthrough fallback ---------------------------------------
  // When set, the plugin's /v1/chat/completions route uses LiteLLM directly
  // instead of forwarding to the gateway. This is a CLI-LOCAL fallback, NOT
  // a gateway concern.

  BILLING_LITELLM_BASE_URL: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : v))
    .pipe(z.string().url().optional()),
  BILLING_LITELLM_API_KEY: z.string().optional(),

  // ---- Deprecated v1.x envs (read so we can warn, otherwise IGNORED) ------
  /**
   * v1.x billing DB connection string. In v2.x the gateway owns the DB and
   * this value is no longer honored. `loadBillingConfig` surfaces it via the
   * returned `deprecatedDatabaseUrl` field so the plugin boot path can log a
   * one-time deprecation warning.
   */
  BILLING_DATABASE_URL: z.string().optional(),
  /**
   * v1.x operator EOA. The CLI no longer signs chain writes; the gateway
   * holds the operator key. Read so we can warn.
   */
  BILLING_OPERATOR_PRIVATE_KEY: z.string().optional(),
  /**
   * v1.x HMAC secret. The gateway now mints JWTs; the CLI never verifies
   * them. Read so we can warn.
   */
  BILLING_AUTH_SECRET: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Margin helpers (unchanged from v1.x)
// ---------------------------------------------------------------------------

function defaultMarginBps(nodeEnv: string | undefined): number {
  return nodeEnv === 'production' ? 100 : 10;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingConfigError';
  }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Pure loader — does NOT touch `process.env` at import time.
 */
export function loadBillingConfig(env: NodeJS.ProcessEnv, nodeEnv?: string) {
  const raw = BillingConfigSchema.parse(env);

  // ---- Sanity bands ----
  if (raw.BILLING_PRICE_SANITY_MIN_USD >= raw.BILLING_PRICE_SANITY_MAX_USD) {
    throw new BillingConfigError(
      `BILLING_PRICE_SANITY_MIN_USD (${raw.BILLING_PRICE_SANITY_MIN_USD}) ` +
        `must be < BILLING_PRICE_SANITY_MAX_USD (${raw.BILLING_PRICE_SANITY_MAX_USD})`,
    );
  }

  // ---- Margin policy ----
  const marginBps = raw.BILLING_MARGIN_BPS ?? defaultMarginBps(nodeEnv);
  const marginFloorBps = raw.BILLING_MARGIN_FLOOR_BPS;
  const promotionDiscountBps = raw.BILLING_PROMOTION_DISCOUNT_BPS;

  if (marginBps < 0) {
    throw new BillingConfigError(`BILLING_MARGIN_BPS must be non-negative (got ${marginBps})`);
  }
  if (marginFloorBps < 0) {
    throw new BillingConfigError(
      `BILLING_MARGIN_FLOOR_BPS must be non-negative (got ${marginFloorBps})`,
    );
  }
  if (promotionDiscountBps < 0) {
    throw new BillingConfigError(
      `BILLING_PROMOTION_DISCOUNT_BPS must be non-negative (got ${promotionDiscountBps})`,
    );
  }
  if (marginBps < marginFloorBps) {
    throw new BillingConfigError(
      `BILLING_MARGIN_BPS (${marginBps}) is below BILLING_MARGIN_FLOOR_BPS (${marginFloorBps})`,
    );
  }
  const effectiveMarginBps = marginBps - promotionDiscountBps;
  if (effectiveMarginBps < 0) {
    throw new BillingConfigError(
      `effective margin (BILLING_MARGIN_BPS - BILLING_PROMOTION_DISCOUNT_BPS = ${effectiveMarginBps}) cannot be negative`,
    );
  }

  const wtonWethPool =
    raw.BILLING_WTON_WETH_POOL_ADDRESS !== undefined
      ? {
          address: raw.BILLING_WTON_WETH_POOL_ADDRESS as Address,
          baseIsToken0: raw.BILLING_WTON_IS_TOKEN0_IN_WETH_POOL,
          baseDecimals: raw.BILLING_WTON_DECIMALS,
          quoteDecimals: raw.BILLING_WETH_DECIMALS,
        }
      : undefined;

  const wethUsdcPool =
    raw.BILLING_WETH_USDC_POOL_ADDRESS !== undefined
      ? {
          address: raw.BILLING_WETH_USDC_POOL_ADDRESS as Address,
          baseIsToken0: raw.BILLING_WETH_IS_TOKEN0_IN_USDC_POOL,
          baseDecimals: raw.BILLING_WETH_DECIMALS,
          quoteDecimals: raw.BILLING_USDC_DECIMALS,
        }
      : undefined;

  // ---- Deprecation surface (NOT enforced — caller logs a warning if set) ----
  const deprecatedDatabaseUrl = raw.BILLING_DATABASE_URL?.trim() || undefined;
  const deprecatedOperatorPrivateKey =
    raw.BILLING_OPERATOR_PRIVATE_KEY?.trim() || undefined;
  const deprecatedAuthSecret = raw.BILLING_AUTH_SECRET?.trim() || undefined;

  return {
    // ---- Gateway thin-client ----
    gatewayUrl: raw.TOKAGENT_GATEWAY_URL,
    gatewayTimeoutMs: raw.TOKAGENT_GATEWAY_TIMEOUT_MS,

    // ---- Feature flags ----
    enabled: raw.BILLING_ENABLED ?? false,
    authRequired: raw.BILLING_AUTH_REQUIRED,

    // ---- TWAP / oracle ----
    mainnetRpcUrl: raw.BILLING_MAINNET_RPC_URL,
    wtonWethPool,
    wethUsdcPool,
    twapWindowSeconds: raw.BILLING_TWAP_WINDOW_SECONDS,
    priceCacheMs: raw.BILLING_PRICE_CACHE_MS,
    maxPriceStalenessMs: raw.BILLING_MAX_PRICE_STALENESS_MS,
    priceSanityMinUsd: raw.BILLING_PRICE_SANITY_MIN_USD,
    priceSanityMaxUsd: raw.BILLING_PRICE_SANITY_MAX_USD,
    priceRefreshIntervalMs: raw.BILLING_PRICE_REFRESH_INTERVAL_MS,
    fixedTonUsd: raw.BILLING_FIXED_TON_USD,

    // ---- Margin (display only for offline /v1/estimate) ----
    marginBps,
    marginFloorBps,
    promotionDiscountBps,
    effectiveMarginBps,

    // ---- Chain identification (display + EIP-712 preview only) ----
    chainRpcUrl: raw.BILLING_CHAIN_RPC_URL,
    chainId: raw.BILLING_CHAIN_ID,
    vaultAddress: raw.BILLING_VAULT_ADDRESS as Address | undefined,
    ptonAddress: raw.BILLING_PTON_ADDRESS as Address | undefined,

    // ---- LiteLLM CLI-local fallback ----
    litellmBaseUrl: raw.BILLING_LITELLM_BASE_URL,
    litellmApiKey: raw.BILLING_LITELLM_API_KEY,

    // ---- Deprecation surface ----
    deprecatedDatabaseUrl,
    deprecatedOperatorPrivateKey,
    deprecatedAuthSecret,
  } as const;
}

export type BillingConfig = ReturnType<typeof loadBillingConfig>;
