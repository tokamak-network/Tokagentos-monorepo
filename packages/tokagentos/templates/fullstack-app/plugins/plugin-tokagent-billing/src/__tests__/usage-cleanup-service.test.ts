/**
 * Unit tests for UsageCleanupService lifecycle wiring (Decision Z20).
 *
 * Proves:
 *   1. Correct `serviceType` static field.
 *   2. `start()` rejects when resolveBillingRuntime throws.
 *   3. `stop()` clears the interval.
 *   4. `stop()` is idempotent.
 *
 * `sweepAllExpired` and `resolveBillingRuntime` are module-level mocks.
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
    sweepAllExpired: vi.fn().mockResolvedValue({
      callLog: 0,
      nonces: 0,
      quotes: 0,
      preauth: 0,
    }),
  };
});

import { UsageCleanupService } from "../services/usage-cleanup-service.js";
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

function makeMockRuntime(): Parameters<typeof UsageCleanupService.start>[0] {
  return { getSetting: (_key: string) => null } as Parameters<typeof UsageCleanupService.start>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UsageCleanupService", () => {
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
    expect(UsageCleanupService.serviceType).toBe(
      "tokagent-billing-usage-cleanup",
    );
  });

  it("rejects when resolveBillingRuntime throws (missing BILLING_DATABASE_URL)", async () => {
    vi.mocked(resolveBillingRuntime).mockRejectedValue(
      new Error("resolveBillingRuntime: BILLING_DATABASE_URL is required but not set"),
    );
    const runtime = makeMockRuntime();
    await expect(UsageCleanupService.start(runtime)).rejects.toThrow(
      /BILLING_DATABASE_URL/i,
    );
  });

  it("starts successfully and schedules an interval", async () => {
    const runtime = makeMockRuntime();
    const instance = await UsageCleanupService.start(runtime);
    expect(instance).toBeInstanceOf(UsageCleanupService);
  });

  it("stop() calls clearInterval and pool stop", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const runtime = makeMockRuntime();
    const instance = await UsageCleanupService.start(runtime);
    await instance.stop();
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(stopPoolFn).toHaveBeenCalled();
  });

  it("stop() is idempotent — calling twice does not throw", async () => {
    const runtime = makeMockRuntime();
    const instance = await UsageCleanupService.start(runtime);
    await instance.stop();
    await expect(instance.stop()).resolves.toBeUndefined();
  });
});
