/**
 * Estimate / count-tokens / price routes — v2.0.0 mixed local + forwarder.
 *
 * Decision (MIGRATION_PLAN.md §5.3.1):
 *   - `/v1/estimate` and `/v1/messages/count_tokens` STAY LOCAL — pure compute
 *     against the pricing table + a cached TWAP price. Falls back to the
 *     gateway when the TWAP cache is empty.
 *   - `/v1/price` FORWARDS to the gateway (with no local cache; the TWAP
 *     service keeps its own cache for the estimate paths).
 *
 * These local routes are the only place the CLI still calls into
 * `@tokagentos/billing`'s pure-compute helpers at request time.
 */

import type {
  Route,
  RouteRequest,
  RouteResponse,
  IAgentRuntime,
} from '@tokagentos/core';
import {
  assertSupportedModel,
  normalizeModelId,
  estimateInputTokens,
  estimateMaxCostUsd,
  detectCacheControl,
  usdToPton,
} from '@tokagentos/billing';
import { getBillingState } from '../state.js';
import { ensureEnabled, forward } from '../lib/forward.js';

/** Read TON/USD from the local cache or the fixed override. */
function getLocalTonUsd(): number | null {
  try {
    const { config, twapCache } = getBillingState();
    return twapCache?.get()?.tonUsd ?? config.fixedTonUsd ?? null;
  } catch {
    return null;
  }
}

interface RequestParts {
  model: string | null;
  messages: Array<{ role: string; content: unknown }>;
  tools: unknown[] | undefined;
  system: unknown | undefined;
  maxTokens: number;
}

function extractRequestParts(body: unknown): RequestParts {
  if (typeof body !== 'object' || body === null) {
    return { model: null, messages: [], tools: undefined, system: undefined, maxTokens: 4096 };
  }
  const b = body as Record<string, unknown>;
  const model = typeof b['model'] === 'string' ? b['model'] : null;
  const messages = Array.isArray(b['messages'])
    ? (b['messages'] as Array<{ role: string; content: unknown }>)
    : [];
  const tools = Array.isArray(b['tools']) ? b['tools'] : undefined;
  const system = b['system'];
  const maxTokens =
    typeof b['max_tokens'] === 'number' && b['max_tokens'] > 0 ? b['max_tokens'] : 4096;
  return { model, messages, tools, system, maxTokens };
}

/**
 * POST /v1/estimate — local compute with gateway fallback.
 */
async function handleEstimate(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;

  const body = req.body as unknown;
  const { model: rawModel, messages, tools, system, maxTokens } =
    extractRequestParts(body);

  if (!rawModel) {
    res.status(400).json({ error: 'Missing required field: model' });
    return;
  }

  let model: string;
  try {
    model = normalizeModelId(rawModel);
    assertSupportedModel(model);
  } catch (err) {
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

  // Try the local cache first. If empty, forward to the gateway so the user
  // never sees a 503 just because the CLI's TWAP refresh hasn't ticked yet.
  const tonUsd = getLocalTonUsd();
  if (tonUsd === null) {
    const { gateway } = getBillingState();
    await forward(res, () => gateway.estimate(body));
    return;
  }

  const maxCostPton = usdToPton(maxCostUsd, tonUsd);

  res.status(200).json({
    model,
    inputTokens,
    maxOutputTokens: maxTokens,
    maxCostUsd,
    maxCostPton: maxCostPton.toString(),
    amountPton: maxCostPton.toString(), // §3 #21 alias
    tonUsd,
    hasCacheControl: cacheInfo.hasCacheControl,
    cacheTtl: cacheInfo.hasCacheControl ? cacheInfo.cacheTtl : undefined,
  });
}

/**
 * POST /v1/messages/count_tokens — local pure-compute, no charge, no gateway.
 */
async function handleCountTokens(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const body = req.body as unknown;
  const { model: rawModel, messages, tools, system } = extractRequestParts(body);
  if (!rawModel) {
    res.status(400).json({
      type: 'error',
      error: { type: 'invalid_request_error', message: 'Missing required field: model' },
    });
    return;
  }
  let model: string;
  try {
    model = normalizeModelId(rawModel);
    assertSupportedModel(model);
  } catch (err) {
    res.status(400).json({
      type: 'error',
      error: { type: 'invalid_request_error', message: (err as Error).message },
    });
    return;
  }
  const inputTokens = estimateInputTokens(messages, tools, system);
  res.status(200).json({ input_tokens: inputTokens, model });
}

/**
 * GET /v1/price — forward to the gateway.
 *
 * The gateway is canonical for the price; the local TwapCache exists purely
 * to keep /v1/estimate fast. A direct GET hits the gateway so the dashboard
 * always sees the live consensus value.
 */
async function handlePrice(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  // /v1/price is public per §3; no auth headers forwarded.
  await forward(res, () => gateway.price());
}

export const estimateRoutes: Route[] = [
  {
    type: 'POST',
    path: '/v1/estimate',
    rawPath: true,
    name: 'billing-estimate',
    handler: handleEstimate,
  },
  {
    type: 'POST',
    path: '/v1/messages/count_tokens',
    rawPath: true,
    name: 'billing-count-tokens',
    handler: handleCountTokens,
  },
  {
    type: 'GET',
    path: '/v1/price',
    rawPath: true,
    public: true,
    name: 'billing-price-debug',
    handler: handlePrice,
  },
];
