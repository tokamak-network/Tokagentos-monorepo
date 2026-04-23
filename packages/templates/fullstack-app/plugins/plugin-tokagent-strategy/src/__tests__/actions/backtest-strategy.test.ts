import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock persistence ─────────────────────────────────────────────────────────

const mockGetStrategy = vi.fn();
const mockSaveStrategy = vi.fn();

vi.mock("../../persistence.js", () => ({
  getStrategy: (...args: unknown[]) => mockGetStrategy(...args),
  saveStrategy: (...args: unknown[]) => mockSaveStrategy(...args),
}));

// ─── Mock kind-registry ───────────────────────────────────────────────────────

const mockGetKind = vi.fn();

vi.mock("../../kind-registry.js", () => ({
  getKind: (...args: unknown[]) => mockGetKind(...args),
}));

import { backtestStrategyAction } from "../../actions/backtest-strategy.js";
import { z } from "zod";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VAULT = { chainId: 137, address: "0xVault000000000000000000000000000000001" as `0x${string}` };

function makeRuntime() {
  return { getSetting: (_k: string) => null } as any;
}

function makeOptions(params: Record<string, unknown>) {
  return { parameters: params } as any;
}

function makeStrategy(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "strat-abc",
    name: "Test Strategy",
    description: "test",
    kind: "yield-auto-compound",
    params: { asset: "USDC", minHarvestAmount: 10 },
    vault: VAULT,
    schedule: { everyMs: 86_400_000 },
    status: "draft",
    createdAt: Date.now() - 1000,
    tickHistory: [],
    ...overrides,
  };
}

const yieldSchema = z.object({
  asset: z.enum(["USDC"]),
  minHarvestAmount: z.number().positive(),
  targetApy: z.number().positive().optional(),
});

const SAMPLE_RUN = {
  runAt: Date.now(),
  rangeFromMs: Date.now() - 30 * 24 * 3600 * 1000,
  rangeToMs: Date.now(),
  totalTicks: 30,
  signalCount: 30,
  pnlPctHypothetical: 0.004,
  sharpeHypothetical: 1.5,
  maxDrawdownPct: 0.001,
  summary: "30/30 ticks triggered.",
  warnings: ["Assumes funds always supplied."],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("backtestStrategyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveStrategy.mockResolvedValue(undefined);
  });

  describe("action metadata", () => {
    it("has name BACKTEST_STRATEGY", () => {
      expect(backtestStrategyAction.name).toBe("BACKTEST_STRATEGY");
    });

    it("has parameters: id (required) and days (optional)", () => {
      const names = backtestStrategyAction.parameters!.map((p) => p.name);
      expect(names).toContain("id");
      expect(names).toContain("days");
      const idParam = backtestStrategyAction.parameters!.find((p) => p.name === "id");
      const daysParam = backtestStrategyAction.parameters!.find((p) => p.name === "days");
      expect(idParam?.required).toBe(true);
      expect(daysParam?.required).toBe(false);
    });

    it("has non-empty similes", () => {
      expect((backtestStrategyAction.similes?.length ?? 0) > 0).toBe(true);
    });

    it("has examples", () => {
      expect((backtestStrategyAction.examples?.length ?? 0) > 0).toBe(true);
    });

    it("validate always returns true", async () => {
      expect(await backtestStrategyAction.validate!({} as any, {} as any)).toBe(true);
    });
  });

  describe("parameter validation", () => {
    it("fails when id is missing", async () => {
      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ days: 30 }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("id");
    });

    it("fails when days is 0", async () => {
      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "abc", days: 0 }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("days");
    });

    it("fails when days exceeds 365", async () => {
      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "abc", days: 400 }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("days");
    });

    it("fails when days is NaN", async () => {
      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "abc", days: NaN }),
      );
      expect(result?.success).toBe(false);
    });
  });

  describe("strategy lookup errors", () => {
    it("fails when strategy is not found", async () => {
      mockGetStrategy.mockResolvedValue(undefined);
      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "nonexistent" }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("No strategy");
    });

    it("fails when kind is not registered", async () => {
      mockGetStrategy.mockResolvedValue(makeStrategy());
      mockGetKind.mockReturnValue(undefined);
      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "strat-abc" }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("Unknown kind");
    });

    it("fails when kind has no backtest method", async () => {
      mockGetStrategy.mockResolvedValue(makeStrategy());
      mockGetKind.mockReturnValue({
        kind: "yield-auto-compound",
        paramSchema: yieldSchema,
        evaluate: vi.fn(),
        execute: vi.fn(),
        // No backtest method
      });
      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "strat-abc" }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("does not support backtesting");
    });

    it("fails when strategy params fail schema validation", async () => {
      mockGetStrategy.mockResolvedValue(makeStrategy({ params: { asset: "DAI", minHarvestAmount: -1 } }));
      mockGetKind.mockReturnValue({
        kind: "yield-auto-compound",
        paramSchema: yieldSchema,
        evaluate: vi.fn(),
        execute: vi.fn(),
        backtest: vi.fn(),
      });
      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "strat-abc" }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("params invalid");
    });
  });

  describe("happy path — supported kind", () => {
    beforeEach(() => {
      mockGetStrategy.mockResolvedValue(makeStrategy());
      mockGetKind.mockReturnValue({
        kind: "yield-auto-compound",
        paramSchema: yieldSchema,
        evaluate: vi.fn(),
        execute: vi.fn(),
        backtest: vi.fn().mockResolvedValue({ supported: true, run: SAMPLE_RUN }),
      });
    });

    it("returns success with P&L stats in text", async () => {
      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "strat-abc", days: 30 }),
      );
      expect(result?.success).toBe(true);
      expect(result?.text).toContain("Backtest complete");
      expect(result?.text).toContain("Ticks");
      expect(result?.text).toContain("P&L");
      expect(result?.text).toContain("Sharpe");
    });

    it("persists the run to strategy.backtestResults", async () => {
      await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "strat-abc", days: 30 }),
      );
      expect(mockSaveStrategy).toHaveBeenCalledOnce();
      const saved = mockSaveStrategy.mock.calls[0][1] as any;
      expect(saved.backtestResults).toBeDefined();
      expect(saved.backtestResults).toHaveLength(1);
      expect(saved.backtestResults[0].totalTicks).toBe(30);
    });

    it("caps backtestResults at 5 entries", async () => {
      // Strategy already has 5 results
      const existingRuns = Array.from({ length: 5 }, (_, i) => ({ ...SAMPLE_RUN, runAt: i }));
      mockGetStrategy.mockResolvedValue(makeStrategy({ backtestResults: existingRuns }));

      await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "strat-abc", days: 30 }),
      );

      const saved = mockSaveStrategy.mock.calls[0][1] as any;
      expect(saved.backtestResults).toHaveLength(5);
      // Oldest entry (runAt=0) should be evicted
      expect(saved.backtestResults[0].runAt).not.toBe(0);
    });

    it("includes warnings in output text when present", async () => {
      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "strat-abc" }),
      );
      expect(result?.text).toContain("Caveats");
      expect(result?.text).toContain("Assumes funds always supplied");
    });

    it("data field contains the run object", async () => {
      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "strat-abc" }),
      );
      expect((result?.data as any)?.run).toBeDefined();
      expect((result?.data as any)?.run.totalTicks).toBe(30);
    });

    it("defaults days to 30 when not provided", async () => {
      const backtestMock = vi.fn().mockResolvedValue({ supported: true, run: SAMPLE_RUN });
      mockGetKind.mockReturnValue({
        kind: "yield-auto-compound",
        paramSchema: yieldSchema,
        evaluate: vi.fn(),
        execute: vi.fn(),
        backtest: backtestMock,
      });

      await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "strat-abc" }), // no days
      );

      const [, ctx] = backtestMock.mock.calls[0] as any[];
      // fromMs should be approximately 30 days before toMs
      const diffDays = (ctx.toMs - ctx.fromMs) / (24 * 3600 * 1000);
      expect(diffDays).toBeCloseTo(30, 0);
    });
  });

  describe("not-supported kind (polymarket)", () => {
    it("returns success=true with not-supported message", async () => {
      mockGetStrategy.mockResolvedValue(makeStrategy({ kind: "polymarket-value-hunt", params: { minMarketVolume: 5000, minMispricingPct: 5, maxMarkets: 10 } }));
      const polySchema = z.object({
        minMarketVolume: z.number().positive(),
        minMispricingPct: z.number().positive(),
        maxMarkets: z.number().int().positive().max(20),
      });
      mockGetKind.mockReturnValue({
        kind: "polymarket-value-hunt",
        paramSchema: polySchema,
        evaluate: vi.fn(),
        execute: vi.fn(),
        backtest: vi.fn().mockResolvedValue({ supported: false, reason: "alert-only" }),
      });

      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "strat-abc" }),
      );
      expect(result?.success).toBe(true);
      expect(result?.text).toContain("not supported");
    });
  });

  describe("error handling", () => {
    it("returns failure when backtest throws", async () => {
      mockGetStrategy.mockResolvedValue(makeStrategy());
      mockGetKind.mockReturnValue({
        kind: "yield-auto-compound",
        paramSchema: yieldSchema,
        evaluate: vi.fn(),
        execute: vi.fn(),
        backtest: vi.fn().mockRejectedValue(new Error("Aave subgraph unreachable")),
      });

      const result = await backtestStrategyAction.handler!(
        makeRuntime(), {} as any, {} as any,
        makeOptions({ id: "strat-abc" }),
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain("Backtest failed");
      expect(result?.text).toContain("Aave subgraph unreachable");
    });
  });
});
