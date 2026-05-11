/**
 * Tests for the billing gate (`middleware/billing-gate.ts`).
 *
 * Covers the full reserve/commit/release cycle plus all rejection paths:
 *   - 401 invalid_auth (no headers)
 *   - 400 unsupported_model (missing or unknown model)
 *   - 503 price oracle unavailable (no TWAP, no fixedTonUsd)
 *   - 402 insufficient_balance
 *   - happy path with TWAP cache snapshot
 *   - happy path with fixedTonUsd bypass
 *   - commit() persists outcome + accrued
 *   - release() restores balance
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import type { IncomingMessage } from "node:http";
import type { Address } from "viem";
import { eq } from "drizzle-orm";
import { applyBillingGate } from "../../middleware/billing-gate.js";
import {
  setBillingState,
  clearBillingState,
  type BillingPluginState,
} from "../../state.js";
import { createTestDb, type TestDbHandle } from "../db-harness.js";
import {
  mintApiKey,
  TwapCache,
  creditState,
  reservations,
  type BillingDatabase,
} from "@tokagentos/billing";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Distinct wallet per test to avoid cross-test PGLite state contamination
// (the credit-state row, prior reservations, and minted API keys are not
// reset between tests in the shared DB harness).
const AUTH_SECRET = "test-billing-gate-secret";
const TON_USD = 0.05;

let walletCounter = 0;
function nextWallet(): Address {
  walletCounter++;
  const suffix = walletCounter.toString(16).padStart(40, "0");
  return ("0x" + suffix) as Address;
}

/** Build a BillingPluginState["config"] stub with the required gate fields. */
function makeConfig(extra: Record<string, unknown> = {}): BillingPluginState["config"] {
  return {
    enabled: true,
    authRequired: true,
    authSecret: AUTH_SECRET,
    effectiveMarginBps: 0,
    // fixedTonUsd intentionally omitted (TWAP path); tests override per case.
    ...extra,
  } as unknown as BillingPluginState["config"];
}

/** Build a TwapCache pre-loaded with a fixed price snapshot. */
function makeTwapCache(tonUsd: number): TwapCache {
  const cache = new TwapCache();
  cache.set({
    tonUsd,
    source: "composite-twap",
    fetchedAt: Date.now(),
    ageMs: 0,
  });
  return cache;
}

/** Build a mock IncomingMessage with the given headers. */
function makeReq(headers: Record<string, string>): IncomingMessage {
  const lowered: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowered[k.toLowerCase()] = v;
  }
  return { headers: lowered, socket: { remoteAddress: undefined } } as unknown as IncomingMessage;
}

/** Standard well-formed chat-completions body. */
function makeBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: "claude-haiku-4-5",
    messages: [{ role: "user", content: "hello world" }],
    max_tokens: 256,
    ...overrides,
  };
}

/**
 * Seed (or reset) the credit-state row for `wallet` with a given balance.
 *
 * Upserts because tests share a single PGLite DB and each test starts from
 * a known state. ON CONFLICT DO UPDATE resets balance/reserved/accrued so
 * a previous test's state never leaks into the next.
 */
async function seedBalance(db: BillingDatabase, wallet: Address, balance: bigint): Promise<void> {
  const w = wallet.toLowerCase();
  await db
    .insert(creditState)
    .values({
      wallet: w,
      balance,
      reserved: 0n,
      accrued: 0n,
      firstAccrualAt: null,
      lastHydratedAt: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: creditState.wallet,
      set: { balance, reserved: 0n, accrued: 0n, updatedAt: new Date() },
    });
}

/** Read the credit_state row for a wallet. */
async function readState(db: BillingDatabase, wallet: Address): Promise<{
  balance: bigint;
  reserved: bigint;
  accrued: bigint;
}> {
  const rows = await db
    .select()
    .from(creditState)
    .where(eq(creditState.wallet, wallet.toLowerCase()));
  if (rows.length === 0) {
    return { balance: 0n, reserved: 0n, accrued: 0n };
  }
  const r = rows[0]!;
  return { balance: r.balance, reserved: r.reserved, accrued: r.accrued };
}

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
});

// ---------------------------------------------------------------------------
// Negative paths
// ---------------------------------------------------------------------------

describe("applyBillingGate — rejection paths", () => {
  it("returns 401 invalid_auth when no auth headers are present", async () => {
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ fixedTonUsd: TON_USD }),
    });

    const result = await applyBillingGate(makeReq({}), makeBody());
    expect(result.allow).toBe(false);
    expect(result.status).toBe(401);
    expect(result.reason).toBe("invalid_auth");
  });

  it("returns 400 unsupported_model when model field is missing", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "gate-missing-model",
      authSecret: AUTH_SECRET,
    });
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ fixedTonUsd: TON_USD }),
    });

    const body = makeBody();
    delete (body as Record<string, unknown>).model;
    const result = await applyBillingGate(makeReq({ "x-api-key": plaintext }), body);
    expect(result.allow).toBe(false);
    expect(result.status).toBe(400);
    expect(result.reason).toBe("unsupported_model");
  });

  it("returns 400 unsupported_model when model is not in allowlist", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "gate-bad-model",
      authSecret: AUTH_SECRET,
    });
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ fixedTonUsd: TON_USD }),
    });

    const result = await applyBillingGate(
      makeReq({ "x-api-key": plaintext }),
      makeBody({ model: "made-up-model" }),
    );
    expect(result.allow).toBe(false);
    expect(result.status).toBe(400);
    expect(result.reason).toBe("unsupported_model");
  });

  it("returns 503 when no TWAP price and no fixedTonUsd", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "gate-no-price",
      authSecret: AUTH_SECRET,
    });
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(), // no fixedTonUsd
      // twapCache intentionally absent.
    });

    const result = await applyBillingGate(makeReq({ "x-api-key": plaintext }), makeBody());
    expect(result.allow).toBe(false);
    expect(result.status).toBe(503);
  });

  it("returns 402 insufficient_balance when balance is 0", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "gate-insufficient",
      authSecret: AUTH_SECRET,
    });
    await seedBalance(handle.db, wallet, 0n);
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ fixedTonUsd: TON_USD }),
    });

    const result = await applyBillingGate(makeReq({ "x-api-key": plaintext }), makeBody());
    expect(result.allow).toBe(false);
    expect(result.status).toBe(402);
    expect(result.reason).toBe("insufficient_balance");
    expect(result.body).toMatchObject({
      requiredPton: expect.any(String),
      availablePton: expect.any(String),
    });
  });
});

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

describe("applyBillingGate — happy path with TWAP cache", () => {
  it("allows the request and creates a reservation when balance is sufficient", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "gate-happy-twap",
      authSecret: AUTH_SECRET,
    });
    // Huge balance — enough to cover any max-cost estimate.
    const HUGE = 10n ** 24n;
    await seedBalance(handle.db, wallet, HUGE);

    const twapCache = makeTwapCache(TON_USD);
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(), // no fixedTonUsd; TWAP cache supplies the price
      twapCache,
    });

    const result = await applyBillingGate(
      makeReq({ "x-api-key": plaintext }),
      makeBody(),
    );
    expect(result.allow).toBe(true);
    expect(result.status).toBe(200);
    expect(typeof result.commit).toBe("function");
    expect(typeof result.release).toBe("function");

    // Verify a reservation row was created for THIS wallet.
    const rsv = await handle.db
      .select()
      .from(reservations)
      .where(eq(reservations.wallet, wallet.toLowerCase()));
    expect(rsv.length).toBe(1);
    expect(rsv[0]!.outcome).toBeNull(); // not committed yet
    expect(rsv[0]!.amountPton).toBeGreaterThan(0n);
  });
});

describe("applyBillingGate — fixedTonUsd bypass", () => {
  it("allows the request without TWAP cache when fixedTonUsd is set", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "gate-fixed-bypass",
      authSecret: AUTH_SECRET,
    });
    await seedBalance(handle.db, wallet, 10n ** 24n);

    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ fixedTonUsd: TON_USD }),
      // No twapCache: relies entirely on fixedTonUsd.
    });

    const result = await applyBillingGate(
      makeReq({ "x-api-key": plaintext }),
      makeBody(),
    );
    expect(result.allow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Commit / release closures
// ---------------------------------------------------------------------------

describe("applyBillingGate — commit closure", () => {
  it("marks the reservation as committed and accrues the charge", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "gate-commit",
      authSecret: AUTH_SECRET,
    });
    const INITIAL = 10n ** 24n;
    await seedBalance(handle.db, wallet, INITIAL);

    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ fixedTonUsd: TON_USD }),
    });

    const result = await applyBillingGate(
      makeReq({ "x-api-key": plaintext }),
      makeBody(),
    );
    expect(result.allow).toBe(true);

    const before = await readState(handle.db, wallet);
    expect(before.reserved).toBeGreaterThan(0n);
    expect(before.accrued).toBe(0n);

    // Commit a tiny actual cost (1/10 cent).
    await result.commit!(0.001);

    const after = await readState(handle.db, wallet);
    expect(after.reserved).toBe(0n);
    expect(after.accrued).toBeGreaterThan(0n);

    // The reservation row should now show outcome=committed.
    const rsv = await handle.db
      .select()
      .from(reservations)
      .where(eq(reservations.wallet, wallet.toLowerCase()));
    expect(rsv.length).toBe(1);
    expect(rsv[0]!.outcome).toBe("committed");
  });
});

describe("applyBillingGate — release closure", () => {
  it("restores the reserved amount to balance with the given outcome", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "gate-release",
      authSecret: AUTH_SECRET,
    });
    const INITIAL = 10n ** 24n;
    await seedBalance(handle.db, wallet, INITIAL);

    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ fixedTonUsd: TON_USD }),
    });

    const result = await applyBillingGate(
      makeReq({ "x-api-key": plaintext }),
      makeBody(),
    );
    expect(result.allow).toBe(true);

    const after_reserve = await readState(handle.db, wallet);
    expect(after_reserve.reserved).toBeGreaterThan(0n);
    expect(after_reserve.balance).toBeLessThan(INITIAL);

    await result.release!("released_abort");

    const after_release = await readState(handle.db, wallet);
    expect(after_release.reserved).toBe(0n);
    expect(after_release.balance).toBe(INITIAL);

    // The reservation row should now show outcome=released_abort.
    const rsv = await handle.db
      .select()
      .from(reservations)
      .where(eq(reservations.wallet, wallet.toLowerCase()));
    expect(rsv.length).toBe(1);
    expect(rsv[0]!.outcome).toBe("released_abort");
  });
});
