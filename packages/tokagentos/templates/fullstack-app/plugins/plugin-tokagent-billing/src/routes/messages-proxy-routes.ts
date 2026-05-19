/**
 * Pure-proxy /v1/messages + /v1/chat/completions handlers.
 *
 * Why this exists: the elizaOS upstream that the billing server is built on
 * routes /v1/messages and /v1/chat/completions through its agent chat
 * handler (handleChatRoutes), which:
 *   - requires a fully-seeded worlds/messages DB
 *   - requires an AI provider plugin (ANTHROPIC_API_KEY / OPENAI_API_KEY)
 *   - wraps the response in the agent's character-prompt envelope
 *
 * None of that is appropriate for a billing GATEWAY whose job is to:
 *   1. auth the caller via sk-ai-* API key
 *   2. reserve credits against the wallet's spendable balance
 *   3. forward the request VERBATIM to BILLING_LITELLM_BASE_URL
 *   4. commit actual usage from the upstream response
 *
 * This file registers plugin routes that own /v1/messages and
 * /v1/chat/completions BEFORE the chat-routes dispatcher in server.ts gets a
 * chance to handle them (see server.ts BILLING_HOOK ordering change made in
 * the same commit). The handler is a thin proxy: identical request body
 * forwarded with the operator's LiteLLM API key, identical response body
 * returned to the caller.
 */

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@elizaos/core";
import type { IncomingMessage } from "node:http";
import { getBillingState, isBillingStateInitialized } from "../state.js";
import { applyBillingGate } from "../middleware/billing-gate.js";
import { computeActualCostUsd } from "@tokagentos/billing";

function billingUnavailable(res: RouteResponse): void {
  res.status(503).json({ error: "Billing service unavailable." });
}

/**
 * Convert a plugin RouteRequest into the IncomingMessage shape that
 * applyBillingGate / resolveBillingIdentity expect.
 *
 * applyBillingGate reads:
 *   - req.headers (for x-api-key + bearer + content-type)
 *   - req.socket?.remoteAddress (rate limiting)
 *
 * Plugin RouteRequest already gives us headers; we provide a stub socket.
 */
function toIncomingMessage(req: RouteRequest): IncomingMessage {
  return {
    headers: req.headers ?? {},
    socket: { remoteAddress: undefined },
  } as unknown as IncomingMessage;
}

/**
 * Pick the headers we forward upstream. NOT the caller's Authorization /
 * x-api-key — those are OUR auth tokens, not LiteLLM's. We attach the
 * operator's LiteLLM API key downstream.
 */
function pickUpstreamHeaders(
  req: RouteRequest,
  litellmApiKey: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (litellmApiKey) {
    // LiteLLM accepts both shapes — pick Bearer for OpenAI-style upstreams
    // and x-api-key for Anthropic-style. Setting both is harmless.
    out["Authorization"] = `Bearer ${litellmApiKey}`;
    out["x-api-key"] = litellmApiKey;
  }
  const h = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
  const passthrough = ["anthropic-version", "anthropic-beta", "openai-organization"];
  for (const name of passthrough) {
    const v = h[name.toLowerCase()];
    if (typeof v === "string") out[name] = v;
    else if (Array.isArray(v) && typeof v[0] === "string") out[name] = v[0];
  }
  return out;
}

/**
 * Shared proxy handler for /v1/messages and /v1/chat/completions.
 *
 * Flow:
 *   1. applyBillingGate(req, body) — auth + reserve. Returns 401 on bad auth,
 *      402 on insufficient balance, 400 on unsupported model.
 *   2. fetch(`${litellmBaseUrl}${path}`, ...) — forward verbatim.
 *   3. Parse usage from response, computeActualCostUsd, gate.commit(actual).
 *   4. Write the upstream response body back to the caller.
 *
 * Failure modes:
 *   - Network error reaching LiteLLM → gate.release({ outcome: "upstream_error" }),
 *     return 502.
 *   - Upstream returned non-2xx → still call gate.release (no charge), pass
 *     the error body through with the upstream status.
 *   - Streaming requests (stream: true) → not yet supported; return 501.
 */
async function proxyToLiteLLM(
  req: RouteRequest,
  res: RouteResponse,
  upstreamPath: string,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const state = getBillingState();
  const config = state.config;
  if (!config.enabled) return billingUnavailable(res);

  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    res.status(400).json({
      error: { type: "invalid_request_error", message: "JSON body required" },
    });
    return;
  }

  // Streaming requires duplex passthrough — out of scope for this proxy
  // until we wire up SSE forwarding. Reject loudly so clients don't hang.
  if ((body as Record<string, unknown>).stream === true) {
    res.status(501).json({
      error: {
        type: "not_implemented",
        message:
          "Streaming responses are not yet supported by this billing proxy. " +
          "Set `stream: false` and retry.",
      },
    });
    return;
  }

  // ---- Auth + reserve ----
  const incoming = toIncomingMessage(req);
  const gate = await applyBillingGate(incoming, body);
  if (!gate.allow) {
    res.status(gate.status).json(gate.body ?? { error: "billing_error" });
    return;
  }

  // ---- Forward upstream ----
  const litellmBaseUrl = (config as { litellmBaseUrl?: string }).litellmBaseUrl;
  const litellmApiKey = (config as { litellmApiKey?: string }).litellmApiKey;
  if (!litellmBaseUrl) {
    await gate.release?.("released_error");
    res.status(503).json({
      error: {
        type: "service_unavailable",
        message:
          "BILLING_LITELLM_BASE_URL is not configured — operator must set it.",
      },
    });
    return;
  }

  const upstreamUrl = `${litellmBaseUrl.replace(/\/$/, "")}${upstreamPath}`;
  const upstreamHeaders = pickUpstreamHeaders(req, litellmApiKey);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(body),
    });
  } catch (err) {
    await gate.release?.("released_error");
    const msg = err instanceof Error ? err.message : "fetch failed";
    res.status(502).json({
      error: {
        type: "upstream_error",
        message: `LiteLLM proxy failed: ${msg}`,
      },
    });
    return;
  }

  // Parse the JSON body once — we both relay it to the client AND extract
  // usage for billing commit.
  const upstreamText = await upstreamRes.text();
  let upstreamBody: unknown;
  try {
    upstreamBody = upstreamText.length > 0 ? JSON.parse(upstreamText) : {};
  } catch {
    upstreamBody = { error: { type: "upstream_error", message: upstreamText.slice(0, 500) } };
  }

  if (!upstreamRes.ok) {
    // Upstream rejected. Release the reservation — no charge — and pass the
    // error through with the upstream status.
    await gate.release?.("released_error");
    res.status(upstreamRes.status).json(upstreamBody);
    return;
  }

  // ---- Commit actual usage ----
  // LiteLLM/Anthropic responses include a `usage` block — fields match
  // the `ClaudeUsage` shape (input_tokens, output_tokens, cache_*).
  const usageRaw =
    (upstreamBody as Record<string, unknown> | null)?.["usage"];
  const usage =
    usageRaw && typeof usageRaw === "object"
      ? (usageRaw as Record<string, number>)
      : {};
  const model =
    typeof (body as Record<string, unknown>)["model"] === "string"
      ? ((body as Record<string, unknown>)["model"] as string)
      : "unknown";

  let actualUsd = 0;
  try {
    actualUsd = computeActualCostUsd({ model, usage });
  } catch {
    // Pricing lookup failed (unknown model) → commit zero and let the
    // operator reconcile from logs. Caller still gets their response.
    actualUsd = 0;
  }

  try {
    // Both Anthropic-style (input_tokens/output_tokens) and OpenAI-style
    // (prompt_tokens/completion_tokens) — prefer Anthropic shape, fall back.
    const inputTokens = Number(
      usage["input_tokens"] ?? usage["prompt_tokens"] ?? 0,
    );
    const outputTokens = Number(
      usage["output_tokens"] ?? usage["completion_tokens"] ?? 0,
    );
    const cacheRead = Number(usage["cache_read_input_tokens"] ?? 0);
    const cacheCreate = Number(usage["cache_creation_input_tokens"] ?? 0);
    await gate.commit?.(actualUsd, {
      model,
      inputTokens,
      outputTokens,
      cacheInputTokens: cacheRead || undefined,
      cacheCreationTokens: cacheCreate || undefined,
      status: "ok",
    });
  } catch {
    // Commit failure is non-fatal for the caller — the user got their
    // response. The operator's audit log will catch the inconsistency.
  }

  // ---- Relay response ----
  res.status(upstreamRes.status).json(upstreamBody as object);
}

// ---------------------------------------------------------------------------
// Route definitions — registered first in index.ts so they run before
// elizaOS's chat handler.
// ---------------------------------------------------------------------------

async function handleMessages(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  return proxyToLiteLLM(req, res, "/v1/messages");
}

async function handleChatCompletions(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  return proxyToLiteLLM(req, res, "/v1/chat/completions");
}

export const messagesProxyRoutes: Route[] = [
  {
    type: "POST",
    path: "/v1/messages",
    rawPath: true,
    public: true,
    name: "billing-messages-proxy",
    handler: handleMessages,
  },
  {
    type: "POST",
    path: "/v1/chat/completions",
    rawPath: true,
    public: true,
    name: "billing-chat-completions-proxy",
    handler: handleChatCompletions,
  },
];

export function getMessagesProxyRoutes(mode: "server" | "client"): Route[] {
  // Client-mode forwards everything through TOKAGENT_GATEWAY_URL — the
  // upstream gateway already owns /v1/messages. Don't register here.
  if (mode === "client") return [];
  return messagesProxyRoutes;
}
