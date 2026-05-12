/**
 * Top-up routes (Phase 6b).
 *
 * Implements the EIP-3009-based deposit UX:
 *
 *   GET  /v1/topup/info      — EIP-712 domain info for client signing.
 *   POST /v1/topup/quote     — compute a PTON quote for a USD amount.
 *   POST /v1/topup/settle    — submit signed EIP-3009 authorization to vault.
 *   POST /v1/topup/preauth   — store a pre-signed authorization slot.
 *   GET  /v1/topup/status    — next available preauth slot for the caller.
 *   POST /v1/topup/revoke    — poison a preauth slot by nonce.
 *   GET  /v1/quote/:id       — debug: fetch a stored quote by ID.
 *
 * Ported from llm-api-gateway/proxy/src/server.ts:824-1007 + handleTopup.ts.
 *
 * The settle route is rate-limited via a separate settle limiter
 * (BILLING_RATE_LIMIT_SETTLE_PER_MIN, Decision Z3) to guard against
 * flood-spamming on-chain deposits.
 *
 * Uses `rawPath: true` so routes mount at the exact paths (Decision Z32).
 * Returns 503 when billing is disabled (BILLING_ENABLED=false).
 */

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@tokagentos/core";
import type { IncomingMessage } from "node:http";
import type { Address, Hex } from "viem";
import { randomUUID } from "node:crypto";
import {
  ptonDomain,
  storeQuote,
  fetchQuote,
  consumeQuote,
  depositPreauthSlot,
  nextAvailableSlot,
  markPoisoned,
  verifyEip3009Signature,
  depositX402,
  usdToPton,
  topupQuotes,
} from "@tokagentos/billing";
import { eq } from "drizzle-orm";
import { getBillingState, isBillingStateInitialized } from "../state.js";
import { resolveBillingIdentity } from "../middleware/api-key-resolve.js";
import { createRateLimiter, type TokenBucketLimiter } from "../middleware/rate-limit.js";

// ---------------------------------------------------------------------------
// Module-level settle rate limiter (lazy-init)
// ---------------------------------------------------------------------------

let _settleLimiter: TokenBucketLimiter | null = null;

function getSettleLimiter(): TokenBucketLimiter {
  if (!_settleLimiter) {
    const { config } = getBillingState();
    _settleLimiter = createRateLimiter({
      capacity: config.rateLimitSettlePerMin,
      windowMs: 60_000,
    });
  }
  return _settleLimiter;
}

/**
 * Reset the settle limiter singleton (called by Plugin.dispose / tests).
 */
export function resetSettleLimiter(): void {
  _settleLimiter = null;
}

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

/** Get the current TON/USD price from TwapCache or fixedTonUsd. */
function getTonUsd(): number | null {
  try {
    const { config, twapCache } = getBillingState();
    return config.fixedTonUsd ?? twapCache?.get()?.tonUsd ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET /v1/topup/info
// ---------------------------------------------------------------------------

/**
 * Return EIP-712 domain info so clients can construct the TransferWithAuthorization
 * typed data for signing.
 *
 * Response 200:
 * ```json
 * {
 *   "chainId": 1,
 *   "vaultAddress": "0x...",
 *   "ptonAddress": "0x...",
 *   "domain": { "name": "PTON", "version": "1", "chainId": 1, "verifyingContract": "0x..." }
 * }
 * ```
 */
async function handleTopupInfo(
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

  const domain = ptonDomain(config.chainId, config.ptonAddress);
  res.status(200).json({
    chainId: config.chainId,
    vaultAddress: config.vaultAddress,
    ptonAddress: config.ptonAddress,
    // Gateway-compatible aliases — the migrated dashboard SPA reads
    // `info.vault` and `info.asset`. Without these, resolveDepositTargets()
    // leaves both addresses undefined and the faucet/top-up flows send
    // transactions to `to: undefined`, which MetaMask surfaces as
    // "gas limit too high" (its UX for "tx simulation failed").
    vault: config.vaultAddress,
    asset: config.ptonAddress,
    domain,
  });
}

// ---------------------------------------------------------------------------
// POST /v1/topup/quote
// ---------------------------------------------------------------------------

/**
 * Compute a PTON quote for a USD deposit amount.
 *
 * Body:
 * ```json
 * { "amountUsd": 10.0 }
 * ```
 * `amountUsd` is optional; defaults to `config.topupAmountPton` expressed in USD
 * at the current TWAP rate.
 *
 * Response 200:
 * ```json
 * {
 *   "topupId": "uuid",
 *   "amountPton": "...",
 *   "amountUsd": 10.0,
 *   "tonUsd": 0.05,
 *   "expiresAt": "2026-05-11T..."
 * }
 * ```
 */
async function handleTopupQuote(
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

  const tonUsd = getTonUsd();
  if (!tonUsd) {
    res.status(503).json({
      error: "Price oracle unavailable — no fresh TON/USD price and no fixedTonUsd override.",
    });
    return;
  }

  // Parse optional amountUsd from body; fall back to the configured default.
  const body = req.body as Record<string, unknown> | undefined;
  let amountUsd: number;
  if (body?.["amountUsd"] !== undefined) {
    const raw = body["amountUsd"];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
      res.status(400).json({ error: "amountUsd must be a positive finite number." });
      return;
    }
    amountUsd = raw;
  } else {
    // Convert default PTON amount → USD.
    const defaultPton = config.topupAmountPton;
    // amountUsd = ptonAmount * tonUsd / 1e18
    amountUsd = Number(defaultPton) * tonUsd / 1e18;
  }

  const amountPton = usdToPton(amountUsd, tonUsd);
  if (amountPton <= 0n) {
    res.status(400).json({ error: "Computed PTON amount is zero — check amountUsd." });
    return;
  }

  const topupId = randomUUID();
  // Quote TTL: 10 minutes (matches the source's QUOTE_TTL_MS = 600_000).
  const QUOTE_TTL_MS = 600_000;

  await storeQuote(db, {
    id: topupId,
    wallet: identity.wallet,
    amountPton,
    amountUsd,
    tonUsd,
    ttlMs: QUOTE_TTL_MS,
  });

  const expiresAt = new Date(Date.now() + QUOTE_TTL_MS).toISOString();

  res.status(200).json({
    topupId,
    amountPton: amountPton.toString(),
    amountUsd,
    tonUsd,
    expiresAt,
    vaultAddress: config.vaultAddress,
    ptonAddress: config.ptonAddress,
    domain: ptonDomain(config.chainId, config.ptonAddress),
  });
}

// ---------------------------------------------------------------------------
// POST /v1/topup/settle
// ---------------------------------------------------------------------------

/**
 * Submit a signed EIP-3009 TransferWithAuthorization to the vault.
 *
 * Body:
 * ```json
 * {
 *   "topupId": "uuid",
 *   "signature": { "v": 27, "r": "0x...", "s": "0x..." }
 * }
 * ```
 *
 * Response 200:
 * ```json
 * { "txHash": "0x...", "balanceAfterPton": "..." }
 * ```
 *
 * Rate-limited via BILLING_RATE_LIMIT_SETTLE_PER_MIN (Decision Z3).
 */
async function handleTopupSettle(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { db, config, clients } = getBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const identity = await resolveBillingIdentity(toIncomingMessage(req));
  if (!identity) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  // Rate limit per wallet on settle path.
  if (config.rateLimitEnabled) {
    const limiter = getSettleLimiter();
    const result = limiter.consume(identity.wallet);
    if (!result.allowed) {
      res.status(429).json({
        error: "Rate limit exceeded on settle path.",
        retryAfterSec: result.retryAfterSec,
      });
      return;
    }
  }

  // Two accepted request shapes:
  //   1. Direct JSON body { topupId, signature: { v, r, s } } — our plugin's
  //      native shape.
  //   2. x402 X-PAYMENT header — gateway-compatible. The migrated dashboard
  //      SPA sends this: base64-encoded JSON of
  //      { x402Version, scheme, network, payload: {
  //          signature: { v, r, s },
  //          authorization: { from, to, value, validAfter, validBefore, nonce },
  //          quoteId,
  //      } }
  // Decode (2) into the same shape as (1) so the rest of the handler is
  // unified.
  const headers = (req.headers ?? {}) as Record<string, unknown>;
  const xPaymentRaw =
    (headers["x-payment"] as string | undefined) ??
    (headers["X-PAYMENT"] as string | undefined);

  let topupId: unknown;
  let sigRaw: unknown;
  if (typeof xPaymentRaw === "string" && xPaymentRaw.length > 0) {
    try {
      const decoded = JSON.parse(
        Buffer.from(xPaymentRaw, "base64").toString("utf8"),
      ) as {
        payload?: {
          signature?: { v?: unknown; r?: unknown; s?: unknown };
          quoteId?: unknown;
        };
      };
      topupId = decoded.payload?.quoteId;
      sigRaw = decoded.payload?.signature;
    } catch (err) {
      res.status(400).json({
        error: `Invalid X-PAYMENT header: ${
          err instanceof Error ? err.message : "decode failed"
        }`,
      });
      return;
    }
  } else {
    const body = req.body as Record<string, unknown> | undefined;
    topupId = body?.["topupId"];
    sigRaw = body?.["signature"];
  }

  if (typeof topupId !== "string" || !topupId) {
    res.status(400).json({ error: "Missing required field: topupId" });
    return;
  }
  if (!sigRaw || typeof sigRaw !== "object") {
    res.status(400).json({ error: "Missing required field: signature ({ v, r, s })" });
    return;
  }

  const sig = sigRaw as Record<string, unknown>;
  if (typeof sig["v"] !== "number" || typeof sig["r"] !== "string" || typeof sig["s"] !== "string") {
    res.status(400).json({ error: "signature must have numeric v and hex r, s" });
    return;
  }

  const paymentSig = { v: sig["v"] as number, r: sig["r"] as Hex, s: sig["s"] as Hex };

  // Fetch and validate the quote.
  const quote = await fetchQuote(db, topupId, new Date());
  if (!quote) {
    res.status(404).json({ error: "Quote not found, expired, or already consumed." });
    return;
  }

  // Guard: the quote must belong to the authenticated wallet.
  if (quote.wallet.toLowerCase() !== identity.wallet.toLowerCase()) {
    res.status(403).json({ error: "Quote does not belong to the authenticated wallet." });
    return;
  }

  // Verify EIP-3009 signature.
  const auth = {
    from: identity.wallet,
    to: config.vaultAddress,
    value: quote.amountPton,
    validAfter: 0n,
    // Valid for 1 hour from quote creation (generous; chain validates validBefore).
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
    nonce: `0x${topupId.replace(/-/g, "").padStart(64, "0")}` as Hex,
  };

  const valid = await verifyEip3009Signature({
    auth,
    sig: paymentSig,
    chainId: config.chainId,
    ptonAddress: config.ptonAddress,
  });

  if (!valid) {
    res.status(402).json({
      type: "billing_error",
      code: "invalid_signature",
      message: "EIP-3009 signature verification failed.",
    });
    return;
  }

  // Submit on-chain deposit.
  let txHash: Hex;
  try {
    txHash = await depositX402(clients, config.vaultAddress, {
      auth,
      sig: paymentSig,
      topupId: auth.nonce,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "vault deposit failed";
    res.status(500).json({ error: `On-chain deposit failed: ${message}` });
    return;
  }

  // ---- Atomically mark the quote consumed (Phase 6c Fix 2) ---------------
  //
  // Trade-off: chain-deposit-first, then consumeQuote.
  //   Pro: a legitimate settle that succeeded on chain is never denied.
  //   Con: leaves a tiny race window where two concurrent callers can both
  //        succeed on chain before either marks the quote consumed. Whichever
  //        callsite loses the consumeQuote() race gets a 409 with the txHash
  //        of the successful deposit — operator can reconcile manually.
  //
  // The reverse ordering (consume first, then deposit) trades double-credit
  // risk for a different failure mode: the quote is marked consumed but the
  // chain deposit fails, leaving the user with an unsettled-but-poisoned
  // quote. We chose chain-first because chain-side success is the source of
  // truth; the quote table is a UX hint, not a financial primitive.
  const consumed = await consumeQuote(db, topupId);
  if (!consumed) {
    res.status(409).json({
      type: "billing_error",
      code: "quote_already_consumed",
      message:
        "Quote was already settled. The on-chain deposit succeeded but this " +
        "is a duplicate settle call. Contact support if unexpected.",
      txHash,
    });
    return;
  }

  res.status(200).json({ txHash, ok: true });
}

// ---------------------------------------------------------------------------
// POST /v1/topup/preauth
// ---------------------------------------------------------------------------

/**
 * Store one or more pre-signed EIP-3009 authorization slots for auto-topup.
 *
 * Body:
 * ```json
 * {
 *   "slots": [
 *     {
 *       "nonce": "0x...",
 *       "amountPton": "...",
 *       "validAfter": 0,
 *       "validBefore": 9999999999,
 *       "v": 27, "r": "0x...", "s": "0x..."
 *     }
 *   ]
 * }
 * ```
 *
 * Response 200:
 * ```json
 * { "accepted": 2, "errors": [] }
 * ```
 */
async function handleTopupPreauth(
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

  const body = req.body as Record<string, unknown> | undefined;
  const rawSlots = body?.["slots"];
  if (!Array.isArray(rawSlots) || rawSlots.length === 0) {
    res.status(400).json({ error: "Missing required field: slots (non-empty array)" });
    return;
  }

  let accepted = 0;
  const errors: string[] = [];

  for (const rawSlot of rawSlots) {
    if (!rawSlot || typeof rawSlot !== "object") {
      errors.push("invalid slot (not an object)");
      continue;
    }
    const slot = rawSlot as Record<string, unknown>;
    const nonce = slot["nonce"];
    const amountPtonRaw = slot["amountPton"];
    const validAfterRaw = slot["validAfter"];
    const validBeforeRaw = slot["validBefore"];
    const v = slot["v"];
    const r = slot["r"];
    const s = slot["s"];

    if (
      typeof nonce !== "string" ||
      (typeof amountPtonRaw !== "string" && typeof amountPtonRaw !== "number") ||
      typeof validAfterRaw !== "number" ||
      typeof validBeforeRaw !== "number" ||
      typeof v !== "number" ||
      typeof r !== "string" ||
      typeof s !== "string"
    ) {
      errors.push(`slot nonce=${nonce}: missing or invalid field`);
      continue;
    }

    let amountPton: bigint;
    try {
      amountPton = BigInt(amountPtonRaw);
    } catch {
      errors.push(`slot nonce=${nonce}: amountPton is not a valid bigint string`);
      continue;
    }

    try {
      await depositPreauthSlot(db, {
        wallet: identity.wallet,
        nonce: nonce as Hex,
        amountPton,
        validAfter: new Date(validAfterRaw * 1000),
        validBefore: new Date(validBeforeRaw * 1000),
        v,
        r: r as Hex,
        s: s as Hex,
      });
      accepted++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "store failed";
      errors.push(`slot nonce=${nonce}: ${message}`);
    }
  }

  res.status(200).json({ accepted, errors });
}

// ---------------------------------------------------------------------------
// GET /v1/topup/status
// ---------------------------------------------------------------------------

/**
 * Return the next available preauth slot for the caller's wallet.
 *
 * Response 200:
 * ```json
 * {
 *   "slot": {
 *     "nonce": "0x...", "amountPton": "...",
 *     "validAfter": "...", "validBefore": "..."
 *   }
 * }
 * ```
 * or `{ "slot": null }` when none are available.
 */
async function handleTopupStatus(
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

  const slot = await nextAvailableSlot(db, identity.wallet, new Date());

  if (!slot) {
    res.status(200).json({ slot: null });
    return;
  }

  res.status(200).json({
    slot: {
      nonce: slot.nonce,
      amountPton: slot.amountPton.toString(),
      validAfter: slot.validAfter.toISOString(),
      validBefore: slot.validBefore.toISOString(),
    },
  });
}

// ---------------------------------------------------------------------------
// POST /v1/topup/revoke
// ---------------------------------------------------------------------------

/**
 * Poison (invalidate) a preauth slot by nonce.
 *
 * Body:
 * ```json
 * { "nonce": "0x..." }
 * ```
 *
 * Response 200:
 * ```json
 * { "poisoned": true, "nonce": "0x..." }
 * ```
 */
async function handleTopupRevoke(
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

  const body = req.body as Record<string, unknown> | undefined;
  const nonce = body?.["nonce"];
  if (typeof nonce !== "string" || !nonce) {
    res.status(400).json({ error: "Missing required field: nonce" });
    return;
  }

  try {
    await markPoisoned(db, identity.wallet, nonce as Hex);
    res.status(200).json({ poisoned: true, nonce });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "revoke failed";
    if (message.includes("not available")) {
      res.status(404).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
}

// ---------------------------------------------------------------------------
// GET /v1/quote/:id (debug)
// ---------------------------------------------------------------------------

/**
 * Debug endpoint — fetch a stored quote by ID.
 * Only returns the quote if it belongs to the authenticated wallet.
 *
 * Response 200:
 * ```json
 * { "topupId": "...", "amountPton": "...", "amountUsd": "...", "tonUsd": "...", "expiresAt": "..." }
 * ```
 */
async function handleGetQuote(
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

  const id = req.params?.["id"];
  if (!id) {
    res.status(400).json({ error: "Missing quote ID in path." });
    return;
  }

  const rows = await db
    .select()
    .from(topupQuotes)
    .where(eq(topupQuotes.id, id));

  if (rows.length === 0) {
    res.status(404).json({ error: "Quote not found." });
    return;
  }

  const row = rows[0]!;
  if (row.wallet.toLowerCase() !== identity.wallet.toLowerCase()) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  res.status(200).json({
    topupId: row.id,
    wallet: row.wallet,
    amountPton: row.amountPton.toString(),
    amountUsd: row.amountUsd,
    tonUsd: row.tonUsd,
    expiresAt: row.expiresAt.toISOString(),
    consumed: row.consumedAt !== null,
  });
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const topupRoutes: Route[] = [
  {
    type: "GET",
    path: "/v1/topup/info",
    rawPath: true,
    name: "billing-topup-info",
    handler: handleTopupInfo,
  },
  {
    type: "POST",
    path: "/v1/topup/quote",
    rawPath: true,
    name: "billing-topup-quote",
    handler: handleTopupQuote,
  },
  {
    type: "POST",
    path: "/v1/topup/settle",
    rawPath: true,
    name: "billing-topup-settle",
    handler: handleTopupSettle,
  },
  {
    type: "POST",
    path: "/v1/topup/preauth",
    rawPath: true,
    name: "billing-topup-preauth",
    handler: handleTopupPreauth,
  },
  {
    type: "GET",
    path: "/v1/topup/status",
    rawPath: true,
    name: "billing-topup-status",
    handler: handleTopupStatus,
  },
  {
    type: "POST",
    path: "/v1/topup/revoke",
    rawPath: true,
    name: "billing-topup-revoke",
    handler: handleTopupRevoke,
  },
  {
    type: "GET",
    path: "/v1/quote/:id",
    rawPath: true,
    name: "billing-quote-debug",
    handler: handleGetQuote,
  },
];
