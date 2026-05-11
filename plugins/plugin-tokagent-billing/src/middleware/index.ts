/**
 * Billing middleware composer (Phase 6).
 *
 * `applyBillingMiddleware` is the single integration point for server.ts.
 * It is called BEFORE the /v1/ dispatch block (BILLING_HOOK seam) and:
 *
 *   1. Short-circuits when billing is disabled or the path is not gated.
 *   2. Applies rate limiting per wallet (consumes a token bucket token).
 *   3. Calls `applyBillingGate` to reserve credits and return commit/release
 *      closures that the upstream proxy stores on the response context.
 *
 * The return type mirrors the gate result so callers can read `allow`,
 * `status`, and `body` without importing the gate directly.
 *
 * Decision Z28: state is read via `getBillingState()` at call time —
 * never at import time.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createRateLimiter, type TokenBucketLimiter } from "./rate-limit.js";
import { applyBillingGate, isBillingGatedPath, type BillingGateResult } from "./billing-gate.js";
import { resolveBillingIdentity } from "./api-key-resolve.js";
import { getBillingState, isBillingStateInitialized } from "../state.js";

export type { BillingGateResult, ReleaseOutcome } from "./billing-gate.js";

// ---------------------------------------------------------------------------
// Module-level rate limiter singletons
// ---------------------------------------------------------------------------
// Created lazily on first use so tests that never call applyBillingMiddleware
// don't pay the allocation cost.
//
// The settle-path limiter (BILLING_RATE_LIMIT_SETTLE_PER_MIN) will be
// reintroduced in Phase 6b alongside `/v1/topup/settle` — keeping a dead
// singleton here now would mask whether Phase 6b activates the limiter on
// the correct route.

let _quoteLimiter: TokenBucketLimiter | null = null;

function getQuoteLimiter(): TokenBucketLimiter {
  if (!_quoteLimiter) {
    const { config } = getBillingState();
    _quoteLimiter = createRateLimiter({
      capacity: config.rateLimitQuotePerMin,
      windowMs: 60_000,
    });
  }
  return _quoteLimiter;
}

/**
 * Reset module-level limiter singletons.
 * Called by Plugin.dispose so rate-limit state doesn't bleed across restarts.
 * Also useful in tests.
 */
export function resetBillingLimiters(): void {
  _quoteLimiter = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BillingMiddlewareResult {
  /** Whether the request should proceed to the upstream handler. */
  allow: boolean;
  /** HTTP status code to use when allow=false. */
  status: number;
  /** JSON body to send when allow=false. */
  body?: object;
  /** Commit actual cost after streaming completes. Only present when allow=true. */
  commit?: BillingGateResult["commit"];
  /** Release reservation on abort/error. Only present when allow=true. */
  release?: BillingGateResult["release"];
}

/**
 * Apply the billing middleware stack to a gated request.
 *
 * Returns `{ allow: true }` + closures when the request may proceed,
 * or `{ allow: false, status, body }` when it should be rejected.
 *
 * Short-circuits with `{ allow: true }` (passthrough) when:
 *   - Billing state has not been initialized (disabled path).
 *   - The path is not one of the gated paths.
 *   - Rate limiting is disabled in config.
 *
 * @param req      - Raw Node IncomingMessage.
 * @param body     - Pre-parsed JSON body.
 * @param pathname - Parsed URL pathname (e.g. "/v1/messages").
 */
export async function applyBillingMiddleware(
  req: IncomingMessage,
  body: unknown,
  pathname: string,
): Promise<BillingMiddlewareResult> {
  // ---- 0. Short-circuit: billing not initialized ----
  if (!isBillingStateInitialized()) {
    return { allow: true, status: 200 };
  }

  const { config } = getBillingState();

  // ---- 0b. Short-circuit: billing disabled ----
  if (!config.enabled) {
    return { allow: true, status: 200 };
  }

  // ---- 0c. Short-circuit: path not gated ----
  if (!isBillingGatedPath(pathname)) {
    return { allow: true, status: 200 };
  }

  // ---- 1. Rate limiting ----
  if (config.rateLimitEnabled) {
    // Resolve identity for rate-limit key; fall back to IP if unauthenticated.
    // Rate limiting runs BEFORE the billing gate so it blocks even unauthenticated
    // floods without hitting the DB.
    const identity = await resolveBillingIdentity(req);
    const rateLimitKey =
      identity?.wallet ??
      (req.socket.remoteAddress ?? "unknown");

    const limiter = getQuoteLimiter();
    const result = limiter.consume(rateLimitKey);
    if (!result.allowed) {
      return {
        allow: false,
        status: 429,
        body: {
          type: "billing_error",
          code: "rate_limited",
          message: "rate limit exceeded for billing-gated path",
          retryAfterSec: result.retryAfterSec,
        },
      };
    }
  }

  // ---- 2. Billing gate (reserve credits) ----
  const gateResult = await applyBillingGate(req, body);

  if (!gateResult.allow) {
    return {
      allow: false,
      status: gateResult.status,
      body: gateResult.body,
    };
  }

  return {
    allow: true,
    status: 200,
    commit: gateResult.commit,
    release: gateResult.release,
  };
}

// Re-export path helper so server.ts only imports from middleware/index.
export { isBillingGatedPath } from "./billing-gate.js";
