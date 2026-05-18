/**
 * Unit tests for WithdrawWatcherService lifecycle wiring (Decision Z20).
 *
 * Proves:
 *   1. Correct `serviceType` static field.
 *   2. `start()` rejects when resolveBillingRuntime throws.
 *   3. `stop()` calls the unwatch function and pool stop().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Module-level mocks — hoisted by vitest before any imports resolve.
vi.mock("../services/_runtime-deps.js", () => ({
  resolveBillingRuntime: vi.fn(),
}));

import { WithdrawWatcherService } from "../services/withdraw-service.js";
import { resolveBillingRuntime } from "../services/_runtime-deps.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const unwatchFn = vi.fn();
const stopPoolFn = vi.fn().mockResolvedValue(undefined);

const MOCK_RUNTIME_DEPS = {
  db: {},
  clients: {
    publicClient: {
      watchContractEvent: vi.fn().mockReturnValue(unwatchFn),
    },
    walletClient: {},
    mainnetClient: {},
  },
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

function makeMockRuntime(): Parameters<typeof WithdrawWatcherService.start>[0] {
  return { getSetting: (_key: string) => null } as Parameters<typeof WithdrawWatcherService.start>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WithdrawWatcherService", () => {
  beforeEach(() => {
    vi.mocked(resolveBillingRuntime).mockResolvedValue(MOCK_RUNTIME_DEPS as never);
    unwatchFn.mockClear();
    stopPoolFn.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exposes correct serviceType static field", () => {
    expect(WithdrawWatcherService.serviceType).toBe("tokagent-billing-withdraw");
  });

  it("rejects when resolveBillingRuntime throws (missing BILLING_DATABASE_URL)", async () => {
    vi.mocked(resolveBillingRuntime).mockRejectedValue(
      new Error("resolveBillingRuntime: BILLING_DATABASE_URL is required but not set"),
    );
    const runtime = makeMockRuntime();
    await expect(WithdrawWatcherService.start(runtime)).rejects.toThrow(
      /BILLING_DATABASE_URL/i,
    );
  });

  it("starts successfully and calls watchContractEvent", async () => {
    const runtime = makeMockRuntime();
    const instance = await WithdrawWatcherService.start(runtime);
    expect(instance).toBeInstanceOf(WithdrawWatcherService);
    expect(
      MOCK_RUNTIME_DEPS.clients.publicClient.watchContractEvent,
    ).toHaveBeenCalled();
  });

  it("stop() calls unwatch and pool stop", async () => {
    const runtime = makeMockRuntime();
    const instance = await WithdrawWatcherService.start(runtime);
    await instance.stop();
    expect(unwatchFn).toHaveBeenCalled();
    expect(stopPoolFn).toHaveBeenCalled();
  });

  it("stop() is idempotent — calling twice does not throw", async () => {
    const runtime = makeMockRuntime();
    const instance = await WithdrawWatcherService.start(runtime);
    await instance.stop();
    await expect(instance.stop()).resolves.toBeUndefined();
  });
});
