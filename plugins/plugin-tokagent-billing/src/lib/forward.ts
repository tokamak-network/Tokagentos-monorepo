/**
 * Forwarder helpers shared by every route file in client-mode (v2.0.0).
 *
 * In `BILLING_MODE=client`, each route's body is ~3 lines: extract headers,
 * call the typed gateway method, hand the result to `send(res, upstream)`.
 * The client-mode plugin never inspects the body — the gateway is canonical.
 */

import type { RouteRequest, RouteResponse } from "@tokagentos/core";
import type { ForwardHeaders, ProxyResponse } from "./gateway-proxy.js";
import { GatewayProxyError } from "./gateway-proxy.js";
import { isBillingStateInitialized, getBillingState } from "../state.js";

/**
 * Extract the headers the gateway needs from a RouteRequest.
 *
 * The client-mode CLI never decodes Authorization or x-api-key — it just
 * relays them. The upstream gateway enforces auth.
 */
export function pickForward(req: RouteRequest): ForwardHeaders {
  const h = (req.headers ?? {}) as Record<
    string,
    string | string[] | undefined
  >;
  const first = (k: string): string | undefined => {
    const v = h[k.toLowerCase()];
    if (Array.isArray(v)) return v[0];
    return typeof v === "string" ? v : undefined;
  };
  const out: ForwardHeaders = {};
  const auth = first("authorization");
  if (auth) out.authorization = auth;
  const apiKey = first("x-api-key");
  if (apiKey) out["x-api-key"] = apiKey;
  const anth = first("anthropic-version");
  if (anth) out["anthropic-version"] = anth;
  const xpay = first("x-payment");
  if (xpay) out["x-payment"] = xpay;
  return out;
}

/**
 * Flatten RouteRequest.query into a string-only record the gateway client
 * accepts. Drops array values (takes the first) and undefined entries.
 */
export function pickQuery(req: RouteRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v[0] !== undefined) out[k] = String(v[0]);
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

/**
 * Send a ProxyResponse back to the agent framework's RouteResponse.
 *
 * Copies the status, sets Content-Type from the upstream, and writes the
 * JSON body (or text passthrough when upstream returned text).
 */
export function send(res: RouteResponse, upstream: ProxyResponse): void {
  // Copy a curated subset of upstream headers. The agent framework's res
  // typically sets Content-Type via .json(); we surface anything billing-
  // specific the dashboard SPA might rely on.
  const passthrough = [
    "content-type",
    "x-actual-pton",
    "x-reserved-pton",
    "x-request-id",
    "retry-after",
  ];
  if (res.setHeader) {
    for (const name of passthrough) {
      const v = upstream.headers[name];
      if (v !== undefined) res.setHeader(name, v);
    }
  }

  res.status(upstream.status);
  if (upstream.body === null) {
    res.end?.();
  } else if (typeof upstream.body === "string") {
    res.send(upstream.body);
  } else {
    res.json(upstream.body as object);
  }
}

/**
 * Guard that returns true when the plugin is initialized.
 * Writes a 503 to the response and returns false otherwise. This is the
 * client-mode analog of `isBillingStateInitialized` plus `config.enabled`.
 */
export function ensureClientReady(res: RouteResponse): boolean {
  if (!isBillingStateInitialized()) {
    res.status(503).json({ error: "Billing service unavailable." });
    return false;
  }
  const state = getBillingState();
  if (!state.gateway) {
    res.status(503).json({
      error: "Billing forwarder not configured (TOKAGENT_GATEWAY_URL missing).",
    });
    return false;
  }
  return true;
}

/**
 * Wrap a forwarder so transport-level failures are turned into a clean 502
 * with a consistent error envelope. The forwarder receives the typed gateway
 * client; it returns a ProxyResponse which is then sent verbatim.
 */
export async function forward(
  res: RouteResponse,
  fn: () => Promise<ProxyResponse>,
): Promise<void> {
  try {
    const upstream = await fn();
    send(res, upstream);
  } catch (err) {
    if (err instanceof GatewayProxyError) {
      res.status(err.status).json({
        type: "gateway_error",
        message: err.message,
      });
      return;
    }
    const msg = err instanceof Error ? err.message : "unknown error";
    res.status(502).json({
      type: "gateway_error",
      message: `Gateway forwarder failed: ${msg}`,
    });
  }
}
