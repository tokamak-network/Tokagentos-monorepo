/**
 * Tests for setup-routes.ts (POST /v1/billing/validate, POST /v1/billing/setup).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IAgentRuntime } from "@elizaos/core";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  writeConfigCalled: false,
  writeConfigError: null as Error | null,
  initCalled: false,
  disposeCalled: false,
  billingInitialized: false,
  setupEnabled: true,
  validateDb: { ok: true } as { ok: boolean; error?: string },
  validateRpc: { ok: true, chainId: 137 } as { ok: boolean; error?: string; chainId?: number },
  validateVault: { ok: true } as { ok: boolean; error?: string },
  validateKey: { ok: true, address: "0x1234" } as { ok: boolean; error?: string; address?: string },
  validateSecret: { ok: true } as { ok: boolean; error?: string },
}));

vi.mock("../../lib/billing-config-writer.js", () => ({
  writeBillingConfig: async () => {
    if (mocks.writeConfigError) throw mocks.writeConfigError;
    mocks.writeConfigCalled = true;
  },
}));

vi.mock("../../lib/billing-config-validator.js", () => ({
  validateDatabaseUrl: async () => mocks.validateDb,
  validateChainRpcUrl: async () => mocks.validateRpc,
  validateVaultAddress: async () => mocks.validateVault,
  validateOperatorPrivateKey: () => mocks.validateKey,
  validateAuthSecret: () => mocks.validateSecret,
}));

vi.mock("../../state.js", () => ({
  isBillingStateInitialized: () => mocks.billingInitialized,
}));

vi.mock("../../init.js", () => ({
  initBillingPlugin: async () => { mocks.initCalled = true; },
  disposeBillingPlugin: async () => { mocks.disposeCalled = true; },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { setupRoutes } from "../../routes/setup-routes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRuntime(): IAgentRuntime {
  return { getSetting: () => null } as unknown as IAgentRuntime;
}

type ResponseCapture = {
  statusCode: number;
  body: unknown;
  status: (code: number) => { json: (b: unknown) => void };
};

function makeRes(): ResponseCapture {
  const res: ResponseCapture = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return {
        json: (b) => { res.body = b; },
      };
    },
  };
  return res;
}

function makeReq(body: unknown): { body: unknown } {
  return { body };
}

const VALID_BODY = {
  databaseUrl: "postgres://user:pass@localhost/billing",
  chainRpcUrl: "https://polygon-rpc.com",
  chainId: 137,
  vaultAddress: "0x" + "1".repeat(40),
  ptonAddress: "0x" + "2".repeat(40),
  operatorPrivateKey: "0x" + "a".repeat(64),
  authSecret: "a".repeat(48),
};

function findRoute(path: string, type: string) {
  return setupRoutes.find(r => r.path === path && r.type === type)!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  Object.assign(mocks, {
    writeConfigCalled: false,
    writeConfigError: null,
    initCalled: false,
    disposeCalled: false,
    billingInitialized: false,
    setupEnabled: true,
    validateDb: { ok: true },
    validateRpc: { ok: true, chainId: 137 },
    validateVault: { ok: true },
    validateKey: { ok: true, address: "0x1234" },
    validateSecret: { ok: true },
  });
  delete process.env.BILLING_SETUP_ENABLED;
});

afterEach(() => {
  delete process.env.BILLING_SETUP_ENABLED;
});

describe("POST /v1/billing/validate", () => {
  const validate = findRoute("/v1/billing/validate", "POST");

  it("returns 200 when all fields are valid", async () => {
    const res = makeRes();
    await validate.handler!(makeReq(VALID_BODY) as never, res as never, makeRuntime());
    expect(res.statusCode).toBe(200);
    expect((res.body as Record<string, unknown>).ok).toBe(true);
  });

  it("returns 422 when db validation fails", async () => {
    mocks.validateDb = { ok: false, error: "Cannot connect" };
    const res = makeRes();
    await validate.handler!(makeReq(VALID_BODY) as never, res as never, makeRuntime());
    expect(res.statusCode).toBe(422);
    const body = res.body as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect((body.errors as Record<string, string>).databaseUrl).toMatch(/Cannot connect/);
  });

  it("returns 403 when BILLING_SETUP_ENABLED=false", async () => {
    process.env.BILLING_SETUP_ENABLED = "false";
    const res = makeRes();
    await validate.handler!(makeReq(VALID_BODY) as never, res as never, makeRuntime());
    expect(res.statusCode).toBe(403);
  });

  it("returns 400 when body is missing", async () => {
    const res = makeRes();
    await validate.handler!(makeReq(undefined) as never, res as never, makeRuntime());
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/billing/setup", () => {
  const setup = findRoute("/v1/billing/setup", "POST");

  it("validates, persists, and re-inits — returns 200", async () => {
    const res = makeRes();
    await setup.handler!(makeReq(VALID_BODY) as never, res as never, makeRuntime());
    expect(res.statusCode).toBe(200);
    expect(mocks.writeConfigCalled).toBe(true);
    expect(mocks.initCalled).toBe(true);
    const body = res.body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.restarted).toBe(true);
  });

  it("disposes existing plugin before re-init when already initialized", async () => {
    mocks.billingInitialized = true;
    const res = makeRes();
    await setup.handler!(makeReq(VALID_BODY) as never, res as never, makeRuntime());
    expect(mocks.disposeCalled).toBe(true);
    expect(mocks.initCalled).toBe(true);
  });

  it("returns 422 when vault validation fails", async () => {
    mocks.validateVault = { ok: false, error: "wrong vault" };
    const res = makeRes();
    await setup.handler!(makeReq(VALID_BODY) as never, res as never, makeRuntime());
    expect(res.statusCode).toBe(422);
    expect(mocks.writeConfigCalled).toBe(false);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = makeRes();
    await setup.handler!(makeReq({ databaseUrl: "postgres://x" }) as never, res as never, makeRuntime());
    expect(res.statusCode).toBe(400);
    expect(mocks.writeConfigCalled).toBe(false);
  });

  it("returns 207 when persist succeeds but re-init fails", async () => {
    mocks.writeConfigError = null;
    // Override initBillingPlugin to throw
    const mod = await import("../../init.js");
    vi.spyOn(mod, "initBillingPlugin").mockRejectedValueOnce(new Error("re-init fail"));

    const res = makeRes();
    await setup.handler!(makeReq(VALID_BODY) as never, res as never, makeRuntime());
    expect(res.statusCode).toBe(207);
    const body = res.body as Record<string, unknown>;
    expect(body.persisted).toBe(true);
    expect(body.restarted).toBe(false);

    vi.restoreAllMocks();
  });

  it("returns 500 when writeBillingConfig throws", async () => {
    mocks.writeConfigError = new Error("disk full");
    const res = makeRes();
    await setup.handler!(makeReq(VALID_BODY) as never, res as never, makeRuntime());
    expect(res.statusCode).toBe(500);
  });

  it("returns 403 when BILLING_SETUP_ENABLED=false", async () => {
    process.env.BILLING_SETUP_ENABLED = "false";
    const res = makeRes();
    await setup.handler!(makeReq(VALID_BODY) as never, res as never, makeRuntime());
    expect(res.statusCode).toBe(403);
  });
});

describe("route definitions", () => {
  it("validate route is public (no auth required pre-setup)", () => {
    const r = findRoute("/v1/billing/validate", "POST");
    expect(r.public).toBe(true);
    expect(r.rawPath).toBe(true);
  });

  it("setup route is public (no auth required pre-setup)", () => {
    const r = findRoute("/v1/billing/setup", "POST");
    expect(r.public).toBe(true);
    expect(r.rawPath).toBe(true);
  });
});
