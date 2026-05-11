/**
 * JWT session helpers for the SIWE-style wallet-auth flow (Phase 6).
 *
 * Decision Z29: Replace the source's hand-rolled HMAC token (base64url payload
 * + hex(HMAC-SHA256)) with a standard JWT via `jose`. The wire format is
 * HS256 (HMAC-SHA256). The secret is derived from BILLING_AUTH_SECRET.
 *
 * Also re-exports `verifySIWESignature` — the EIP-712 typed-data verifier
 * used by the /v1/auth/login route handler.
 *
 * Ported from llm-api-gateway/proxy/src/auth.ts:163-180 (EIP-712 portion).
 * HMAC session portions are discarded (replaced by JWT).
 */

import { SignJWT, jwtVerify } from "jose";
import {
  verifyTypedData,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import { LOGIN_AUTH_TYPES, loginAuthDomain } from "../chain/typed-data.js";

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

export interface SessionClaims {
  wallet: Address;
  iat: number;
  exp: number;
}

const ALG = "HS256";

function secretKey(authSecret: string): Uint8Array {
  return new TextEncoder().encode(authSecret);
}

/**
 * Issue a JWT session token for `wallet`.
 *
 * The token is HS256-signed with `authSecret`. Payload carries `wallet`
 * (lowercased) in a custom claim so `verifySession` can extract it without
 * knowing the claim layout upfront.
 *
 * @param wallet     - Wallet address (any casing; stored lowercased in token).
 * @param authSecret - BILLING_AUTH_SECRET. Must be non-empty.
 * @param ttlMs      - Token lifetime in milliseconds (e.g. 86_400_000 = 24h).
 */
export async function issueSession(
  wallet: Address,
  authSecret: string,
  ttlMs: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.floor(ttlMs / 1000);
  return new SignJWT({ wallet: wallet.toLowerCase() })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretKey(authSecret));
}

/**
 * Verify a JWT session token and return the wallet address.
 *
 * Returns `null` if the token is missing, malformed, tampered, or expired.
 * Never throws — callers treat null as "unauthenticated".
 */
export async function verifySession(
  token: string,
  authSecret: string,
): Promise<{ wallet: Address } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(authSecret), {
      algorithms: [ALG],
    });
    const raw = payload["wallet"];
    if (typeof raw !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(raw)) {
      return null;
    }
    // Re-checksum so callers always work with canonical EIP-55 form.
    return { wallet: getAddress(raw) as Address };
  } catch {
    // Expired, bad signature, clock drift, malformed — all return null.
    return null;
  }
}

// ---------------------------------------------------------------------------
// EIP-712 SIWE-style login signature verifier
// ---------------------------------------------------------------------------

export interface SIWEEnvelope {
  wallet: Address;
  nonce: Hex;
  /** ms epoch */
  issuedAt: number;
  /** ms epoch */
  expiresAt: number;
}

export class SIWEAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SIWEAuthError";
  }
}

/**
 * Verify an EIP-712 login signature against the stored nonce envelope.
 *
 * This is the server-side counterpart of the client's
 * `eth_signTypedData_v4` call. The `envelope` must be the exact object
 * returned by `/v1/auth/nonce` (stored in `billing_auth_nonces`).
 *
 * Ported from llm-api-gateway/proxy/src/auth.ts:163-180.
 *
 * @param envelope   - The EIP-712 typed data envelope (nonce + timestamps).
 * @param signature  - Hex signature from the client.
 * @param chainId    - Chain ID used for the EIP-712 domain (anti-replay).
 * @throws SIWEAuthError(401, ...) if verification fails.
 */
export async function verifySIWESignature(
  envelope: SIWEEnvelope,
  signature: Hex,
  chainId: number,
): Promise<void> {
  const wallet = getAddress(envelope.wallet) as Address;

  const ok = await verifyTypedData({
    address: wallet,
    domain: loginAuthDomain(chainId),
    types: LOGIN_AUTH_TYPES,
    primaryType: "LoginAuth",
    message: {
      wallet,
      nonce: envelope.nonce,
      // EIP-712 uint256 — pass as bigint for viem's hashing path.
      issuedAt: BigInt(Math.floor(envelope.issuedAt / 1000)),
      expiresAt: BigInt(Math.floor(envelope.expiresAt / 1000)),
    },
    signature,
  });

  if (!ok) {
    throw new SIWEAuthError(401, "invalid signature");
  }
}
