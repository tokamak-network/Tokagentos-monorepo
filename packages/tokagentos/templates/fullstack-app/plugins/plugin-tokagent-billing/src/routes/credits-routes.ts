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

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@elizaos/core";
import type { IncomingMessage } from "node:http";
import type { Address } from "viem";
import {
  getBillingState,
  getServerBillingState,
  isBillingStateInitialized,
} from "../state.js";
import { resolveBillingIdentity } from "../middleware/api-key-resolve.js";
import { pickForward, forward, ensureClientReady } from "../lib/forward.js";
import { creditState, hydrate as hydrateCredits, readCredits } from "@tokagentos/billing";
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
  const { db, config, clients } = getServerBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const identity = await resolveBillingIdentity(toIncomingMessage(req));
  if (!identity) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const wallet: Address = identity.wallet;
  const walletKey = wallet.toLowerCase();

  // Sync on-chain credits → DB ledger BEFORE returning the balance.
  //
  // Why hydrate-on-read instead of a separate deposit watcher service:
  //   - depositX402 is now PERMISSIONLESS (any wallet can submit a user's
  //     signed EIP-3009 auth) — handleTopupSettle is only ONE possible
  //     submitter, so we can't rely on the settle path to credit the DB.
  //   - A dedicated event listener could miss events during agent
  //     downtime or RPC outages; hydrate-on-read self-heals at request
  //     time.
  //   - The vault's `credits[user]` mapping is the source of truth.
  //     hydrate() reconciles: balance = onChain - (reserved + accrued).
  //
  // Costs: one eth_call per dashboard refresh. Acceptable — this route is
  // not on the hot inference path.
  //
  // Failure handling: if the RPC call throws, fall back to the stale DB
  // row rather than 500ing. The user sees a slightly old balance instead
  // of a broken page.
  try {
    const onChainCredits = await readCredits(
      clients,
      config.vaultAddress,
      wallet,
    );
    await hydrateCredits(db, wallet, onChainCredits);
  } catch (_err) {
    // Swallow — fall back to whatever the DB has. Logged at hydrate level.
  }

  // Read the credit state row (may not exist for a new wallet).
  const rows = await db
    .select()
    .from(creditState)
    .where(eq(creditState.wallet, walletKey));

  const row = rows[0];

  // Response shape: both flat (legacy clients) and nested under `ledger`
  // (the dashboard SPA which reads `c.ledger.balance`). Keeping both keys
  // is cheap and avoids a contract break for any external caller already
  // depending on the flat shape.
  const balance = row ? row.balance.toString() : "0";
  const reserved = row ? row.reserved.toString() : "0";
  const accrued = row ? row.accrued.toString() : "0";
  res.status(200).json({
    wallet,
    balance,
    reserved,
    accrued,
    ledger: { balance, reserved, accrued },
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
    public: true,
    name: "billing-credits-me",
    handler: handleGetCreditsMe,
  },
];

// ---------------------------------------------------------------------------
// Client-mode forwarders
// ---------------------------------------------------------------------------

function clientCreditsRoutes(): Route[] {
  return [
    {
      type: "GET",
      path: "/v1/credits/me",
      rawPath: true,
      public: true,
      name: "billing-credits-me",
      handler: async (req, res) => {
        if (!ensureClientReady(res)) return;
        await forward(res, () =>
          getBillingState().gateway!.credits.me(pickForward(req)),
        );
      },
    },
  ];
}

export function getCreditsRoutes(mode: "server" | "client"): Route[] {
  return mode === "client" ? clientCreditsRoutes() : creditsRoutes;
}
