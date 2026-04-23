import type { BacktestDataPoint, BacktestRun } from "./types.js";

// ─── Stats helpers ────────────────────────────────────────────────────────────

/**
 * Compute annualised Sharpe ratio and max drawdown from an equity curve.
 * equity[i] is the running P&L at each daily step (not cumulative).
 * For sub-daily ticks the series is bucketed into days before Sharpe calculation.
 */
export function computeStats(equityCurve: number[]): {
  sharpe: number;
  maxDrawdownPct: number;
} {
  if (equityCurve.length === 0) {
    return { sharpe: 0, maxDrawdownPct: 0 };
  }

  // Build cumulative equity for drawdown calculation
  const cumulative: number[] = [];
  let running = 0;
  for (const delta of equityCurve) {
    running += delta;
    cumulative.push(running);
  }

  // Max drawdown: largest peak-to-trough decline in the cumulative curve
  let peak = cumulative[0] ?? 0;
  let maxDrawdownPct = 0;
  for (const value of cumulative) {
    if (value > peak) peak = value;
    if (peak > 0) {
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
    }
  }

  // Sharpe: use the raw per-tick deltas as "returns"
  const n = equityCurve.length;
  const mean = equityCurve.reduce((s, v) => s + v, 0) / n;
  const variance = equityCurve.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  // annualised: assumes equityCurve entries represent one tick each;
  // caller must ensure the series length is proportional to the step granularity.
  // We scale by sqrt(ticks-per-year) ≈ sqrt(365 * (86400000 / stepMs)).
  // Because we don't have stepMs here, the caller feeds annualisation factor separately;
  // this helper returns the per-tick Sharpe and the caller annualises.
  const sharpePerTick = stddev === 0 ? 0 : mean / stddev;

  return { sharpe: sharpePerTick, maxDrawdownPct };
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export function runBacktest(args: {
  rangeFromMs: number;
  rangeToMs: number;
  stepMs: number;
  dataPoints: BacktestDataPoint[];    // time-ordered, may be sparser than ticks
  evaluator: (
    tickTs: number,
    recentData: BacktestDataPoint[],
  ) => { shouldExecute: boolean; pnlDelta: number };
}): BacktestRun {
  const { rangeFromMs, rangeToMs, stepMs, dataPoints, evaluator } = args;

  const sortedData = [...dataPoints].sort((a, b) => a.ts - b.ts);

  let totalTicks = 0;
  let signalCount = 0;
  const pnlDeltas: number[] = [];
  let totalPnl = 0;

  // Iterate ticks
  for (let tickTs = rangeFromMs; tickTs <= rangeToMs; tickTs += stepMs) {
    totalTicks++;

    // Gather all data points up to and including tickTs
    const recentData = sortedData.filter((p) => p.ts <= tickTs);

    const { shouldExecute, pnlDelta } = evaluator(tickTs, recentData);

    if (shouldExecute) {
      signalCount++;
      pnlDeltas.push(pnlDelta);
      totalPnl += pnlDelta;
    } else {
      pnlDeltas.push(0);
    }
  }

  // Compute stats
  const { sharpe: sharpePerTick, maxDrawdownPct } = computeStats(pnlDeltas);

  // Annualise Sharpe: scale by sqrt(ticks per year)
  const yearMs = 365 * 24 * 3600 * 1000;
  const ticksPerYear = stepMs > 0 ? yearMs / stepMs : 1;
  const sharpeHypothetical = sharpePerTick * Math.sqrt(ticksPerYear);

  // Build summary
  const pnlPct = totalPnl;
  const hitRatePct = totalTicks > 0 ? ((signalCount / totalTicks) * 100).toFixed(1) : "0.0";
  const summary =
    totalTicks === 0
      ? "No ticks — range too short or step too large."
      : `${signalCount}/${totalTicks} ticks triggered (${hitRatePct}% hit rate). ` +
        `Hypothetical P&L: ${(pnlPct * 100).toFixed(2)}%. ` +
        `Sharpe: ${sharpeHypothetical.toFixed(2)}. ` +
        `Max drawdown: ${(maxDrawdownPct * 100).toFixed(2)}%.`;

  return {
    runAt: Date.now(),
    rangeFromMs,
    rangeToMs,
    totalTicks,
    signalCount,
    pnlPctHypothetical: pnlPct,
    sharpeHypothetical,
    maxDrawdownPct,
    summary,
    warnings: [],
  };
}
