import type { PublicClient } from "viem";
import { logger } from "@elizaos/core";
import { readCompositeTwap } from "./oracle.js";
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
  // 1. Fixed override — bypass all oracle logic.
  if (opts.fixedTonUsd !== undefined) {
    const snap: PriceSnapshot = {
      tonUsd: opts.fixedTonUsd,
      source: "fixed",
      fetchedAt: Date.now(),
      ageMs: 0,
    };
    return snap;
  }

  // 2. Cache hit within freshness window.
  const cached = cache.get();
  if (cached && cached.ageMs < opts.cacheMs) {
    return cached;
  }

  // 3. Attempt fresh read.
  try {
    const fresh = await readCompositeTwap(client, oracle);
    cache.set(fresh);
    return { ...fresh, ageMs: 0 };
  } catch (e) {
    log.warn({ err: (e as Error).message }, "twap refresh failed");

    // 4. Stale fallback.
    const stale = cache.getStaleFallback();
    if (stale && stale.ageMs < opts.maxStalenessMs) {
      log.warn({ ageMs: stale.ageMs }, "using stale cached twap");
      return { ...stale, source: "stale-cache" };
    }

    // 5. No valid price available.
    throw new Error(
      `No price available (TWAP failed, no valid cache): ${(e as Error).message}`,
    );
  }
}
