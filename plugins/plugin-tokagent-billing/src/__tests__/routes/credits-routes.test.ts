/**
 * Unit tests for credits-routes.ts.
 *
 * Calls route handlers directly with a seeded billing state and PGLite DB.
 * Auth is mocked via x-dev-wallet (BILLING_AUTH_REQUIRED=false, dev mode).
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import { creditsRoutes } from "../../routes/credits-routes.js";
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

const WALLET = "0xfeed000000000000000000000000000000000001" as Address;
const UNKNOWN_WALLET = "0xfeed000000000000000000000000000000000099" as Address;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(extra: Record<string, unknown> = {}): BillingPluginState["config"] {
  return {
    enabled: true,
    authRequired: false,
    authSecret: "test-billing-auth-secret-credits",
    authSessionTtlMs: 86_400_000,
    authLoginNonceTtlMs: 300_000,
    rateLimitEnabled: false,
    rateLimitQuotePerMin: 60,
    rateLimitSettlePerMin: 30,
    ...extra,
  } as unknown as BillingPluginState["config"];
}

function findHandler(method: string, path: string) {
  const route = creditsRoutes.find((r) => r.type === method && r.path === path);
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

function makeReqWithWallet(wallet: Address = WALLET, extra: Partial<RouteRequest> = {}): RouteRequest {
  return {
    headers: { "x-dev-wallet": wallet },
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
// GET /v1/credits/me
// ---------------------------------------------------------------------------

describe("GET /v1/credits/me", () => {
  const handler = findHandler("GET", "/v1/credits/me");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({}, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 503 when billing is disabled", async () => {
    await clearBillingState();
    const res = makeRes();
    await handler(makeReqWithWallet(), res, fakeRuntime);
    expect(res.statusCode).toBe(503);
  });

  it("returns zero balances for a wallet with no credit state row", async () => {
    const res = makeRes();
    await handler(makeReqWithWallet(UNKNOWN_WALLET), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      wallet: string;
      balance: string;
      reserved: string;
      accrued: string;
    };
    expect(body.wallet.toLowerCase()).toBe(UNKNOWN_WALLET.toLowerCase());
    expect(body.balance).toBe("0");
    expect(body.reserved).toBe("0");
    expect(body.accrued).toBe("0");
  });

  it("returns 200 with the wallet field matching the authenticated wallet", async () => {
    const res = makeRes();
    await handler(makeReqWithWallet(), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as { wallet: string };
    expect(body.wallet.toLowerCase()).toBe(WALLET.toLowerCase());
  });
});
