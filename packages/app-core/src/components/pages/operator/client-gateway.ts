/**
 * Self-contained same-origin gateway client for the operator console.
 *
 * Mirrors client-billing.ts: bare `fetch("/api/...", { credentials: "include" })`
 * with ZERO app-core / cross-package imports. This is deliberate — the operator
 * ships identically into the monorepo dev surface AND the published scaffold,
 * whose eliza-based app-core does NOT contain the TokagentClient singleton,
 * `@tokagentos/shared/contracts`, `inventory/chainConfig`, or `plugin-list-utils`.
 * Every route below is served by the agent server in BOTH contexts, so wiring
 * through these helpers (not the app-core client) keeps the operator portable.
 *
 * Types are minimal — only the fields the operator pages render. Each fetcher
 * returns the raw endpoint shape (same as the app-core client methods, which
 * just proxy these routes), and callers fall back to mock + the "⟩ example
 * values" chip via the `useLive` hook when a call throws (unauth / offline).
 */

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ── Chat · conversation routes ───────────────────────────────────────────── */

export interface GwConversation {
  id: string;
  title?: string;
  updatedAt?: string | number | null;
}
export interface GwMessage {
  id: string;
  role?: string;
  text?: string;
  actionName?: string;
  actionCallbackHistory?: string[];
  createdAt?: string | number | null;
}
export interface GwSendReply {
  text: string;
  agentName?: string;
  noResponseReason?: string;
}

export function fetchConversations(): Promise<{
  conversations: GwConversation[];
}> {
  return getJson("/api/conversations");
}
export function fetchMessages(id: string): Promise<{ messages: GwMessage[] }> {
  return getJson(`/api/conversations/${encodeURIComponent(id)}/messages`);
}
export function createConversation(): Promise<{
  conversation: GwConversation;
}> {
  return getJson("/api/conversations", { method: "POST", body: "{}" });
}
/** Non-streaming send — the POST returns the agent's full reply synchronously. */
export function sendMessage(id: string, text: string): Promise<GwSendReply> {
  return getJson(`/api/conversations/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ text, channelType: "operator" }),
  });
}

/* ── Chat · streaming send + assistant-text normalizer ─────────────────────────
 * Self-contained mirror of app-core's `streamChatEndpoint` (client-base.ts) and
 * `normalizeAssistantText`/`normalizeDisplayText`. No app-core imports — the SSE
 * protocol + normalization are ported inline so the operator stays portable into
 * the scaffold (whose app-core has no TokagentClient). The agent server serves
 * the stream route in BOTH contexts at the same origin, so we POST same-origin
 * with `credentials: "include"`, NOT through the billing proxy base.
 */

/**
 * Strip `<thinking>`/`<think>` blocks and any leading XML/tool wrapper tags from
 * the assistant text, then collapse whitespace edges. Minimal port of app-core's
 * `normalizeAssistantText` — keeps the visible human reply, drops reasoning + tool
 * scaffolding the model sometimes leaks into the message body.
 */
/**
 * Merge a streaming delta into the accumulated text, deduping overlap so
 * snapshot-style or overlapping chunks don't garble the output. Compact,
 * self-contained equivalent of app-core's mergeStreamingText (used only when a
 * token event omits `fullText`).
 */
function mergeDelta(existing: string, incoming: string): string {
  if (!incoming) return existing;
  if (!existing) return incoming;
  if (incoming === existing) return incoming;
  // Cumulative snapshot — the chunk already contains everything so far.
  if (incoming.startsWith(existing) || incoming.includes(existing)) {
    return incoming;
  }
  // Regressive snapshot (shorter than what we have) — keep the longer buffer.
  if (existing.startsWith(incoming)) return existing;
  // Suffix/prefix overlap: largest tail of `existing` that prefixes `incoming`.
  const max = Math.min(existing.length, incoming.length);
  for (let n = max; n > 0; n--) {
    if (existing.slice(existing.length - n) === incoming.slice(0, n)) {
      return existing + incoming.slice(n);
    }
  }
  return existing + incoming;
}

export function normalizeAssistantText(raw: string): string {
  if (!raw) return "";
  let text = raw;
  // Drop <thinking>…</thinking> / <think>…</think> reasoning blocks (any case,
  // across newlines, even if a closing tag is missing at the end of the stream).
  text = text.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, "");
  text = text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<thinking\b[^>]*>[\s\S]*$/gi, "");
  text = text.replace(/<think\b[^>]*>[\s\S]*$/gi, "");
  // Strip any LEADING XML/tool wrapper tags (e.g. <response>, <answer>,
  // <function_calls>…</function_calls>, <tool_use>…). Repeatedly peel an opening
  // tag (and its matching close, when present) off the front of the text.
  let prev: string;
  do {
    prev = text;
    text = text.replace(
      /^\s*<([a-zA-Z][\w-]*)\b[^>]*>([\s\S]*?)<\/\1>\s*/,
      "$2",
    );
    text = text.replace(/^\s*<[a-zA-Z][\w-]*\b[^>]*\/>\s*/, "");
    text = text.replace(/^\s*<[a-zA-Z][\w-]*\b[^>]*>\s*/, "");
  } while (text !== prev);
  // Collapse 3+ blank lines and trim whitespace edges.
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

/**
 * Streaming send — POSTs to the agent server's SSE endpoint and invokes
 * `onToken(fullText)` with the running accumulated text for live rendering.
 * Mirrors `streamChatEndpoint`: splits SSE on blank lines, JSON-parses each
 * `data:` line, handles `token` / `done` / `error`, and applies a ~60s idle-read
 * timeout. Returns the final NORMALIZED text + agent name + completion flag.
 */
export async function streamMessage(
  conversationId: string,
  text: string,
  onToken: (fullText: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; agentName: string; completed: boolean }> {
  const res = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages/stream`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ text, channelType: "DM" }),
      signal,
    },
  );

  if (!res.ok) {
    throw new Error(`POST stream → ${res.status}`);
  }
  if (!res.body) {
    throw new Error("Streaming not supported by this browser");
  }

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = "";
  let fullText = "";
  let doneText: string | null = null;
  let doneAgentName: string | null = null;
  let receivedDone = false;

  const findSseEventBreak = (
    chunkBuffer: string,
  ): { index: number; length: number } | null => {
    const lfBreak = chunkBuffer.indexOf("\n\n");
    const crlfBreak = chunkBuffer.indexOf("\r\n\r\n");
    if (lfBreak === -1 && crlfBreak === -1) return null;
    if (lfBreak === -1) return { index: crlfBreak, length: 4 };
    if (crlfBreak === -1) return { index: lfBreak, length: 2 };
    return lfBreak < crlfBreak
      ? { index: lfBreak, length: 2 }
      : { index: crlfBreak, length: 4 };
  };

  const parseDataLine = (line: string): void => {
    const payload = line.startsWith("data:") ? line.slice(5).trim() : "";
    if (!payload) return;

    let parsed: {
      type?: string;
      text?: string;
      fullText?: string;
      agentName?: string;
      message?: string;
    };
    try {
      parsed = JSON.parse(payload) as typeof parsed;
    } catch {
      return;
    }

    if (!parsed.type && typeof parsed.text === "string") {
      parsed.type = "token";
    }

    if (parsed.type === "token") {
      const chunk = parsed.text ?? "";
      // Prefer the server's cumulative `fullText`; otherwise merge the delta
      // (dedups overlap so out-of-order/overlapping chunks don't garble text —
      // compact equivalent of app-core mergeStreamingText).
      const nextFullText =
        typeof parsed.fullText === "string"
          ? parsed.fullText
          : chunk
            ? mergeDelta(fullText, chunk)
            : fullText;
      if (nextFullText === fullText) return;
      fullText = nextFullText;
      onToken(fullText);
      return;
    }

    if (parsed.type === "done") {
      receivedDone = true;
      if (typeof parsed.fullText === "string") doneText = parsed.fullText;
      if (typeof parsed.agentName === "string" && parsed.agentName.trim()) {
        doneAgentName = parsed.agentName;
      }
      // Terminal event — stop reading immediately rather than waiting for the
      // server to close the body.
      void reader.cancel("operator-sse-terminal-done").catch(() => {});
      return;
    }

    if (parsed.type === "error") {
      throw new Error(parsed.message ?? "generation failed");
    }
  };

  const SSE_IDLE_TIMEOUT_MS = 60_000;
  while (true) {
    let done = false;
    let value: Uint8Array | undefined;
    try {
      const readPromise = reader.read();
      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(
          () => reject(new Error("SSE idle timeout — no data for 60s")),
          SSE_IDLE_TIMEOUT_MS,
        );
        void readPromise.finally(() => clearTimeout(id));
      });
      ({ done, value } = await Promise.race([readPromise, timeoutPromise]));
    } catch (streamErr) {
      console.warn("[operator-gateway] SSE stream interrupted:", streamErr);
      void reader.cancel("operator-sse-idle-timeout").catch(() => {});
      break;
    }
    if (done || !value) break;

    buffer += decoder.decode(value, { stream: true });
    let eventBreak = findSseEventBreak(buffer);
    while (eventBreak) {
      const rawEvent = buffer.slice(0, eventBreak.index);
      buffer = buffer.slice(eventBreak.index + eventBreak.length);
      for (const evLine of rawEvent.split(/\r?\n/)) {
        if (evLine.startsWith("data:")) parseDataLine(evLine);
      }
      eventBreak = findSseEventBreak(buffer);
    }
  }

  if (buffer.trim()) {
    for (const evLine of buffer.split(/\r?\n/)) {
      if (evLine.startsWith("data:")) parseDataLine(evLine);
    }
  }

  return {
    text: normalizeAssistantText(doneText ?? fullText),
    agentName: doneAgentName ?? "Tokagent",
    completed: receivedDone,
  };
}

/* ── Wallet · wallet routes ───────────────────────────────────────────────── */

export interface GwTokenBalance {
  symbol: string;
  balance: string;
  valueUsd: string;
}
export interface GwEvmChain {
  chainId: number;
  nativeSymbol: string;
  nativeBalance: string;
  nativeValueUsd: string;
  tokens: GwTokenBalance[];
  error: string | null;
}
export interface GwWalletBalances {
  evm: { address: string; chains: GwEvmChain[] } | null;
  solana: { address: string; tokens?: GwTokenBalance[] } | null;
}
export interface GwWalletAddresses {
  evmAddress: string | null;
  solanaAddress?: string | null;
}

export function fetchWalletBalances(): Promise<GwWalletBalances> {
  return getJson("/api/wallet/balances");
}
export function fetchWalletAddresses(): Promise<GwWalletAddresses> {
  return getJson("/api/wallet/addresses");
}

/** Trust-boundary fields from GET /api/wallet/config (WalletConfigStatus).
 *  Self-contained — no app-core imports. */
export interface GwWalletConfig {
  tradePermissionMode?: "user-sign-only" | "manual-local-key" | "agent-auto";
  automationMode?: "full" | "connectors-only";
  walletSource?: "local" | "managed" | "none";
}
export function fetchWalletConfig(): Promise<GwWalletConfig> {
  return getJson("/api/wallet/config");
}

/** Minimal chainId → display meta, self-contained (no app-core chainConfig). */
const CHAIN_META: Record<number, { key: string; name: string }> = {
  1: { key: "ethereum", name: "Ethereum" },
  8453: { key: "base", name: "Base" },
  42161: { key: "arbitrum", name: "Arbitrum" },
  137: { key: "polygon", name: "Polygon" },
  10: { key: "optimism", name: "Optimism" },
  56: { key: "bsc", name: "BNB Chain" },
};
export function chainMeta(chainId: number): { key: string; name: string } {
  return CHAIN_META[chainId] ?? { key: "evm", name: `Chain ${chainId}` };
}

/* ── Automations · automations + triggers routes ──────────────────────────── */

export interface GwTriggerSummary {
  cronExpression?: string | null;
  intervalMs?: number | null;
  scheduledAtIso?: string | null;
  lastRunAtIso?: string | null;
  lastStatus?: string | null;
  instructions?: string | null;
}
export interface GwAutomation {
  id: string;
  type?: string;
  source?: string;
  title?: string;
  description?: string;
  enabled: boolean;
  updatedAt?: string | null;
  triggerId?: string;
  trigger?: GwTriggerSummary;
}

export function fetchAutomations(): Promise<{ automations: GwAutomation[] }> {
  return getJson("/api/automations");
}
export function setTriggerEnabled(
  id: string,
  enabled: boolean,
): Promise<unknown> {
  return getJson(`/api/triggers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

/* ── Plugins · plugins routes ─────────────────────────────────────────────── */

export interface GwPlugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category?: string;
  source?: string;
  npmName?: string;
}

export function fetchPlugins(): Promise<{ plugins: GwPlugin[] }> {
  return getJson("/api/plugins");
}
export function setPluginEnabled(
  id: string,
  enabled: boolean,
): Promise<{ ok?: boolean; requiresRestart?: boolean }> {
  return getJson(`/api/plugins/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

/* ── Settings · config + secrets routes ───────────────────────────────────── */

export interface GwSecret {
  key: string;
  isSet: boolean;
  maskedValue: string | null;
}

export function fetchSecrets(): Promise<{ secrets: GwSecret[] }> {
  return getJson("/api/secrets");
}
export function fetchConfig(): Promise<Record<string, unknown>> {
  return getJson("/api/config");
}
export function updateConfig(patch: Record<string, unknown>): Promise<unknown> {
  return getJson("/api/config", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
