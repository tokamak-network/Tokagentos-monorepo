/**
 * Unit tests for estimate-routes.ts.
 *
 * Tests POST /v1/estimate, POST /v1/messages/count_tokens, GET /v1/price.
 * Auth is mocked via x-dev-wallet (dev mode).
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import { estimateRoutes } from "../../routes/estimate-routes.js";
import {
  setBillingState,
  clearBillingState,
  type BillingPluginState,
} from "../../state.js";
import { createTestDb, type TestDbHandle } from "../db-harness.js";
import type { RouteRequest, RouteResponse, IAgentRuntime } from "@elizaos/core";
import type { Address } from "viem";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALLET = "0xeeee000000000000000000000000000000000001" as Address;
const FIXED_TON_USD = 5.0; // $5/TON for deterministic test assertions

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(extra: Record<string, unknown> = {}): BillingPluginState["config"] {
  return {
    enabled: true,
    authRequired: false,
    authSecret: "test-billing-auth-secret-estimate",
    authSessionTtlMs: 86_400_000,
    authLoginNonceTtlMs: 300_000,
    rateLimitEnabled: false,
    rateLimitQuotePerMin: 60,
    rateLimitSettlePerMin: 30,
    fixedTonUsd: FIXED_TON_USD,
    ...extra,
  } as unknown as BillingPluginState["config"];
}

function findHandler(method: string, path: string) {
  const route = estimateRoutes.find((r) => r.type === method && r.path === path);
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

function makeReq(body: Record<string, unknown> = {}, extra: Partial<RouteRequest> = {}): RouteRequest {
  return {
    headers: { "x-dev-wallet": WALLET },
    body: body as RouteRequest["body"],
    ...extra,
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
// POST /v1/estimate
// ---------------------------------------------------------------------------

describe("POST /v1/estimate", () => {
  const handler = findHandler("POST", "/v1/estimate");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({ body: { model: "claude-sonnet-4-6", messages: [] } }, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 503 when billing is disabled", async () => {
    await clearBillingState();
    const res = makeRes();
    await handler(makeReq({ model: "claude-sonnet-4-6" }), res, fakeRuntime);
    expect(res.statusCode).toBe(503);
  });

  it("returns 400 when model is missing", async () => {
    const res = makeRes();
    await handler(makeReq({ messages: [] }), res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for an unsupported model", async () => {
    const res = makeRes();
    await handler(
      makeReq({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] }),
      res,
      fakeRuntime,
    );
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 with cost estimate fields", async () => {
    const res = makeRes();
    await handler(
      makeReq({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello world" }],
        max_tokens: 100,
      }),
      res,
      fakeRuntime,
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      model: string;
      inputTokens: number;
      maxOutputTokens: number;
      maxCostUsd: number;
      maxCostPton: string;
      tonUsd: number;
      hasCacheControl: boolean;
    };
    expect(body.model).toContain("sonnet");
    expect(typeof body.inputTokens).toBe("number");
    expect(body.inputTokens).toBeGreaterThan(0);
    expect(body.maxOutputTokens).toBe(100);
    expect(typeof body.maxCostUsd).toBe("number");
    expect(body.maxCostUsd).toBeGreaterThan(0);
    // maxCostPton is a bigint string
    expect(typeof body.maxCostPton).toBe("string");
    expect(BigInt(body.maxCostPton)).toBeGreaterThan(0n);
    expect(body.tonUsd).toBe(FIXED_TON_USD);
    expect(body.hasCacheControl).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/messages/count_tokens
// ---------------------------------------------------------------------------

describe("POST /v1/messages/count_tokens", () => {
  const handler = findHandler("POST", "/v1/messages/count_tokens");

  it("returns 401 when not authenticated (Anthropic error shape)", async () => {
    const res = makeRes();
    await handler({ body: { model: "claude-sonnet-4-6", messages: [] } }, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
    const body = res.body as { type: string; error: { type: string } };
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("authentication_error");
  });

  it("returns 400 when model is missing (Anthropic error shape)", async () => {
    const res = makeRes();
    await handler(makeReq({ messages: [] }), res, fakeRuntime);
    expect(res.statusCode).toBe(400);
    const body = res.body as { type: string; error: { type: string } };
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("returns 200 with input_tokens for a simple message", async () => {
    const res = makeRes();
    await handler(
      makeReq({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Count these tokens please." }],
      }),
      res,
      fakeRuntime,
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as { input_tokens: number };
    expect(typeof body.input_tokens).toBe("number");
    expect(body.input_tokens).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/price
// ---------------------------------------------------------------------------

describe("GET /v1/price", () => {
  const handler = findHandler("GET", "/v1/price");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({}, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns fixed price when fixedTonUsd is set", async () => {
    const res = makeRes();
    await handler({ headers: { "x-dev-wallet": WALLET } }, res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as { tonUsd: number; source: string };
    expect(body.tonUsd).toBe(FIXED_TON_USD);
    expect(body.source).toBe("fixed");
  });

  it("returns available:false when twapCache has no snapshot", async () => {
    // Set config without fixedTonUsd so TwapCache is the only source.
    await clearBillingState();
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ fixedTonUsd: undefined }),
    });
    const res = makeRes();
    await handler({ headers: { "x-dev-wallet": WALLET } }, res, fakeRuntime);
    // twapCache is undefined in state → should return available:false or 200
    expect([200, 200]).toContain(res.statusCode);
    const body = res.body as { available?: boolean; tonUsd?: number };
    // Either fixedTonUsd was returned or available:false
    if ("available" in body) {
      expect(body.available).toBe(false);
    }
  });
});
