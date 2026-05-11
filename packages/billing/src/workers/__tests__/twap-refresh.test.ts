/**
 * Unit tests for twap-refresh.ts (Decision Z20).
 *
 * getCachedTonUsd is mocked — no real RPC calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PublicClient } from "viem";
import { refreshTwap, type TwapRefreshDeps } from "../twap-refresh.js";
import { TwapCache } from "../../twap/cache.js";
import type { OracleConfig, PriceSnapshot } from "../../twap/oracle.js";

// Mock the cache module's getCachedTonUsd
vi.mock("../../twap/cache.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../twap/cache.js")>();
  return {
    ...mod,
    getCachedTonUsd: vi.fn(),
  };
});

import * as cacheModule from "../../twap/cache.js";

const ORACLE_CONFIG: OracleConfig = {
  twapWindowSeconds: 1800,
  cacheMs: 60_000,
  maxStalenessMs: 600_000,
  sanity: { minUsd: 0.05, maxUsd: 10 },
};

function makeDeps(cache?: TwapCache): TwapRefreshDeps {
  return {
    mainnetClient: {} as unknown as PublicClient,
    oracleConfig: ORACLE_CONFIG,
    cache: cache ?? new TwapCache(),
  };
}

describe("refreshTwap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a PriceSnapshot on success", async () => {
    const snap: PriceSnapshot = {
      tonUsd: 1.23,
      source: "composite-twap",
      fetchedAt: Date.now(),
      ageMs: 0,
    };
    vi.mocked(cacheModule.getCachedTonUsd).mockResolvedValueOnce(snap);

    const result = await refreshTwap(makeDeps());
    expect(result).toEqual(snap);
    expect(cacheModule.getCachedTonUsd).toHaveBeenCalledOnce();
  });

  it("returns null and does not throw on error", async () => {
    vi.mocked(cacheModule.getCachedTonUsd).mockRejectedValueOnce(
      new Error("RPC timeout"),
    );

    const result = await refreshTwap(makeDeps());
    expect(result).toBeNull();
  });

  it("uses fixedTonUsd when provided", async () => {
    const snap: PriceSnapshot = {
      tonUsd: 2.5,
      source: "fixed",
      fetchedAt: Date.now(),
      ageMs: 0,
    };
    vi.mocked(cacheModule.getCachedTonUsd).mockResolvedValueOnce(snap);

    const deps: TwapRefreshDeps = { ...makeDeps(), fixedTonUsd: 2.5 };
    const result = await refreshTwap(deps);

    expect(result?.tonUsd).toBe(2.5);
    expect(result?.source).toBe("fixed");
  });

  it("passes cache instance to getCachedTonUsd", async () => {
    const cache = new TwapCache();
    const snap: PriceSnapshot = {
      tonUsd: 1.0,
      source: "composite-twap",
      fetchedAt: Date.now(),
      ageMs: 0,
    };
    vi.mocked(cacheModule.getCachedTonUsd).mockResolvedValueOnce(snap);

    await refreshTwap({ mainnetClient: {} as unknown as PublicClient, oracleConfig: ORACLE_CONFIG, cache });
    const callArgs = vi.mocked(cacheModule.getCachedTonUsd).mock.calls[0]!;
    expect(callArgs[2]).toBe(cache);
  });
});
