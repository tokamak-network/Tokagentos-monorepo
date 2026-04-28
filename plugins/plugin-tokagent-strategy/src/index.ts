import type { Plugin } from "@tokagentos/core";
import { deployTokagentVaultAction } from "./actions/deploy-vault.js";
import { registerExistingVaultAction } from "./actions/register-existing-vault.js";
import { buildStrategyAction } from "./actions/build-strategy.js";
import { listStrategiesAction } from "./actions/list-strategies.js";
import { startStrategyAction, stopStrategyAction } from "./actions/start-stop.js";
import { backtestStrategyAction } from "./actions/backtest-strategy.js";
import { getTokagentStatusAction } from "./actions/get-tokagent-status.js";
import { activeStrategiesProvider } from "./providers/strategies.js";
import { vaultContextProvider } from "./providers/vault-context.js";
import { StrategyRunnerService } from "./services/strategy-runner.js";
import { registerBuiltinKinds } from "./kinds/index.js";

// Re-exports so kind-implementer plugins (or follow-up work) can register kinds.
export { registerKind, getKind, listKinds } from "./kind-registry.js";
export type {
  Strategy,
  StrategyKind,
  StrategyStatus,
  StrategyTickEntry,
  StrategyKindImpl,
} from "./types.js";
export type { BacktestRun, BacktestResult, BacktestContext, StrategyBacktestImpl } from "./backtest/types.js";
export { STRATEGY_SCHEMA } from "./persistence.js";
export { registerBuiltinKinds } from "./kinds/index.js";

export const tokagentStrategyPlugin: Plugin = {
  name: "tokagent-strategy",
  description:
    "Strategy engine for Tokagent vaults — compose, persist, and run automated DeFi strategies.",
  init: async () => {
    registerBuiltinKinds();
  },
  actions: [
    // Discovery action listed first so the LLM finds it when scanning
    // for "what can I do" / "where are we" intents.
    getTokagentStatusAction,
    deployTokagentVaultAction,
    registerExistingVaultAction,
    buildStrategyAction,
    listStrategiesAction,
    startStrategyAction,
    stopStrategyAction,
    backtestStrategyAction,
  ],
  providers: [vaultContextProvider, activeStrategiesProvider],
  services: [StrategyRunnerService],
};

export default tokagentStrategyPlugin;
