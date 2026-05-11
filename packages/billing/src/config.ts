import { z } from "zod";
import type { Address } from "viem";

// ---------------------------------------------------------------------------
// Zod helpers
// ---------------------------------------------------------------------------

const numFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number().finite());

const optionalHexAddress = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : v))
  .pipe(
    z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, "expected 0x-prefixed address")
      .optional(),
  );

// ---------------------------------------------------------------------------
// Phase 2 schema — pricing / billing / TWAP envs only.
//
// Deferred env namespaces:
//   Phase 3+: BILLING_CHAIN_RPC_URL, BILLING_CHAIN_ID, BILLING_VAULT_ADDRESS,
//             BILLING_PTON_ADDRESS, BILLING_OPERATOR_PRIVATE_KEY
//   Phase 4:  BILLING_TOPUP_AMOUNT_PTON, BILLING_CONSUME_*
//   Phase 6:  BILLING_AUTH_*, BILLING_RATE_LIMIT_*, BILLING_LITELLM_*
// ---------------------------------------------------------------------------

const Phase2ConfigSchema = z.object({
  // ---- TWAP / price oracle ----
  BILLING_MAINNET_RPC_URL: z.string().url().optional(),

  BILLING_WTON_WETH_POOL_ADDRESS: optionalHexAddress,
  BILLING_WTON_IS_TOKEN0_IN_WETH_POOL: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  BILLING_WTON_DECIMALS: numFromEnv(27),

  BILLING_WETH_USDC_POOL_ADDRESS: optionalHexAddress,
  BILLING_WETH_IS_TOKEN0_IN_USDC_POOL: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  BILLING_WETH_DECIMALS: numFromEnv(18),
  BILLING_USDC_DECIMALS: numFromEnv(6),

  BILLING_TWAP_WINDOW_SECONDS: numFromEnv(1800),
  BILLING_PRICE_CACHE_MS: numFromEnv(60_000),
  BILLING_MAX_PRICE_STALENESS_MS: numFromEnv(600_000),
  BILLING_PRICE_SANITY_MIN_USD: numFromEnv(0.05),
  BILLING_PRICE_SANITY_MAX_USD: numFromEnv(10),

  // ---- Margin / promotion config ----
  // Operator margin in basis points. Default is environment-aware: production
  // uses 100 bps (1%) so a single L2 consume tx (~$0.003) is amortised across
  // ~$0.30 of inference; dev/test stay at 10 bps to match historical behaviour.
  // The actual default is resolved by `loadBillingConfig` below — leaving this
  // entry as `numFromEnv(0)` here would conflict with the env-aware logic, so
  // we model it as optional and fold the default in `loadBillingConfig`.
  BILLING_MARGIN_BPS: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v)))
    .pipe(z.number().finite().optional()),
  // Hard floor below which the proxy refuses to start. Protects against a
  // misconfiguration that would silently make every request unprofitable.
  // `0` means no floor; production should set this to e.g. 50 (= 0.5%).
  BILLING_MARGIN_FLOOR_BPS: numFromEnv(0),
  // Promotion / discount applied on top of BILLING_MARGIN_BPS. Allowed to be
  // 0 or positive; the *effective* margin must remain non-negative or boot fails.
  BILLING_PROMOTION_DISCOUNT_BPS: numFromEnv(0),

  // ---- Test override ----
  BILLING_FIXED_TON_USD: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v))),
});

// ---------------------------------------------------------------------------
// Margin helpers
// ---------------------------------------------------------------------------

/**
 * Default operator margin per environment. Production deployments must
 * cover L2 consume gas at the chosen chain; 100 bps (1%) is the floor that
 * lets even sub-cent inference calls remain profitable on Base/Optimism/Titan.
 * Dev/test stays at 10 bps so the existing fixtures continue to pass without
 * env tweaks.
 */
function defaultMarginBps(nodeEnv: string | undefined): number {
  return nodeEnv === "production" ? 100 : 10;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigError";
  }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Pure loader — does NOT touch `process.env` at import time.
 *
 * Tests drive this with a crafted env object; the production caller passes
 * `process.env` explicitly. There is intentionally NO singleton export at the
 * bottom of this file — require explicit `loadBillingConfig(env)` calls.
 */
export function loadBillingConfig(
  env: NodeJS.ProcessEnv,
  nodeEnv?: string,
) {
  const raw = Phase2ConfigSchema.parse(env);

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
      `BILLING_MARGIN_BPS (${marginBps}) is below BILLING_MARGIN_FLOOR_BPS (${marginFloorBps}); booting would lock the operator into a guaranteed loss`,
    );
  }
  const effectiveMarginBps = marginBps - promotionDiscountBps;
  if (effectiveMarginBps < 0) {
    throw new BillingConfigError(
      `effective margin (BILLING_MARGIN_BPS - BILLING_PROMOTION_DISCOUNT_BPS = ${effectiveMarginBps}) cannot be negative; reduce BILLING_PROMOTION_DISCOUNT_BPS`,
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

  return {
    mainnetRpcUrl: raw.BILLING_MAINNET_RPC_URL,
    wtonWethPool,
    wethUsdcPool,

    twapWindowSeconds: raw.BILLING_TWAP_WINDOW_SECONDS,
    priceCacheMs: raw.BILLING_PRICE_CACHE_MS,
    maxPriceStalenessMs: raw.BILLING_MAX_PRICE_STALENESS_MS,
    priceSanityMinUsd: raw.BILLING_PRICE_SANITY_MIN_USD,
    priceSanityMaxUsd: raw.BILLING_PRICE_SANITY_MAX_USD,

    marginBps,
    marginFloorBps,
    promotionDiscountBps,
    /** Margin actually applied at billing time. Always = marginBps - promotionDiscountBps. */
    effectiveMarginBps,

    fixedTonUsd: raw.BILLING_FIXED_TON_USD,
  } as const;
}

export type BillingConfigPhase2 = ReturnType<typeof loadBillingConfig>;
