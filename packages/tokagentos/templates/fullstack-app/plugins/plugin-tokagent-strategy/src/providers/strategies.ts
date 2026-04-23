import type { Provider, ProviderResult, IAgentRuntime } from "@tokagentos/core";
import { listActiveStrategies } from "../persistence.js";

function toRuntimeLike(runtime: IAgentRuntime) {
  return {
    getSetting: (key: string): string | undefined => {
      const v = runtime.getSetting(key);
      if (v === null || v === undefined) return undefined;
      return String(v) || undefined;
    },
  };
}

export const activeStrategiesProvider: Provider = {
  name: "activeStrategies",
  description:
    "Currently active and testing strategies owned by the user. Useful context for deciding whether to create new ones vs. modify existing.",
  get: async (runtime): Promise<ProviderResult> => {
    const strategies = await listActiveStrategies(toRuntimeLike(runtime));
    if (strategies.length === 0) {
      return { text: "No active strategies." };
    }
    const text =
      `Active strategies (${strategies.length}):\n` +
      strategies
        .map(
          (s) =>
            `  - ${s.name} [${s.status}] ${s.kind} every ${s.schedule.everyMs / 1000}s${s.lastError ? ` (ERROR: ${s.lastError})` : ""}`,
        )
        .join("\n");
    return { text, data: { strategies } };
  },
};
