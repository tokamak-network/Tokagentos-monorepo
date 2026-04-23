import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Strategy } from "../types.js";

// ─── Mock @tokagentos/core to provide a stub Service base class ──────────────
vi.mock("@tokagentos/core", () => {
  class Service {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    protected runtime: any;
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    constructor(runtime?: any) {
      if (runtime) this.runtime = runtime;
    }
    static serviceType = "unknown";
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    static async start(runtime: any) { return new Service(runtime); }
    async stop() {}
  }
  return { Service };
});

// ─── Mock persistence module ─────────────────────────────────────────────────
vi.mock("../persistence.js", () => ({
  listActiveStrategies: vi.fn(),
  appendTick: vi.fn(),
  updateStrategy: vi.fn(),
}));

// ─── Mock kind-registry module ───────────────────────────────────────────────
vi.mock("../kind-registry.js", () => ({
  getKind: vi.fn(),
}));

import {
  listActiveStrategies,
  appendTick,
  updateStrategy,
} from "../persistence.js";
import { getKind } from "../kind-registry.js";
import { StrategyRunnerService } from "../services/strategy-runner.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "s1",
    name: "Test",
    description: "Test strategy",
    kind: "yield-auto-compound",
    params: { threshold: 0.5 },
    vault: { chainId: 137, address: "0xdeadbeef00000000000000000000000000000001" },
    schedule: { everyMs: 60_000 },
    status: "active",
    createdAt: Date.now(),
    lastTickAt: 0,
    tickHistory: [],
    ...overrides,
  };
}

const fakeRuntime = { getSetting: (_key: string) => null } as any;

function makeRunner() {
  return new StrategyRunnerService(fakeRuntime);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("StrategyRunnerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(appendTick).mockResolvedValue(undefined);
    vi.mocked(updateStrategy).mockResolvedValue(makeStrategy());
  });

  it("skips strategies that are not yet due", async () => {
    const strategy = makeStrategy({ lastTickAt: Date.now() + 1_000_000 });
    vi.mocked(listActiveStrategies).mockResolvedValue([strategy]);

    const runner = makeRunner();
    await runner.tick();

    expect(appendTick).not.toHaveBeenCalled();
    expect(updateStrategy).not.toHaveBeenCalled();
  });

  it("records error when kind is unknown", async () => {
    const strategy = makeStrategy({ kind: "perp-funding-arb", lastTickAt: 0 });
    vi.mocked(listActiveStrategies).mockResolvedValue([strategy]);
    vi.mocked(getKind).mockReturnValue(undefined);

    const runner = makeRunner();
    await runner.tick();

    expect(appendTick).toHaveBeenCalledWith(
      expect.anything(),
      "s1",
      expect.objectContaining({ action: "error", result: expect.stringContaining("unknown kind") }),
    );
  });

  it("evaluate-only path: records evaluated + no execute when shouldExecute=false", async () => {
    const strategy = makeStrategy({ lastTickAt: 0 });
    vi.mocked(listActiveStrategies).mockResolvedValue([strategy]);

    const mockImpl = {
      kind: "yield-auto-compound" as const,
      paramSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: { threshold: 0.5 } }) },
      evaluate: vi.fn().mockResolvedValue({ shouldExecute: false, summary: "Below threshold" }),
      execute: vi.fn(),
    };
    vi.mocked(getKind).mockReturnValue(mockImpl as any);

    const runner = makeRunner();
    await runner.tick();

    expect(appendTick).toHaveBeenCalledWith(
      expect.anything(),
      "s1",
      expect.objectContaining({ action: "evaluated", result: "Below threshold" }),
    );
    expect(mockImpl.execute).not.toHaveBeenCalled();
  });

  it("testing-mode dry-run: records dry-run + skips execute", async () => {
    const strategy = makeStrategy({ lastTickAt: 0, status: "testing" });
    vi.mocked(listActiveStrategies).mockResolvedValue([strategy]);

    const mockImpl = {
      kind: "yield-auto-compound" as const,
      paramSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: { threshold: 0.5 } }) },
      evaluate: vi.fn().mockResolvedValue({ shouldExecute: true, summary: "Would execute" }),
      execute: vi.fn(),
    };
    vi.mocked(getKind).mockReturnValue(mockImpl as any);

    const runner = makeRunner();
    await runner.tick();

    const calls = vi.mocked(appendTick).mock.calls.map((c) => c[2]);
    const dryRun = calls.find((c) => c.action === "dry-run");
    expect(dryRun).toBeDefined();
    expect(mockImpl.execute).not.toHaveBeenCalled();
  });

  it("active mode: calls evaluate then execute", async () => {
    const strategy = makeStrategy({ lastTickAt: 0, status: "active" });
    vi.mocked(listActiveStrategies).mockResolvedValue([strategy]);

    const mockImpl = {
      kind: "yield-auto-compound" as const,
      paramSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: { threshold: 0.5 } }) },
      evaluate: vi.fn().mockResolvedValue({ shouldExecute: true, summary: "Execute now", context: {} }),
      execute: vi.fn().mockResolvedValue({ summary: "Executed", txHashes: ["0xabc"] }),
    };
    vi.mocked(getKind).mockReturnValue(mockImpl as any);

    const runner = makeRunner();
    await runner.tick();

    expect(mockImpl.evaluate).toHaveBeenCalledOnce();
    expect(mockImpl.execute).toHaveBeenCalledOnce();

    const calls = vi.mocked(appendTick).mock.calls.map((c) => c[2]);
    const executed = calls.find((c) => c.action === "executed");
    expect(executed).toBeDefined();
    expect(executed?.result).toContain("Executed");
    expect(executed?.result).toContain("1 tx");
  });

  it("captures error in tickHistory when evaluate throws", async () => {
    const strategy = makeStrategy({ lastTickAt: 0, status: "active" });
    vi.mocked(listActiveStrategies).mockResolvedValue([strategy]);

    const mockImpl = {
      kind: "yield-auto-compound" as const,
      paramSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
      evaluate: vi.fn().mockRejectedValue(new Error("network timeout")),
      execute: vi.fn(),
    };
    vi.mocked(getKind).mockReturnValue(mockImpl as any);

    const runner = makeRunner();
    await runner.tick();

    const calls = vi.mocked(appendTick).mock.calls.map((c) => c[2]);
    const errEntry = calls.find((c) => c.action === "error");
    expect(errEntry?.result).toContain("network timeout");
    expect(vi.mocked(updateStrategy)).toHaveBeenCalledWith(
      expect.anything(),
      "s1",
      expect.objectContaining({ lastError: "network timeout" }),
    );
  });

  it("records param validation error and skips impl", async () => {
    const strategy = makeStrategy({ lastTickAt: 0 });
    vi.mocked(listActiveStrategies).mockResolvedValue([strategy]);

    const mockImpl = {
      kind: "yield-auto-compound" as const,
      paramSchema: {
        safeParse: vi.fn().mockReturnValue({
          success: false,
          error: { message: "threshold must be positive" },
        }),
      },
      evaluate: vi.fn(),
      execute: vi.fn(),
    };
    vi.mocked(getKind).mockReturnValue(mockImpl as any);

    const runner = makeRunner();
    await runner.tick();

    expect(mockImpl.evaluate).not.toHaveBeenCalled();
    const calls = vi.mocked(appendTick).mock.calls.map((c) => c[2]);
    const errEntry = calls.find((c) => c.action === "error");
    expect(errEntry?.result).toContain("invalid params");
  });

  it("stop() clears the interval", async () => {
    const runner = makeRunner();
    // Initialize creates the timer
    await runner.initialize();
    // stop clears it
    await runner.stop();
    // Verify stop is idempotent
    await runner.stop();
  });

  it("serviceType is set correctly", () => {
    expect(StrategyRunnerService.serviceType).toBe("tokagent-strategy-runner");
  });
});
