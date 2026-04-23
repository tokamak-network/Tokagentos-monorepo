import type { Action, ActionResult, IAgentRuntime } from "@elizaos/core";
import { getStrategy, updateStrategy } from "../persistence.js";
import { getKind } from "../kind-registry.js";
import type { StrategyStatus } from "../types.js";

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

// ─── START_STRATEGY ───────────────────────────────────────────────────────────

export const startStrategyAction: Action = {
  name: "START_STRATEGY",
  description:
    "Start a strategy. In 'testing' mode (default) the strategy evaluates but does not execute — useful for sanity-checking before going live. In 'active' mode it will actually execute transactions.",
  similes: [
    "start strategy",
    "activate strategy",
    "run strategy",
    "enable strategy",
    "begin strategy",
    "start running strategy",
  ],
  parameters: [
    {
      name: "id",
      description: "Strategy ID to start.",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "mode",
      description: "'testing' (dry-run, default) or 'active' (live execution).",
      required: false,
      schema: { type: "string", enum: ["testing", "active"] },
    },
  ],
  validate: async () => true,
  handler: async (runtime, _message, _state, options) => {
    const params = (
      (options as { parameters?: Record<string, unknown> } | undefined)?.parameters ?? options ?? {}
    ) as Record<string, unknown>;

    const id = String(params.id ?? "").trim();
    if (!id) {
      return {
        success: false,
        text: "Missing required parameter: id",
      } as ActionResult;
    }

    const modeRaw = String(params.mode ?? "testing").toLowerCase().trim();
    if (modeRaw !== "testing" && modeRaw !== "active") {
      return {
        success: false,
        text: `Invalid mode '${modeRaw}'. Must be 'testing' or 'active'.`,
      } as ActionResult;
    }
    const targetStatus: StrategyStatus = modeRaw;

    const rl = toRuntimeLike(runtime);
    const strategy = await getStrategy(rl, id);
    if (!strategy) {
      return {
        success: false,
        text: `Strategy not found: ${id}. Use LIST_STRATEGIES to see your strategies.`,
      } as ActionResult;
    }

    if (strategy.status === "stopped") {
      return {
        success: false,
        text: `Strategy '${strategy.name}' is stopped and cannot be restarted. Create a new strategy instead.`,
      } as ActionResult;
    }

    // Validate that the kind is registered
    const impl = getKind(strategy.kind);
    if (!impl) {
      return {
        success: false,
        text: `Cannot start strategy: kind '${strategy.kind}' is not registered. Make sure the corresponding plugin is loaded.`,
      } as ActionResult;
    }

    // Validate that the params pass the kind's schema
    const parseResult = impl.paramSchema.safeParse(strategy.params);
    if (!parseResult.success) {
      return {
        success: false,
        text: `Cannot start strategy: params validation failed — ${parseResult.error.message}. Edit the strategy params before starting.`,
      } as ActionResult;
    }

    await updateStrategy(rl, id, { status: targetStatus });

    const modeLabel = targetStatus === "testing" ? "testing (dry-run)" : "active (live)";
    return {
      success: true,
      text: `Strategy '${strategy.name}' is now ${modeLabel}. The runner will pick it up on the next tick.`,
      data: { id, status: targetStatus },
    } as ActionResult;
  },
  examples: [
    [
      { name: "user", content: { text: "start strategy abc-123" } },
      {
        name: "agent",
        content: { text: "Starting strategy in testing mode." },
      },
    ],
    [
      { name: "user", content: { text: "activate strategy abc-123 in live mode" } },
      {
        name: "agent",
        content: { text: "Starting strategy in active mode — it will execute transactions." },
      },
    ],
  ],
};

// ─── STOP_STRATEGY ────────────────────────────────────────────────────────────

export const stopStrategyAction: Action = {
  name: "STOP_STRATEGY",
  description:
    "Stop a strategy permanently. The strategy history is retained. Use PAUSE or status updates for temporary suspension.",
  similes: [
    "stop strategy",
    "deactivate strategy",
    "disable strategy",
    "halt strategy",
    "cancel strategy",
  ],
  parameters: [
    {
      name: "id",
      description: "Strategy ID to stop.",
      required: true,
      schema: { type: "string" },
    },
  ],
  validate: async () => true,
  handler: async (runtime, _message, _state, options) => {
    const params = (
      (options as { parameters?: Record<string, unknown> } | undefined)?.parameters ?? options ?? {}
    ) as Record<string, unknown>;

    const id = String(params.id ?? "").trim();
    if (!id) {
      return {
        success: false,
        text: "Missing required parameter: id",
      } as ActionResult;
    }

    const rl = toRuntimeLike(runtime);
    const strategy = await getStrategy(rl, id);
    if (!strategy) {
      return {
        success: false,
        text: `Strategy not found: ${id}. Use LIST_STRATEGIES to see your strategies.`,
      } as ActionResult;
    }

    // Idempotent — stopping an already-stopped strategy is a no-op
    if (strategy.status === "stopped") {
      return {
        success: true,
        text: `Strategy '${strategy.name}' is already stopped.`,
        data: { id, status: "stopped" },
      } as ActionResult;
    }

    await updateStrategy(rl, id, { status: "stopped" });

    return {
      success: true,
      text: `Strategy '${strategy.name}' has been stopped. Its history is retained. Use LIST_STRATEGIES to review it.`,
      data: { id, status: "stopped" },
    } as ActionResult;
  },
  examples: [
    [
      { name: "user", content: { text: "stop strategy abc-123" } },
      {
        name: "agent",
        content: { text: "Stopping strategy abc-123." },
      },
    ],
  ],
};
