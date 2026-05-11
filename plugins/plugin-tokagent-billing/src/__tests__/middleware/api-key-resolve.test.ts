/**
 * Tests for the billing identity resolver (`middleware/api-key-resolve.ts`).
 *
 * Covers the precedence chain documented in Decision Z29 / G6:
 *   1. x-api-key (DB lookup via resolveApiKey)
 *   2. Authorization: Bearer <jwt> (verifySession)
 *   3. x-dev-wallet (dev escape — only when authRequired=false + dev mode)
 *
 * Plus negative cases: missing headers, invalid values, dev escape gated off
 * in production.
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { Address } from "viem";
import { resolveBillingIdentity } from "../../middleware/api-key-resolve.js";
import {
  setBillingState,
  clearBillingState,
  type BillingPluginState,
} from "../../state.js";
import { createTestDb, type TestDbHandle } from "../db-harness.js";
import { mintApiKey, issueSession } from "@tokagentos/billing";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WALLET = "0xface000000000000000000000000000000000001" as Address;
const DEV_WALLET = "0xdeadbeef00000000000000000000000000000001" as Address;
const AUTH_SECRET = "test-auth-secret-resolver";

interface ConfigOverrides {
  authRequired?: boolean;
  authSecret?: string | undefined;
}

function makeConfig(overrides: ConfigOverrides = {}): BillingPluginState["config"] {
  return {
    enabled: true,
    authRequired: overrides.authRequired ?? true,
    authSecret: "authSecret" in overrides ? overrides.authSecret : AUTH_SECRET,
  } as unknown as BillingPluginState["config"];
}

/** Build a fake IncomingMessage with the given headers. */
function makeReq(headers: Record<string, string>): IncomingMessage {
  const lowered: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowered[k.toLowerCase()] = v;
  }
  return { headers: lowered, socket: { remoteAddress: undefined } } as unknown as IncomingMessage;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let handle: TestDbHandle;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  await clearBillingState();
  await handle.close();
});

beforeEach(async () => {
  vi.unstubAllEnvs();
  await clearBillingState();
});

// ---------------------------------------------------------------------------
// Precedence chain
// ---------------------------------------------------------------------------

describe("resolveBillingIdentity — x-api-key path", () => {
  it("resolves via x-api-key when key exists", async () => {
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(),
    });

    const { plaintext, id } = await mintApiKey(handle.db, {
      wallet: WALLET,
      name: "resolver-test",
      authSecret: AUTH_SECRET,
    });

    const req = makeReq({ "x-api-key": plaintext });
    const identity = await resolveBillingIdentity(req);
    expect(identity).not.toBeNull();
    expect(identity!.wallet.toLowerCase()).toBe(WALLET.toLowerCase());
    expect(identity!.apiKeyId).toBe(id);
  });

  it("returns null for invalid x-api-key", async () => {
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(),
    });

    const req = makeReq({ "x-api-key": "sk-ai-" + "0".repeat(64) });
    const identity = await resolveBillingIdentity(req);
    expect(identity).toBeNull();
  });
});

describe("resolveBillingIdentity — Bearer JWT path", () => {
  it("resolves via Bearer when token is valid", async () => {
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(),
    });

    const token = await issueSession(WALLET, AUTH_SECRET, 60_000);
    const req = makeReq({ authorization: `Bearer ${token}` });
    const identity = await resolveBillingIdentity(req);
    expect(identity).not.toBeNull();
    expect(identity!.wallet.toLowerCase()).toBe(WALLET.toLowerCase());
    // JWT path does NOT set apiKeyId.
    expect(identity!.apiKeyId).toBeUndefined();
  });

  it("returns null for an invalid bearer token", async () => {
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(),
    });

    const req = makeReq({ authorization: "Bearer not.a.real.jwt" });
    const identity = await resolveBillingIdentity(req);
    expect(identity).toBeNull();
  });
});

describe("resolveBillingIdentity — precedence", () => {
  it("x-api-key wins over Bearer when both are present", async () => {
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(),
    });

    // Mint a key for WALLET; issue a JWT for a DIFFERENT wallet. The x-api-key
    // path should return WALLET (not the JWT wallet).
    const { plaintext, id } = await mintApiKey(handle.db, {
      wallet: WALLET,
      name: "precedence-test",
      authSecret: AUTH_SECRET,
    });
    const otherWallet = "0xfeedface00000000000000000000000000000099" as Address;
    const token = await issueSession(otherWallet, AUTH_SECRET, 60_000);

    const req = makeReq({
      "x-api-key": plaintext,
      authorization: `Bearer ${token}`,
    });
    const identity = await resolveBillingIdentity(req);
    expect(identity).not.toBeNull();
    expect(identity!.wallet.toLowerCase()).toBe(WALLET.toLowerCase());
    expect(identity!.apiKeyId).toBe(id);
  });
});

describe("resolveBillingIdentity — no headers", () => {
  it("returns null when no auth headers and no dev escape are present", async () => {
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(),
    });

    const identity = await resolveBillingIdentity(makeReq({}));
    expect(identity).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dev escape (x-dev-wallet)
// ---------------------------------------------------------------------------

describe("resolveBillingIdentity — x-dev-wallet escape", () => {
  it("resolves via x-dev-wallet when authRequired=false AND NODE_ENV=development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ authRequired: false }),
    });

    const req = makeReq({ "x-dev-wallet": DEV_WALLET });
    const identity = await resolveBillingIdentity(req);
    expect(identity).not.toBeNull();
    expect(identity!.wallet.toLowerCase()).toBe(DEV_WALLET.toLowerCase());
  });

  it("returns null when authRequired=true (even in dev mode)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ authRequired: true }),
    });

    const req = makeReq({ "x-dev-wallet": DEV_WALLET });
    const identity = await resolveBillingIdentity(req);
    expect(identity).toBeNull();
  });

  it("returns null when NODE_ENV is not 'development' (production guard)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ authRequired: false }),
    });

    const req = makeReq({ "x-dev-wallet": DEV_WALLET });
    const identity = await resolveBillingIdentity(req);
    expect(identity).toBeNull();
  });

  it("returns null for malformed x-dev-wallet value", async () => {
    vi.stubEnv("NODE_ENV", "development");
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ authRequired: false }),
    });

    const req = makeReq({ "x-dev-wallet": "not-an-address" });
    const identity = await resolveBillingIdentity(req);
    expect(identity).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Safety: missing auth secret
// ---------------------------------------------------------------------------

describe("resolveBillingIdentity — missing authSecret", () => {
  it("returns null when config.authSecret is undefined", async () => {
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ authSecret: undefined }),
    });

    // Even with a Bearer header present, missing authSecret short-circuits.
    const req = makeReq({ authorization: "Bearer doesnt-matter" });
    const identity = await resolveBillingIdentity(req);
    expect(identity).toBeNull();
  });
});
