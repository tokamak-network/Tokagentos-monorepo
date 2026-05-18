/**
 * Credits routes (Phase 6b).
 *
 *   GET /v1/credits/me — return the caller's wallet balance + reserved + accrued.
 *
 * Ported from llm-api-gateway/proxy/src/server.ts:707-729.
 * Uses `rawPath: true` so the route mounts at the exact path (Decision Z32).
 *
 * Returns 503 when billing is disabled (BILLING_ENABLED=false).
 */

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@tokagentos/core";
import type { IncomingMessage } from "node:http";
import type { Address } from "viem";
import { getBillingState, isBillingStateInitialized } from "../state.js";
import { resolveBillingIdentity } from "../middleware/api-key-resolve.js";
import { creditState } from "@tokagentos/billing";
import { eq } from "drizzle-orm";

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

// ---------------------------------------------------------------------------
// GET /v1/credits/me
// ---------------------------------------------------------------------------

/**
 * Return the authenticated wallet's credit ledger state.
 *
 * Response 200:
 * ```json
 * {
 *   "wallet": "0x...",
 *   "balance": "1000000000000000000",
 *   "reserved": "0",
 *   "accrued": "0"
 * }
 * ```
 *
 * `balance`, `reserved`, and `accrued` are returned as decimal strings
 * (bigint serialization — JSON does not support bigint natively).
 */
async function handleGetCreditsMe(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { db, config } = getBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const identity = await resolveBillingIdentity(toIncomingMessage(req));
  if (!identity) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const wallet: Address = identity.wallet;
  const walletKey = wallet.toLowerCase();

  // Read the credit state row (may not exist for a new wallet).
  const rows = await db
    .select()
    .from(creditState)
    .where(eq(creditState.wallet, walletKey));

  const row = rows[0];

  res.status(200).json({
    wallet,
    balance: row ? row.balance.toString() : "0",
    reserved: row ? row.reserved.toString() : "0",
    accrued: row ? row.accrued.toString() : "0",
  });
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const creditsRoutes: Route[] = [
  {
    type: "GET",
    path: "/v1/credits/me",
    rawPath: true,
    name: "billing-credits-me",
    handler: handleGetCreditsMe,
  },
];
