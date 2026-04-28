import type { Action, ActionResult, IAgentRuntime } from "@elizaos/core";
import { loadStrategies } from "../persistence.js";

/** Adapt IAgentRuntime.getSetting (returns string|number|boolean|null) to AgentRuntimeLike. */
function toRuntimeLike(runtime: IAgentRuntime) {
  return {
    getSetting: (key: string): string | undefined => {
      const v = runtime.getSetting(key);
      if (v === null || v === undefined) return undefined;
      return String(v) || undefined;
    },
  };
}

export const listStrategiesAction: Action = {
  name: "LIST_STRATEGIES",
  description:
    "Use to enumerate all strategies the user has created — call this BEFORE start/stop/backtest when the user refers to a strategy by description rather than id. " +
    "Returns each strategy's id, name, kind, status (draft/active/testing/paused/stopped), vault, and last tick.",
  similes: [
    "list strategies",
    "show strategies",
    "my strategies",
    "what strategies do I have",
    "show me my strategies",
    "which strategies are running",
  ],
  validate: async () => true,
  handler: async (runtime) => {
    const strategies = await loadStrategies(toRuntimeLike(runtime));
    if (strategies.length === 0) {
      return {
        success: true,
        text: "No strategies yet. Use BUILD_STRATEGY to create one.",
      } as ActionResult;
    }
    const lines = strategies.map(
      (s) =>
        `• ${s.name} [${s.status}] — ${s.kind}, vault ${s.vault.address.slice(0, 10)}… on chain ${s.vault.chainId}, last tick: ${s.lastTickAt ? new Date(s.lastTickAt).toISOString() : "never"}${s.lastError ? ` — ERROR: ${s.lastError}` : ""}`,
    );
    return {
      success: true,
      text: `${strategies.length} strateg${strategies.length === 1 ? "y" : "ies"}:\n${lines.join("\n")}`,
      data: { strategies },
    } as ActionResult;
  },
  examples: [
    [
      { name: "user", content: { text: "list my strategies" } },
      {
        name: "agent",
        content: {
          text: "Showing all strategies.",
          actions: ["LIST_STRATEGIES"],
        },
      },
    ],
    [
      { name: "user", content: { text: "what strategies do I have running?" } },
      {
        name: "agent",
        content: {
          text: "Pulling your strategy list with current statuses.",
          actions: ["LIST_STRATEGIES"],
        },
      },
    ],
    [
      { name: "user", content: { text: "show me everything I've built" } },
      {
        name: "agent",
        content: {
          text: "Listing every strategy — drafts, active, testing, and stopped.",
          actions: ["LIST_STRATEGIES"],
        },
      },
    ],
    [
      { name: "user", content: { text: "any of my strategies misbehaving?" } },
      {
        name: "agent",
        content: {
          text: "Listing strategies so I can flag any with errors on their last tick.",
          actions: ["LIST_STRATEGIES"],
        },
      },
    ],
  ],
};
