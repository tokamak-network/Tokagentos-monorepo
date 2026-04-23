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
    "List all strategies the user has created (draft, active, testing, paused, stopped).",
  similes: [
    "list strategies",
    "show strategies",
    "my strategies",
    "what strategies do I have",
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
        content: { text: "Showing all strategies." },
      },
    ],
  ],
};
