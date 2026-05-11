import { z } from "zod";
import type { Address, Hex } from "viem";

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

/** Required 0x-prefixed EVM address validator (40 hex chars after 0x). */
const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected 0x-prefixed 20-byte address");

/**
 * Required 0x-prefixed 32-byte private key validator.
 * Accepts 64 hex chars after 0x (standard secp256k1 private key size).
 */
const hexPrivateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected 0x-prefixed 32-byte private key");

// ---------------------------------------------------------------------------
// Billing config schema — pricing / billing / TWAP envs land in Phase 2.
// Phase 3 adds chain-write envs (BILLING_CHAIN_RPC_URL, BILLING_CHAIN_ID,
// BILLING_VAULT_ADDRESS, BILLING_PTON_ADDRESS, BILLING_OPERATOR_PRIVATE_KEY).
// Phase 4 adds BILLING_TOPUP_AMOUNT_PTON / BILLING_CONSUME_*.
// Phase 6 adds BILLING_AUTH_* / BILLING_RATE_LIMIT_* / BILLING_LITELLM_*.
// The TYPE remains `BillingConfig` across all phases (Decision Z10).
// ---------------------------------------------------------------------------

const BillingConfigSchema = z.object({
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

  // ---- Phase 3: chain-write layer ----------------------------------------
  // These five envs are required when the chain layer is used (Phase 6 wires
  // `BILLING_ENABLED` as the top-level gate). Until Phase 6 they are always
  // present in the schema but the caller decides whether to assert their
  // presence. Decision Z10: single BillingConfig shape grows incrementally.

  /** RPC URL for the L2 chain hosting ClaudeVault (e.g. Polygon, Base, Titan). */
  BILLING_CHAIN_RPC_URL: z.string().url().optional(),

  /**
   * Chain ID of the L2 chain hosting ClaudeVault. Used for EIP-712 domain
   * construction in `ptonDomain()` and for `BillingClients` transport.
   */
  BILLING_CHAIN_ID: z.coerce.number().int().positive().optional(),

  /** Deployed ClaudeVault contract address on the L2 chain. */
  BILLING_VAULT_ADDRESS: hexAddress.optional(),

  /** Deployed PTON token contract address on the L2 chain. */
  BILLING_PTON_ADDRESS: hexAddress.optional(),

  /**
   * Operator EOA private key (hex, 0x-prefixed).
   * Used by the billing layer to sign `depositX402` and `consumeCredits` txs.
   * In production (cloud profile) this should be sourced from
   * `packages/agent/src/auth/credentials.ts` (OS keychain), not bare env.
   * See plan §Config, Risk R7, and Decision OQ3.
   */
  BILLING_OPERATOR_PRIVATE_KEY: hexPrivateKey.optional(),
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
  const raw = BillingConfigSchema.parse(env);

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

    // ---- Phase 3: chain-write layer ----
    chainRpcUrl: raw.BILLING_CHAIN_RPC_URL,
    chainId: raw.BILLING_CHAIN_ID,
    vaultAddress: raw.BILLING_VAULT_ADDRESS as Address | undefined,
    ptonAddress: raw.BILLING_PTON_ADDRESS as Address | undefined,
    operatorPrivateKey: raw.BILLING_OPERATOR_PRIVATE_KEY as Hex | undefined,
  } as const;
}

export type BillingConfig = ReturnType<typeof loadBillingConfig>;
