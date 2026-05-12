/**
 * Unit tests for auth-routes.ts.
 *
 * These tests call the route handlers directly with mocked req/res objects
 * and a seeded billing state backed by an in-memory PGLite database.
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { authRoutes } from "../../routes/auth-routes.js";
import {
  setBillingState,
  clearBillingState,
  type BillingPluginState,
} from "../../state.js";
import { createTestDb, type TestDbHandle } from "../db-harness.js";
import type { RouteRequest, RouteResponse, IAgentRuntime } from "@elizaos/core";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const AUTH_SECRET = "test-billing-auth-secret-phase6a";
const CHAIN_ID = 1;

function makeConfig(): BillingPluginState["config"] {
  return {
    enabled: true,
    authRequired: true,
    authSecret: AUTH_SECRET,
    authSessionTtlMs: 86_400_000,
    authLoginNonceTtlMs: 300_000,
    rateLimitEnabled: false,
    rateLimitQuotePerMin: 60,
    rateLimitSettlePerMin: 30,
  } as unknown as BillingPluginState["config"];
}

// ---------------------------------------------------------------------------
// Route handler helpers
// ---------------------------------------------------------------------------

function findHandler(method: string, path: string) {
  const route = authRoutes.find((r) => r.type === method && r.path === path);
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

const fakeRuntime = {} as IAgentRuntime;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
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
// GET /v1/auth/nonce
// ---------------------------------------------------------------------------

describe("GET /v1/auth/nonce", () => {
  const handler = findHandler("GET", "/v1/auth/nonce");

  it("returns 400 when wallet is missing", async () => {
    const req: RouteRequest = { query: { chainId: "1" } };
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when chainId is missing", async () => {
    const req: RouteRequest = { query: { wallet: "0xface000000000000000000000000000000000001" } };
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid wallet address", async () => {
    const req: RouteRequest = { query: { wallet: "not-an-address", chainId: "1" } };
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 with nonce and envelope for valid params", async () => {
    const req: RouteRequest = {
      query: {
        wallet: "0xface000000000000000000000000000000000001",
        chainId: "1",
      },
    };
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as { nonce: string; envelope: { wallet: string; nonce: string } };
    expect(body.nonce).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.envelope.wallet).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(body.envelope.nonce).toBe(body.nonce);
  });

  it("returns 503 when billing is disabled", async () => {
    await clearBillingState();
    const req: RouteRequest = { query: { wallet: "0xface000000000000000000000000000000000001", chainId: "1" } };
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/auth/login
// ---------------------------------------------------------------------------

describe("POST /v1/auth/login", () => {
  const handler = findHandler("POST", "/v1/auth/login");

  it("returns 400 when wallet is missing", async () => {
    const req: RouteRequest = { body: { nonce: "0xabc", signature: "0xsig", chainId: 1 } };
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when nonce is missing", async () => {
    const req: RouteRequest = {
      body: { wallet: "0xface000000000000000000000000000000000001", signature: "0xsig", chainId: 1 },
    };
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 for a nonce that was never issued", async () => {
    const req: RouteRequest = {
      body: {
        wallet: "0xface000000000000000000000000000000000001",
        nonce: "0x" + "ab".repeat(32),
        signature: "0x" + "00".repeat(65),
        chainId: 1,
      },
    };
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/billing/status (Decision Z40)
// ---------------------------------------------------------------------------

describe("GET /v1/billing/status", () => {
  const handler = findHandler("GET", "/v1/billing/status");

  it("returns { enabled: true } when billing state is initialized with enabled config", async () => {
    // beforeEach() already set billing state with config.enabled = true (see makeConfig()).
    const req: RouteRequest = {};
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ enabled: true });
  });

  it("returns { enabled: false } when billing state is not initialized", async () => {
    // Clear billing state so isBillingStateInitialized() returns false.
    await clearBillingState();
    const req: RouteRequest = {};
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ enabled: false });
  });
});
