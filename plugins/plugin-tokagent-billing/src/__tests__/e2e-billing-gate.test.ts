/**
 * E2E billing gate test (Phase 6b validation gate, Decision Z35).
 *
 * Exercises the FULL reserve → simulated-provider-call → commit cycle through
 * the `applyBillingMiddleware` composer — the same entrypoint that the agent
 * server's BILLING_HOOK seam calls in production.
 *
 * Unlike `billing-gate.test.ts` (which tests `applyBillingGate` directly),
 * this file validates the production integration point including:
 *
 *   - Path gating (`isBillingGatedPath`).
 *   - Identity resolution from real HTTP-shaped IncomingMessage.
 *   - Reservation creation and balance deduction.
 *   - The commit/release closures exposed to chat-routes.ts.
 *   - Conservation invariant: `balance + reserved + accrued == initial`.
 *
 * No anvil required: on-chain consume runs out-of-band via the worker
 * (Phase 5 scope). This test asserts the in-process ledger contract only.
 *
 * No real HTTP server, no full agent boot, no upstream LiteLLM call —
 * we mock the upstream as a `vi.fn()` and feed its captured usage back
 * into `commit(actualUsd)` to mirror the production flow.
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { Address } from "viem";
import { eq } from "drizzle-orm";
import { applyBillingMiddleware, resetBillingLimiters } from "../middleware/index.js";
import {
  setBillingState,
  clearBillingState,
  type BillingPluginState,
} from "../state.js";
import { createTestDb, type TestDbHandle } from "./db-harness.js";
import {
  mintApiKey,
  TwapCache,
  creditState,
  reservations,
  callLog,
  computeCharge,
  usdToPton,
  type BillingDatabase,
} from "@tokagentos/billing";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_SECRET = "e2e-billing-gate-secret";
const TON_USD = 0.05;

let walletCounter = 0;
function nextWallet(): Address {
  walletCounter++;
  const suffix = walletCounter.toString(16).padStart(40, "0");
  return ("0x" + suffix) as Address;
}

function makeConfig(extra: Record<string, unknown> = {}): BillingPluginState["config"] {
  return {
    enabled: true,
    authRequired: true,
    authSecret: AUTH_SECRET,
    authSessionTtlMs: 86_400_000,
    authLoginNonceTtlMs: 300_000,
    rateLimitEnabled: false,
    rateLimitQuotePerMin: 60,
    rateLimitSettlePerMin: 30,
    effectiveMarginBps: 100,
    fixedTonUsd: TON_USD,
    ...extra,
  } as unknown as BillingPluginState["config"];
}

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

function makeReq(headers: Record<string, string>): IncomingMessage {
  const lowered: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowered[k.toLowerCase()] = v;
  }
  return {
    headers: lowered,
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as IncomingMessage;
}

function makeBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: "claude-haiku-4-5",
    messages: [{ role: "user", content: "hello world" }],
    max_tokens: 256,
    ...overrides,
  };
}

async function seedBalance(
  db: BillingDatabase,
  wallet: Address,
  balance: bigint,
): Promise<void> {
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

async function readState(
  db: BillingDatabase,
  wallet: Address,
): Promise<{ balance: bigint; reserved: bigint; accrued: bigint }> {
  const rows = await db
    .select()
    .from(creditState)
    .where(eq(creditState.wallet, wallet.toLowerCase()));
  if (rows.length === 0) return { balance: 0n, reserved: 0n, accrued: 0n };
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
  resetBillingLimiters();
  await clearBillingState();
});

// ---------------------------------------------------------------------------
// E2E happy path: full reserve → upstream → commit cycle
// ---------------------------------------------------------------------------

describe("e2e: applyBillingMiddleware — reserve → commit", () => {
  it("reserves credits, simulates upstream call, commits actual cost, preserves conservation", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "e2e-happy",
      authSecret: AUTH_SECRET,
    });
    const INITIAL = 10n ** 21n; // 1000 TON
    await seedBalance(handle.db, wallet, INITIAL);

    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(),
      twapCache: makeTwapCache(TON_USD),
    });

    // Mock the upstream LiteLLM provider — never actually called. We capture
    // the would-be request and return a fixed Anthropic-shaped usage response.
    const mockUpstream = vi.fn().mockResolvedValue({
      id: "msg_test_e2e_01",
      model: "claude-haiku-4-5",
      content: [{ type: "text", text: "hi" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    // ── Step 1: Call applyBillingMiddleware (BILLING_HOOK seam) ────────────
    const body = makeBody();
    const gate = await applyBillingMiddleware(
      makeReq({ "x-api-key": plaintext, "content-type": "application/json" }),
      body,
      "/v1/chat/completions",
    );

    // ── Assert: gate allowed, closures returned ────────────────────────────
    expect(gate.allow).toBe(true);
    expect(gate.status).toBe(200);
    expect(typeof gate.commit).toBe("function");
    expect(typeof gate.release).toBe("function");

    // Assert: reservation row exists, outcome is null (uncommitted).
    const rsvBefore = await handle.db
      .select()
      .from(reservations)
      .where(eq(reservations.wallet, wallet.toLowerCase()));
    expect(rsvBefore.length).toBe(1);
    expect(rsvBefore[0]!.outcome).toBeNull();
    expect(rsvBefore[0]!.amountPton).toBeGreaterThan(0n);
    const reservedAmount = rsvBefore[0]!.amountPton;

    // Assert: balance decremented, reserved increased.
    const stateAfterReserve = await readState(handle.db, wallet);
    expect(stateAfterReserve.reserved).toBe(reservedAmount);
    expect(stateAfterReserve.balance).toBe(INITIAL - reservedAmount);
    expect(stateAfterReserve.accrued).toBe(0n);

    // ── Step 2: Simulate upstream LLM call ─────────────────────────────────
    const upstreamResponse = await mockUpstream(body);
    expect(mockUpstream).toHaveBeenCalledTimes(1);
    expect(upstreamResponse.usage.input_tokens).toBe(100);
    expect(upstreamResponse.usage.output_tokens).toBe(50);

    // Compute actual cost from the mocked usage. Haiku pricing at 100 in + 50 out
    // is fractions of a cent — well below the reservation max-cost estimate.
    // Rather than re-derive from the rates table, we use a small fixed actualUsd
    // that we know is below the reservation amount.
    const actualUsd = 0.0005; // ~50/100ths of a cent

    // ── Step 3: Commit the reservation with the actual cost + usage params ──
    // Phase 6c (Fix 4 / Z38): passing params writes a billing_call_log row.
    await gate.commit!(actualUsd, {
      inputTokens: upstreamResponse.usage.input_tokens,
      outputTokens: upstreamResponse.usage.output_tokens,
      model: upstreamResponse.model,
      status: "ok",
    });

    // ── Assert: reservation outcome=committed, reserved cleared, accrued > 0 ─
    const rsvAfter = await handle.db
      .select()
      .from(reservations)
      .where(eq(reservations.wallet, wallet.toLowerCase()));
    expect(rsvAfter.length).toBe(1);
    expect(rsvAfter[0]!.outcome).toBe("committed");

    const stateAfterCommit = await readState(handle.db, wallet);
    expect(stateAfterCommit.reserved).toBe(0n);
    expect(stateAfterCommit.accrued).toBeGreaterThan(0n);

    // Verify accrued ≈ computed charge (within rounding).
    const expectedCharge = computeCharge({
      actualUsd,
      tonUsd: TON_USD,
      marginBps: 100,
    });
    expect(stateAfterCommit.accrued).toBe(expectedCharge.totalPton);

    // ── Assert: conservation invariant ─────────────────────────────────────
    // balance + reserved + accrued must equal INITIAL after commit.
    const total =
      stateAfterCommit.balance +
      stateAfterCommit.reserved +
      stateAfterCommit.accrued;
    expect(total).toBe(INITIAL);

    // ── Assert: billing_call_log row was written (Fix 4 / Z38) ─────────────
    const logRows = await handle.db
      .select()
      .from(callLog)
      .where(eq(callLog.wallet, wallet.toLowerCase()));
    expect(logRows.length).toBe(1);
    const logRow = logRows[0]!;
    expect(logRow.model).toBe("claude-haiku-4-5");
    expect(logRow.inputTokens).toBe(100);
    expect(logRow.outputTokens).toBe(50);
    expect(logRow.status).toBe("ok");
    expect(logRow.costPton).toBe(expectedCharge.totalPton);
  });

  it("commit() WITHOUT params still works (backward compat) — no call_log row", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "e2e-commit-no-params",
      authSecret: AUTH_SECRET,
    });
    const INITIAL = 10n ** 21n;
    await seedBalance(handle.db, wallet, INITIAL);

    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(),
      twapCache: makeTwapCache(TON_USD),
    });

    const gate = await applyBillingMiddleware(
      makeReq({ "x-api-key": plaintext }),
      makeBody(),
      "/v1/chat/completions",
    );
    expect(gate.allow).toBe(true);

    // Commit without params — should NOT write a call_log row.
    await gate.commit!(0.001);

    const logRows = await handle.db
      .select()
      .from(callLog)
      .where(eq(callLog.wallet, wallet.toLowerCase()));
    expect(logRows.length).toBe(0);

    // But the ledger commit still applied (accrued > 0).
    const state = await readState(handle.db, wallet);
    expect(state.accrued).toBeGreaterThan(0n);
    expect(state.reserved).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// E2E negative path: insufficient balance → 402
// ---------------------------------------------------------------------------

describe("e2e: applyBillingMiddleware — insufficient balance", () => {
  it("returns 402 billing_error with insufficient_balance code", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "e2e-insufficient",
      authSecret: AUTH_SECRET,
    });
    await seedBalance(handle.db, wallet, 1n); // one atto-PTON only

    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(),
      twapCache: makeTwapCache(TON_USD),
    });

    const gate = await applyBillingMiddleware(
      makeReq({ "x-api-key": plaintext }),
      makeBody(),
      "/v1/chat/completions",
    );

    expect(gate.allow).toBe(false);
    expect(gate.status).toBe(402);
    expect(gate.body).toMatchObject({
      type: "billing_error",
      code: "insufficient_balance",
      message: expect.any(String),
      requiredPton: expect.any(String),
      availablePton: expect.any(String),
    });
    // No commit/release closures on failure.
    expect(gate.commit).toBeUndefined();
    expect(gate.release).toBeUndefined();

    // Balance is unchanged (the wallet's 1n atto-PTON is still there).
    const state = await readState(handle.db, wallet);
    expect(state.balance).toBe(1n);
    expect(state.reserved).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// E2E release-on-abort: gate.release restores balance
// ---------------------------------------------------------------------------

describe("e2e: applyBillingMiddleware — release on abort", () => {
  it("restores the full reserved amount when release('released_abort') is called", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "e2e-release-abort",
      authSecret: AUTH_SECRET,
    });
    const INITIAL = 10n ** 21n;
    await seedBalance(handle.db, wallet, INITIAL);

    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(),
      twapCache: makeTwapCache(TON_USD),
    });

    const gate = await applyBillingMiddleware(
      makeReq({ "x-api-key": plaintext }),
      makeBody(),
      "/v1/chat/completions",
    );

    expect(gate.allow).toBe(true);
    const stateAfterReserve = await readState(handle.db, wallet);
    expect(stateAfterReserve.reserved).toBeGreaterThan(0n);
    expect(stateAfterReserve.balance).toBeLessThan(INITIAL);

    // Simulate aborted upstream call.
    await gate.release!("released_abort");

    // Assert: balance fully restored, reserved cleared, accrued unchanged (0).
    const stateAfterRelease = await readState(handle.db, wallet);
    expect(stateAfterRelease.reserved).toBe(0n);
    expect(stateAfterRelease.balance).toBe(INITIAL);
    expect(stateAfterRelease.accrued).toBe(0n);

    // Reservation row should show the abort outcome.
    const rsv = await handle.db
      .select()
      .from(reservations)
      .where(eq(reservations.wallet, wallet.toLowerCase()));
    expect(rsv.length).toBe(1);
    expect(rsv[0]!.outcome).toBe("released_abort");
  });
});

// ---------------------------------------------------------------------------
// E2E path-gating: non-gated path is a passthrough
// ---------------------------------------------------------------------------

describe("e2e: applyBillingMiddleware — non-gated path passthrough", () => {
  it("returns allow=true without reserving for paths outside the gated set", async () => {
    const wallet = nextWallet();
    const { plaintext } = await mintApiKey(handle.db, {
      wallet,
      name: "e2e-passthrough",
      authSecret: AUTH_SECRET,
    });
    const INITIAL = 10n ** 21n;
    await seedBalance(handle.db, wallet, INITIAL);

    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig(),
      twapCache: makeTwapCache(TON_USD),
    });

    // `/v1/credits/me` is NOT in `isBillingGatedPath` — the middleware
    // short-circuits before reaching the gate.
    const gate = await applyBillingMiddleware(
      makeReq({ "x-api-key": plaintext }),
      makeBody(),
      "/v1/credits/me",
    );

    expect(gate.allow).toBe(true);
    expect(gate.status).toBe(200);
    expect(gate.commit).toBeUndefined();
    expect(gate.release).toBeUndefined();

    // Assert: no reservation was created, balance is unchanged.
    const state = await readState(handle.db, wallet);
    expect(state.balance).toBe(INITIAL);
    expect(state.reserved).toBe(0n);

    const rsv = await handle.db
      .select()
      .from(reservations)
      .where(eq(reservations.wallet, wallet.toLowerCase()));
    expect(rsv.length).toBe(0);
  });
});
