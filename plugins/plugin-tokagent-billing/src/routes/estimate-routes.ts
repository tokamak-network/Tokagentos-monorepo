/**
 * Estimate / count-tokens / price routes (Phase 6b).
 *
 *   POST /v1/estimate               — estimate max cost for a request (no charge).
 *   POST /v1/messages/count_tokens  — Anthropic-compatible token count.
 *   GET  /v1/price                  — debug: current TWAP cache state.
 *
 * Ported from llm-api-gateway/proxy/src/server.ts:677-703 + 1011-1060.
 * Uses `rawPath: true` so routes mount at the exact paths (Decision Z32).
 *
 * `/v1/estimate` and `/v1/price` are gated (auth required when billing is on).
 * `/v1/messages/count_tokens` mirrors Anthropic's authentication pattern —
 * requires a valid billing identity when billing is enabled.
 *
 * Returns 503 when billing is disabled (BILLING_ENABLED=false).
 */

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@tokagentos/core";
import type { IncomingMessage } from "node:http";
import {
  assertSupportedModel,
  normalizeModelId,
  estimateInputTokens,
  estimateMaxCostUsd,
  detectCacheControl,
  usdToPton,
  assertNoDisallowedModifiers,
  fetchTokamakApiPrice,
} from "@tokagentos/billing";
import { getBillingState, isBillingStateInitialized } from "../state.js";
import { resolveBillingIdentity } from "../middleware/api-key-resolve.js";
import { pickForward, forward, ensureClientReady } from "../lib/forward.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function billingUnavailable(res: RouteResponse): void {
  res.status(503).json({ error: "Billing service unavailable." });
}

function toIncomingMessage(req: RouteRequest): IncomingMessage {
  return {
    headers: req.headers ?? {},
    socket: { remoteAddress: undefined },
  } as unknown as IncomingMessage;
}

/**
 * Get the current TON/USD price.
 *
 * Resolution order matches getCachedTonUsd in @tokagentos/billing — the
 * TwapCache holds the most recent live read (Tokamak API → composite TWAP),
 * and config.fixedTonUsd is the admin escape-hatch ONLY when the cache is
 * empty (e.g. plugin just initialized, refresh worker hasn't ticked yet).
 *
 * Returns null if neither source has a value.
 */
function getTonUsd(): number | null {
  try {
    const { config, twapCache } = getBillingState();
    return twapCache?.get()?.tonUsd ?? config.fixedTonUsd ?? null;
  } catch {
    return null;
  }
}

/** Extract messages / tools / system from a request body. */
function extractRequestParts(body: unknown): {
  model: string | null;
  messages: Array<{ role: string; content: unknown }>;
  tools: unknown[] | undefined;
  system: unknown | undefined;
  maxTokens: number;
} {
  if (typeof body !== "object" || body === null) {
    return { model: null, messages: [], tools: undefined, system: undefined, maxTokens: 4096 };
  }
  const b = body as Record<string, unknown>;
  const model = typeof b["model"] === "string" ? b["model"] : null;
  const messages = Array.isArray(b["messages"])
    ? (b["messages"] as Array<{ role: string; content: unknown }>)
    : [];
  const tools = Array.isArray(b["tools"]) ? b["tools"] : undefined;
  const system = b["system"];
  const maxTokens =
    typeof b["max_tokens"] === "number" && b["max_tokens"] > 0 ? b["max_tokens"] : 4096;
  return { model, messages, tools, system, maxTokens };
}

// ---------------------------------------------------------------------------
// POST /v1/estimate
// ---------------------------------------------------------------------------

/**
 * Estimate the maximum cost for a request without charging.
 *
 * Body:
 * ```json
 * { "model": "claude-sonnet-4-6", "messages": [...], "tools": [...], "system": "...", "max_tokens": 4096 }
 * ```
 *
 * Response 200:
 * ```json
 * {
 *   "model": "claude-sonnet-4-6",
 *   "inputTokens": 123,
 *   "maxOutputTokens": 4096,
 *   "maxCostUsd": 0.00123,
 *   "maxCostPton": "24600000000000",
 *   "tonUsd": 0.05,
 *   "hasCacheControl": false
 * }
 * ```
 */
async function handleEstimate(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { config } = getBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const identity = await resolveBillingIdentity(toIncomingMessage(req));
  if (!identity) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const body = req.body as unknown;
  const { model: rawModel, messages, tools, system, maxTokens } = extractRequestParts(body);

  if (!rawModel) {
    res.status(400).json({ error: "Missing required field: model" });
    return;
  }

  let model: string;
  try {
    model = normalizeModelId(rawModel);
    assertSupportedModel(model);
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  try {
    assertNoDisallowedModifiers(body as Record<string, unknown>);
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  const cacheInfo = detectCacheControl(body);
  const inputTokens = estimateInputTokens(messages, tools, system);
  const maxCostUsd = estimateMaxCostUsd({
    model,
    inputTokens,
    maxOutputTokens: maxTokens,
    hasCacheControl: cacheInfo.hasCacheControl,
    cacheTtl: cacheInfo.hasCacheControl ? cacheInfo.cacheTtl : undefined,
  });

  const tonUsd = getTonUsd();
  if (!tonUsd) {
    res.status(503).json({
      error: "Price oracle unavailable — no fresh TON/USD price and no fixedTonUsd override.",
    });
    return;
  }

  const maxCostPton = usdToPton(maxCostUsd, tonUsd);

  res.status(200).json({
    model,
    inputTokens,
    maxOutputTokens: maxTokens,
    maxCostUsd,
    maxCostPton: maxCostPton.toString(),
    tonUsd,
    hasCacheControl: cacheInfo.hasCacheControl,
    cacheTtl: cacheInfo.hasCacheControl ? cacheInfo.cacheTtl : undefined,
  });
}

// ---------------------------------------------------------------------------
// POST /v1/messages/count_tokens
// ---------------------------------------------------------------------------

/**
 * Anthropic-compatible token count endpoint (no charge).
 *
 * Body: `{ "model": "...", "messages": [...], "tools": [...], "system": "..." }`
 *
 * Response 200:
 * ```json
 * { "input_tokens": 123 }
 * ```
 */
async function handleCountTokens(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { config } = getBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const identity = await resolveBillingIdentity(toIncomingMessage(req));
  if (!identity) {
    // Match Anthropic's error shape for this endpoint.
    res.status(401).json({
      type: "error",
      error: { type: "authentication_error", message: "authentication required" },
    });
    return;
  }

  const body = req.body as unknown;
  const { model: rawModel, messages, tools, system } = extractRequestParts(body);

  if (!rawModel) {
    res.status(400).json({
      type: "error",
      error: { type: "invalid_request_error", message: "Missing required field: model" },
    });
    return;
  }

  let model: string;
  try {
    model = normalizeModelId(rawModel);
    assertSupportedModel(model);
  } catch (err: unknown) {
    res.status(400).json({
      type: "error",
      error: { type: "invalid_request_error", message: (err as Error).message },
    });
    return;
  }

  const inputTokens = estimateInputTokens(messages, tools, system);
  res.status(200).json({ input_tokens: inputTokens });
}

// ---------------------------------------------------------------------------
// GET /v1/price (debug)
// ---------------------------------------------------------------------------

/**
 * Debug endpoint — return the current TWAP cache state.
 *
 * Response 200:
 * ```json
 * {
 *   "tonUsd": 0.05,
 *   "source": "twap",
 *   "fetchedAt": 1715435200000,
 *   "ageMs": 12000
 * }
 * ```
 * or `{ "available": false }` when no price is cached.
 */
async function handlePrice(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { config, twapCache } = getBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const identity = await resolveBillingIdentity(toIncomingMessage(req));
  if (!identity) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  // 1. Priority override — operator-pinned price freeze.
  //    `BILLING_FIXED_TON_USD` is env-only (not exposed in the setup wizard),
  //    so anyone setting it has done so intentionally. We return it
  //    immediately, bypassing all live sources. This is the emergency-freeze
  //    path used during suspected oracle manipulation or in test/dev envs.
  //    Same semantic as getCachedTonUsd step 1 — kept in sync so the route
  //    behavior matches what the billing engine actually uses for charging.
  if (config.fixedTonUsd !== undefined) {
    res.status(200).json({
      tonUsd: config.fixedTonUsd,
      source: "fixed",
      fetchedAt: null,
      ageMs: null,
    });
    return;
  }

  // 2. Prefer the live cache (Tokamak API / on-chain TWAP).
  //    Cold-cache path: TwapRefreshService ticks every 60s, so the first
  //    dashboard load after restart could land before the worker has run.
  //    Hit the Tokamak API inline as a one-shot warm-up so the user sees a
  //    real price on first paint instead of "—".
  let snapshot = twapCache?.get() ?? null;
  if (!snapshot) {
    try {
      const live = await fetchTokamakApiPrice();
      twapCache?.set(live);
      snapshot = live;
    } catch {
      // Live fetch failed — fall through to unavailable handling.
    }
  }
  if (snapshot) {
    res.status(200).json({
      tonUsd: snapshot.tonUsd,
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
      ageMs: snapshot.ageMs,
    });
    return;
  }

  res.status(200).json({ available: false });
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const estimateRoutes: Route[] = [
  {
    type: "POST",
    path: "/v1/estimate",
    rawPath: true,
    name: "billing-estimate",
    handler: handleEstimate,
  },
  {
    type: "POST",
    path: "/v1/messages/count_tokens",
    rawPath: true,
    name: "billing-count-tokens",
    handler: handleCountTokens,
  },
  {
    type: "GET",
    path: "/v1/price",
    rawPath: true,
    name: "billing-price-debug",
    handler: handlePrice,
  },
];

// ---------------------------------------------------------------------------
// Client-mode forwarders
// ---------------------------------------------------------------------------

function clientEstimateRoutes(): Route[] {
  return [
    {
      type: "POST",
      path: "/v1/estimate",
      rawPath: true,
      name: "billing-estimate",
      handler: async (req, res) => {
        if (!ensureClientReady(res)) return;
        await forward(res, () =>
          getBillingState().gateway!.estimate.estimate(req.body),
        );
      },
    },
    {
      type: "POST",
      path: "/v1/messages/count_tokens",
      rawPath: true,
      name: "billing-count-tokens",
      handler: async (req, res) => {
        if (!ensureClientReady(res)) return;
        await forward(res, () =>
          getBillingState().gateway!.estimate.countTokens(
            pickForward(req),
            req.body,
          ),
        );
      },
    },
    {
      type: "GET",
      path: "/v1/price",
      rawPath: true,
      name: "billing-price-debug",
      handler: async (_req, res) => {
        if (!ensureClientReady(res)) return;
        await forward(res, () => getBillingState().gateway!.estimate.price());
      },
    },
  ];
}

export function getEstimateRoutes(mode: "server" | "client"): Route[] {
  return mode === "client" ? clientEstimateRoutes() : estimateRoutes;
}
