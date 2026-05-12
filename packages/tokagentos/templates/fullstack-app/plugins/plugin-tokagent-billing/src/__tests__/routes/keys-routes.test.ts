/**
 * Unit tests for keys-routes.ts.
 *
 * Calls route handlers directly with a seeded billing state and PGLite DB.
 * Auth is mocked via x-dev-wallet (BILLING_AUTH_REQUIRED=false, dev mode).
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import { keysRoutes } from "../../routes/keys-routes.js";
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

const WALLET = "0xface000000000000000000000000000000000001" as Address;
const LIST_WALLET = "0xface000000000000000000000000000000000002" as Address;
const REVOKE_WALLET = "0xface000000000000000000000000000000000003" as Address;
const AUTH_SECRET = "test-billing-auth-secret-keys-routes";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeConfig(extra: Record<string, unknown> = {}): BillingPluginState["config"] {
  return {
    enabled: true,
    authRequired: false, // dev mode — x-dev-wallet escape active
    authSecret: AUTH_SECRET,
    authSessionTtlMs: 86_400_000,
    authLoginNonceTtlMs: 300_000,
    rateLimitEnabled: false,
    rateLimitQuotePerMin: 60,
    rateLimitSettlePerMin: 30,
    ...extra,
  } as unknown as BillingPluginState["config"];
}

function findHandler(method: string, path: string) {
  const route = keysRoutes.find((r) => r.type === method && r.path === path);
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

function makeReqWithWallet(
  extra: Partial<RouteRequest> = {},
): RouteRequest {
  return {
    headers: {
      "x-dev-wallet": WALLET,
    },
    ...extra,
  };
}

const fakeRuntime = {} as IAgentRuntime;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let handle: TestDbHandle;

beforeAll(async () => {
  // Dev mode for x-dev-wallet escape.
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
// POST /v1/keys
// ---------------------------------------------------------------------------

describe("POST /v1/keys — mint", () => {
  const handler = findHandler("POST", "/v1/keys");

  it("returns 401 when not authenticated", async () => {
    const req: RouteRequest = { body: { name: "my-key" } };
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    const req = makeReqWithWallet({ body: {} });
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when name is empty string", async () => {
    const req = makeReqWithWallet({ body: { name: "   " } });
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("mints a key and returns 201 with id + plaintext + disclosure rule", async () => {
    const req = makeReqWithWallet({ body: { name: "integration-key" } });
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(201);
    const body = res.body as {
      id: string;
      key: string;
      keyDisclosure: string;
      name: string;
      createdAt: string;
    };
    expect(body.id).toMatch(/^sk-ai-/);
    expect(body.key).toMatch(/^sk-ai-[0-9a-f]{64}$/);
    expect(body.keyDisclosure).toBe("shown_once_store_immediately");
    expect(body.name).toBe("integration-key");
  });

  it("returns 503 when billing is disabled", async () => {
    await clearBillingState();
    const req = makeReqWithWallet({ body: { name: "key" } });
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/keys
// ---------------------------------------------------------------------------

describe("GET /v1/keys — list", () => {
  const handler = findHandler("GET", "/v1/keys");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({}, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with empty array for a wallet with no keys", async () => {
    // Use a unique wallet that has never had keys minted.
    const req: RouteRequest = { headers: { "x-dev-wallet": LIST_WALLET } };
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as { keys: unknown[] };
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys.length).toBe(0);
  });

  it("lists minted keys for the wallet", async () => {
    // Use the primary WALLET; mint a key first.
    const mintHandler = findHandler("POST", "/v1/keys");
    await mintHandler(makeReqWithWallet({ body: { name: "listed-key" } }), makeRes(), fakeRuntime);

    const req = makeReqWithWallet();
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    const body = res.body as { keys: Array<{ id: string; name: string }> };
    expect(body.keys.some((k) => k.name === "listed-key")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/keys/:id
// ---------------------------------------------------------------------------

describe("DELETE /v1/keys/:id — revoke", () => {
  const handler = findHandler("DELETE", "/v1/keys/:id");

  it("returns 401 when not authenticated", async () => {
    const req: RouteRequest = { params: { id: "sk-ai-12345678" } };
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent key", async () => {
    const req = makeReqWithWallet({ params: { id: "sk-ai-nonexistent" } });
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(404);
  });

  it("revokes a key and returns 200", async () => {
    // Mint a key on a dedicated wallet.
    const mintHandler = findHandler("POST", "/v1/keys");
    const mintRes = makeRes();
    const revokeReq: RouteRequest = {
      headers: { "x-dev-wallet": REVOKE_WALLET },
      body: { name: "to-revoke" },
    };
    await mintHandler(revokeReq, mintRes, fakeRuntime);
    const { id } = mintRes.body as { id: string };

    const req: RouteRequest = { headers: { "x-dev-wallet": REVOKE_WALLET }, params: { id } };
    const res = makeRes();
    await handler(req, res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as { revoked: boolean; id: string };
    expect(body.revoked).toBe(true);
    expect(body.id).toBe(id);
  });
});
