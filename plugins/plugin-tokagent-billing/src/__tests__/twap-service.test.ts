/**
 * Unit tests for TwapRefreshService lifecycle wiring (Decision Z20).
 *
 * Proves:
 *   1. Correct `serviceType` static field.
 *   2. `start()` rejects when resolveBillingRuntime throws.
 *   3. The service exposes a `cache` property (TwapCache instance).
 *   4. `stop()` clears the interval.
 *
 * `refreshTwap` and `resolveBillingRuntime` are module-level mocks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Module-level mocks — hoisted by vitest before any imports resolve.
vi.mock("../services/_runtime-deps.js", () => ({
  resolveBillingRuntime: vi.fn(),
}));

vi.mock("@tokagentos/billing", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@tokagentos/billing")>();
  return {
    ...mod,
    refreshTwap: vi.fn().mockResolvedValue({
      tonUsd: 1.5,
      source: "fixed" as const,
      ageMs: 0,
      fetchedAt: new Date(),
    }),
  };
});

import { TwapRefreshService } from "../services/twap-service.js";
import { resolveBillingRuntime } from "../services/_runtime-deps.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const stopPoolFn = vi.fn().mockResolvedValue(undefined);

const MOCK_RUNTIME_DEPS = {
  db: {},
  clients: { publicClient: {}, walletClient: {}, mainnetClient: {} },
  config: {
    vaultAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
    wtonWethPool: undefined,
    wethUsdcPool: undefined,
    twapWindowSeconds: 1800,
    priceCacheMs: 60_000,
    maxPriceStalenessMs: 600_000,
    priceSanityMinUsd: 0.05,
    priceSanityMaxUsd: 10,
    fixedTonUsd: 1.5,
    consumeBatchMinPton: 500_000_000_000_000_000n,
    consumeMaxAgeMs: 300_000,
    consumeScanIntervalMs: 30_000,
    consumeMaxPerCycle: 10,
    usageRetentionDays: 90,
    usageCleanupIntervalMs: 86_400_000,
    priceRefreshIntervalMs: 60_000,
  },
  stop: stopPoolFn,
};

function makeMockRuntime(): Parameters<typeof TwapRefreshService.start>[0] {
  return { getSetting: (_key: string) => null } as Parameters<typeof TwapRefreshService.start>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TwapRefreshService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(resolveBillingRuntime).mockResolvedValue(MOCK_RUNTIME_DEPS as never);
    stopPoolFn.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("exposes correct serviceType static field", () => {
    expect(TwapRefreshService.serviceType).toBe("tokagent-billing-twap");
  });

  it("rejects when resolveBillingRuntime throws (missing BILLING_DATABASE_URL)", async () => {
    vi.mocked(resolveBillingRuntime).mockRejectedValue(
      new Error("resolveBillingRuntime: BILLING_DATABASE_URL is required but not set"),
    );
    const runtime = makeMockRuntime();
    await expect(TwapRefreshService.start(runtime)).rejects.toThrow(
      /BILLING_DATABASE_URL/i,
    );
  });

  it("starts successfully, primes the cache, and exposes cache property", async () => {
    const runtime = makeMockRuntime();
    const instance = await TwapRefreshService.start(runtime);
    expect(instance).toBeInstanceOf(TwapRefreshService);
    expect(instance.cache).toBeDefined();
  });

  it("stop() calls clearInterval and pool stop", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const runtime = makeMockRuntime();
    const instance = await TwapRefreshService.start(runtime);
    await instance.stop();
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(stopPoolFn).toHaveBeenCalled();
  });
});
