/**
 * Unit tests for usage-routes.ts.
 *
 * Tests GET /v1/usage/summary, GET /v1/usage/calls, GET /v1/usage/keys, GET /v1/stats.
 * Auth is mocked via x-dev-wallet (dev mode).
 * Inserts seed call_log rows via Drizzle for data-driven tests.
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import { usageRoutes } from "../../routes/usage-routes.js";
import {
  setBillingState,
  clearBillingState,
  type BillingPluginState,
} from "../../state.js";
import { createTestDb, type TestDbHandle } from "../db-harness.js";
import type { RouteRequest, RouteResponse, IAgentRuntime } from "@tokagentos/core";
import type { Address } from "viem";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALLET = "0xdead000000000000000000000000000000000001" as Address;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(extra: Record<string, unknown> = {}): BillingPluginState["config"] {
  return {
    enabled: true,
    authRequired: false,
    authSecret: "test-billing-auth-secret-usage",
    authSessionTtlMs: 86_400_000,
    authLoginNonceTtlMs: 300_000,
    rateLimitEnabled: false,
    rateLimitQuotePerMin: 60,
    rateLimitSettlePerMin: 30,
    ...extra,
  } as unknown as BillingPluginState["config"];
}

function findHandler(method: string, path: string) {
  const route = usageRoutes.find((r) => r.type === method && r.path === path);
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

function makeReq(extra: Partial<RouteRequest> = {}): RouteRequest {
  return {
    headers: { "x-dev-wallet": WALLET },
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
// GET /v1/usage/summary
// ---------------------------------------------------------------------------

describe("GET /v1/usage/summary", () => {
  const handler = findHandler("GET", "/v1/usage/summary");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({}, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 503 when billing is disabled", async () => {
    await clearBillingState();
    const res = makeRes();
    await handler(makeReq(), res, fakeRuntime);
    expect(res.statusCode).toBe(503);
  });

  it("returns 200 with zero totals for a fresh wallet", async () => {
    const res = makeRes();
    await handler(makeReq(), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      callCount: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCostUsd: string;
      window: { since: string; until: string };
    };
    expect(typeof body.callCount).toBe("number");
    expect(body.callCount).toBe(0);
    expect(typeof body.window.since).toBe("string");
    expect(typeof body.window.until).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// GET /v1/usage/calls
// ---------------------------------------------------------------------------

describe("GET /v1/usage/calls", () => {
  const handler = findHandler("GET", "/v1/usage/calls");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({}, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with empty calls array for fresh wallet", async () => {
    const res = makeRes();
    await handler(makeReq(), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as { calls: unknown[]; hasMore: boolean };
    expect(Array.isArray(body.calls)).toBe(true);
    expect(body.calls.length).toBe(0);
    expect(body.hasMore).toBe(false);
  });

  it("returns 400 for invalid limit param", async () => {
    const res = makeRes();
    await handler(makeReq({ query: { limit: "0" } }), res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/usage/keys
// ---------------------------------------------------------------------------

describe("GET /v1/usage/keys", () => {
  const handler = findHandler("GET", "/v1/usage/keys");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({}, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with empty items array for fresh wallet", async () => {
    const res = makeRes();
    await handler(makeReq(), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/stats
// ---------------------------------------------------------------------------

describe("GET /v1/stats", () => {
  const handler = findHandler("GET", "/v1/stats");

  it("returns 503 when billing is disabled", async () => {
    await clearBillingState();
    const res = makeRes();
    await handler({}, res, fakeRuntime);
    expect(res.statusCode).toBe(503);
  });

  it("returns 200 with aggregate counts (no auth required)", async () => {
    // /v1/stats is a public operator debug endpoint — no auth needed.
    const res = makeRes();
    await handler({}, res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as { totalWallets: number; totalCallLog: number; totalAccruedPton: string };
    expect(typeof body.totalWallets).toBe("number");
    expect(typeof body.totalCallLog).toBe("number");
    expect(typeof body.totalAccruedPton).toBe("string");
  });
});
