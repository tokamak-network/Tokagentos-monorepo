/**
 * Concurrent settle test for topup-routes.ts (Phase 6c Fix 2).
 *
 * Verifies the consumeQuote-after-deposit semantics: when two settle calls
 * race on the same quoteId, exactly one returns 200 OK and the other returns
 * 409 quote_already_consumed.
 *
 * Lives in a separate file so the vi.mock() of @tokagentos/billing does not
 * contaminate the unrelated route tests (verifyEip3009Signature and
 * depositX402 are mocked to succeed unconditionally — only `consumeQuote`'s
 * UPDATE … WHERE consumed_at IS NULL semantics is under test here).
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted by vitest
// ---------------------------------------------------------------------------

vi.mock("@tokagentos/billing", async () => {
  const actual = await vi.importActual<typeof import("@tokagentos/billing")>(
    "@tokagentos/billing",
  );
  return {
    ...actual,
    // Force signature verification to pass.
    verifyEip3009Signature: vi.fn(async () => true),
    // Force on-chain deposit to succeed with a deterministic tx hash.
    depositX402: vi.fn(async () => "0xdeadbeef" as `0x${string}`),
  };
});

// Imports below MUST come after vi.mock to pick up the mocked module.
import { topupRoutes } from "../../routes/topup-routes.js";
import {
  setBillingState,
  clearBillingState,
  type BillingPluginState,
} from "../../state.js";
import { createTestDb, type TestDbHandle } from "../db-harness.js";
import { storeQuote } from "@tokagentos/billing";
import type { RouteRequest, RouteResponse, IAgentRuntime } from "@tokagentos/core";
import type { Address } from "viem";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WALLET = "0xfee1000000000000000000000000000000000001" as Address;
const PTON_ADDRESS = "0x1234567890123456789012345678901234567890" as Address;
const VAULT_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
const FIXED_TON_USD = 5.0;

function makeConfig(): BillingPluginState["config"] {
  return {
    enabled: true,
    authRequired: false,
    authSecret: "test-billing-auth-secret-concurrent",
    authSessionTtlMs: 86_400_000,
    authLoginNonceTtlMs: 300_000,
    rateLimitEnabled: false,
    rateLimitQuotePerMin: 60,
    rateLimitSettlePerMin: 30,
    fixedTonUsd: FIXED_TON_USD,
    chainId: 1,
    ptonAddress: PTON_ADDRESS,
    vaultAddress: VAULT_ADDRESS,
    topupAmountPton: 1_000_000_000_000_000_000n,
    effectiveMarginBps: 0,
  } as unknown as BillingPluginState["config"];
}

function findHandler(method: string, path: string) {
  const route = topupRoutes.find((r) => r.type === method && r.path === path);
  if (!route?.handler) throw new Error(`Route not found: ${method} ${path}`);
  return route.handler;
}

function makeRes() {
  let _status = 200;
  let _body: unknown;
  const res = {
    status(code: number) { _status = code; return res; },
    json(data: unknown) { _body = data; return res; },
    send(data: unknown) { _body = data; return res; },
    end() { return res; },
    get statusCode() { return _status; },
    get body() { return _body; },
  };
  return res as unknown as RouteResponse & { statusCode: number; body: unknown };
}

function makeSettleReq(topupId: string): RouteRequest {
  return {
    headers: { "x-dev-wallet": WALLET },
    body: {
      topupId,
      signature: { v: 27, r: "0x" + "a".repeat(64), s: "0x" + "b".repeat(64) },
    } as RouteRequest["body"],
  };
}

const fakeRuntime = {} as IAgentRuntime;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let handle: TestDbHandle;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "development");
  handle = await createTestDb();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await clearBillingState();
  await handle.close();
});

beforeEach(async () => {
  await clearBillingState();
  setBillingState({
    pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
    db: handle.db,
    clients: {} as BillingPluginState["clients"],
    config: makeConfig(),
  });
});

// ---------------------------------------------------------------------------
// Concurrent settle: exactly one wins (Fix 2)
// ---------------------------------------------------------------------------

describe("POST /v1/topup/settle — concurrent settle on same quoteId", () => {
  const handler = findHandler("POST", "/v1/topup/settle");

  it("two concurrent settles on the same quote: exactly one returns 200, the other 409", async () => {
    // Pre-store a quote that both settles will target.
    const topupId = "00000000-0000-0000-0000-000000000abc";
    await storeQuote(handle.db, {
      id: topupId,
      wallet: WALLET,
      amountPton: 1_000_000_000_000_000_000n,
      amountUsd: 0.05,
      tonUsd: FIXED_TON_USD,
      ttlMs: 600_000,
    });

    // Fire two settle requests in parallel against the same quote.
    const [resA, resB] = [makeRes(), makeRes()];
    await Promise.all([
      handler(makeSettleReq(topupId), resA, fakeRuntime),
      handler(makeSettleReq(topupId), resB, fakeRuntime),
    ]);

    const statuses = [resA.statusCode, resB.statusCode].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    // The 200 response carries ok:true + txHash.
    const winnerRes = resA.statusCode === 200 ? resA : resB;
    const winnerBody = winnerRes.body as { ok: boolean; txHash: string };
    expect(winnerBody.ok).toBe(true);
    expect(winnerBody.txHash).toMatch(/^0x/);

    // The 409 response carries quote_already_consumed.
    const loserRes = resA.statusCode === 409 ? resA : resB;
    const loserBody = loserRes.body as {
      type: string;
      code: string;
      txHash: string;
    };
    expect(loserBody.type).toBe("billing_error");
    expect(loserBody.code).toBe("quote_already_consumed");
    expect(loserBody.txHash).toMatch(/^0x/);
  });

  it("sequential second settle after first succeeds returns 404 (fetchQuote filters consumed quotes)", async () => {
    // After a successful first settle marks the quote consumed, a SEQUENTIAL
    // second settle is rejected earlier in the handler: `fetchQuote` filters
    // out consumed quotes and returns null, so the handler emits 404 before
    // reaching the `consumeQuote` 409 path. The 409 path is only hit in the
    // CONCURRENT case (above) where both calls pass `fetchQuote` but only one
    // wins the `consumeQuote` UPDATE race.
    const topupId = "00000000-0000-0000-0000-000000000def";
    await storeQuote(handle.db, {
      id: topupId,
      wallet: WALLET,
      amountPton: 1_000_000_000_000_000_000n,
      amountUsd: 0.05,
      tonUsd: FIXED_TON_USD,
      ttlMs: 600_000,
    });

    const firstRes = makeRes();
    await handler(makeSettleReq(topupId), firstRes, fakeRuntime);
    expect(firstRes.statusCode).toBe(200);

    const secondRes = makeRes();
    await handler(makeSettleReq(topupId), secondRes, fakeRuntime);
    expect(secondRes.statusCode).toBe(404);
    const body = secondRes.body as { error: string };
    expect(body.error).toMatch(/already consumed/);
  });
});
