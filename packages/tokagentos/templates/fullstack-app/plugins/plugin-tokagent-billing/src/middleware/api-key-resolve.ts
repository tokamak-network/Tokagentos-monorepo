/**
 * Billing identity resolver (Phase 6).
 *
 * Extracts a wallet address from an incoming HTTP request using one of three
 * resolution paths (in precedence order):
 *
 *   1. `x-api-key: sk-ai-*`  → DB lookup via `resolveApiKey`
 *   2. `Authorization: Bearer <jwt>`  → JWT verification via `verifySession`
 *   3. `x-dev-wallet: 0x...`  → dev escape (BILLING_AUTH_REQUIRED=false +
 *                                NODE_ENV=development only; Decision G6)
 *
 * This is a pure resolver function. Routes and middleware call it directly;
 * no express/Hono middleware chains here.
 *
 * Ported from llm-api-gateway/proxy/src/auth.ts:242-254.
 */

import type { IncomingMessage } from "node:http";
import type { Address } from "viem";
import { resolveApiKey, verifySession } from "@tokagentos/billing";
import { getBillingState } from "../state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BillingIdentity {
  wallet: Address;
  /** Present when identity was resolved from `x-api-key`. */
  apiKeyId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headerValue(req: IncomingMessage, name: string): string | null {
  const raw = req.headers[name.toLowerCase()];
  if (!raw) return null;
  const val = Array.isArray(raw) ? raw[0] : raw;
  return typeof val === "string" && val.trim() ? val.trim() : null;
}

function bearerToken(req: IncomingMessage): string | null {
  const auth = headerValue(req, "authorization");
  if (!auth) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  return m ? (m[1] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the billing identity from the request.
 *
 * Returns `null` if no valid identity can be found (anonymous request).
 * Never throws — treat null as "unauthenticated".
 */
export async function resolveBillingIdentity(
  req: IncomingMessage,
): Promise<BillingIdentity | null> {
  const { db, config } = getBillingState();

  // Safety: if authSecret is not configured (billing-disabled path should not
  // reach here, but guard anyway) skip resolution.
  if (!config.authSecret) return null;
  const authSecret = config.authSecret;

  // ---- 1. x-api-key: sk-ai-* ----
  const apiKey = headerValue(req, "x-api-key");
  if (apiKey) {
    const result = await resolveApiKey(db, apiKey, authSecret);
    if (result) {
      return { wallet: result.wallet, apiKeyId: result.id };
    }
  }

  // ---- 2. Authorization: Bearer <jwt> ----
  const bearer = bearerToken(req);
  if (bearer) {
    const result = await verifySession(bearer, authSecret);
    if (result) {
      return { wallet: result.wallet };
    }
  }

  // ---- 3. Dev escape: x-dev-wallet (Decision G6) ----
  // Only active when BILLING_AUTH_REQUIRED=false AND NODE_ENV=development.
  if (!config.authRequired && process.env.NODE_ENV === "development") {
    const devWallet = headerValue(req, "x-dev-wallet");
    if (devWallet && /^0x[0-9a-fA-F]{40}$/.test(devWallet)) {
      return { wallet: devWallet as Address };
    }
  }

  return null;
}
