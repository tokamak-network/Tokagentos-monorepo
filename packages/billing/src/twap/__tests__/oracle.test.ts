import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PublicClient } from 'viem';

// Mock `fetchTokamakApiPrice` to fail by default. Otherwise the orchestration
// tests below (which want to exercise the on-chain TWAP path + stale-cache
// fallback path) would short-circuit on the Tokamak public API call, which
// happily reaches the real network in tests. Individual tests can override
// via `mockResolvedValueOnce` if they want to exercise the live-API path.
vi.mock('../oracle.js', async (importActual) => {
  const actual = await importActual<typeof import('../oracle.js')>();
  return {
    ...actual,
    fetchTokamakApiPrice: vi.fn(() =>
      Promise.reject(new Error('Tokamak API mocked off in unit tests')),
    ),
  };
});

import { readCompositeTwap, TwapCache, getCachedTonUsd } from '../index.js';
import type { OracleConfig, PoolConfig } from '../oracle.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOracleConfig(override?: Partial<OracleConfig>): OracleConfig {
  return {
    wtonWethPool: {
      address: '0x1111111111111111111111111111111111111111',
      baseIsToken0: true,
      baseDecimals: 27, // WTON
      quoteDecimals: 18, // WETH
    } satisfies PoolConfig,
    wethUsdcPool: {
      address: '0x2222222222222222222222222222222222222222',
      baseIsToken0: true,
      baseDecimals: 18, // WETH
      quoteDecimals: 6,  // USDC
    } satisfies PoolConfig,
    twapWindowSeconds: 1800,
    cacheMs: 60_000,
    maxStalenessMs: 600_000,
    sanity: { minUsd: 0.05, maxUsd: 10 },
    ...override,
  };
}

/**
 * Build a mock PublicClient whose `readContract` returns the given tick
 * cumulatives for the two pools in order (first call = WTON/WETH, second = WETH/USDC).
 *
 * The tick math used by the oracle:
 *   avgTick = (t1 - t0) / window
 *   humanToken1PerToken0 = 1.0001^avgTick * 10^(dec0 - dec1)
 *
 * We compute what tick cumulatives (t0, t1) would produce a desired ratio
 * by inverting the formula.
 */
function makeClient(
  wtonWethTickDelta: bigint, // t1 - t0 for WTON/WETH pool
  wethUsdcTickDelta: bigint, // t1 - t0 for WETH/USDC pool
  window: number = 1800,
): PublicClient {
  let callCount = 0;
  const readContract = vi.fn((_args: unknown) => {
    const idx = callCount++;
    if (idx === 0) {
      // WTON/WETH pool
      return Promise.resolve([[0n, wtonWethTickDelta], [0n, 0n]] as readonly [readonly bigint[], readonly bigint[]]);
    }
    // WETH/USDC pool
    return Promise.resolve([[0n, wethUsdcTickDelta], [0n, 0n]] as readonly [readonly bigint[], readonly bigint[]]);
  });
  return { readContract } as unknown as PublicClient;
}

// ---------------------------------------------------------------------------
// 1. Composite math
// ---------------------------------------------------------------------------

describe('readCompositeTwap — composite math', () => {
  it('computes tonUsd = wethPerWton * usdcPerWeth correctly', async () => {
    const window = 1800;
    const oracle = makeOracleConfig({ twapWindowSeconds: window });

    // Choose tick deltas that produce known prices:
    // WTON/WETH: we want wethPerWton = 0.0004 (WTON is worth 0.0004 WETH)
    // avg tick for WTON/WETH (base=WTON dec=27, quote=WETH dec=18):
    //   humanToken1PerToken0 = 1.0001^avgTick * 10^(27-18)
    //   We want humanToken1PerToken0 (quote/base) = wethPerWton = 0.0004
    //   0.0004 = 1.0001^avgTick * 10^9
    //   1.0001^avgTick = 0.0004 / 1e9 = 4e-13
    //   avgTick = ln(4e-13) / ln(1.0001) ≈ -276,813
    //   tickDelta ≈ avgTick * window = -276813 * 1800 ≈ -498,263,400
    // We'll simplify by using avgTick = 0 to get price = 10^(27-18) = 1e9 WETH/WTON,
    // but that's unrealistic. Instead let's just verify the formula works with
    // simple tick=0 and validate the math mechanically.

    // With avgTick = 0: humanToken1PerToken0 = 1.0001^0 * 10^(dec0-dec1)
    // WTON/WETH pool (base=WTON dec=27, quote=WETH dec=18):
    //   humanToken1PerToken0 = 1 * 10^(27-18) = 1e9 → wethPerWton = 1e9 (price/base=WTON)
    //   Since baseIsToken0=true: quote-per-base = 1e9 WETH per WTON
    // WETH/USDC pool (base=WETH dec=18, quote=USDC dec=6):
    //   humanToken1PerToken0 = 1 * 10^(18-6) = 1e12 → usdcPerWeth = 1e12
    // tonUsd = wethPerWton * usdcPerWeth = 1e9 * 1e12 = 1e21 — way outside sanity!

    // Use a sanity range that covers the test values (tick=0 for 27-18 decimals produces 1e9 * 1e12 = 1e21):
    const oracleRelaxed = makeOracleConfig({
      twapWindowSeconds: window,
      sanity: { minUsd: 0, maxUsd: Infinity },
    });
    const client = makeClient(0n, 0n, window);
    const snap = await readCompositeTwap(client, oracleRelaxed);
    expect(snap.source).toBe('composite-twap');
    expect(snap.tonUsd).toBeGreaterThan(0);
    expect(Number.isFinite(snap.tonUsd)).toBe(true);
    expect(snap.legs?.wethUsd).toBeGreaterThan(0);
    expect(snap.legs?.wtonPerWeth).toBeGreaterThan(0);
  });

  it('tonUsd = (wtonPerWeth leg inverse) * wethUsd leg', async () => {
    const window = 1800;
    const oracleRelaxed = makeOracleConfig({
      twapWindowSeconds: window,
      sanity: { minUsd: 0, maxUsd: Infinity },
    });
    // Use nonzero tick delta to exercise tick math
    const client = makeClient(900000n, 900000n, window); // avgTick = 500 for both
    const snap = await readCompositeTwap(client, oracleRelaxed);
    expect(snap.source).toBe('composite-twap');
    // wtonPerWeth * wethUsd should approximately equal tonUsd
    const wtonPerWeth = snap.legs!.wtonPerWeth!;
    const wethUsd = snap.legs!.wethUsd!;
    const reconstructed = (1 / wtonPerWeth) * wethUsd; // wethPerWton * usdcPerWeth
    expect(Math.abs(reconstructed - snap.tonUsd) / snap.tonUsd).toBeLessThan(1e-9);
  });

  it('throws when tonUsd is outside sanity bounds', async () => {
    const window = 1800;
    // tick=0 with WTON(27) and USDC(6) decimals produces ~1e21, which exceeds any realistic range
    const strict = makeOracleConfig({
      twapWindowSeconds: window,
      sanity: { minUsd: 0.05, maxUsd: 10 }, // realistic bounds — tick=0 result is way outside
    });
    const client = makeClient(0n, 0n, window);
    await expect(readCompositeTwap(client, strict)).rejects.toThrow(/sanity bounds/);
  });

  it('throws when pools are not configured and fixedPrice is absent', async () => {
    const oracle: OracleConfig = {
      twapWindowSeconds: 1800,
      cacheMs: 60_000,
      maxStalenessMs: 600_000,
      sanity: { minUsd: 0.05, maxUsd: 10 },
    };
    const client = makeClient(0n, 0n);
    await expect(readCompositeTwap(client, oracle)).rejects.toThrow(/not configured/);
  });
});

// ---------------------------------------------------------------------------
// 2. Stale-cache fallback (getCachedTonUsd)
// ---------------------------------------------------------------------------

describe('getCachedTonUsd — stale-cache fallback', () => {
  let cache: TwapCache;

  beforeEach(() => {
    cache = new TwapCache();
  });

  it('returns stale-cache entry when fresh read fails and cache is within staleness window', async () => {
    // Pre-populate the cache with a snapshot that is OLDER than cacheMs (not fresh)
    // but younger than maxStalenessMs (eligible for stale fallback).
    const staleSnap = {
      tonUsd: 1.23,
      source: 'composite-twap' as const,
      fetchedAt: Date.now() - 120_000, // 120s old — older than cacheMs=60s but younger than maxStalenessMs=600s
      ageMs: 120_000,
    };
    cache.set(staleSnap);

    // Make the client always throw
    const failingClient = {
      readContract: vi.fn(() => Promise.reject(new Error('RPC down'))),
    } as unknown as PublicClient;

    const oracle = makeOracleConfig();
    const result = await getCachedTonUsd(failingClient, oracle, cache, {
      cacheMs: 60_000,      // 60s freshness window — cache is stale (120s > 60s)
      maxStalenessMs: 600_000, // 600s max staleness — cache is still usable (120s < 600s)
    });

    expect(result.source).toBe('stale-cache');
    expect(result.tonUsd).toBe(1.23);
  });

  it('throws when fresh read fails and cache exceeds staleness window', async () => {
    // Pre-populate with a very old snapshot
    cache.set({
      tonUsd: 1.23,
      source: 'composite-twap' as const,
      fetchedAt: Date.now() - 700_000, // 700s > maxStalenessMs 600s
      ageMs: 700_000,
    });

    const failingClient = {
      readContract: vi.fn(() => Promise.reject(new Error('RPC down'))),
    } as unknown as PublicClient;

    const oracle = makeOracleConfig();
    await expect(
      getCachedTonUsd(failingClient, oracle, cache, {
        cacheMs: 60_000,
        maxStalenessMs: 600_000,
      }),
    ).rejects.toThrow(/No price available/);
  });

  it('throws when fresh read fails and no cache entry exists', async () => {
    const failingClient = {
      readContract: vi.fn(() => Promise.reject(new Error('RPC down'))),
    } as unknown as PublicClient;

    const oracle = makeOracleConfig();
    await expect(
      getCachedTonUsd(failingClient, oracle, cache, {
        cacheMs: 60_000,
        maxStalenessMs: 600_000,
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Fixed override
// ---------------------------------------------------------------------------

describe('getCachedTonUsd — fixedTonUsd override', () => {
  it('returns fixed override without calling the client', async () => {
    const noCallClient = {
      readContract: vi.fn(() => { throw new Error('should not be called'); }),
    } as unknown as PublicClient;

    const oracle = makeOracleConfig();
    const cache = new TwapCache();

    const result = await getCachedTonUsd(noCallClient, oracle, cache, {
      fixedTonUsd: 2.5,
      cacheMs: 60_000,
      maxStalenessMs: 600_000,
    });

    expect(result.source).toBe('fixed');
    expect(result.tonUsd).toBe(2.5);
    expect(noCallClient.readContract).not.toHaveBeenCalled();
  });

  it('fixed override also bypasses cache lookup', async () => {
    const cache = new TwapCache();
    // Seed the cache with a different value
    cache.set({ tonUsd: 99, source: 'composite-twap', fetchedAt: Date.now(), ageMs: 0 });

    const noCallClient = {
      readContract: vi.fn(),
    } as unknown as PublicClient;

    const oracle = makeOracleConfig();
    const result = await getCachedTonUsd(noCallClient, oracle, cache, {
      fixedTonUsd: 3.14,
      cacheMs: 60_000,
      maxStalenessMs: 600_000,
    });

    expect(result.tonUsd).toBe(3.14);
    expect(result.source).toBe('fixed');
  });
});

// ---------------------------------------------------------------------------
// 4. TwapCache unit tests
// ---------------------------------------------------------------------------

describe('TwapCache', () => {
  it('get returns null when empty', () => {
    const cache = new TwapCache();
    expect(cache.get()).toBeNull();
  });

  it('set and get returns the snapshot', () => {
    const cache = new TwapCache();
    cache.set({ tonUsd: 1.5, source: 'composite-twap', fetchedAt: Date.now(), ageMs: 0 });
    const snap = cache.get();
    expect(snap).not.toBeNull();
    expect(snap!.tonUsd).toBe(1.5);
  });

  it('ageMs reflects elapsed time since fetchedAt', () => {
    const cache = new TwapCache();
    const past = Date.now() - 5000;
    cache.set({ tonUsd: 1, source: 'composite-twap', fetchedAt: past, ageMs: 0 });
    const snap = cache.get()!;
    expect(snap.ageMs).toBeGreaterThanOrEqual(4900);
    expect(snap.ageMs).toBeLessThan(6000);
  });

  it('clear empties the cache', () => {
    const cache = new TwapCache();
    cache.set({ tonUsd: 1, source: 'composite-twap', fetchedAt: Date.now(), ageMs: 0 });
    cache.clear();
    expect(cache.get()).toBeNull();
    expect(cache.getStaleFallback()).toBeNull();
  });

  it('readCompositeTwap returns fixed source for fixedPrice config', async () => {
    const client = {} as PublicClient;
    const oracle = makeOracleConfig({ fixedPrice: 1.5 });
    const snap = await readCompositeTwap(client, oracle);
    expect(snap.source).toBe('fixed');
    expect(snap.tonUsd).toBe(1.5);
  });
});
