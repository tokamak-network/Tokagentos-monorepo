/**
 * Unit tests for the x402 client helper.
 *
 * Strategy: mock `fetch` and the wallet signing callback, run the full dance,
 * and assert:
 *   - The probe sends NO X-PAYMENT header.
 *   - The retry sends a base64-decodable X-PAYMENT envelope with the
 *     expected scheme/network/payload shape.
 *   - User-rejection flows surface as X402Error("user_rejected").
 *   - Settle rejection (402 on retry) surfaces as "settle_rejected".
 *   - Upstream failure (502) surfaces as "upstream_failed".
 *   - Billing headers are extracted into result.billing.
 */

import { describe, it, expect } from "vitest";
import {
  sendX402Message,
  X402Error,
  type X402Quote,
  type SignTypedDataFn,
} from "../x402-send.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VAULT = "0x1072f70e7c490E460fA72AC4171F7aDD1ef2d79F" as `0x${string}`;
const PTON = "0x00D1EDcE8E7c617891FF76224DFf501c568f1Ce0" as `0x${string}`;
const USER = "0x3ec2c9fb15C222Aa273F3f2F20a740FA86b4F618" as `0x${string}`;

const FAKE_QUOTE: X402Quote = {
  x402Version: 1,
  accepts: [
    {
      scheme: "exact",
      network: "chain-1",
      maxAmountRequired: "100000000000000000", // 0.1 PTON
      payTo: VAULT,
      asset: PTON,
      extra: {
        quoteId: "550e8400-e29b-41d4-a716-446655440000",
        domain: {
          name: "PTON",
          version: "1",
          chainId: 1,
          verifyingContract: PTON,
        },
        inputTokens: 12,
        maxOutputTokens: 50,
      },
    },
  ],
};

const REQUEST = {
  model: "glm-4.7",
  max_tokens: 50,
  messages: [{ role: "user" as const, content: "say hi" }],
};

/** 65-byte signature stub. */
const FAKE_SIG = `0x${"a".repeat(64)}${"b".repeat(64)}1c`;
const FAKE_SIGNER: SignTypedDataFn = async () => FAKE_SIG;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetch(
  responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>,
): typeof fetch & { calls: Array<{ url: string; init: RequestInit }> } {
  let i = 0;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses[i++];
    if (!r) throw new Error("fetch called more times than expected");
    const body = r.body ? JSON.stringify(r.body) : "";
    return new Response(body, {
      status: r.status,
      headers: r.headers ?? { "content-type": "application/json" },
    });
  }) as typeof fetch & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

function readXPayment(call: { init: RequestInit }) {
  const headers = call.init.headers as Record<string, string>;
  const raw = headers["X-PAYMENT"] ?? headers["x-payment"];
  if (!raw) return null;
  return JSON.parse(atob(raw));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendX402Message — happy path", () => {
  it("probe + sign + retry returns the model body and billing headers", async () => {
    const fetchImpl = makeFetch([
      { status: 402, body: FAKE_QUOTE },
      {
        status: 200,
        body: { content: [{ type: "text", text: "hi" }] },
        headers: {
          "content-type": "application/json",
          "x-payment-tx": "0xabc",
          "x-quote-id": "550e8400-e29b-41d4-a716-446655440000",
          "x-actual-pton": "60000000000000000",
          "x-refund-pton": "40000000000000000",
          "x-fee-pton": "600000000000000",
          "x-credits-balance": "0",
          "x-margin-bps": "100",
        },
      },
    ]);

    const result = await sendX402Message({
      proxyBase: "http://test.local",
      request: REQUEST,
      signTypedData: FAKE_SIGNER,
      fromAddress: USER,
      fetchImpl,
    });

    expect(result.body).toEqual({ content: [{ type: "text", text: "hi" }] });
    expect(result.billing.paymentTxHash).toBe("0xabc");
    expect(result.billing.actualPton).toBe("60000000000000000");
    expect(result.billing.refundedPton).toBe("40000000000000000");

    // Probe must have NO X-PAYMENT header.
    expect(readXPayment(fetchImpl.calls[0]!)).toBeNull();

    // Retry must have a properly-shaped X-PAYMENT envelope.
    const env = readXPayment(fetchImpl.calls[1]!);
    expect(env.x402Version).toBe(1);
    expect(env.scheme).toBe("exact");
    expect(env.network).toBe("chain-1");
    expect(env.payload.quoteId).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(env.payload.authorization.from).toBe(USER);
    expect(env.payload.authorization.to).toBe(VAULT);
    expect(env.payload.authorization.value).toBe("100000000000000000");
    expect(env.payload.signature.v).toBe(0x1c);
    expect(env.payload.signature.r).toMatch(/^0x[a-f0-9]{64}$/);
    expect(env.payload.signature.s).toMatch(/^0x[a-f0-9]{64}$/);
  });
});

describe("sendX402Message — error surfaces", () => {
  it("throws no_402_returned when probe returns 200", async () => {
    const fetchImpl = makeFetch([{ status: 200, body: { ok: true } }]);
    await expect(
      sendX402Message({
        proxyBase: "http://test.local",
        request: REQUEST,
        signTypedData: FAKE_SIGNER,
        fromAddress: USER,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "no_402_returned" });
  });

  it("throws envelope_parse_failed on malformed 402", async () => {
    const fetchImpl = makeFetch([{ status: 402, body: { x402Version: 1 } }]);
    await expect(
      sendX402Message({
        proxyBase: "http://test.local",
        request: REQUEST,
        signTypedData: FAKE_SIGNER,
        fromAddress: USER,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "envelope_parse_failed" });
  });

  it("throws user_rejected when signer throws a rejection-shaped error", async () => {
    const fetchImpl = makeFetch([{ status: 402, body: FAKE_QUOTE }]);
    const rejecting: SignTypedDataFn = async () => {
      throw new Error("ACTION_REJECTED: user denied signature");
    };
    await expect(
      sendX402Message({
        proxyBase: "http://test.local",
        request: REQUEST,
        signTypedData: rejecting,
        fromAddress: USER,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "user_rejected" });
  });

  it("throws settle_rejected when proxy returns 402 on retry", async () => {
    const fetchImpl = makeFetch([
      { status: 402, body: FAKE_QUOTE },
      { status: 402, body: { error: "bad signature" } },
    ]);
    await expect(
      sendX402Message({
        proxyBase: "http://test.local",
        request: REQUEST,
        signTypedData: FAKE_SIGNER,
        fromAddress: USER,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "settle_rejected" });
  });

  it("throws upstream_failed when proxy returns 502 after settle", async () => {
    const fetchImpl = makeFetch([
      { status: 402, body: FAKE_QUOTE },
      { status: 502, body: { error: "upstream failed; full refund queued" } },
    ]);
    await expect(
      sendX402Message({
        proxyBase: "http://test.local",
        request: REQUEST,
        signTypedData: FAKE_SIGNER,
        fromAddress: USER,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "upstream_failed" });
  });
});

describe("sendX402Message — signing payload shape", () => {
  it("passes the domain, types, and TransferWithAuthorization message to signTypedData", async () => {
    let captured: Parameters<SignTypedDataFn>[0] | null = null;
    const capturingSigner: SignTypedDataFn = async (req) => {
      captured = req;
      return FAKE_SIG;
    };

    const fetchImpl = makeFetch([
      { status: 402, body: FAKE_QUOTE },
      { status: 200, body: {} },
    ]);

    await sendX402Message({
      proxyBase: "http://test.local",
      request: REQUEST,
      signTypedData: capturingSigner,
      fromAddress: USER,
      fetchImpl,
    });

    expect(captured).not.toBeNull();
    const c = captured as unknown as Parameters<SignTypedDataFn>[0];
    expect(c.domain.verifyingContract).toBe(PTON);
    expect(c.domain.chainId).toBe(1);
    expect(c.types.TransferWithAuthorization).toBeDefined();
    expect(c.message.from).toBe(USER);
    expect(c.message.to).toBe(VAULT);
    expect(c.message.value).toBe("100000000000000000");
    expect(c.preview.quoteId).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(c.preview.amountAttoPton).toBe(100000000000000000n);
  });
});
