# @tokagent/plugin-tokagent-strategy

Strategy engine for Tokagent vaults. Compose, persist, and run automated DeFi strategies.

## Actions

| Action | Description |
|--------|-------------|
| `BUILD_STRATEGY` | LLM-driven strategy composition |
| `LIST_STRATEGIES` | List all strategies with status |
| `START_STRATEGY` | Start in `testing` (dry-run) or `active` (live) mode |
| `STOP_STRATEGY` | Permanently stop a strategy |
| `BACKTEST_STRATEGY` | Simulate strategy P&L on historical data |
| `DEPLOY_TOKAGENT_VAULT` | Deploy a KernelVault for use by strategies |

## Strategy Kinds

| Kind | Backtest Support | Data Source |
|------|-----------------|-------------|
| `yield-auto-compound` | Yes (Polygon only) | Aave v3 subgraph (The Graph) |
| `perp-funding-arb` | Yes | Hyperliquid fundingHistory API |
| `polymarket-value-hunt` | No (alert-only) | — |

---

## Backtesting

The `BACKTEST_STRATEGY` action runs a strategy's evaluation logic against historical data to simulate hypothetical P&L before committing real funds.

### Usage

```
BACKTEST_STRATEGY id=<strategy-id> days=30
```

- `id` (required): Strategy ID from `LIST_STRATEGIES`
- `days` (optional, default 30): Number of history days to simulate. Must be in (0, 365].

### Which kinds support backtesting?

| Kind | Supported | What it tests |
|------|-----------|---------------|
| `yield-auto-compound` | Yes | Simulates supplying to Aave v3 on Polygon; models APY accrual at each tick |
| `perp-funding-arb` | Yes | Simulates funding-rate spread capture across Hyperliquid perp symbols |
| `polymarket-value-hunt` | No | Alert-only kind — no positions taken, no P&L to backtest |

### What the hypothetical P&L measures (and what it ignores)

**`yield-auto-compound`**:
- P&L proxy = `liquidityRate * (stepMs / yearMs)` per tick — the APY fraction accrued each strategy step
- Assumes funds are always supplied (no idle time modelled)
- Ignores: gas costs, supply/withdraw delays, aToken rebasing precision, Aave utilisation changes between ticks

**`perp-funding-arb`**:
- P&L proxy = `(highestFunding - lowestFunding) * (stepMs / hourMs)` per signal tick
- Models capturing the funding spread between the highest and lowest rate symbol in each tick
- Ignores: slippage, exchange fees, borrow cost, execution timing, position rebalancing cost, mark price drift between entry and exit

**Both kinds**: The hypothetical P&L is a notional spread × time proxy, NOT a real trading P&L. Treat it as a rough directional signal, not a precise return estimate.

### How to interpret Sharpe and max drawdown

- **Sharpe ratio**: Annualised `mean(tick-returns) / stddev(tick-returns) * sqrt(ticks-per-year)`. Positive Sharpe suggests the strategy historically produced returns above the noise level; zero means all ticks were identical (no variance). This is NOT risk-adjusted for transaction costs.
- **Max drawdown**: Largest peak-to-trough decline in the cumulative equity curve. A 5% max drawdown means the cumulative P&L fell 5% from its peak before recovering. For the yield kind this is typically near zero (rates don't go negative).

### Results persistence

Each run is stored in `strategy.backtestResults` (capped at 5 most recent). Runs are persisted with the strategy in `~/.tokagent/strategies.json`.

### Example output

```
Backtest complete for "BTC/ETH Funding Arb" (30d):
  Ticks: 720 (312 signals)
  Hypothetical P&L: 1.45%
  Sharpe: 2.11
  Max drawdown: 0.03%
  312/720 ticks triggered (43.3% hit rate). Hypothetical P&L: 1.45%. Sharpe: 2.11. Max drawdown: 0.03%.
Caveats:
  - Backtest ignores slippage, fees, borrow cost.
  - Assumes 1-tick holding period — real holding is determined by execution + spread convergence.
  - Uses current funding spread as P&L proxy; actual P&L depends on position size, mark price drift, and funding payment timing.
```

---

## Quick start

```
# 1. Build a strategy
BUILD_STRATEGY description="Auto-compound idle USDC into Aave on Polygon" vaultAddress=0x... chain=polygon

# 2. Backtest it before going live
BACKTEST_STRATEGY id=<id-from-step-1> days=60

# 3. Start in dry-run mode to see live evaluate output
START_STRATEGY id=<id> mode=testing

# 4. Go live once satisfied
START_STRATEGY id=<id> mode=active
```
