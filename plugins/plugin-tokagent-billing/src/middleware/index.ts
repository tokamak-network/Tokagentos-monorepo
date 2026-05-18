/**
 * Billing middleware seam — v2.0.0 passthrough.
 *
 * v1.x: this enforced rate limits, resolved identity, reserved credits, and
 * returned commit/release closures the agent server then called after
 * streaming finished.
 *
 * v2.x: all of that lives on the hosted gateway. The agent server's
 * BILLING_HOOK still calls this function (the seam survives so the agent
 * doesn't need to know whether billing is local or remote) but it returns
 * `{ allow: true }` unconditionally. The `/v1/messages` route in the plugin
 * forwards to the gateway, and the gateway is the single source of truth
 * for auth + ledger.
 *
 * The agent must still pre-read the JSON body when this is called so the
 * downstream forwarder sees it; we keep that contract intact by exporting
 * the same `isBillingGatedPath` helper.
 */

import type { IncomingMessage } from 'node:http';
import { isBillingStateInitialized, getBillingState } from '../state.js';

export interface BillingMiddlewareResult {
  allow: boolean;
  status: number;
  body?: object;
  /** v1.x compat — never present in v2.x (the gateway commits). */
  commit?: undefined;
  /** v1.x compat — never present in v2.x (the gateway releases). */
  release?: undefined;
}

/**
 * Always allow the request to proceed. Auth headers (Authorization,
 * x-api-key) survive in `req` and the route forwarder relays them to the
 * gateway, which is the canonical enforcer.
 *
 * This function is intentionally async to match the v1.x signature the agent
 * server calls — switching to sync would break the type guard in
 * server.ts:isBillingMiddlewareService.
 */
export async function applyBillingMiddleware(
  _req: IncomingMessage,
  _body: unknown,
  _pathname: string,
): Promise<BillingMiddlewareResult> {
  // Short-circuit when the plugin hasn't initialized or billing is off.
  if (!isBillingStateInitialized()) {
    return { allow: true, status: 200 };
  }
  try {
    const { config } = getBillingState();
    if (!config.enabled) return { allow: true, status: 200 };
  } catch {
    return { allow: true, status: 200 };
  }
  // Always pass through. The gateway enforces billing on /v1/messages and the
  // /v1/messages route in this plugin forwards to it.
  return { allow: true, status: 200 };
}

/** Test / dispose hook kept for v1.x compatibility. */
export function resetBillingLimiters(): void {
  /* no-op in v2.x */
}

/**
 * Path-classification helper kept for v1.x compatibility with the agent
 * server's `if (isGatedPath) { _billingBody = await readJsonBody(...) }`
 * preamble. The set of gated paths is unchanged; only the enforcement
 * mechanism has moved.
 */
export function isBillingGatedPath(pathname: string): boolean {
  return (
    pathname === '/v1/messages' ||
    pathname.startsWith('/v1/messages/') ||
    pathname === '/v1/chat/completions'
  );
}
