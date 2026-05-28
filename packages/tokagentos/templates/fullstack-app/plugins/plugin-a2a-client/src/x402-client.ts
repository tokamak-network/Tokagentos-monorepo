/**
 * Generic x402 client middleware. Sits in front of any outbound HTTP call
 * and handles the HTTP 402 challenge-response loop. Knows nothing about
 * A2A or any other protocol on top — reusable for paid REST APIs, paid
 * MCP servers, etc.
 *
 * Flow on a paid endpoint:
 *   1. Issue the original request
 *   2. On 200 → return
 *   3. On 402 → parse `WWW-Authenticate: X402 scheme=eip3009 asset=PTON
 *      amount=0.05 recipient=0x... validBefore=...` AND the body's
 *      `paymentRequirements` JSON (whichever the server uses)
 *   4. Check caps: per-call cap + session cap. Refuse cleanly if exceeded.
 *   5. Compose a signed EIP-3009 TransferWithAuthorization voucher
 *   6. Retry with `X-Payment: <base64-encoded-voucher>`
 *   7. On 2xx → emit X402_PAYMENT event, return
 *   8. On second non-2xx → throw X402Error("retry-failed")
 *
 * Trust model (locked-in for v0.1, per design decision):
 *   - We trust the 2xx response after our X-Payment retry as proof of
 *     settlement. No round-trip to a facilitator. This matches the
 *     existing Tokagent billing rail's trust model: the gateway has
 *     authority to refuse, and a 2xx is the receipt.
 *   - When X402_FACILITATOR_URL is set we'd add a verification round-
 *     trip here. Not implemented in v0.1.
 *
 * Wallet handling:
 *   - The operator private key (TOKAGENT_PRIVATE_KEY / EVM_PRIVATE_KEY)
 *     is used to sign vouchers. It is NEVER serialized into request
 *     bodies, error messages, or logs. Sign in memory, send only the
 *     resulting signature.
 *   - If no wallet is configured, the middleware is in observer-only
 *     mode: 402 responses become X402Error("no-wallet"). No silent skip.
 */

import {
  type Address,
  type Hex,
  parseUnits,
  parseAbi,
  encodeAbiParameters,
  privateKeyToAccount,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed x402 challenge from a 402 response. */
export interface X402Challenge {
  scheme: "eip3009" | (string & {});
  asset: string; // canonical symbol, e.g. "PTON"
  /** Token contract on the settlement chain. */
  assetContract: Address;
  chainId: number;
  amount: bigint; // wei-scaled
  amountDecimals: number;
  amountDisplay: string; // human-readable, e.g. "0.05"
  recipient: Address;
  validAfter: bigint; // EIP-3009 field — usually 0
  validBefore: bigint; // EIP-3009 field — UNIX seconds
  nonce: Hex; // 32-byte nonce supplied by the server
  /** Optional facilitator the server prefers; we ignore in v0.1. */
  facilitatorHint?: string;
}

/** Receipt emitted via runtime.emitEvent("X402_PAYMENT", receipt). */
export interface X402Receipt {
  url: string;
  scheme: string;
  asset: string;
  amount: string; // human-readable
  amountWei: string; // for accurate session-spend accounting
  recipient: Address;
  signedAt: number; // ms
}

export type X402Cause =
  | "no-wallet"
  | "per-call-cap"
  | "session-cap"
  | "challenge-malformed"
  | "unsupported-scheme"
  | "retry-failed";

export class X402Error extends Error {
  constructor(
    message: string,
    public readonly cause: X402Cause,
    public readonly meta: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "X402Error";
  }
}

export interface X402ClientOptions {
  /** Operator private key for signing vouchers. Optional → observer mode. */
  privateKey?: Hex;
  /** Optional facilitator (unused in v0.1; reserved for option (b)). */
  facilitatorUrl?: string;
  /** Refuse any single payment above this (wei-scaled in PTON's decimals). */
  maxPerCall: bigint;
  /** Refuse once cumulative session spend exceeds this (wei-scaled). */
  maxTotal: bigint;
  /** Decimals for the asset (PTON = 18 by convention; verify per-token). */
  assetDecimals: number;
  /** Emitted on every successful payment for UI telemetry. */
  onPaid?: (receipt: X402Receipt) => void;
  /** Emitted when a cap refuses a payment. */
  onCapHit?: (
    cap: "per-call" | "session",
    req: { url: string; amount: bigint; cap: bigint },
  ) => void;
}

// ---------------------------------------------------------------------------
// X402Client
// ---------------------------------------------------------------------------

export class X402Client {
  private readonly account: PrivateKeyAccount | null;
  private spent = 0n;

  constructor(private readonly opts: X402ClientOptions) {
    this.account = opts.privateKey
      ? privateKeyToAccount(opts.privateKey)
      : null;
  }

  /** Cumulative session spend in wei (for UI / debugging). */
  get sessionSpentWei(): bigint {
    return this.spent;
  }

  /**
   * Issue the request. On 402, compose + retry once. On any failure after
   * the retry, throw X402Error("retry-failed"). The middleware never loops
   * more than once — repeated 402 from the same endpoint indicates the
   * server is misconfigured or rejecting our payment, neither of which
   * benefits from blind retries.
   */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const first = await fetch(url, init);
    if (first.status !== 402) return first;

    const challenge = await this.parseChallenge(first, url);
    this.enforceCaps(url, challenge.amount);

    if (!this.account) {
      throw new X402Error(
        `${url} requires payment (${challenge.amountDisplay} ${challenge.asset}) ` +
          `but no operator wallet is configured. Set TOKAGENT_PRIVATE_KEY in .env ` +
          `to enable x402 payments.`,
        "no-wallet",
        { url, asset: challenge.asset, amount: challenge.amountDisplay },
      );
    }

    const paymentHeader = await this.composePayment(challenge);
    const retryInit: RequestInit = {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        "X-Payment": paymentHeader,
      },
    };
    const second = await fetch(url, retryInit);
    if (!second.ok) {
      const bodyPreview = await safePreview(second);
      throw new X402Error(
        `x402 retry failed for ${url}: ${second.status} ${second.statusText}. ${bodyPreview}`,
        "retry-failed",
        {
          url,
          status: second.status,
          statusText: second.statusText,
          bodyPreview,
        },
      );
    }
    // Trust the 2xx as settlement receipt (per design decision).
    this.spent += challenge.amount;
    this.opts.onPaid?.({
      url,
      scheme: challenge.scheme,
      asset: challenge.asset,
      amount: challenge.amountDisplay,
      amountWei: challenge.amount.toString(),
      recipient: challenge.recipient,
      signedAt: Date.now(),
    });
    return second;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Parse a 402 response into a structured X402Challenge.
   *
   * The x402 spec allows either the `WWW-Authenticate` header OR a JSON
   * body to convey requirements. We prefer the body when present (clearer
   * typing) and fall back to header parsing otherwise. Either way, the
   * fields we need are: scheme, asset, assetContract, chainId, amount,
   * amountDecimals, recipient, validAfter, validBefore, nonce.
   */
  private async parseChallenge(
    res: Response,
    url: string,
  ): Promise<X402Challenge> {
    let body: Record<string, unknown> | null = null;
    try {
      const txt = await res.clone().text();
      body = txt.trim().startsWith("{") ? (JSON.parse(txt) as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    const reqs =
      (body?.paymentRequirements as Record<string, unknown> | undefined) ?? body;

    const auth = res.headers.get("www-authenticate") ?? "";
    const headerParts = parseAuthHeader(auth);

    const scheme = String(
      (reqs?.scheme as string | undefined) ?? headerParts.scheme ?? "eip3009",
    ).toLowerCase();
    if (scheme !== "eip3009") {
      throw new X402Error(
        `x402 scheme "${scheme}" is not supported by this client (v0.1 ships eip3009 only).`,
        "unsupported-scheme",
        { url, scheme },
      );
    }

    const asset = String(
      (reqs?.asset as string | undefined) ?? headerParts.asset ?? "PTON",
    );
    const assetContract = requireHex(
      (reqs?.assetContract as string | undefined) ??
        (reqs?.token as string | undefined) ??
        headerParts.assetContract,
      "assetContract",
      url,
    ) as Address;
    const chainId = Number(
      (reqs?.chainId as number | string | undefined) ?? headerParts.chainId ?? 0,
    );
    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw new X402Error(
        `x402 challenge missing chainId (got ${chainId}).`,
        "challenge-malformed",
        { url },
      );
    }
    const amountDecimals = Number(
      (reqs?.amountDecimals as number | string | undefined) ?? this.opts.assetDecimals,
    );
    const amountRaw =
      (reqs?.amount as string | number | undefined) ?? headerParts.amount;
    if (amountRaw === undefined) {
      throw new X402Error(
        "x402 challenge missing amount.",
        "challenge-malformed",
        { url },
      );
    }
    // `amount` may be wei-scaled (bigint string) or human-readable
    // ("0.05"). Detect by presence of a decimal point.
    const amountStr = String(amountRaw);
    const amount = amountStr.includes(".")
      ? parseUnits(amountStr as `${number}`, amountDecimals)
      : BigInt(amountStr);
    const amountDisplay = amountStr.includes(".")
      ? amountStr
      : formatPton(amount, amountDecimals);

    const recipient = requireHex(
      (reqs?.recipient as string | undefined) ??
        (reqs?.payTo as string | undefined) ??
        headerParts.recipient,
      "recipient",
      url,
    ) as Address;
    const validAfter = BigInt(
      (reqs?.validAfter as string | number | undefined) ??
        headerParts.validAfter ??
        0,
    );
    const validBefore = BigInt(
      (reqs?.validBefore as string | number | undefined) ??
        headerParts.validBefore ??
        Math.floor(Date.now() / 1000) + 300, // default: 5 minutes from now
    );
    const nonce = requireHex(
      (reqs?.nonce as string | undefined) ?? headerParts.nonce,
      "nonce",
      url,
    ) as Hex;

    return {
      scheme: "eip3009",
      asset,
      assetContract,
      chainId,
      amount,
      amountDecimals,
      amountDisplay,
      recipient,
      validAfter,
      validBefore,
      nonce,
      facilitatorHint: this.opts.facilitatorUrl,
    };
  }

  /**
   * Enforce per-call + session caps. Throws X402Error on refusal so the
   * outer handler surfaces a clear message to the agent.
   */
  private enforceCaps(url: string, amount: bigint): void {
    if (amount > this.opts.maxPerCall) {
      this.opts.onCapHit?.("per-call", { url, amount, cap: this.opts.maxPerCall });
      throw new X402Error(
        `x402 payment refused: requested ${formatPton(amount, this.opts.assetDecimals)} PTON exceeds X402_MAX_PAYMENT_PER_CALL_PTON cap of ${formatPton(this.opts.maxPerCall, this.opts.assetDecimals)} PTON. Raise the cap in .env if this call is expected.`,
        "per-call-cap",
        { url, amount: amount.toString(), cap: this.opts.maxPerCall.toString() },
      );
    }
    if (this.spent + amount > this.opts.maxTotal) {
      this.opts.onCapHit?.("session", { url, amount, cap: this.opts.maxTotal });
      throw new X402Error(
        `x402 payment refused: cumulative session spend would reach ${formatPton(this.spent + amount, this.opts.assetDecimals)} PTON, exceeding X402_MAX_TOTAL_SPEND_PTON cap of ${formatPton(this.opts.maxTotal, this.opts.assetDecimals)} PTON. Restart the agent to reset the counter or raise the cap in .env.`,
        "session-cap",
        {
          url,
          amount: amount.toString(),
          spent: this.spent.toString(),
          cap: this.opts.maxTotal.toString(),
        },
      );
    }
  }

  /**
   * Sign an EIP-3009 TransferWithAuthorization voucher for the challenge.
   * The returned string is the X-Payment header value: base64-encoded
   * JSON containing the typed-data signature and the fields needed by the
   * receiver to call receiveWithAuthorization on-chain.
   *
   * The signing process never touches the network and never persists the
   * key — it's a pure local computation. The signature itself binds the
   * (from, to, value, validAfter, validBefore, nonce) tuple, so a stolen
   * voucher only spends what the challenge asked for, to the address it
   * names, before validBefore.
   */
  private async composePayment(challenge: X402Challenge): Promise<string> {
    if (!this.account) {
      // Defensive — caller is supposed to check, but make the contract clear.
      throw new X402Error(
        "composePayment called without an account",
        "no-wallet",
      );
    }
    const domain = {
      name: challenge.asset,
      version: "1",
      chainId: challenge.chainId,
      verifyingContract: challenge.assetContract,
    } as const;
    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    } as const;
    const value = {
      from: this.account.address,
      to: challenge.recipient,
      value: challenge.amount,
      validAfter: challenge.validAfter,
      validBefore: challenge.validBefore,
      nonce: challenge.nonce,
    } as const;
    const signature = await this.account.signTypedData({
      domain,
      types,
      primaryType: "TransferWithAuthorization",
      message: value,
    });
    const payload = {
      scheme: "eip3009",
      from: this.account.address,
      to: challenge.recipient,
      value: challenge.amount.toString(),
      validAfter: challenge.validAfter.toString(),
      validBefore: challenge.validBefore.toString(),
      nonce: challenge.nonce,
      chainId: challenge.chainId,
      assetContract: challenge.assetContract,
      signature,
    };
    // base64 over a JSON envelope. Same encoding the Tokamak gateway's
    // /v1/topup/settle accepts for EIP-3009 vouchers, so server-side
    // verification reuses existing code paths.
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedAuthHeader {
  scheme?: string;
  asset?: string;
  assetContract?: string;
  chainId?: number;
  amount?: string;
  recipient?: string;
  validAfter?: string;
  validBefore?: string;
  nonce?: string;
}

/**
 * Parse `WWW-Authenticate: X402 scheme=eip3009 asset=PTON ...` into key/value
 * pairs. Quotes around values are stripped; we don't try to handle every
 * RFC 7235 corner case, just the shapes x402 servers actually emit.
 */
function parseAuthHeader(raw: string): ParsedAuthHeader {
  const out: ParsedAuthHeader = {};
  if (!raw) return out;
  const stripped = raw.replace(/^X402\s+/i, "");
  const pairs = stripped.matchAll(/(\w+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s,]+))/g);
  for (const m of pairs) {
    const key = m[1];
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    switch (key) {
      case "scheme":
        out.scheme = value;
        break;
      case "asset":
        out.asset = value;
        break;
      case "assetContract":
      case "token":
        out.assetContract = value;
        break;
      case "chainId":
        out.chainId = Number(value);
        break;
      case "amount":
        out.amount = value;
        break;
      case "recipient":
      case "payTo":
        out.recipient = value;
        break;
      case "validAfter":
        out.validAfter = value;
        break;
      case "validBefore":
        out.validBefore = value;
        break;
      case "nonce":
        out.nonce = value;
        break;
    }
  }
  return out;
}

function requireHex(
  value: string | undefined,
  field: string,
  url: string,
): Hex {
  if (!value || typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new X402Error(
      `x402 challenge missing or malformed ${field}`,
      "challenge-malformed",
      { url, field, value },
    );
  }
  return value as Hex;
}

function formatPton(wei: bigint, decimals: number): string {
  const denom = 10n ** BigInt(decimals);
  const whole = wei / denom;
  const frac = wei % denom;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

async function safePreview(res: Response): Promise<string> {
  try {
    const txt = await res.text();
    return txt.length > 200 ? `${txt.slice(0, 200)}…` : txt;
  } catch {
    return "(could not read response body)";
  }
}

// Suppress unused-import warnings when consumers tree-shake.
void encodeAbiParameters;
void parseAbi;
