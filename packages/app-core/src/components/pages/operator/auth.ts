/**
 * Operator console — SIWE bearer-token sign-in for the billing gateway.
 *
 * The gateway's `/v1/*` read + write routes are auth-gated behind a JWT BEARER
 * token (NOT cookie auth). This module ports the dashboard SIWE flow
 * (plugin-tokagent-billing dashboard/app.js siweLogin L556-610 + session
 * L326-362) so the operator's x402 surface can authenticate the connected
 * funding wallet and attach `Authorization: Bearer <token>` to its `/v1` calls.
 *
 * The session is stored under the SAME sessionStorage key the billing dashboard
 * uses ("ai-proxy-dashboard:session"), so a session minted in either surface is
 * shared with the other within the tab.
 *
 * Self-contained: `window.ethereum` (eth_chainId, eth_signTypedData_v4) + same-
 * origin `fetch` only. NO ethers / app-core / external imports (reuses
 * SignatureRejectedError from the operator-local ../eip712 sibling).
 */
import { useSyncExternalStore } from "react";
import { proxyBase } from "./chain-config";
import { SignatureRejectedError } from "./eip712";

// ── session storage ─────────────────────────────────────────────────────────

/**
 * Shared with the billing dashboard (app.js L143). Reusing the exact key means a
 * session minted by either surface authenticates the other within the tab.
 */
const SESSION_KEY = "ai-proxy-dashboard:session";

export interface GatewaySession {
  /** JWT bearer token sent as `Authorization: Bearer <token>`. */
  token: string;
  /** Expiry, UNIX SECONDS (server-issued). */
  exp: number;
  /** The wallet this session authenticates. */
  wallet: string;
}

/**
 * Load + validate the stored session. Mirrors app.js loadSession (L328-339):
 * requires token/exp/wallet, and treats a session expiring within 5s
 * (`exp*1000 < now + 5000`) as already expired → null.
 */
export function loadSession(): GatewaySession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<GatewaySession> | null;
    if (!obj?.token || !obj?.exp || !obj?.wallet) return null;
    if (obj.exp * 1000 < Date.now() + 5_000) return null; // expiring soon
    return obj as GatewaySession;
  } catch {
    return null;
  }
}

/** Persist (or clear, on null) the session and notify subscribers. */
export function saveSession(s: GatewaySession | null): void {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* sessionStorage unavailable (private mode / SSR) — ignore */
  }
  notify();
}

/** Bearer token for an authed `/v1` request, or null when not signed in. */
export function getToken(): string | null {
  return loadSession()?.token ?? null;
}

/** True iff a valid, non-expiring session is stored. */
export function isSignedIn(): boolean {
  return loadSession() !== null;
}

/** The wallet of the current session, or null. */
export function signedInWallet(): string | null {
  return loadSession()?.wallet ?? null;
}

/** Clear the session (sign out) and notify subscribers. */
export function signOut(): void {
  saveSession(null);
}

// ── pub/sub (re-render hook) ─────────────────────────────────────────────────

const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* a bad subscriber must not break the others */
    }
  }
}

/** Subscribe to auth changes (sign-in / sign-out). Returns an unsubscribe fn. */
export function subscribeAuth(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// ── React hook ───────────────────────────────────────────────────────────────

/**
 * Subscribe a component to the gateway session. Re-renders whenever the user
 * signs in or out (saveSession/signOut → notify → subscribers). The snapshot is
 * a cached string so `useSyncExternalStore` doesn't loop on referential
 * inequality.
 */
let authSnapshot: { signedIn: boolean; wallet: string | null } = {
  signedIn: isSignedIn(),
  wallet: signedInWallet(),
};
let authSnapshotKey = `${authSnapshot.signedIn}:${authSnapshot.wallet}`;

function getAuthSnapshot(): { signedIn: boolean; wallet: string | null } {
  const wallet = signedInWallet();
  const signedIn = wallet !== null;
  const key = `${signedIn}:${wallet}`;
  if (key !== authSnapshotKey) {
    authSnapshotKey = key;
    authSnapshot = { signedIn, wallet };
  }
  return authSnapshot;
}

const serverAuthSnapshot = { signedIn: false, wallet: null };

export function useAuth(): { signedIn: boolean; wallet: string | null } {
  return useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    () => serverAuthSnapshot,
  );
}

// ── wallet bridge (window.ethereum only) ─────────────────────────────────────

type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
};
function injectedWallet(): Eip1193 | undefined {
  return (window as unknown as { ethereum?: Eip1193 }).ethereum;
}

// ── SIWE login ───────────────────────────────────────────────────────────────

interface NonceResponse {
  wallet: string;
  nonce: string;
  /** MILLISECONDS (server-issued). */
  issuedAt: number;
  /** MILLISECONDS (server-issued). */
  expiresAt: number;
  domain: { name: string; version: string; chainId: number };
  primaryType: string;
  types: Record<string, { name: string; type: string }[]>;
}

/**
 * SIWE sign-in for `address` → a bearer-token session. Ports app.js
 * siweLogin (L556-610) EXACTLY, including the seconds/ms split that is required
 * for the signature to verify:
 *
 *   • the SIGNED MESSAGE uses issuedAt/expiresAt in SECONDS
 *     (`Math.floor(ms / 1000)`)
 *   • the LOGIN BODY uses the RAW MILLISECONDS issuedAt/expiresAt
 *
 * The typed-data domain chainId is overridden with the WALLET's active chain
 * (a wallet refuses to sign typed data whose domain.chainId != its active
 * chain), and that same chainId is passed to /v1/auth/login, which verifies
 * against the supplied chainId.
 */
export async function siweLogin(address: string): Promise<GatewaySession> {
  const eth = injectedWallet();
  if (!eth) {
    throw new Error(
      "No Web3 wallet detected. Install MetaMask or another browser wallet.",
    );
  }

  // (a) Request a nonce + EIP-712 envelope for this wallet.
  const nonceRes = await postJson<NonceResponse>("/v1/auth/nonce", {
    wallet: address,
  });

  // (b) Read the wallet's active chainId (fall back to the envelope's chain).
  let activeChainId = nonceRes.domain.chainId;
  try {
    const hex = (await eth.request({ method: "eth_chainId" })) as string;
    if (typeof hex === "string") {
      activeChainId = Number.parseInt(hex, 16) || activeChainId;
    }
  } catch {
    // No eth_chainId — keep the envelope's configured chain.
  }

  // (c) Build the typed data. Domain chainId is the WALLET's active chain;
  //     EIP712Domain here has NO verifyingContract; the MESSAGE uses SECONDS.
  const typedData = {
    domain: { ...nonceRes.domain, chainId: activeChainId },
    primaryType: nonceRes.primaryType,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
      ],
      ...nonceRes.types,
    },
    message: {
      wallet: address,
      nonce: nonceRes.nonce,
      issuedAt: Math.floor(nonceRes.issuedAt / 1000), // SECONDS in the message
      expiresAt: Math.floor(nonceRes.expiresAt / 1000), // SECONDS in the message
    },
  };

  // (d) Sign the typed data.
  let signature: string;
  try {
    signature = (await eth.request({
      method: "eth_signTypedData_v4",
      params: [address, JSON.stringify(typedData)],
    })) as string;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: number } | null)?.code;
    if (code === 4001 || /reject|denied|cancel|ACTION_REJECTED/i.test(msg)) {
      throw new SignatureRejectedError(
        "Sign-in rejected — no session was created.",
      );
    }
    throw err instanceof Error ? err : new Error(msg);
  }

  // (e) Exchange the signature for a session. The login body uses the RAW
  //     MILLISECONDS issuedAt/expiresAt (NOT the seconds from the message).
  const loginRes = await postJson<GatewaySession>("/v1/auth/login", {
    wallet: address,
    nonce: nonceRes.nonce,
    issuedAt: nonceRes.issuedAt, // raw MILLISECONDS in the body
    expiresAt: nonceRes.expiresAt, // raw MILLISECONDS in the body
    signature,
    chainId: activeChainId,
  });
  if (!loginRes?.token) {
    throw new Error("Sign-in failed — the gateway did not return a token.");
  }

  // (f) Persist + broadcast.
  saveSession(loginRes);
  return loginRes;
}

/**
 * JSON POST to the gateway with a clear error on HTTP failure. Prefixes
 * PROXY_BASE so SIWE auth targets the SAME gateway the rest of the operator
 * (and the billing dashboard) uses — signing in against the operator's own
 * origin would mint a session the real gateway never honors. app.js routes
 * /v1/auth/* through api() → PROXY too.
 */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const base = await proxyBase();
  const reqInit: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  if (!base) reqInit.credentials = "include";
  const res = await fetch(`${base}${path}`, reqInit);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { error?: unknown };
      if (typeof j?.error === "string") detail = j.error;
    } catch {
      /* non-JSON body — keep statusText */
    }
    throw new Error(`${path} → ${res.status}${detail ? ` (${detail})` : ""}`);
  }
  return (await res.json()) as T;
}
