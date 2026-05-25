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

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@tokagentos/core";
import type { IncomingMessage } from "node:http";
import { getBillingState, isBillingStateInitialized } from "../state.js";
import { applyBillingGate } from "../middleware/billing-gate.js";
import {
  computeActualCostUsd,
  estimateInputTokens,
} from "@tokagentos/billing";

function billingUnavailable(res: RouteResponse): void {
  res.status(503).json({ error: "Billing service unavailable." });
}

// ---------------------------------------------------------------------------
// Anthropic prompt-cache auto-injection
// ---------------------------------------------------------------------------

/**
 * Anthropic's minimum cacheable prefix is 1024 tokens for Sonnet/Opus and
 * 2048 for Haiku. Below that the cache_control marker is a no-op. Use the
 * stricter bound so the optimization always pays off when we add it.
 */
const MIN_CACHEABLE_PREFIX_TOKENS = 2048;

/** Returns true if any node anywhere in `value` has a `cache_control` key. */
function hasCacheControlDeep(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasCacheControlDeep);
  const obj = value as Record<string, unknown>;
  if ("cache_control" in obj) return true;
  for (const k of Object.keys(obj)) {
    if (hasCacheControlDeep(obj[k])) return true;
  }
  return false;
}

/**
 * Auto-inject Anthropic prompt-cache markers on stable parts of the request.
 *
 * The billing engine already supports cache pricing end-to-end (see
 * pricing/rates.ts cacheRead/cacheWrite columns and computeActualCostUsd),
 * but most anthropic-sdk callers never set cache_control themselves. Without
 * markers, Anthropic re-reads the full system + tools prefix on every turn
 * at base input rate. With markers, the prefix is served from cache at ~10×
 * cheaper after the first call within 5 minutes.
 *
 * What we touch:
 *   - `system`: normalised to array form, marker on the LAST text block
 *   - `tools`: marker on the LAST tool definition (Anthropic caches the
 *     entire prefix up to and including the marker, so this also covers
 *     `system`)
 *
 * What we DON'T touch:
 *   - Non-Claude models — other providers ignore or reject the field; their
 *     caching is implicit.
 *   - Bodies that already have ANY cache_control set — respect client intent.
 *   - Bodies whose stable prefix is below Anthropic's minimum cacheable size.
 *
 * Returns a new body when injection happens; the same reference otherwise.
 * Never mutates the input.
 */
function maybeInjectAnthropicCache(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const model = body.model;
  if (typeof model !== "string" || !model.startsWith("claude-")) return body;
  if (hasCacheControlDeep(body)) return body;

  const tools = Array.isArray(body.tools) ? body.tools : undefined;
  const sys = body.system;
  const prefixTokens = estimateInputTokens([], tools, sys);
  if (prefixTokens < MIN_CACHEABLE_PREFIX_TOKENS) return body;

  const next: Record<string, unknown> = { ...body };

  if (typeof sys === "string" && sys.length > 0) {
    next.system = [
      { type: "text", text: sys, cache_control: { type: "ephemeral" } },
    ];
  } else if (Array.isArray(sys) && sys.length > 0) {
    const cloned = sys.map((b) =>
      b && typeof b === "object" ? { ...(b as Record<string, unknown>) } : b,
    );
    for (let i = cloned.length - 1; i >= 0; i--) {
      const blk = cloned[i];
      if (
        blk &&
        typeof blk === "object" &&
        (blk as Record<string, unknown>).type === "text"
      ) {
        (cloned[i] as Record<string, unknown>).cache_control = {
          type: "ephemeral",
        };
        break;
      }
    }
    next.system = cloned;
  }

  if (tools && tools.length > 0) {
    const clonedTools = tools.map((t) =>
      t && typeof t === "object" ? { ...(t as Record<string, unknown>) } : t,
    );
    const last = clonedTools[clonedTools.length - 1];
    if (last && typeof last === "object") {
      (last as Record<string, unknown>).cache_control = { type: "ephemeral" };
    }
    next.tools = clonedTools;
  }

  return next;
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

  const rawBody = req.body as Record<string, unknown> | undefined;
  if (!rawBody || typeof rawBody !== "object") {
    res.status(400).json({
      error: { type: "invalid_request_error", message: "JSON body required" },
    });
    return;
  }

  // Auto-inject Anthropic prompt-cache markers on stable parts of the
  // request. Done BEFORE the billing gate so the reservation sees the
  // markers (gate.detectCacheControl reads them to size at cacheWrite rate
  // — slightly higher first-call reservation, dramatically lower steady
  // state). No-op for non-Claude models or bodies where the caller already
  // set cache_control. See maybeInjectAnthropicCache for the full policy.
  const body = maybeInjectAnthropicCache(rawBody);

  // Detect streaming. plugin-openai (Vercel AI SDK) defaults to
  // stream:true and there's no way to disable from the agent's chat flow,
  // so we MUST support it. For non-stream we buffer the JSON response;
  // for stream we pipe SSE bytes through and parse usage from the final
  // chunk before committing billing.
  const wantsStream = (body as Record<string, unknown>).stream === true;

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

  // For streaming, request usage in the final SSE chunk (OpenAI's
  // stream_options.include_usage convention — LiteLLM honors it). Without
  // this we'd have no token counts and would commit zero, leaking PTON.
  const upstreamBodyObj =
    wantsStream
      ? {
          ...body,
          stream_options: {
            ...((body as { stream_options?: Record<string, unknown> })
              .stream_options ?? {}),
            include_usage: true,
          },
        }
      : body;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(upstreamBodyObj),
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

  // ---- STREAMING PATH ----
  // For SSE we need raw write() access to the underlying ServerResponse.
  // RouteResponse's .json()/.send() helpers buffer + close; we instead
  // forward bytes as they arrive, parse data: lines to extract usage from
  // the final chunk, then end the response and commit billing.
  if (wantsStream) {
    if (!upstreamRes.ok || !upstreamRes.body) {
      await gate.release?.("released_error");
      const errText = await upstreamRes.text().catch(() => "");
      let errBody: unknown;
      try {
        errBody = errText ? JSON.parse(errText) : { error: "upstream_error" };
      } catch {
        errBody = { error: { type: "upstream_error", message: errText.slice(0, 500) } };
      }
      res.status(upstreamRes.status).json(errBody as object);
      return;
    }

    // Bypass the .json()/.send() helpers — write SSE bytes directly to the
    // underlying http.ServerResponse. The shim attaches helpers ON res so
    // the native write/end/setHeader are still available beneath them.
    const rawRes = res as unknown as {
      statusCode?: number;
      setHeader?: (n: string, v: string) => void;
      write?: (chunk: string | Uint8Array) => boolean;
      end?: () => void;
    };
    rawRes.statusCode = 200;
    rawRes.setHeader?.("Content-Type", "text/event-stream; charset=utf-8");
    rawRes.setHeader?.("Cache-Control", "no-cache, no-transform");
    rawRes.setHeader?.("Connection", "keep-alive");
    rawRes.setHeader?.("X-Accel-Buffering", "no");

    const model =
      typeof (body as Record<string, unknown>)["model"] === "string"
        ? ((body as Record<string, unknown>)["model"] as string)
        : "unknown";
    let lastUsage: Record<string, number> | null = null;
    let buffer = "";
    const decoder = new TextDecoder();
    const reader = upstreamRes.body.getReader();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        // Forward to client verbatim. plugin-openai's SDK parses the SSE
        // event stream — we don't transform.
        rawRes.write?.(chunkText);
        // Parse for usage extraction. SSE events are separated by blank
        // lines; within an event, `data: <json>` carries the payload.
        // The final usage chunk (when include_usage=true) is the LAST
        // data line before [DONE], with content.choices empty + usage set.
        buffer += chunkText;
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? ""; // keep last (possibly partial) event
        for (const evt of events) {
          for (const line of evt.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data) as { usage?: Record<string, number> };
              if (parsed.usage && typeof parsed.usage === "object") {
                lastUsage = parsed.usage;
              }
            } catch {
              // Ignore malformed chunks — keep streaming.
            }
          }
        }
      }
    } catch (err) {
      // Stream interrupted — best-effort release and end the response.
      await gate.release?.("released_error");
      try {
        rawRes.end?.();
      } catch {
        /* response already ended */
      }
      return;
    }

    // Flush any final buffered bytes (rare — usually [DONE] ends the
    // stream cleanly with a trailing blank line).
    if (buffer.length > 0) rawRes.write?.(buffer);
    rawRes.end?.();

    // ---- Commit billing from extracted usage ----
    if (lastUsage) {
      const inputTokens = Number(
        lastUsage["prompt_tokens"] ?? lastUsage["input_tokens"] ?? 0,
      );
      const outputTokens = Number(
        lastUsage["completion_tokens"] ?? lastUsage["output_tokens"] ?? 0,
      );
      let actualUsd = 0;
      try {
        actualUsd = computeActualCostUsd({
          model,
          usage: lastUsage as Record<string, number>,
        });
      } catch {
        actualUsd = 0;
      }
      try {
        await gate.commit?.(actualUsd, {
          model,
          inputTokens,
          outputTokens,
          status: "ok",
        });
      } catch {
        /* commit failure is non-fatal — user already got their response */
      }
    } else {
      // No usage chunk arrived — upstream didn't honor include_usage, or
      // the stream ended abnormally. Commit zero so we don't double-charge
      // a reservation that may have been zero-sized anyway.
      try {
        await gate.commit?.(0, { model, status: "ok" });
      } catch {
        /* swallow */
      }
    }
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

/**
 * OpenAI-compatible model catalog. plugin-openai (and many OpenAI SDKs)
 * call GET /v1/models on startup to validate the API key — if this returns
 * 401/404, the plugin marks the provider unhealthy and the agent's chat
 * composer never gets an active backend.
 *
 * We return a static list of the models the gateway actually supports
 * (currently glm-4.7 on Tokamak's LiteLLM). Two reasons static beats
 * proxying upstream:
 *   1. Tokamak's LiteLLM /v1/models requires the operator's key, not the
 *      user's sk-ai-* — proxying would either expose the operator key or
 *      require a separate auth path. Static avoids the leak.
 *   2. The billing layer's allowlist is the source of truth for "what
 *      models a billing client can use"; the upstream catalog is the
 *      operator's concern. Decoupling them lets us add/remove allowlisted
 *      models without redeploying the upstream.
 *
 * Auth: still gated by applyBillingGate so only authenticated clients see
 * the list. Returns the same 401 envelope as the chat routes on bad auth.
 */
async function handleModels(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const state = getBillingState();
  if (!state.config.enabled) return billingUnavailable(res);

  // Auth check — applyBillingGate is overkill here (no model/body to gate
  // on) but using it keeps the auth-error envelope consistent across routes.
  const incoming = toIncomingMessage(req);
  const { resolveBillingIdentity } = await import(
    "../middleware/api-key-resolve.js"
  );
  const identity = await resolveBillingIdentity(incoming);
  if (!identity) {
    res.status(401).json({
      error: { type: "invalid_auth", message: "Authentication required." },
    });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  res.status(200).json({
    object: "list",
    data: [
      {
        id: "glm-4.7",
        object: "model",
        created: now,
        owned_by: "tokamak",
      },
    ],
  });
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
  {
    type: "GET",
    path: "/v1/models",
    rawPath: true,
    public: true,
    name: "billing-models-catalog",
    handler: handleModels,
  },
];

export function getMessagesProxyRoutes(mode: "server" | "client"): Route[] {
  // Client-mode forwards everything through TOKAGENT_GATEWAY_URL — the
  // upstream gateway already owns /v1/messages. Don't register here.
  if (mode === "client") return [];
  return messagesProxyRoutes;
}
