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
 * Resolution order (priority override, NOT fallback):
 *  1. `fixedTonUsd` — if provided, return immediately with `source: "fixed"`.
 *     This is an EMERGENCY PRICE FREEZE: when an operator sets
 *     `BILLING_FIXED_TON_USD`, every live source is bypassed and the pinned
 *     value is used. The setting is env-only (not exposed in the setup
 *     wizard) so the only way it can be set is intentionally. Use cases:
 *       - Pinning the rate during a suspected oracle manipulation incident.
 *       - Deterministic test/dev environments with no live pool liquidity.
 *  2. Cache hit — if the cached entry is younger than `cacheMs`, return it.
 *  3. Live primary — Tokamak's public price API.
 *  4. Live fallback — composite on-chain TWAP (WTON/WETH × WETH/USDC).
 *  5. Stale-cache fallback — last successful read within `maxStalenessMs`,
 *     returned with `source: "stale-cache"`.
 *  6. Throw — no valid price available anywhere.
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
  // 1. Priority override — operator-pinned price.
  //    No live call is made. This is the emergency freeze path; if the
  //    operator wanted live data, they would not have set this env var.
  if (opts.fixedTonUsd !== undefined) {
    return {
      tonUsd: opts.fixedTonUsd,
      source: "fixed",
      fetchedAt: Date.now(),
      ageMs: 0,
    };
  }

  // 2. Cache hit within freshness window — serve immediately.
  const cached = cache.get();
  if (cached && cached.ageMs < opts.cacheMs) {
    return cached;
  }

  // 3. Live primary: TON/USD from Tokamak's public price API. This is the
  //    canonical user-facing rate (https://www.tokamak.network/about/price).
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

  // 4. Live fallback: composite on-chain TWAP (WTON/WETH × WETH/USDC).
  try {
    const fresh = await readCompositeTwap(client, oracle);
    cache.set(fresh);
    return { ...fresh, ageMs: 0 };
  } catch (e) {
    log.warn({ err: (e as Error).message }, "twap refresh failed");
  }

  // 5. Stale-cache fallback — last successful read within maxStalenessMs.
  const stale = cache.getStaleFallback();
  if (stale && stale.ageMs < opts.maxStalenessMs) {
    log.warn({ ageMs: stale.ageMs }, "using stale cached price");
    return { ...stale, source: "stale-cache" };
  }

  // 6. No valid price anywhere.
  throw new Error(
    "No price available (Tokamak API down, TWAP failed, no valid cache, no fixedTonUsd override)",
  );
}
