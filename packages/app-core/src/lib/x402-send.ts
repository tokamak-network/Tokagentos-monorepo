/**
 * x402 client helper — send a chat completion through `/v1/messages` and,
 * when the proxy answers 402, drive the EIP-3009 sign + retry dance so the
 * call lands with a valid X-PAYMENT header.
 *
 * Use when the user has NOT configured a billing API key (`sk-ai-*`).
 * The user pays per-call in PTON, signed by their browser wallet.
 *
 * Architecture:
 *   1. POST /v1/messages (Anthropic-shape body) without X-PAYMENT.
 *   2. Proxy returns 402 with x402 envelope (quoteId, vault, pton, domain,
 *      maxAmountRequired).
 *   3. Caller's `onSign` callback signs TransferWithAuthorization via the
 *      user's wallet (injected via getEthersSigner() in TopupView pattern).
 *   4. Helper re-sends with X-PAYMENT header (base64-JSON envelope).
 *   5. Returns the 200 body. The proxy refunds any over-quote asynchronously.
 *
 * The signing callback is passed in (not embedded) so callers can:
 *   - Surface a "Sign to pay X PTON" modal,
 *   - Skip wallet prompts in tests by passing a mock signer,
 *   - Reject the dance cleanly on user cancel.
 */

import {
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  buildTransferWithAuthMessage,
  decomposeSignature,
} from "../components/pages/billing/eip712-utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Anthropic-style /v1/messages request body. */
export interface X402MessagesRequest {
  model: string;
  max_tokens: number;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string | Array<{ type: string; [k: string]: unknown }>;
  }>;
  [extra: string]: unknown;
}

/** EIP-712 domain — comes from the proxy in the 402 envelope. */
export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: `0x${string}`;
}

/** Shape the proxy returns in the 402 body (mirrors x402-rs spec). */
export interface X402Quote {
  x402Version: number;
  accepts: Array<{
    scheme: "exact";
    network: string; // e.g. "chain-1"
    /** atto-PTON, decimal string */
    maxAmountRequired: string;
    /** Vault address — `to` of the EIP-3009 authorization */
    payTo: `0x${string}`;
    /** PTON address — the `verifyingContract` */
    asset: `0x${string}`;
    extra: {
      quoteId: string;
      domain: Eip712Domain;
      inputTokens?: number;
      maxOutputTokens?: number;
    };
  }>;
}

/**
 * What the helper asks the caller to do when it needs a signature.
 * Caller hands back the raw hex (0x + 130 chars) from `signer.signTypedData`.
 */
export interface SignTypedDataRequest {
  domain: Eip712Domain;
  types: typeof TRANSFER_WITH_AUTHORIZATION_TYPES;
  message: Record<string, unknown>;
  /** Wallet address that will sign — passed back to the proxy as `from`. */
  fromAddress: `0x${string}`;
  /** Approximate USD cost the caller may display in a confirm modal. */
  preview: {
    amountAttoPton: bigint;
    payTo: `0x${string}`;
    quoteId: string;
  };
}

export type SignTypedDataFn = (req: SignTypedDataRequest) => Promise<string>;

/** Errors users can act on. The helper throws subclasses of this. */
export class X402Error extends Error {
  constructor(message: string, public readonly code: X402ErrorCode) {
    super(message);
    this.name = "X402Error";
  }
}

export type X402ErrorCode =
  | "no_402_returned"
  | "envelope_parse_failed"
  | "user_rejected"
  | "signature_invalid"
  | "settle_rejected"
  | "upstream_failed"
  | "unknown";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SendX402MessageInput {
  /** Base URL of the gateway (e.g. `http://localhost:3000` or same-origin `""`). */
  proxyBase: string;
  /** The chat request body, Anthropic-style. */
  request: X402MessagesRequest;
  /** Wallet signing callback — caller integrates UI prompts here. */
  signTypedData: SignTypedDataFn;
  /** Wallet's `from` address (must match the active signer). */
  fromAddress: `0x${string}`;
  /** Optional fetch override — useful in tests. */
  fetchImpl?: typeof fetch;
  /** Optional AbortSignal. */
  signal?: AbortSignal;
}

export interface SendX402MessageResult {
  /** The model response body (Anthropic-shape, what the proxy proxies through). */
  body: unknown;
  /** Useful per-call billing headers exposed by the proxy. */
  billing: {
    paymentTxHash: string | null;
    quoteId: string | null;
    actualPton: string | null;
    refundedPton: string | null;
    feePton: string | null;
    creditsBalance: string | null;
    marginBps: string | null;
  };
}

/**
 * Drive the full x402 dance. Throws X402Error on any failure mode the caller
 * needs to surface differently.
 */
export async function sendX402Message(
  input: SendX402MessageInput,
): Promise<SendX402MessageResult> {
  const fetchFn = input.fetchImpl ?? fetch;
  const url = `${input.proxyBase.replace(/\/+$/, "")}/v1/messages`;

  // ---- 1. Probe with no payment to get a fresh 402 quote ----
  const probe = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.request),
    signal: input.signal,
  });

  if (probe.status !== 402) {
    // Proxy responded with something else — e.g. 200 because the wallet
    // already has prepaid credit, or 400 for an invalid model. Either way the
    // x402 dance is not appropriate; let the caller handle the raw response.
    throw new X402Error(
      `Expected 402 on probe, got ${probe.status}. Body: ${await safeText(probe)}`,
      "no_402_returned",
    );
  }

  const quote: X402Quote = await probe.json().catch(() => ({}) as X402Quote);
  const accept = quote.accepts?.[0];
  if (!accept?.payTo || !accept.asset || !accept.extra?.domain) {
    throw new X402Error(
      `402 envelope malformed: ${JSON.stringify(quote).slice(0, 200)}`,
      "envelope_parse_failed",
    );
  }

  // ---- 2. Build EIP-3009 message ----
  const valueAttoPton = BigInt(accept.maxAmountRequired);
  const nonceHex = randomBytes32Hex();
  const now = Math.floor(Date.now() / 1000);
  // Generous validity windows — the proxy enforces a max ~5min skew at settle
  // time, so a wide bracket here just absorbs RPC clock differences.
  const validAfterUnix = Math.max(0, now - 300);
  const validBeforeUnix = now + 300;

  const message = buildTransferWithAuthMessage({
    from: input.fromAddress,
    to: accept.payTo,
    valueAttoPton,
    validAfterUnix,
    validBeforeUnix,
    nonceHex,
  });

  // ---- 3. Ask the caller's UI to drive the wallet ----
  let rawSig: string;
  try {
    rawSig = await input.signTypedData({
      domain: accept.extra.domain,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      message,
      fromAddress: input.fromAddress,
      preview: {
        amountAttoPton: valueAttoPton,
        payTo: accept.payTo,
        quoteId: accept.extra.quoteId,
      },
    });
  } catch (err) {
    if (isUserRejection(err)) {
      throw new X402Error("Signing rejected by user.", "user_rejected");
    }
    throw new X402Error(
      `Signing failed: ${err instanceof Error ? err.message : String(err)}`,
      "unknown",
    );
  }

  let sig: { v: number; r: `0x${string}`; s: `0x${string}` };
  try {
    sig = decomposeSignature(rawSig);
  } catch (err) {
    throw new X402Error(
      `Signature decomposition failed: ${err instanceof Error ? err.message : String(err)}`,
      "signature_invalid",
    );
  }

  // ---- 4. Build X-PAYMENT envelope and retry ----
  const payment = {
    x402Version: 1,
    scheme: "exact" as const,
    network: accept.network,
    payload: {
      signature: { v: sig.v, r: sig.r, s: sig.s },
      authorization: {
        from: input.fromAddress,
        to: accept.payTo,
        value: valueAttoPton.toString(),
        validAfter: String(validAfterUnix),
        validBefore: String(validBeforeUnix),
        nonce: nonceHex,
      },
      quoteId: accept.extra.quoteId,
    },
  };
  const xPayment = base64EncodeJson(payment);

  const retry = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": xPayment,
    },
    body: JSON.stringify(input.request),
    signal: input.signal,
  });

  if (retry.status === 402) {
    throw new X402Error(
      `Settle rejected: ${await safeText(retry)}`,
      "settle_rejected",
    );
  }
  if (retry.status === 502) {
    throw new X402Error(
      `Upstream model failed (proxy will auto-refund): ${await safeText(retry)}`,
      "upstream_failed",
    );
  }
  if (!retry.ok) {
    throw new X402Error(
      `Retry failed: HTTP ${retry.status} ${await safeText(retry)}`,
      "unknown",
    );
  }

  const body = await retry.json().catch(() => null);
  return {
    body,
    billing: {
      paymentTxHash: retry.headers.get("x-payment-tx"),
      quoteId: retry.headers.get("x-quote-id"),
      actualPton: retry.headers.get("x-actual-pton"),
      refundedPton: retry.headers.get("x-refund-pton"),
      feePton: retry.headers.get("x-fee-pton"),
      creditsBalance: retry.headers.get("x-credits-balance"),
      marginBps: retry.headers.get("x-margin-bps"),
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomBytes32Hex(): `0x${string}` {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return (`0x` +
    Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as `0x${string}`;
}

function base64EncodeJson(obj: unknown): string {
  const json = JSON.stringify(obj);
  // btoa is fine for ASCII; the payment envelope is ASCII-safe by construction.
  if (typeof btoa === "function") return btoa(json);
  // Node fallback (used in tests under vitest).
  return Buffer.from(json, "utf8").toString("base64");
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 400);
  } catch {
    return `<no body, status ${res.status}>`;
  }
}

function isUserRejection(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("rejected") ||
    m.includes("denied") ||
    m.includes("cancelled") ||
    m.includes("canceled") ||
    m.includes("action_rejected") ||
    m.includes("user denied")
  );
}
