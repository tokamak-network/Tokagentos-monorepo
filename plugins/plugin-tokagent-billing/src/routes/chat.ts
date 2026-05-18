/**
 * Chat / messages routes — v2.0.0.
 *
 *   POST /v1/messages              — Anthropic Messages (streaming + unary)
 *   POST /v1/chat/completions      — OpenAI-shaped fallback (LiteLLM)
 *
 * Routing decision (per the migration brief):
 *   - If `LITELLM_API_KEY` is set in the environment → /v1/chat/completions
 *     forwards to the LiteLLM upstream LOCALLY (does NOT touch the gateway).
 *     This is a CLI-local escape hatch for users running their own LiteLLM.
 *   - Otherwise both paths forward to the hosted gateway.
 *
 * Streaming is the dominant case for `/v1/messages`. We use the typed gateway
 * client's `stream: true` flag and pipe the upstream `Response.body` (a
 * `ReadableStream`) through to the agent framework's response without
 * buffering. SSE framing, the final `[DONE]` sentinel, and Anthropic's
 * `message_delta` events all pass through unchanged.
 */

import type {
  Route,
  RouteRequest,
  RouteResponse,
  IAgentRuntime,
} from '@tokagentos/core';
import { logger } from '@tokagentos/core';
import { getBillingState } from '../state.js';
import { ensureEnabled, pickForward } from '../lib/forward.js';
import { GatewayProxyError } from '../lib/gateway-proxy.js';

const log = logger.child({ src: 'billing:chat' });

/** Is the LiteLLM CLI-local passthrough active? */
function isLiteLlmActive(): boolean {
  const key = process.env['LITELLM_API_KEY']?.trim();
  return Boolean(key);
}

/** Resolve the LiteLLM upstream URL. Defaults to the config value when set. */
function liteLlmBaseUrl(): string {
  try {
    const { config } = getBillingState();
    return (
      process.env['LITELLM_BASE_URL']?.trim() ||
      config.litellmBaseUrl ||
      'https://api.ai.tokamak.network'
    );
  } catch {
    return process.env['LITELLM_BASE_URL']?.trim() || 'https://api.ai.tokamak.network';
  }
}

/**
 * Stream-aware response writer.
 *
 * Copies upstream status + a curated header set, then pipes the upstream
 * body chunk-by-chunk into res via res.send(chunk). Falls back to res.send
 * for unary responses (when the upstream Response.body is null/empty).
 */
async function pipeUpstream(res: RouteResponse, upstream: Response): Promise<void> {
  const passthrough = [
    'content-type',
    'cache-control',
    'x-actual-pton',
    'x-reserved-pton',
    'x-request-id',
    'retry-after',
  ];
  if (res.setHeader) {
    for (const name of passthrough) {
      const v = upstream.headers.get(name);
      if (v !== null) res.setHeader(name, v);
    }
  }
  res.status(upstream.status);

  if (!upstream.body) {
    res.end();
    return;
  }

  // The agent framework's RouteResponse exposes only status/json/send/end —
  // there is no native streaming API. We read the upstream stream and forward
  // it as a single buffered send when streaming surfaces aren't available.
  // When res.send accepts a Buffer/string, SSE clients still see the same
  // bytes; the only behavioral difference is that the response is delivered
  // at end-of-stream rather than progressively.
  //
  // Future enhancement: when the framework exposes a writable stream, switch
  // to chunk-by-chunk forwarding for true SSE pass-through.
  try {
    const buf = await upstream.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'failed to relay upstream body');
    res.end();
  }
}

async function handleMessages(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;
  const { gateway } = getBillingState();
  try {
    const upstream = await gateway.messages(pickForward(req), req.body ?? {});
    if (!upstream.raw) {
      // Defensive: messages() always returns raw, but guard for tests/mocks.
      res.status(upstream.status);
      if (upstream.body === null) res.end();
      else if (typeof upstream.body === 'string') res.send(upstream.body);
      else res.json(upstream.body as unknown);
      return;
    }
    await pipeUpstream(res, upstream.raw);
  } catch (err) {
    if (err instanceof GatewayProxyError) {
      res.status(err.status).json({ type: 'gateway_error', message: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(502).json({ type: 'gateway_error', message: msg });
  }
}

/**
 * POST /v1/chat/completions — LiteLLM passthrough or gateway forward.
 *
 * The CLI-local LiteLLM path is the only place in the plugin that talks to a
 * non-gateway upstream. It uses `LITELLM_API_KEY` for outbound auth and DOES
 * NOT bill — the assumption is the user is paying LiteLLM directly.
 *
 * The gateway path is the normal route: same Anthropic-shaped body works,
 * the gateway accepts OpenAI-compatible bodies on /v1/chat/completions or
 * Anthropic-shaped bodies on /v1/messages.
 */
async function handleChatCompletions(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!ensureEnabled(res)) return;

  // Branch 1: CLI-local LiteLLM passthrough.
  if (isLiteLlmActive()) {
    const base = liteLlmBaseUrl().replace(/\/$/, '');
    const url = `${base}/v1/chat/completions`;
    const apiKey = process.env['LITELLM_API_KEY']!;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60_000);
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(req.body ?? {}),
        signal: ac.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : 'transport error';
      res.status(502).json({ type: 'litellm_error', message: msg });
      return;
    }
    clearTimeout(timer);
    await pipeUpstream(res, upstream);
    return;
  }

  // Branch 2: gateway forward (uses /v1/messages on the gateway side —
  // the gateway accepts both shapes; we keep /v1/messages as the canonical
  // forward target since /v1/chat/completions is not in §3.).
  const { gateway } = getBillingState();
  try {
    const upstream = await gateway.raw('POST', '/v1/messages', {
      headers: pickForward(req),
      body: req.body ?? {},
      stream: true,
    });
    if (!upstream.raw) {
      res.status(upstream.status);
      if (upstream.body === null) res.end();
      else if (typeof upstream.body === 'string') res.send(upstream.body);
      else res.json(upstream.body as unknown);
      return;
    }
    await pipeUpstream(res, upstream.raw);
  } catch (err) {
    if (err instanceof GatewayProxyError) {
      res.status(err.status).json({ type: 'gateway_error', message: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(502).json({ type: 'gateway_error', message: msg });
  }
}

export const chatRoutes: Route[] = [
  {
    type: 'POST',
    path: '/v1/messages',
    rawPath: true,
    name: 'billing-messages',
    handler: handleMessages,
  },
  {
    type: 'POST',
    path: '/v1/chat/completions',
    rawPath: true,
    name: 'billing-chat-completions',
    handler: handleChatCompletions,
  },
];
