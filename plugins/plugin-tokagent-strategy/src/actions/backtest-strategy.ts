import type { Action, ActionResult, IAgentRuntime } from "@tokagentos/core";
import { getStrategy, saveStrategy } from "../persistence.js";
import { getKind } from "../kind-registry.js";
import type { BacktestContext, BacktestResult, BacktestRun } from "../backtest/types.js";
import type { Strategy } from "../types.js";

/** Adapt IAgentRuntime.getSetting to the AgentRuntimeLike interface used by persistence. */
function toRuntimeLike(runtime: IAgentRuntime) {
  return {
    getSetting: (key: string): string | undefined => {
      const v = runtime.getSetting(key);
      if (v === null || v === undefined) return undefined;
      return String(v) || undefined;
    },
  };
}

export const backtestStrategyAction: Action = {
  name: "BACKTEST_STRATEGY",
  description:
    "Use AFTER a strategy is built, to validate its params against historical data BEFORE going active. " +
    "Replays the strategy's evaluator over the last N days and reports hypothetical P&L, Sharpe, drawdown. Only some kinds support backtesting.",
  similes: [
    "backtest strategy",
    "simulate strategy",
    "test strategy on historical data",
    "dry-run strategy on history",
    "historical backtest",
    "back test strategy",
    "validate strategy parameters",
  ],
  parameters: [
    {
      name: "id",
      description: "Strategy ID.",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "days",
      description: "How many days of history to simulate. Default 30.",
      required: false,
      schema: { type: "number" },
    },
  ],
  validate: async () => true,
  handler: async (runtime, _msg, _state, options) => {
    const params = (
      (options as { parameters?: Record<string, unknown> } | undefined)?.parameters ??
      options ??
      {}
    ) as Record<string, unknown>;

    const id = String(params.id ?? "").trim();
    const days = Number(params.days ?? 30);

    if (!id) {
      return { success: false,} as ActionResult;
    }
    if (!Number.isFinite(days) || days <= 0 || days > 365) {
      return {
        success: false,      } as ActionResult;
    }

    const rl = toRuntimeLike(runtime);
    const strategy = await getStrategy(rl, id);
    if (!strategy) {
      return {
        success: false,      } as ActionResult;
    }

    const impl = getKind(strategy.kind);
    if (!impl) {
      return {
        success: false,      } as ActionResult;
    }

    const backtestFn = (impl as unknown as { backtest?: unknown }).backtest;
    if (typeof backtestFn !== "function") {
      return {
        success: false,      } as ActionResult;
    }

    const paramsParse = impl.paramSchema.safeParse(strategy.params);
    if (!paramsParse.success) {
      return {
        success: false,      } as ActionResult;
    }

    const now = Date.now();
    const ctx: BacktestContext = {
      fromMs: now - days * 24 * 3600 * 1000,
      toMs: now,
      stepMs: strategy.schedule.everyMs,
    };

    try {
      const result = (await (
        impl as unknown as {
          backtest: (
            p: unknown,
            c: BacktestContext,
            v: Strategy["vault"],
          ) => Promise<BacktestResult>;
        }
      ).backtest(paramsParse.data, ctx, strategy.vault)) as BacktestResult;

      if (!result.supported) {
        return {
          success: true,
          text: `Backtest not supported for kind '${strategy.kind}': ${result.reason}`,
        } as ActionResult;
      }

      if (!result.run) {
        return {
          success: false,        } as ActionResult;
      }

      // Append to strategy.backtestResults, capped at 5 most recent
      const updated: Strategy = {
        ...strategy,
        backtestResults: [...(strategy.backtestResults ?? []), result.run].slice(-5),
      };
      await saveStrategy(rl, updated);

      const run: BacktestRun = result.run;
      const warningsText =
        run.warnings.length > 0
          ? `\nCaveats:\n${run.warnings.map((w) => `  - ${w}`).join("\n")}`
          : "";

      return {
        success: true,
        text:
          `Backtest complete for "${strategy.name}" (${days}d):\n` +
          `  Ticks: ${run.totalTicks} (${run.signalCount} signals)\n` +
          `  Hypothetical P&L: ${(run.pnlPctHypothetical * 100).toFixed(2)}%\n` +
          `  Sharpe: ${run.sharpeHypothetical.toFixed(2)}\n` +
          `  Max drawdown: ${(run.maxDrawdownPct * 100).toFixed(2)}%\n` +
          `  ${run.summary}${warningsText}`,
        data: { run },
      } as ActionResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,      } as ActionResult;
    }
  },
  examples: [
    [
      {
        name: "user",
        content: { text: "Backtest my funding-arb strategy over the last 60 days" },
      },
      {
        name: "agent",
        content: {
          text: "Running 60-day backtest for your funding-arb strategy.",
          actions: ["BACKTEST_STRATEGY"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "Simulate the yield strategy against 90 days of Aave history" },
      },
      {
        name: "agent",
        content: {
          text: "Backtesting 90 days of Aave rate history for your yield strategy.",
          actions: ["BACKTEST_STRATEGY"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "would my strategy have made money historically?" },
      },
      {
        name: "agent",
        content: {
          text: "Let me list your strategies so I can pick the right one to backtest.",
          actions: ["LIST_STRATEGIES"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "backtest strategy abc-123" } ,
      },
      {
        name: "agent",
        content: {
          text: "Running a 30-day backtest on strategy abc-123 (default window).",
          actions: ["BACKTEST_STRATEGY"],
        },
      },
    ],
  ],
};
