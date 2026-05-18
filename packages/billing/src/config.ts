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

/**
 * Same as `numFromEnv` but rejects zero and negative values. Use for
 * intervals, capacities, and other fields where 0 would crash a downstream
 * consumer (e.g. setInterval, TokenBucketLimiter) at runtime rather than at
 * boot.
 */
const positiveNumFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number().finite().positive());

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
// Phase 6 adds BILLING_ENABLED / BILLING_AUTH_* / BILLING_RATE_LIMIT_* /
//          BILLING_LITELLM_*.
// The TYPE remains `BillingConfig` across all phases (Decision Z10).
// ---------------------------------------------------------------------------

const BillingConfigSchema = z.object({
  // ---- Phase 6: feature gate + auth + rate-limit + LiteLLM proxy ----

  /**
   * Master feature flag. When false (default), the billing gate is disabled:
   * all LLM requests pass through without deductions, and auth routes return
   * 503. Flipping this to true requires BILLING_DATABASE_URL and the
   * chain-write layer to also be configured (Decision Z31).
   */
  BILLING_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  /**
   * Whether auth (x-api-key / Bearer JWT) is required on gated paths.
   * Default true. Can be set to false for dev/test to allow the x-dev-wallet
   * escape hatch (Decision G6). Must not be false in production.
   */
  BILLING_AUTH_REQUIRED: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? true : v !== "false")),

  /**
   * HMAC secret used for JWT signing (HS256) and API-key hashing.
   * Required when BILLING_ENABLED=true && BILLING_AUTH_REQUIRED=true.
   * The cross-validation is enforced by `loadBillingConfig` after Zod parse.
   */
  BILLING_AUTH_SECRET: z.string().optional(),

  /**
   * JWT session token lifetime in milliseconds. Default: 86_400_000 (24h).
   */
  BILLING_AUTH_SESSION_TTL_MS: numFromEnv(86_400_000),

  /**
   * SIWE nonce lifetime in milliseconds. Default: 300_000 (5 minutes).
   * Nonces older than this are rejected and swept by UsageCleanupService.
   */
  BILLING_AUTH_LOGIN_NONCE_TTL_MS: numFromEnv(300_000),

  /**
   * Whether the token-bucket rate limiter is active. Default: true.
   */
  BILLING_RATE_LIMIT_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? true : v !== "false")),

  /**
   * Capacity of the token bucket on the quote/nonce path (requests per minute).
   * Default: 60.
   */
  BILLING_RATE_LIMIT_QUOTE_PER_MIN: positiveNumFromEnv(60),

  /**
   * Capacity of the token bucket on the settle/commit path (requests per minute).
   * Default: 30.
   */
  BILLING_RATE_LIMIT_SETTLE_PER_MIN: positiveNumFromEnv(30),

  /**
   * Default top-up amount in atto-PTON credited after a successful
   * EIP-3009 deposit. Default: 5_000_000_000_000_000_000n (5 PTON).
   */
  BILLING_TOPUP_AMOUNT_PTON: z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === "" ? 5_000_000_000_000_000_000n : BigInt(v),
    )
    .pipe(z.bigint().nonnegative()),

  /**
   * Base URL of the LiteLLM proxy. When set, the billing plugin forwards
   * gated LLM requests here instead of to the upstream API directly.
   * Optional — if absent the plugin acts as a pure billing gate.
   */
  BILLING_LITELLM_BASE_URL: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : v))
    .pipe(z.string().url().optional()),

  /**
   * API key for the LiteLLM proxy. Forwarded as `Authorization: Bearer <key>`
   * when BILLING_LITELLM_BASE_URL is set.
   */
  BILLING_LITELLM_API_KEY: z.string().optional(),

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

  BILLING_TWAP_WINDOW_SECONDS: positiveNumFromEnv(1800),
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
  // Required when BILLING_ENABLED=true. Cross-validation in `loadBillingConfig`
  // enforces this at boot; individual Zod fields are optional to allow
  // disabled-mode startup without a full chain config (Decision Z10/Z31).

  /**
   * RPC URL for the L2 chain hosting ClaudeVault (e.g. Polygon, Base, Titan).
   * Required when BILLING_ENABLED=true.
   */
  BILLING_CHAIN_RPC_URL: z.string().url().optional(),

  /**
   * Chain ID of the L2 chain hosting ClaudeVault. Used for EIP-712 domain
   * construction in `ptonDomain()` and for `BillingClients` transport.
   * Required when BILLING_ENABLED=true.
   */
  BILLING_CHAIN_ID: z.coerce.number().int().positive().optional(),

  /**
   * Deployed ClaudeVault contract address on the L2 chain.
   * Required when BILLING_ENABLED=true.
   */
  BILLING_VAULT_ADDRESS: optionalHexAddress,

  /**
   * Deployed PTON token contract address on the L2 chain.
   * Required when BILLING_ENABLED=true.
   */
  BILLING_PTON_ADDRESS: optionalHexAddress,

  /**
   * Operator EOA private key (hex, 0x-prefixed).
   * Used by the billing layer to sign `depositX402` and `consumeCredits` txs.
   * In production (cloud profile) this should be sourced from
   * `packages/agent/src/auth/credentials.ts` (OS keychain), not bare env.
   * See plan §Config, Risk R7, and Decision OQ3.
   * Required when BILLING_ENABLED=true.
   */
  BILLING_OPERATOR_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "expected 0x-prefixed 32-byte private key")
    .optional(),

  /**
   * Postgres connection URL for the billing ledger.
   * Required when BILLING_ENABLED=true. The plugin service layer constructs a
   * `pg.Pool` from this at start time (Decision Z23). Validated as a URL at
   * boot via Zod, so typos like `BILLING_DATABSE_URL` surface as a
   * `BillingConfigError`, not a service-start throw.
   * When BILLING_ENABLED=false this is optional (no pool is constructed).
   */
  BILLING_DATABASE_URL: z.string().url().optional(),

  // ---- Phase 5: worker / service envs (Decision Z22) ----------------------

  /**
   * Minimum accrued atto-PTON before the consume worker flushes a wallet.
   * Default: 0.5 PTON = 500_000_000_000_000_000n atto-PTON.
   * The worker also fires when the idle clock hits BILLING_CONSUME_MAX_AGE_MS.
   */
  BILLING_CONSUME_BATCH_MIN_PTON: z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === "" ? 500_000_000_000_000_000n : BigInt(v),
    )
    .pipe(z.bigint().nonnegative()),

  /**
   * Maximum age (ms) of an accrual before the idle trigger fires, regardless
   * of whether BILLING_CONSUME_BATCH_MIN_PTON was reached.
   * Default: 300_000 ms (5 minutes).
   */
  BILLING_CONSUME_MAX_AGE_MS: numFromEnv(300_000),

  /**
   * How often the consume worker scans for flush-eligible wallets.
   * Default: 30_000 ms (30 seconds).
   */
  BILLING_CONSUME_SCAN_INTERVAL_MS: positiveNumFromEnv(30_000),

  /**
   * Maximum number of wallets flushed in a single consume worker scan.
   * Default: 10.
   */
  BILLING_CONSUME_MAX_PER_CYCLE: positiveNumFromEnv(10),

  /**
   * How long (days) to retain rows in billing_call_log.
   * Default: 90 days.
   */
  BILLING_USAGE_RETENTION_DAYS: numFromEnv(90),

  /**
   * How often (ms) the usage cleanup worker sweeps old call log rows.
   * Default: 86_400_000 ms (24 hours).
   */
  BILLING_USAGE_CLEANUP_INTERVAL_MS: positiveNumFromEnv(86_400_000),

  /**
   * How often (ms) the TWAP service refreshes the TON/USD price.
   * Default: 60_000 ms (60 seconds).
   */
  BILLING_PRICE_REFRESH_INTERVAL_MS: positiveNumFromEnv(60_000),
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

  // ---- Phase 6: BILLING_ENABLED cross-validation ----
  const enabled = raw.BILLING_ENABLED ?? false;
  const authRequired = raw.BILLING_AUTH_REQUIRED;

  if (enabled) {
    // Chain-write and DB fields are required when billing is enabled.
    if (!raw.BILLING_DATABASE_URL) {
      throw new BillingConfigError(
        "BILLING_ENABLED=true requires BILLING_DATABASE_URL",
      );
    }
    if (!raw.BILLING_CHAIN_RPC_URL) {
      throw new BillingConfigError(
        "BILLING_ENABLED=true requires BILLING_CHAIN_RPC_URL",
      );
    }
    if (!raw.BILLING_CHAIN_ID) {
      throw new BillingConfigError(
        "BILLING_ENABLED=true requires BILLING_CHAIN_ID",
      );
    }
    if (!raw.BILLING_VAULT_ADDRESS) {
      throw new BillingConfigError(
        "BILLING_ENABLED=true requires BILLING_VAULT_ADDRESS",
      );
    }
    if (!raw.BILLING_PTON_ADDRESS) {
      throw new BillingConfigError(
        "BILLING_ENABLED=true requires BILLING_PTON_ADDRESS",
      );
    }
    if (!raw.BILLING_OPERATOR_PRIVATE_KEY) {
      throw new BillingConfigError(
        "BILLING_ENABLED=true requires BILLING_OPERATOR_PRIVATE_KEY",
      );
    }
    // Auth secret required when auth is enforced.
    if (authRequired && !raw.BILLING_AUTH_SECRET) {
      throw new BillingConfigError(
        "BILLING_ENABLED=true && BILLING_AUTH_REQUIRED=true requires BILLING_AUTH_SECRET",
      );
    }
  }

  // Price sanity band must be ordered. An inverted band rejects every legitimate
  // price and makes the gate return 503 on every request.
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
    // ---- Phase 6: feature gate + auth + rate-limit + LiteLLM ----
    enabled,
    authRequired,
    authSecret: raw.BILLING_AUTH_SECRET,
    authSessionTtlMs: raw.BILLING_AUTH_SESSION_TTL_MS,
    authLoginNonceTtlMs: raw.BILLING_AUTH_LOGIN_NONCE_TTL_MS,
    rateLimitEnabled: raw.BILLING_RATE_LIMIT_ENABLED,
    rateLimitQuotePerMin: raw.BILLING_RATE_LIMIT_QUOTE_PER_MIN,
    rateLimitSettlePerMin: raw.BILLING_RATE_LIMIT_SETTLE_PER_MIN,
    topupAmountPton: raw.BILLING_TOPUP_AMOUNT_PTON,
    litellmBaseUrl: raw.BILLING_LITELLM_BASE_URL,
    litellmApiKey: raw.BILLING_LITELLM_API_KEY,

    // ---- TWAP / price oracle ----
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

    // ---- Phase 3: chain-write layer (required when BILLING_ENABLED=true) ----
    // Cast to non-optional — cross-validation above ensures these are set
    // when enabled=true; when disabled callers should not use these fields.
    chainRpcUrl: raw.BILLING_CHAIN_RPC_URL as string,
    chainId: raw.BILLING_CHAIN_ID as number,
    vaultAddress: raw.BILLING_VAULT_ADDRESS as Address,
    ptonAddress: raw.BILLING_PTON_ADDRESS as Address,
    operatorPrivateKey: raw.BILLING_OPERATOR_PRIVATE_KEY as Hex,
    databaseUrl: raw.BILLING_DATABASE_URL as string,

    // ---- Phase 5: worker / service config (Decision Z22) ----
    consumeBatchMinPton: raw.BILLING_CONSUME_BATCH_MIN_PTON,
    consumeMaxAgeMs: raw.BILLING_CONSUME_MAX_AGE_MS,
    consumeScanIntervalMs: raw.BILLING_CONSUME_SCAN_INTERVAL_MS,
    consumeMaxPerCycle: raw.BILLING_CONSUME_MAX_PER_CYCLE,
    usageRetentionDays: raw.BILLING_USAGE_RETENTION_DAYS,
    usageCleanupIntervalMs: raw.BILLING_USAGE_CLEANUP_INTERVAL_MS,
    priceRefreshIntervalMs: raw.BILLING_PRICE_REFRESH_INTERVAL_MS,
  } as const;
}

export type BillingConfig = ReturnType<typeof loadBillingConfig>;
