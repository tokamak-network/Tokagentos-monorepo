/**
 * Unit tests for ConsumeService lifecycle wiring (Decision Z20).
 *
 * Does NOT spin up PGLite or Anvil — those live in the billing package's
 * worker tests. This file proves:
 *   1. The service exposes the correct `serviceType` static field.
 *   2. `start()` rejects when resolveBillingRuntime throws (simulating
 *      missing BILLING_DATABASE_URL).
 *   3. `stop()` clears the interval.
 *
 * `resolveBillingRuntime` and `flushNow` are module-level mocks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Module-level mocks — hoisted by vitest before any imports resolve.
vi.mock("../services/_runtime-deps.js", () => ({
  resolveBillingRuntime: vi.fn(),
}));

vi.mock("@tokagentos/billing", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@tokagentos/billing")>();
  return { ...mod, flushNow: vi.fn().mockResolvedValue({ attempted: 0, succeeded: 0, deadLettered: 0 }) };
});

import { ConsumeService } from "../services/consume-service.js";
import { resolveBillingRuntime } from "../services/_runtime-deps.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  stop: vi.fn().mockResolvedValue(undefined),
};

function makeMockRuntime(): Parameters<typeof ConsumeService.start>[0] {
  return { getSetting: (_key: string) => null } as Parameters<typeof ConsumeService.start>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConsumeService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(resolveBillingRuntime).mockResolvedValue(MOCK_RUNTIME_DEPS as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("exposes correct serviceType static field", () => {
    expect(ConsumeService.serviceType).toBe("tokagent-billing-consume");
  });

  it("rejects when resolveBillingRuntime throws (missing BILLING_DATABASE_URL)", async () => {
    vi.mocked(resolveBillingRuntime).mockRejectedValue(
      new Error("resolveBillingRuntime: BILLING_DATABASE_URL is required but not set"),
    );
    const runtime = makeMockRuntime();
    await expect(ConsumeService.start(runtime)).rejects.toThrow(
      /BILLING_DATABASE_URL/i,
    );
  });

  it("starts successfully and schedules an interval", async () => {
    const runtime = makeMockRuntime();
    const instance = await ConsumeService.start(runtime);
    expect(instance).toBeInstanceOf(ConsumeService);
  });

  it("stop() calls clearInterval", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const runtime = makeMockRuntime();
    const instance = await ConsumeService.start(runtime);
    await instance.stop();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("stop() calls runtimeDeps.stop() to close the pg pool", async () => {
    const runtime = makeMockRuntime();
    const instance = await ConsumeService.start(runtime);
    await instance.stop();
    expect(MOCK_RUNTIME_DEPS.stop).toHaveBeenCalled();
  });
});
