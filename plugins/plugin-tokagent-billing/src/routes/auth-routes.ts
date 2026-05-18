/**
 * Auth routes (Phase 6).
 *
 * Implements the SIWE-style wallet-authentication flow:
 *
 *   GET  /v1/auth/nonce   — issue a one-time nonce + EIP-712 envelope.
 *   POST /v1/auth/login   — verify the signed envelope; issue a JWT session.
 *
 * Ported from llm-api-gateway/proxy/src/routes.ts auth section.
 * Uses `rawPath: true` so routes mount at the exact paths without the
 * plugin-name prefix (Decision Z32).
 *
 * Both routes return 503 when billing is disabled (BILLING_ENABLED=false).
 */

import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "@tokagentos/core";
import type { Address, Hex } from "viem";
import { getAddress } from "viem";
import {
  issueNonce,
  consumeNonce,
  issueSession,
  verifySIWESignature,
  type SIWEEnvelope,
} from "@tokagentos/billing";
import { getBillingState, isBillingStateInitialized } from "../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function billingUnavailable(res: RouteResponse): void {
  res.status(503).json({ error: "Billing service unavailable." });
}

function header(req: RouteRequest, name: string): string | null {
  const raw = req.headers?.[name.toLowerCase()];
  if (!raw) return null;
  const val = Array.isArray(raw) ? raw[0] : raw;
  return typeof val === "string" && val.trim() ? val.trim() : null;
}

// ---------------------------------------------------------------------------
// GET /v1/auth/nonce
// ---------------------------------------------------------------------------

/**
 * Issue a one-time SIWE nonce.
 *
 * Query params:
 *   - `wallet`  — EIP-55 wallet address (required).
 *   - `chainId` — integer chain ID for EIP-712 domain (required).
 *
 * Response 200:
 *   ```json
 *   {
 *     "nonce": "0xabc...",
 *     "envelope": { "wallet": "0x...", "nonce": "0x...", "issuedAt": ..., "expiresAt": ... }
 *   }
 *   ```
 */
async function handleGetNonce(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { db, config } = getBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const rawWallet = req.query?.["wallet"];
  const rawChainId = req.query?.["chainId"];

  if (typeof rawWallet !== "string" || !rawWallet) {
    res.status(400).json({ error: "Missing required query param: wallet" });
    return;
  }
  if (typeof rawChainId !== "string" || !rawChainId) {
    res.status(400).json({ error: "Missing required query param: chainId" });
    return;
  }

  let wallet: Address;
  try {
    wallet = getAddress(rawWallet) as Address;
  } catch {
    res.status(400).json({ error: `Invalid wallet address: ${rawWallet}` });
    return;
  }

  const chainId = parseInt(rawChainId, 10);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    res.status(400).json({ error: `Invalid chainId: ${rawChainId}` });
    return;
  }

  const now = Date.now();
  const ttlMs = config.authLoginNonceTtlMs;
  const envelope: SIWEEnvelope = {
    wallet,
    nonce: "0x0000000000000000000000000000000000000000000000000000000000000000", // placeholder
    issuedAt: now,
    expiresAt: now + ttlMs,
  };

  // issueNonce stores the envelope and returns the actual nonce hex.
  const nonce = await issueNonce(db, envelope, ttlMs);

  // Return the envelope with the real nonce filled in.
  const fullEnvelope: SIWEEnvelope = { ...envelope, nonce: nonce as Hex };

  res.status(200).json({ nonce, envelope: fullEnvelope });
}

// ---------------------------------------------------------------------------
// POST /v1/auth/nonce — dashboard-compatible variant
// ---------------------------------------------------------------------------

/**
 * Issue a one-time SIWE nonce — gateway-compatible POST shape.
 *
 * Wire-compatible with llm-api-gateway/proxy/src/server.ts POST /v1/auth/nonce
 * so the operator dashboard (migrated as a static SPA) works against the
 * tokagent-billing plugin without modification.
 *
 * Body: `{ wallet: string }`
 *
 * Response 200:
 *   ```json
 *   {
 *     "wallet": "0x...",
 *     "nonce":  "0x...",
 *     "issuedAt": 1700000000000,
 *     "expiresAt": 1700000300000,
 *     "domain": { "name": "ai-proxy", "version": "1", "chainId": 1 },
 *     "primaryType": "LoginAuth",
 *     "types": {
 *       "LoginAuth": [
 *         { "name": "wallet", "type": "address" },
 *         { "name": "nonce", "type": "bytes32" },
 *         { "name": "issuedAt", "type": "uint256" },
 *         { "name": "expiresAt", "type": "uint256" }
 *       ]
 *     }
 *   }
 *   ```
 */
async function handlePostNonce(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { db, config } = getBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const body = req.body as { wallet?: unknown } | undefined;
  const rawWallet = body?.wallet;
  if (typeof rawWallet !== "string" || !rawWallet) {
    res.status(400).json({ error: "Missing required body field: wallet" });
    return;
  }

  let wallet: Address;
  try {
    wallet = getAddress(rawWallet) as Address;
  } catch {
    res.status(400).json({ error: `Invalid wallet address: ${rawWallet}` });
    return;
  }

  const now = Date.now();
  const ttlMs = config.authLoginNonceTtlMs;
  const envelope: SIWEEnvelope = {
    wallet,
    nonce:
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    issuedAt: now,
    expiresAt: now + ttlMs,
  };
  const nonce = await issueNonce(db, envelope, ttlMs);

  res.status(200).json({
    wallet,
    nonce,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    domain: {
      name: "ai-proxy",
      version: "1",
      chainId: config.chainId,
    },
    primaryType: "LoginAuth",
    types: {
      LoginAuth: [
        { name: "wallet", type: "address" },
        { name: "nonce", type: "bytes32" },
        { name: "issuedAt", type: "uint256" },
        { name: "expiresAt", type: "uint256" },
      ],
    },
  });
}

// ---------------------------------------------------------------------------
// POST /v1/auth/login
// ---------------------------------------------------------------------------

/**
 * Verify a signed SIWE envelope and issue a JWT session token.
 *
 * Body:
 *   ```json
 *   {
 *     "wallet":    "0x...",
 *     "nonce":     "0x...",
 *     "signature": "0x...",
 *     "chainId":   1
 *   }
 *   ```
 *
 * Response 200:
 *   ```json
 *   { "token": "<jwt>" }
 *   ```
 */
async function handleLogin(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { db, config } = getBillingState();
  if (!config.enabled) return billingUnavailable(res);
  if (!config.authSecret) return billingUnavailable(res);

  const body = req.body as Record<string, unknown> | undefined;

  const rawWallet = body?.["wallet"];
  const rawNonce = body?.["nonce"];
  const rawSignature = body?.["signature"];
  const rawChainId = body?.["chainId"];

  if (typeof rawWallet !== "string" || !rawWallet) {
    res.status(400).json({ error: "Missing required field: wallet" });
    return;
  }
  if (typeof rawNonce !== "string" || !rawNonce) {
    res.status(400).json({ error: "Missing required field: nonce" });
    return;
  }
  if (typeof rawSignature !== "string" || !rawSignature) {
    res.status(400).json({ error: "Missing required field: signature" });
    return;
  }
  // chainId is optional — if omitted, fall back to the server's configured
  // chain. Dashboard SPA doesn't send it; matches the gateway's behavior.
  const chainId =
    typeof rawChainId === "number" && Number.isInteger(rawChainId) && rawChainId > 0
      ? rawChainId
      : config.chainId;
  if (chainId <= 0) {
    res.status(400).json({ error: "Server has no configured chainId." });
    return;
  }

  let wallet: Address;
  try {
    wallet = getAddress(rawWallet) as Address;
  } catch {
    res.status(400).json({ error: `Invalid wallet address: ${rawWallet}` });
    return;
  }

  // Consume the nonce (atomic delete-and-return; returns null if expired/missing).
  const storedEnvelope = await consumeNonce(db, rawNonce, new Date());
  if (!storedEnvelope) {
    res.status(401).json({ error: "Nonce not found or expired." });
    return;
  }

  const envelope = storedEnvelope as SIWEEnvelope;

  // Guard: wallet in body must match the wallet the nonce was issued for.
  if (getAddress(envelope.wallet).toLowerCase() !== wallet.toLowerCase()) {
    res.status(401).json({ error: "Wallet mismatch." });
    return;
  }

  // Verify the EIP-712 signature.
  try {
    await verifySIWESignature(envelope, rawSignature as Hex, chainId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "signature verification failed";
    res.status(401).json({ error: message });
    return;
  }

  // Issue JWT session. Include `exp` and `wallet` in the response — the
  // dashboard SPA's saveSession() expects `{ token, exp, wallet }`.
  const token = await issueSession(wallet, config.authSecret, config.authSessionTtlMs);
  const exp = Math.floor((Date.now() + config.authSessionTtlMs) / 1000);
  res.status(200).json({ token, exp, wallet });
}

// ---------------------------------------------------------------------------
// GET /v1/billing/status (Decision Z40)
// ---------------------------------------------------------------------------

/**
 * Unauthenticated endpoint — reports whether billing is enabled.
 *
 * Used by the UI at boot to decide whether to render the Billing sidebar entry.
 * Returns `{ enabled: false }` when the billing plugin is not loaded or
 * BILLING_ENABLED=false, so it is always safe to call without auth.
 *
 * Response 200:
 * ```json
 * { "enabled": true }
 * ```
 */
async function handleBillingStatus(
  _req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) {
    res.status(200).json({ enabled: false });
    return;
  }
  const { config } = getBillingState();
  res.status(200).json({ enabled: config.enabled });
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const authRoutes: Route[] = [
  {
    type: "GET",
    path: "/v1/auth/nonce",
    rawPath: true,
    public: true,
    name: "billing-auth-nonce",
    handler: handleGetNonce,
  },
  {
    // POST variant — wire-compatible with the gateway dashboard SPA.
    type: "POST",
    path: "/v1/auth/nonce",
    rawPath: true,
    public: true,
    name: "billing-auth-nonce-post",
    handler: handlePostNonce,
  },
  {
    type: "POST",
    path: "/v1/auth/login",
    rawPath: true,
    public: true,
    name: "billing-auth-login",
    handler: handleLogin,
  },
  {
    type: "GET",
    path: "/v1/billing/status",
    rawPath: true,
    public: true,
    name: "billing-status",
    handler: handleBillingStatus,
  },
];
