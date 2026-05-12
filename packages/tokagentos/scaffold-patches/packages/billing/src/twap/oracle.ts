import type { Address, PublicClient } from "viem";

export const UNISWAP_V3_POOL_ABI = [
  {
    type: "function",
    name: "observe",
    stateMutability: "view",
    inputs: [{ name: "secondsAgos", type: "uint32[]" }],
    outputs: [
      { name: "tickCumulatives", type: "int56[]" },
      { name: "secondsPerLiquidityCumulativeX128s", type: "uint160[]" },
    ],
  },
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

/**
 * Describes one V3 pool in terms of a `base` token and a `quote` token.
 * `baseIsToken0` tells us which side of the pool is our base asset, so we
 * can correctly invert the raw tick-derived ratio when needed.
 */
export interface PoolConfig {
  address: Address;
  baseIsToken0: boolean;
  baseDecimals: number;
  quoteDecimals: number;
}

export interface PriceSnapshot {
  tonUsd: number;
  source: "composite-twap" | "fixed" | "stale-cache";
  fetchedAt: number;
  ageMs: number;
  legs?: {
    wtonPerWeth?: number;
    wethUsd?: number;
  };
}

export interface OracleConfig {
  // Composite path only: TON has no mainnet USDC pool. WTON wraps TON 1:1 in
  // human units (WTON has 27 decimals, TON has 18 — decimal-adjusted price is
  // identical), so we read WTON/WETH and WETH/USDC and multiply.
  wtonWethPool?: PoolConfig; // base=WTON, quote=WETH
  wethUsdcPool?: PoolConfig; // base=WETH, quote=USDC
  twapWindowSeconds: number;
  cacheMs: number;
  maxStalenessMs: number;
  sanity: { minUsd: number; maxUsd: number };
  fixedPrice?: number;
}

/**
 * Read a composite WTON/WETH × WETH/USDC TWAP from on-chain Uniswap V3 pools.
 *
 * The `client` parameter is explicitly injected rather than using a module-level
 * singleton so that this function is testable and composable. The caller (Phase 5
 * worker or Phase 6 route handler) controls client instantiation.
 *
 * Returns a PriceSnapshot with source="composite-twap". Throws on any error
 * (invalid price, sanity failure, RPC error) — the cache layer in oracle/cache.ts
 * handles stale-cache fallback.
 */
export async function readCompositeTwap(
  client: PublicClient,
  oracle: OracleConfig,
): Promise<PriceSnapshot> {
  if (oracle.fixedPrice !== undefined) {
    return {
      tonUsd: oracle.fixedPrice,
      source: "fixed",
      fetchedAt: Date.now(),
      ageMs: 0,
    };
  }

  if (!oracle.wtonWethPool || !oracle.wethUsdcPool) {
    throw new Error(
      "TWAP oracle: composite pools (WTON/WETH and WETH/USDC) not configured and fixedPrice unset",
    );
  }

  const wethPerWton = await readPoolPrice(client, oracle.wtonWethPool, oracle.twapWindowSeconds);
  const usdcPerWeth = await readPoolPrice(client, oracle.wethUsdcPool, oracle.twapWindowSeconds);
  // WTON/TON are value-equivalent at human scale, so USDC-per-WTON = TON-USD.
  const tonUsd = wethPerWton * usdcPerWeth;

  if (!Number.isFinite(tonUsd) || tonUsd <= 0) {
    throw new Error(
      `composite TWAP produced invalid price: ${tonUsd} (wethPerWton=${wethPerWton}, usdcPerWeth=${usdcPerWeth})`,
    );
  }
  if (tonUsd < oracle.sanity.minUsd || tonUsd > oracle.sanity.maxUsd) {
    throw new Error(
      `composite TWAP ${tonUsd} outside sanity bounds [${oracle.sanity.minUsd}, ${oracle.sanity.maxUsd}]`,
    );
  }

  return {
    tonUsd,
    source: "composite-twap",
    fetchedAt: Date.now(),
    ageMs: 0,
    legs: { wtonPerWeth: 1 / wethPerWton, wethUsd: usdcPerWeth },
  };
}

/**
 * Returns quote-per-base (in human decimal units) for the given pool over
 * the configured TWAP window. Decimal adjustment keeps 1 WTON and 1 TON
 * producing the same USD number despite WTON using 27 decimals.
 */
async function readPoolPrice(
  client: PublicClient,
  pool: PoolConfig,
  twapWindowSeconds: number,
): Promise<number> {
  const result = (await client.readContract({
    address: pool.address,
    abi: UNISWAP_V3_POOL_ABI,
    functionName: "observe",
    args: [[twapWindowSeconds, 0]],
  })) as readonly [readonly bigint[], readonly bigint[]];

  const tickCumulatives = result[0];
  const t0 = tickCumulatives[0];
  const t1 = tickCumulatives[1];
  if (t0 === undefined || t1 === undefined) {
    throw new Error(`TWAP observe returned empty tickCumulatives for ${pool.address}`);
  }
  const delta = Number(t1 - t0);
  const avgTick = delta / twapWindowSeconds;

  // raw = token1-per-token0 in raw units; multiply by 10^(dec0 - dec1) to
  // get the same ratio in human-readable units.
  const dec0 = pool.baseIsToken0 ? pool.baseDecimals : pool.quoteDecimals;
  const dec1 = pool.baseIsToken0 ? pool.quoteDecimals : pool.baseDecimals;
  const humanToken1PerToken0 = Math.pow(1.0001, avgTick) * Math.pow(10, dec0 - dec1);

  // If base is token0, that's already quote-per-base; otherwise invert.
  return pool.baseIsToken0 ? humanToken1PerToken0 : 1 / humanToken1PerToken0;
}
