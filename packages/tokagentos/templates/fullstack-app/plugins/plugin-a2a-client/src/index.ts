/**
 * @tokagent/plugin-a2a-client
 *
 * Lets the agent call other agents via Google's A2A (Agent2Agent) protocol.
 * When the remote agent's HTTP endpoint returns 402 Payment Required, the
 * middleware transparently composes a signed EIP-3009 PTON authorization
 * with the operator wallet and retries with `X-Payment`.
 *
 * Single action: CALL_A2A_AGENT. Input shapes:
 *   options.baseUrl  — peer agent's base URL (the well-known AgentCard
 *                      lives at `${baseUrl}/.well-known/agent.json`)
 *   options.skillId  — the skill ID from the AgentCard to invoke
 *   options.input    — payload matching the skill's inputSchema
 *
 * The action also tries to parse `baseUrl` and `skillId` out of the
 * message text for "call @market-data ask for ETH price" style prompts.
 *
 * Wallet handling — IMPORTANT
 * ---------------------------
 *   TOKAGENT_PRIVATE_KEY in process.env (also accepts EVM_PRIVATE_KEY) is
 *   used to sign vouchers. It is read once per action invocation, lives
 *   only in the X402Client's memory for the duration of the call, and is
 *   never logged, never serialized to HTTP bodies, never returned in
 *   error messages.
 *
 *   If unset, the action runs in observer mode: it can discover and call
 *   free A2A endpoints, but 402 responses become a clear "no operator
 *   wallet configured" error. No silent skip.
 *
 * Cap enforcement
 * ---------------
 *   X402_MAX_PAYMENT_PER_CALL_PTON (default 1.0)  — single-payment cap
 *   X402_MAX_TOTAL_SPEND_PTON      (default 10.0) — session-cumulative cap
 *
 *   Both are enforced BEFORE signing — a refused payment never reaches
 *   the wallet. Refusal emits a clear error to the agent so the user can
 *   raise the cap if intentional.
 */

import type {
  Action,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Plugin,
  State,
} from "@elizaos/core";

import { type Hex, parseUnits } from "viem";

import {
  A2AClient,
  A2AError,
  formatTaskResult,
  type AgentCard,
} from "./a2a-protocol.js";
import { X402Client, X402Error, type X402Receipt } from "./x402-client.js";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** PTON has 18 decimals in the existing Tokamak vault deployments. */
const PTON_DECIMALS = 18;

const MAX_OUTPUT_CHARS = 16_000;

// ---------------------------------------------------------------------------
// Setting resolution — runtime.getSetting() does NOT consult process.env
// in current elizaOS, so every read falls back to process.env explicitly.
// Same pattern as plugin-web-fetch and the auto-reply patch in
// plugin-telegram.
// ---------------------------------------------------------------------------

function readSetting(runtime: IAgentRuntime, key: string): string | undefined {
  const fromRuntime =
    typeof runtime.getSetting === "function"
      ? (runtime.getSetting(key) as string | null | undefined)
      : undefined;
  if (typeof fromRuntime === "string" && fromRuntime.trim()) {
    return fromRuntime.trim();
  }
  const fromEnv = process.env[key];
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return undefined;
}

function readPrivateKey(): Hex | undefined {
  const raw =
    process.env.TOKAGENT_PRIVATE_KEY?.trim() ||
    process.env.EVM_PRIVATE_KEY?.trim();
  if (!raw) return undefined;
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return undefined;
  return hex as Hex;
}

// ---------------------------------------------------------------------------
// Argument extraction
// ---------------------------------------------------------------------------

interface CallArgs {
  baseUrl: string;
  skillId: string;
  input: unknown;
}

const HTTP_URL_RE = /\bhttps?:\/\/[^\s<>"'`)]+/i;

function pickArgs(
  options: Record<string, unknown> | undefined,
  message: Memory,
): Partial<CallArgs> {
  const text =
    typeof message.content?.text === "string" ? message.content.text : "";
  const baseUrl =
    optionString(options?.baseUrl) ??
    optionString(options?.url) ??
    text.match(HTTP_URL_RE)?.[0];
  const skillId = optionString(options?.skillId) ?? optionString(options?.skill);
  const input =
    options?.input !== undefined
      ? options.input
      : options?.payload !== undefined
        ? options.payload
        : text;
  return { baseUrl: baseUrl?.replace(/\/$/, ""), skillId, input };
}

function optionString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export const callA2AAgentAction: Action = {
  name: "CALL_A2A_AGENT",
  similes: [
    "INVOKE_A2A",
    "CALL_AGENT",
    "DELEGATE_TO_AGENT",
    "ASK_AGENT",
    "A2A",
    "INVOKE_AGENT",
  ],
  description:
    "Discover and invoke a remote agent via Google's A2A protocol. " +
    "Pass `baseUrl` (the peer's base URL) and `skillId` (from its " +
    "AgentCard) in options. Handles x402 payment automatically using " +
    "the operator wallet; refuses payments above the env-configured " +
    "caps. Use whenever the user asks you to call, ask, or delegate to " +
    "another agent.",

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
  ): Promise<boolean> => {
    const text =
      typeof message.content?.text === "string" ? message.content.text : "";
    if (!text.trim()) return false;
    // Allow either an explicit URL + agent reference, or natural language
    // patterns like "ask the X agent" / "delegate to" / "call agent".
    if (HTTP_URL_RE.test(text) && /\bagent|a2a\b/i.test(text)) return true;
    return /\b(ask|call|delegate|invoke|query)\b.*\b(agent|peer|a2a)\b/i.test(
      text,
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<undefined> => {
    const log = (msg: string, extra?: Record<string, unknown>) => {
      try {
        // biome-ignore lint/suspicious/noConsole: intentional diagnostic
        console.info(`[A2A] ${msg}`, extra ?? {});
      } catch {
        /* ignore */
      }
    };

    const { baseUrl, skillId, input } = pickArgs(options, message);

    if (!baseUrl) {
      await callback?.({
        text:
          "CALL_A2A_AGENT requires a peer agent's base URL. Include it in " +
          "the instruction (e.g. https://example.com) or pass via the " +
          "action's `baseUrl` option.",
        action: "CALL_A2A_AGENT",
        source: "a2a-client",
      } as Content);
      return undefined;
    }

    // Resolve env settings. Caps default to 1.0 / 10.0 PTON.
    const maxPerCallStr = readSetting(runtime, "X402_MAX_PAYMENT_PER_CALL_PTON") ?? "1.0";
    const maxTotalStr = readSetting(runtime, "X402_MAX_TOTAL_SPEND_PTON") ?? "10.0";
    const facilitatorUrl = readSetting(runtime, "X402_FACILITATOR_URL");
    const privateKey = readPrivateKey();

    let maxPerCallWei: bigint;
    let maxTotalWei: bigint;
    try {
      maxPerCallWei = parseUnits(
        maxPerCallStr as `${number}`,
        PTON_DECIMALS,
      );
      maxTotalWei = parseUnits(maxTotalStr as `${number}`, PTON_DECIMALS);
    } catch (err) {
      await callback?.({
        text:
          `CALL_A2A_AGENT misconfigured: could not parse X402_MAX_* values ` +
          `as PTON amounts (got per-call="${maxPerCallStr}", total="${maxTotalStr}"). ` +
          `Use plain decimal numbers like "1.0", "10.0".`,
        action: "CALL_A2A_AGENT",
        source: "a2a-client",
      } as Content);
      return undefined;
    }

    log("dispatching", {
      baseUrl,
      skillId: skillId ?? "(unspecified)",
      hasWallet: Boolean(privateKey),
      maxPerCall: maxPerCallStr,
      maxTotal: maxTotalStr,
      facilitatorUrl: facilitatorUrl ?? "(unset)",
    });

    const x402 = new X402Client({
      privateKey,
      facilitatorUrl,
      maxPerCall: maxPerCallWei,
      maxTotal: maxTotalWei,
      assetDecimals: PTON_DECIMALS,
      onPaid: (receipt: X402Receipt) => {
        log("paid", { url: receipt.url, amount: receipt.amount, asset: receipt.asset });
        try {
          (runtime as { emitEvent?: (name: string, payload: unknown) => void })
            .emitEvent?.("X402_PAYMENT", receipt);
        } catch {
          /* event bus may be unavailable in some runtimes */
        }
      },
      onCapHit: (cap, req) => {
        log("cap-hit", { cap, url: req.url, amount: req.amount.toString() });
        try {
          (runtime as { emitEvent?: (name: string, payload: unknown) => void })
            .emitEvent?.("X402_SESSION_CAP_HIT", { cap, ...req });
        } catch {
          /* ignore */
        }
      },
    });
    const a2a = new A2AClient({
      fetch: (url: string, init?: RequestInit) => x402.fetch(url, init),
    });

    let card: AgentCard;
    try {
      card = await a2a.discoverAgent(baseUrl);
    } catch (err) {
      await callback?.({
        text: explainError(err, `discovering AgentCard at ${baseUrl}`),
        action: "CALL_A2A_AGENT",
        source: "a2a-client",
      } as Content);
      return undefined;
    }

    log("discovered", {
      name: card.name,
      url: card.url,
      skills: (card.skills ?? []).map((s) => s.id),
    });

    // If no skillId was provided, surface the AgentCard so the LLM can
    // pick one in a follow-up turn rather than failing silently.
    if (!skillId) {
      const skillsList = (card.skills ?? [])
        .map((s) => `  • ${s.id}${s.name ? ` — ${s.name}` : ""}${s.description ? `: ${s.description}` : ""}`)
        .join("\n");
      await callback?.({
        text:
          `Discovered agent "${card.name}" at ${card.url}.\n` +
          (card.description ? `${card.description}\n` : "") +
          `\nAvailable skills:\n${skillsList || "  (no skills advertised)"}` +
          `\n\nCall again with a specific skillId from the list to invoke.`,
        action: "CALL_A2A_AGENT",
        source: "a2a-client",
        agentCard: card,
      } as Content);
      return undefined;
    }

    let task;
    try {
      task = await a2a.invokeTask(card, skillId, input);
    } catch (err) {
      await callback?.({
        text: explainError(err, `invoking ${skillId} on ${card.name}`),
        action: "CALL_A2A_AGENT",
        source: "a2a-client",
      } as Content);
      return undefined;
    }

    log("task returned", {
      id: task.id,
      state: task.status?.state,
      artifactCount: task.artifacts?.length ?? 0,
      sessionSpentWei: x402.sessionSpentWei.toString(),
    });

    const summary = formatTaskResult(task);
    const truncated =
      summary.length > MAX_OUTPUT_CHARS
        ? `${summary.slice(0, MAX_OUTPUT_CHARS)}\n…[truncated]`
        : summary;

    await callback?.({
      text: truncated,
      action: "CALL_A2A_AGENT",
      source: "a2a-client",
      task,
    } as Content);
    return undefined;
  },

  examples: [
    [
      {
        name: "user",
        content: {
          text: "Ask the market-data agent at https://market.example.com what the ETH price is.",
        },
      },
      {
        name: "agent",
        content: {
          text:
            "Calling market-data agent for ETH price. (Will pay the x402 quote " +
            "if asked.)",
          action: "CALL_A2A_AGENT",
        },
      },
    ],
    [
      {
        name: "user",
        content: {
          text: "Discover the agent at https://example.com",
        },
      },
      {
        name: "agent",
        content: {
          text:
            "Fetching the AgentCard. I'll show the available skills.",
          action: "CALL_A2A_AGENT",
        },
      },
    ],
  ],
};

// ---------------------------------------------------------------------------
// Error formatting — turn structured errors into agent-readable text
// ---------------------------------------------------------------------------

function explainError(err: unknown, context: string): string {
  if (err instanceof X402Error) {
    switch (err.cause) {
      case "no-wallet":
        return (
          `${err.message}\n\n` +
          `To enable x402 payments, set TOKAGENT_PRIVATE_KEY in .env to ` +
          `the operator wallet's private key, then restart the agent.`
        );
      case "per-call-cap":
        return (
          `${err.message}\n\n` +
          `Raise X402_MAX_PAYMENT_PER_CALL_PTON in .env if this call is expected.`
        );
      case "session-cap":
        return (
          `${err.message}\n\n` +
          `Raise X402_MAX_TOTAL_SPEND_PTON or restart the agent to reset the counter.`
        );
      case "unsupported-scheme":
        return (
          `${err.message}\n\n` +
          `This client supports the eip3009 scheme only in v0.1. The peer ` +
          `advertised a different scheme.`
        );
      case "challenge-malformed":
        return (
          `${err.message}\n\n` +
          `The peer's 402 response did not include the fields required to ` +
          `compose a payment. This is a server bug at ${context}.`
        );
      case "retry-failed":
        return (
          `${err.message}\n\n` +
          `Our signed voucher was rejected. The peer may not recognize our ` +
          `wallet, may be using a different settlement chain, or may have a ` +
          `bug in its facilitator integration.`
        );
      default:
        return `${err.message} (cause=${err.cause})`;
    }
  }
  if (err instanceof A2AError) {
    return `A2A error while ${context}: ${err.message} (cause=${err.cause})`;
  }
  if (err instanceof Error) {
    return `Failure while ${context}: ${err.message}`;
  }
  return `Unknown failure while ${context}: ${String(err)}`;
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

export const a2aClientPlugin: Plugin = {
  name: "a2a-client",
  description:
    "Discover and invoke other agents via Google's A2A protocol, paying " +
    "with x402 vouchers (EIP-3009 PTON authorizations) when required.",
  actions: [callA2AAgentAction],
  providers: [],
  services: [],
  evaluators: [],
};

export default a2aClientPlugin;
