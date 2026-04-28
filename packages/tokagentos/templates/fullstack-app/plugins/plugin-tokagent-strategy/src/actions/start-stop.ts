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
    "Use AFTER a strategy has been built (status 'draft') and the user wants to run it. Requires the strategy id — if the user references it by name, call LIST_STRATEGIES first to resolve it. " +
    "Mode 'testing' (default) evaluates without sending transactions; 'active' executes for real.",
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
        success: false,      } as ActionResult;
    }

    const modeRaw = String(params.mode ?? "testing").toLowerCase().trim();
    if (modeRaw !== "testing" && modeRaw !== "active") {
      return {
        success: false,      } as ActionResult;
    }
    const targetStatus: StrategyStatus = modeRaw;

    const rl = toRuntimeLike(runtime);
    const strategy = await getStrategy(rl, id);
    if (!strategy) {
      return {
        success: false,      } as ActionResult;
    }

    if (strategy.status === "stopped") {
      return {
        success: false,      } as ActionResult;
    }

    // Validate that the kind is registered
    const impl = getKind(strategy.kind);
    if (!impl) {
      return {
        success: false,      } as ActionResult;
    }

    // Validate that the params pass the kind's schema
    const parseResult = impl.paramSchema.safeParse(strategy.params);
    if (!parseResult.success) {
      return {
        success: false,      } as ActionResult;
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
        content: {
          text: "Starting strategy abc-123 in testing mode (dry-run).",
          actions: ["START_STRATEGY"],
        },
      },
    ],
    [
      { name: "user", content: { text: "activate strategy abc-123 in live mode" } },
      {
        name: "agent",
        content: {
          text: "Starting strategy abc-123 in active mode — it will execute transactions.",
          actions: ["START_STRATEGY"],
        },
      },
    ],
    [
      { name: "user", content: { text: "start the perp one" } },
      {
        name: "agent",
        content: {
          text: "Let me find your perp strategy first.",
          actions: ["LIST_STRATEGIES"],
        },
      },
    ],
    [
      { name: "user", content: { text: "go live with my yield strategy" } },
      {
        name: "agent",
        content: {
          text: "Switching the yield strategy to active mode.",
          actions: ["START_STRATEGY"],
        },
      },
    ],
  ],
};

// ─── STOP_STRATEGY ────────────────────────────────────────────────────────────

export const stopStrategyAction: Action = {
  name: "STOP_STRATEGY",
  description:
    "Use to permanently stop a running strategy by id; history is retained but the runner will skip it on future ticks. " +
    "If the user refers to a strategy by name, call LIST_STRATEGIES first to resolve the id. For temporary suspension, use a pause/status update instead.",
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
        success: false,      } as ActionResult;
    }

    const rl = toRuntimeLike(runtime);
    const strategy = await getStrategy(rl, id);
    if (!strategy) {
      return {
        success: false,      } as ActionResult;
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
        content: {
          text: "Stopping strategy abc-123. History will be retained.",
          actions: ["STOP_STRATEGY"],
        },
      },
    ],
    [
      { name: "user", content: { text: "kill the polymarket strategy" } },
      {
        name: "agent",
        content: {
          text: "Let me find the polymarket strategy id first.",
          actions: ["LIST_STRATEGIES"],
        },
      },
    ],
    [
      { name: "user", content: { text: "halt all my strategies" } },
      {
        name: "agent",
        content: {
          text: "Listing your strategies so I can stop each one.",
          actions: ["LIST_STRATEGIES"],
        },
      },
    ],
  ],
};
