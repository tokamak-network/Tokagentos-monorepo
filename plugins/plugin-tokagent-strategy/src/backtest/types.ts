export interface BacktestDataPoint {
  ts: number;                          // unix ms
  [key: string]: number | string;      // kind-specific fields
}

export interface BacktestRun {
  runAt: number;                       // when backtest was executed
  rangeFromMs: number;
  rangeToMs: number;
  totalTicks: number;                  // how many simulated ticks
  signalCount: number;                 // how many ticks triggered shouldExecute
  pnlPctHypothetical: number;          // total hypothetical P&L as a fraction (0.045 = 4.5%)
  sharpeHypothetical: number;          // annualized Sharpe ratio
  maxDrawdownPct: number;              // max drawdown as a fraction (0.05 = 5%)
  summary: string;                     // 1-line human summary
  warnings: string[];                  // caveats, e.g. "funding calc assumes position held 1 hour"
}

export interface BacktestResult {
  supported: boolean;
  reason?: string;                     // if !supported, why (e.g. "polymarket-value-hunt is alert-only")
  run?: BacktestRun;                   // present when supported=true
}

export interface BacktestContext {
  fromMs: number;
  toMs: number;
  stepMs: number;                      // = strategy.schedule.everyMs
}

export interface StrategyBacktestImpl<P = unknown> {
  backtest(
    params: P,
    ctx: BacktestContext,
    vault: { chainId: number; address: `0x${string}` },
  ): Promise<BacktestResult>;
}
