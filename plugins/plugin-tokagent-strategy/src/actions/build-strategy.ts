/**
 * BUILD_STRATEGY — compose a Strategy from a free-form natural language description.
 *
 * Calls runtime.useModel to generate structured JSON, validates it, persists as "draft".
 */

import { randomUUID } from "node:crypto";
import type { Action, ActionResult, IAgentRuntime } from "@tokagentos/core";
import { ModelType } from "@tokagentos/core";
import {
  tokagentActionError,
  tokagentActionFailure,
} from "@tokagent/plugin-tokagent-shared";
import { getKind } from "../kind-registry.js";
import { saveStrategy } from "../persistence.js";
import type { Strategy, StrategyKind } from "../types.js";

// ─── Chain resolution ─────────────────────────────────────────────────────────

const CHAIN_IDS_BY_NAME: Record<string, number> = {
  ethereum: 1,
  mainnet: 1,
  eth: 1,
  polygon: 137,
  matic: 137,
  hyperevm: 999,
  hyper: 999,
};

// ─── LLM system prompt ────────────────────────────────────────────────────────

function buildSystemPrompt(userPrompt: string): string {
  return `You are a DeFi strategy composer. Given a user's goal, produce a JSON strategy object matching this exact shape:

{
  "name": "<short human title>",
  "description": "<1-paragraph rationale, plain English>",
  "kind": "<one of: yield-auto-compound | polymarket-value-hunt | perp-funding-arb>",
  "params": <kind-specific — see schemas below>,
  "scheduleEveryMs": <number, how often to tick; min 60000>
}

Available kinds:

1. yield-auto-compound:
   params: { asset: "USDC", minHarvestAmount: number, targetApy?: number }
   - asset: which stablecoin to auto-compound. Only "USDC" supported.
   - minHarvestAmount: minimum USDC balance in vault before triggering supply (human units, e.g., 10 for $10).
   - targetApy: advisory only.

2. polymarket-value-hunt:
   params: { minMarketVolume: number, minMispricingPct: number, maxMarkets: number }
   - minMarketVolume: only scan markets with >= $X cumulative volume.
   - minMispricingPct: alert threshold in percent.
   - maxMarkets: cap per tick (<=20).

3. perp-funding-arb:
   params: { symbols: string[] (>=2, <=10), minFundingSpreadBps: number, maxPositionUsd: number }
   - symbols: Hyperliquid perp symbols, e.g., ["BTC", "ETH", "SOL"].
   - minFundingSpreadBps: minimum funding-rate spread (basis points) to signal.
   - maxPositionUsd: cap per leg in USD.

Rules:
- Emit ONLY a valid JSON block, no prose before or after.
- Pick the best kind for the user's request.
- If unclear, pick sensible defaults per the kind's typical use.
- scheduleEveryMs: default 3600000 (1h) for funding-arb / value-hunt, 86400000 (24h) for yield-auto-compound.

User request: ${userPrompt}

Respond with JSON only.`;
}

// ─── JSON extraction ──────────────────────────────────────────────────────────

function extractJson(raw: string): unknown {
  // Strip everything before the first { and after the last }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in LLM response");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_KINDS: StrategyKind[] = [
  "yield-auto-compound",
  "polymarket-value-hunt",
  "perp-funding-arb",
];

interface LLMStrategyShape {
  name: string;
  description: string;
  kind: StrategyKind;
  params: Record<string, unknown>;
  scheduleEveryMs: number;
}

function validateLLMOutput(parsed: unknown): LLMStrategyShape {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("LLM returned non-object JSON");
  }
  const obj = parsed as Record<string, unknown>;

  if (typeof obj["name"] !== "string" || obj["name"].trim().length === 0) {
    throw new Error('LLM response missing or empty "name" field');
  }
  if (typeof obj["description"] !== "string" || obj["description"].trim().length === 0) {
    throw new Error('LLM response missing or empty "description" field');
  }
  if (!VALID_KINDS.includes(obj["kind"] as StrategyKind)) {
    throw new Error(
      `LLM response "kind" must be one of: ${VALID_KINDS.join(", ")}. Got: ${JSON.stringify(obj["kind"])}`,
    );
  }
  if (typeof obj["params"] !== "object" || obj["params"] === null) {
    throw new Error('LLM response missing or non-object "params" field');
  }
  const scheduleEveryMs = Number(obj["scheduleEveryMs"]);
  if (!Number.isFinite(scheduleEveryMs) || scheduleEveryMs < 60_000) {
    throw new Error(
      `LLM response "scheduleEveryMs" must be a number >= 60000. Got: ${JSON.stringify(obj["scheduleEveryMs"])}`,
    );
  }

  return {
    name: obj["name"] as string,
    description: obj["description"] as string,
    kind: obj["kind"] as StrategyKind,
    params: obj["params"] as Record<string, unknown>,
    scheduleEveryMs,
  };
}

// ─── Runtime adapter helper ───────────────────────────────────────────────────

function toRuntimeLike(runtime: IAgentRuntime) {
  return {
    getSetting: (key: string): string | undefined => {
      const v = runtime.getSetting(key);
      if (v === null || v === undefined) return undefined;
      return String(v) || undefined;
    },
  };
}

// ─── Action ───────────────────────────────────────────────────────────────────

export const buildStrategyAction: Action = {
  name: "BUILD_STRATEGY",
  description:
    "Use to compose a DeFi strategy from a free-form goal description (yield, perp funding arb, polymarket value hunt). " +
    "Maps the goal to a structured StrategyKind via an LLM, validates kind-specific params, and persists it as a draft. " +
    "Returns the new strategy id; vault defaults to TOKAGENT_VAULT_ADDRESS_<chainId> and chain defaults to 'hyperevm'.",
  similes: [
    "build strategy",
    "create strategy",
    "new strategy",
    "compose strategy",
    "make a strategy",
    "set up a strategy",
    "design a strategy",
  ],

  parameters: [
    {
      name: "description",
      description: "Free-form description of the strategy goal.",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "vaultAddress",
      description:
        "Optional. TokagentVault address this strategy operates through. " +
        "Defaults to TOKAGENT_VAULT_ADDRESS_<chainId> setting (per-chain) — call DEPLOY_TOKAGENT_VAULT first if no vault exists.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "chain",
      description: "Optional. Chain the vault is on: 'ethereum', 'polygon', or 'hyperevm'. Defaults to 'hyperevm'.",
      required: false,
      schema: { type: "string", enum: ["ethereum", "polygon", "hyperevm"] },
    },
  ],

  validate: async () => true,

  handler: async (runtime, _message, _state, options) => {
    const params = (
      (options as { parameters?: Record<string, unknown> } | undefined)?.parameters ?? options ?? {}
    ) as Record<string, unknown>;

    const userPrompt = String(params["description"] ?? "").trim();

    // Default chain to "hyperevm" when not provided
    const chainNameRaw = String(params["chain"] ?? "")
      .toLowerCase()
      .trim();
    const chainName = chainNameRaw || "hyperevm";

    if (!userPrompt) {
      return tokagentActionError("missing_description");
    }

    const chainId = CHAIN_IDS_BY_NAME[chainName];
    if (!chainId) {
      return tokagentActionError("invalid_chain", { provided: chainName });
    }

    // Resolve vault address: explicit param wins, otherwise per-chain runtime setting
    let vaultAddress = String(params["vaultAddress"] ?? "").trim() as `0x${string}`;
    if (!vaultAddress) {
      const settingKey = `TOKAGENT_VAULT_ADDRESS_${chainId}`;
      const fromSetting = String(runtime.getSetting(settingKey) ?? "").trim();
      if (fromSetting) {
        vaultAddress = fromSetting as `0x${string}`;
      }
    }

    if (!vaultAddress) {
      return tokagentActionFailure(
        "no_vault_for_chain",
        `No TokagentVault deployed on ${chainName} yet. Call DEPLOY_TOKAGENT_VAULT first, then re-run BUILD_STRATEGY.`,
        { chain: chainName, chainId },
      );
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(vaultAddress)) {
      return tokagentActionFailure(
        "invalid_vault_address",
        `vaultAddress "${vaultAddress.slice(0, 12)}…" is not a valid EVM address. Pass a deployed vault from GET_TOKAGENT_STATUS or DEPLOY_TOKAGENT_VAULT.`,
        { provided: vaultAddress },
      );
    }

    // ── Step 1: call LLM ──────────────────────────────────────────────────────

    const systemPrompt = buildSystemPrompt(userPrompt);

    let rawResponse: string;
    try {
      rawResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: systemPrompt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return tokagentActionFailure(
        "llm_call_failed",
        `Strategy composition aborted — the model call to compose the strategy JSON failed: ${msg.slice(0, 240)}. Try again in a moment.`,
        { error: msg },
      );
    }

    // ── Step 2: extract + structurally validate JSON ──────────────────────────

    let parsed: unknown;
    try {
      parsed = extractJson(rawResponse);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return tokagentActionFailure(
        "llm_json_parse_failed",
        `Strategy composer model returned non-JSON output. Try rephrasing the request.`,
        { rawResponse: rawResponse.slice(0, 500), error: msg },
      );
    }

    let shape: LLMStrategyShape;
    try {
      shape = validateLLMOutput(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return tokagentActionFailure(
        "llm_shape_invalid",
        `Strategy composer model returned a malformed object: ${msg.slice(0, 200)}. Try a more specific request.`,
        { parsed, error: msg },
      );
    }

    // ── Step 3: validate kind-specific params via the kind's zod schema ────────

    const kindImpl = getKind(shape.kind);
    if (!kindImpl) {
      return tokagentActionFailure(
        "unknown_strategy_kind",
        `Strategy kind "${shape.kind}" is not registered. This is an internal configuration issue — report it.`,
        { kind: shape.kind },
      );
    }

    const paramValidation = kindImpl.paramSchema.safeParse(shape.params);
    if (!paramValidation.success) {
      const zodErr = paramValidation.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      return tokagentActionFailure(
        "strategy_params_invalid",
        `Composed strategy params didn't pass validation for kind "${shape.kind}". Try a more specific request (e.g. include exact USDC threshold or symbol list).`,
        {
          kind: shape.kind,
          params: shape.params,
          zodErrors: paramValidation.error.issues,
          zodErrText: zodErr,
        },
      );
    }

    // ── Step 4: build + persist strategy ──────────────────────────────────────

    const strategy: Strategy = {
      id: randomUUID(),
      name: shape.name,
      description: shape.description,
      kind: shape.kind,
      params: paramValidation.data as Record<string, unknown>,
      vault: { chainId, address: vaultAddress },
      schedule: { everyMs: shape.scheduleEveryMs },
      status: "draft",
      createdAt: Date.now(),
      tickHistory: [],
    };

    const rl = toRuntimeLike(runtime);
    await saveStrategy(rl, strategy);

    return {
      success: true,
      text:
        `Built strategy "${strategy.name}" (${strategy.kind}). ID: ${strategy.id}. Status: draft.\n\n` +
        `${strategy.description}\n\n` +
        `To run in dry-run mode: START_STRATEGY id=${strategy.id} mode=testing.\n` +
        `To run live: START_STRATEGY id=${strategy.id} mode=active.`,
      data: { strategy },
    } as ActionResult;
  },

  examples: [
    [
      {
        name: "user",
        content: {
          text: "Create a perp strategy that spots funding rate discrepancies across BTC, ETH, and SOL",
        },
      },
      {
        name: "agent",
        content: {
          text: "Building a perp-funding-arb strategy across BTC/ETH/SOL on the default HyperEVM vault.",
          actions: ["BUILD_STRATEGY"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "I want to auto-compound my USDC on Aave" },
      },
      {
        name: "agent",
        content: {
          text: "Setting up a yield-auto-compound strategy for USDC on the Polygon vault.",
          actions: ["BUILD_STRATEGY"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "alert me to mispriced polymarket markets" },
      },
      {
        name: "agent",
        content: {
          text: "Creating a polymarket-value-hunt strategy.",
          actions: ["BUILD_STRATEGY"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "build a yield strategy" },
      },
      {
        name: "agent",
        content: {
          text: "Composing a yield-auto-compound USDC strategy on your default vault.",
          actions: ["BUILD_STRATEGY"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "make a strategy that does something with funding" },
      },
      {
        name: "agent",
        content: {
          text: "I'll build a perp-funding-arb strategy. Which symbols should I include — BTC, ETH, SOL, or others?",
        },
      },
    ],
  ],
};
