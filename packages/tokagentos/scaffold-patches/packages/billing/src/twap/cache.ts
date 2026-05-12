import type { PublicClient } from "viem";
import { logger } from "@elizaos/core";
import { fetchTokamakApiPrice, readCompositeTwap } from "./oracle.js";
import type { OracleConfig, PriceSnapshot } from "./oracle.js";

const log = logger.child({ src: "billing" });

/**
 * In-process cache for the composite TON/USD TWAP price.
 *
 * Holds a single entry (the most recent successful read). Stale-cache
 * fallback is handled by `getCachedTonUsd` — if a fresh read fails but the
 * cached entry is younger than `maxStalenessMs`, the stale value is returned
 * with `source: "stale-cache"`. If the cache is too old, the error is
 * re-thrown.
 */
export class TwapCache {
  private entry: PriceSnapshot | null = null;

  /** Return the current cached entry, or null if none. */
  get(): PriceSnapshot | null {
    return this.entry ? { ...this.entry, ageMs: Date.now() - this.entry.fetchedAt } : null;
  }

  /** Store a fresh snapshot. */
  set(snapshot: PriceSnapshot): void {
    this.entry = { ...snapshot, fetchedAt: snapshot.fetchedAt };
  }

  /**
   * Return the cached entry regardless of age (for stale fallback).
   * Returns null if no entry has ever been stored.
   */
  getStaleFallback(): PriceSnapshot | null {
    return this.entry ? { ...this.entry, ageMs: Date.now() - this.entry.fetchedAt } : null;
  }

  /** Clear the cache (for testing). */
  clear(): void {
    this.entry = null;
  }
}

/**
 * Orchestration function: returns a fresh or cached TON/USD price.
 *
 * Resolution order:
 *  1. `fixedTonUsd` — if provided, return immediately with `source: "fixed"`.
 *     No client call is made. Useful for tests and pinned-rate deployments
 *     (`BILLING_FIXED_TON_USD`).
 *  2. Cache hit — if the cached entry is younger than `cacheMs`, return it.
 *  3. Fresh read — call `readCompositeTwap` and cache the result.
 *  4. Stale fallback — if the fresh read fails but the cache entry is younger
 *     than `maxStalenessMs`, return it with `source: "stale-cache"` and log a
 *     warning.
 *  5. Throw — if no valid price is available (fresh failed AND cache too old).
 */
export async function getCachedTonUsd(
  client: PublicClient,
  oracle: OracleConfig,
  cache: TwapCache,
  opts: {
    fixedTonUsd?: number;
    cacheMs: number;
    maxStalenessMs: number;
  },
): Promise<PriceSnapshot> {
  // 1. Cache hit within freshness window — serve immediately.
  const cached = cache.get();
  if (cached && cached.ageMs < opts.cacheMs) {
    return cached;
  }

  // 2. Primary: live TON/USD from Tokamak's public price API.
  //    This is the canonical user-facing rate
  //    (https://www.tokamak.network/about/price). Operator-pinned overrides
  //    via BILLING_FIXED_TON_USD are an admin escape hatch only — handled
  //    last so a stale env value doesn't shadow the live feed.
  try {
    const fresh = await fetchTokamakApiPrice();
    cache.set(fresh);
    return { ...fresh, ageMs: 0 };
  } catch (e) {
    log.warn(
      { err: (e as Error).message },
      "tokamak api price fetch failed — falling back to on-chain TWAP",
    );
  }

  // 3. Fallback: composite on-chain TWAP (WTON/WETH × WETH/USDC).
  try {
    const fresh = await readCompositeTwap(client, oracle);
    cache.set(fresh);
    return { ...fresh, ageMs: 0 };
  } catch (e) {
    log.warn({ err: (e as Error).message }, "twap refresh failed");
  }

  // 4. Stale fallback — last successful read within maxStalenessMs.
  const stale = cache.getStaleFallback();
  if (stale && stale.ageMs < opts.maxStalenessMs) {
    log.warn({ ageMs: stale.ageMs }, "using stale cached price");
    return { ...stale, source: "stale-cache" };
  }

  // 5. Admin pinned override — last-resort, only when no live source works.
  //    Configurable via BILLING_FIXED_TON_USD (env, NOT setup wizard).
  if (opts.fixedTonUsd !== undefined) {
    log.warn(
      { fixedTonUsd: opts.fixedTonUsd },
      "all live price sources failed — using admin BILLING_FIXED_TON_USD",
    );
    return {
      tonUsd: opts.fixedTonUsd,
      source: "fixed",
      fetchedAt: Date.now(),
      ageMs: 0,
    };
  }

  // 6. No valid price anywhere.
  throw new Error(
    "No price available (Tokamak API down, TWAP failed, no valid cache, no admin override)",
  );
}
