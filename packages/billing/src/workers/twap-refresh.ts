/**
 * TWAP refresh tick — pure async function, no setInterval, no global state.
 *
 * Ported from the inline `setInterval(() => oracle.refresh(), ...)` in
 * source `proxy/src/server.ts:~1107`.
 *
 * The Service wrapper
 * (`plugins/plugin-tokagent-billing/src/services/twap-service.ts`)
 * owns the timer and calls `refreshTwap(deps)` on each tick.
 *
 * Errors are swallowed after logging — the stale-cache fallback in
 * `twap/cache.ts:getCachedTonUsd` is the safety net.
 */

import type { PublicClient } from "viem";
import { logger } from "@tokagentos/core";
import { getCachedTonUsd } from "../twap/cache.js";
import type { OracleConfig, PriceSnapshot } from "../twap/oracle.js";
import type { TwapCache } from "../twap/cache.js";

const log = logger.child({ src: "billing:worker:twap-refresh" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TwapRefreshDeps {
  /** Ethereum mainnet PublicClient for on-chain TWAP reads. */
  mainnetClient: PublicClient;
  oracleConfig: OracleConfig;
  cache: TwapCache;
  /** When set, bypasses on-chain read and returns this fixed price. */
  fixedTonUsd?: number;
}

// ---------------------------------------------------------------------------
// refreshTwap
// ---------------------------------------------------------------------------

/**
 * Trigger one TWAP refresh cycle. Calls `getCachedTonUsd` which handles:
 *   1. Fixed-price shortcut (no RPC call).
 *   2. Cache hit (no RPC call).
 *   3. Fresh on-chain read (updates cache).
 *   4. Stale-cache fallback.
 *
 * Logs the refreshed price on success. Swallows errors after logging
 * (stale-cache fallback is the safety net; an unhandled throw in the Service
 * timer callback would silently kill the interval on some runtimes).
 *
 * @returns The resulting PriceSnapshot, or null on error.
 */
export async function refreshTwap(
  deps: TwapRefreshDeps,
): Promise<PriceSnapshot | null> {
  try {
    const snap = await getCachedTonUsd(
      deps.mainnetClient,
      deps.oracleConfig,
      deps.cache,
      {
        fixedTonUsd: deps.fixedTonUsd,
        cacheMs: deps.oracleConfig.cacheMs,
        maxStalenessMs: deps.oracleConfig.maxStalenessMs,
      },
    );
    log.debug(
      { tonUsd: snap.tonUsd, source: snap.source, ageMs: snap.ageMs },
      "twap refreshed",
    );
    return snap;
  } catch (e) {
    log.warn({ err: (e as Error).message }, "twap refresh failed (stale-cache will serve)");
    return null;
  }
}
