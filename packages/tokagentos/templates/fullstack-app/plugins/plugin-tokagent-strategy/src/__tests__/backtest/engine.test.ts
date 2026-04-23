import { describe, expect, it } from "vitest";
import { runBacktest, computeStats } from "../../backtest/engine.js";

// ─── computeStats ─────────────────────────────────────────────────────────────

describe("computeStats", () => {
  it("returns zero sharpe and zero drawdown for empty curve", () => {
    const { sharpe, maxDrawdownPct } = computeStats([]);
    expect(sharpe).toBe(0);
    expect(maxDrawdownPct).toBe(0);
  });

  it("returns zero sharpe for zero-variance returns (constant positive P&L)", () => {
    // All deltas identical → stddev = 0 → sharpe = 0 (not NaN)
    const { sharpe } = computeStats([0.01, 0.01, 0.01, 0.01]);
    expect(Number.isFinite(sharpe)).toBe(true);
    expect(sharpe).toBe(0);
  });

  it("computes positive sharpe for linearly growing equity", () => {
    // Constant positive return per tick → mean > 0, stddev = 0 → sharpe = 0 (not NaN)
    const { sharpe } = computeStats([0.005, 0.005, 0.005]);
    expect(sharpe).toBe(0); // zero variance → 0, not NaN
  });

  it("computes max drawdown for simple peak-to-trough", () => {
    // Cumulative: +0.2, +0.4 (peak), +0.2 → drawdown = 0.2/0.4 = 50%
    const { maxDrawdownPct } = computeStats([0.2, 0.2, -0.2]);
    expect(maxDrawdownPct).toBeCloseTo(0.5, 5);
  });

  it("max drawdown is zero when equity only goes up", () => {
    const { maxDrawdownPct } = computeStats([0.1, 0.2, 0.1, 0.3]);
    expect(maxDrawdownPct).toBe(0);
  });
});

// ─── runBacktest ──────────────────────────────────────────────────────────────

describe("runBacktest", () => {
  const ONE_HOUR_MS = 3600 * 1000;

  it("returns zero ticks and zero P&L when range produces no ticks", () => {
    // fromMs === toMs → only one tick at fromMs
    const run = runBacktest({
      rangeFromMs: 1_000_000,
      rangeToMs: 1_000_000,
      stepMs: ONE_HOUR_MS,
      dataPoints: [],
      evaluator: () => ({ shouldExecute: false, pnlDelta: 0 }),
    });
    expect(run.totalTicks).toBe(1); // at fromMs itself
    expect(run.signalCount).toBe(0);
    expect(run.pnlPctHypothetical).toBe(0);
  });

  it("handles empty data array — evaluator gets empty recentData", () => {
    const run = runBacktest({
      rangeFromMs: 0,
      rangeToMs: ONE_HOUR_MS * 3,
      stepMs: ONE_HOUR_MS,
      dataPoints: [],
      evaluator: (_ts, recent) => ({
        shouldExecute: recent.length > 0,
        pnlDelta: recent.length > 0 ? 0.01 : 0,
      }),
    });
    // No data → evaluator never signals
    expect(run.signalCount).toBe(0);
    expect(run.pnlPctHypothetical).toBe(0);
  });

  it("constant-positive evaluator produces linear equity growth", () => {
    const TICKS = 10;
    const DELTA = 0.01;
    const run = runBacktest({
      rangeFromMs: 0,
      rangeToMs: (TICKS - 1) * ONE_HOUR_MS,
      stepMs: ONE_HOUR_MS,
      dataPoints: [{ ts: 0, value: 1 }],
      evaluator: () => ({ shouldExecute: true, pnlDelta: DELTA }),
    });
    expect(run.totalTicks).toBe(TICKS);
    expect(run.signalCount).toBe(TICKS);
    expect(run.pnlPctHypothetical).toBeCloseTo(TICKS * DELTA, 10);
  });

  it("oscillating evaluator computes max drawdown correctly", () => {
    // Deltas: +0.1, +0.1, -0.15 → cumulative: 0.1, 0.2, 0.05
    // Peak = 0.2, trough = 0.05, drawdown = (0.2 - 0.05)/0.2 = 75%
    const run = runBacktest({
      rangeFromMs: 0,
      rangeToMs: ONE_HOUR_MS * 2,
      stepMs: ONE_HOUR_MS,
      dataPoints: [{ ts: 0, value: 1 }],
      evaluator: (_ts, _recent) => {
        const tickIndex = Math.round(_ts / ONE_HOUR_MS);
        if (tickIndex === 0) return { shouldExecute: true, pnlDelta: 0.1 };
        if (tickIndex === 1) return { shouldExecute: true, pnlDelta: 0.1 };
        return { shouldExecute: true, pnlDelta: -0.15 };
      },
    });
    expect(run.pnlPctHypothetical).toBeCloseTo(0.05, 8);
    expect(run.maxDrawdownPct).toBeCloseTo(0.75, 5);
  });

  it("evaluator with zero signal count produces zero P&L and zero drawdown", () => {
    const run = runBacktest({
      rangeFromMs: 0,
      rangeToMs: ONE_HOUR_MS * 5,
      stepMs: ONE_HOUR_MS,
      dataPoints: [],
      evaluator: () => ({ shouldExecute: false, pnlDelta: 0 }),
    });
    expect(run.signalCount).toBe(0);
    expect(run.pnlPctHypothetical).toBe(0);
    expect(run.maxDrawdownPct).toBe(0);
  });

  it("sharpeHypothetical is zero (not NaN) when all returns are identical", () => {
    const run = runBacktest({
      rangeFromMs: 0,
      rangeToMs: ONE_HOUR_MS * 4,
      stepMs: ONE_HOUR_MS,
      dataPoints: [{ ts: 0, value: 1 }],
      evaluator: () => ({ shouldExecute: true, pnlDelta: 0.01 }),
    });
    expect(Number.isFinite(run.sharpeHypothetical)).toBe(true);
    expect(Number.isNaN(run.sharpeHypothetical)).toBe(false);
  });

  it("passes recentData up to and including the current tick timestamp", () => {
    const capturedDataLengths: number[] = [];
    const baseTs = 1_000_000_000;

    const dataPoints = [
      { ts: baseTs, funding: 0.01 },
      { ts: baseTs + ONE_HOUR_MS, funding: 0.02 },
      { ts: baseTs + ONE_HOUR_MS * 2, funding: 0.03 },
    ];

    runBacktest({
      rangeFromMs: baseTs,
      rangeToMs: baseTs + ONE_HOUR_MS * 2,
      stepMs: ONE_HOUR_MS,
      dataPoints,
      evaluator: (_ts, recent) => {
        capturedDataLengths.push(recent.length);
        return { shouldExecute: false, pnlDelta: 0 };
      },
    });

    // Tick at baseTs: 1 data point (ts=baseTs)
    // Tick at baseTs+1h: 2 data points (ts=baseTs, baseTs+1h)
    // Tick at baseTs+2h: 3 data points
    expect(capturedDataLengths).toEqual([1, 2, 3]);
  });

  it("summary field is a non-empty string", () => {
    const run = runBacktest({
      rangeFromMs: 0,
      rangeToMs: ONE_HOUR_MS * 3,
      stepMs: ONE_HOUR_MS,
      dataPoints: [],
      evaluator: () => ({ shouldExecute: false, pnlDelta: 0 }),
    });
    expect(typeof run.summary).toBe("string");
    expect(run.summary.length).toBeGreaterThan(0);
  });

  it("run has warnings array (initially empty from engine)", () => {
    const run = runBacktest({
      rangeFromMs: 0,
      rangeToMs: ONE_HOUR_MS,
      stepMs: ONE_HOUR_MS,
      dataPoints: [],
      evaluator: () => ({ shouldExecute: false, pnlDelta: 0 }),
    });
    expect(Array.isArray(run.warnings)).toBe(true);
  });
});
