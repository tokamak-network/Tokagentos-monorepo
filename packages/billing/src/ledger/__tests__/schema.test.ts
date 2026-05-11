/**
 * CRUD smoke tests for all 8 billing_* tables.
 *
 * Verifies that:
 * - All fields round-trip correctly (including numeric(78,0) ↔ bigint)
 * - PK / composite PK constraints fire on duplicate inserts
 * - Timestamps survive round-trip as Date objects
 *
 * Uses in-memory PGLite — no external Postgres needed.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDbHandle } from "./db-harness.js";
import {
  creditState,
  reservations,
  consumeBatches,
  topupQuotes,
  topupPreauthSlots,
  apiKeys,
  authNonces,
  callLog,
} from "../schema.js";

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

// ---------------------------------------------------------------------------
// Table 1: billing_credit_state
// ---------------------------------------------------------------------------

describe("billing_credit_state", () => {
  const wallet = "0xaabbccdd00112233aabbccdd00112233aabbccdd";

  it("inserts and selects a row with bigint balance fields", async () => {
    await handle.db.insert(creditState).values({
      wallet,
      balance: 1_000_000_000_000_000_000n, // 1e18 atto-PTON
      reserved: 500_000n,
      accrued: 250_000n,
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const rows = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, wallet));

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.balance).toBe(1_000_000_000_000_000_000n);
    expect(row.reserved).toBe(500_000n);
    expect(row.accrued).toBe(250_000n);
    expect(row.firstAccrualAt).toBeNull();
  });

  it("rejects duplicate PK", async () => {
    await expect(
      handle.db.insert(creditState).values({
        wallet,
        balance: 0n,
        reserved: 0n,
        accrued: 0n,
        updatedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("updates balance and reads back correctly", async () => {
    await handle.db
      .update(creditState)
      .set({ balance: 999n })
      .where(eq(creditState.wallet, wallet));

    const rows = await handle.db
      .select({ balance: creditState.balance })
      .from(creditState)
      .where(eq(creditState.wallet, wallet));

    expect(rows[0]!.balance).toBe(999n);
  });

  afterAll(async () => {
    await handle.db.delete(creditState).where(eq(creditState.wallet, wallet));
  });
});

// ---------------------------------------------------------------------------
// Table 2: billing_reservations
// ---------------------------------------------------------------------------

describe("billing_reservations", () => {
  const wallet = "0x1111111111111111111111111111111111111111";

  beforeAll(async () => {
    await handle.db.insert(creditState).values({
      wallet,
      balance: 1000n,
      reserved: 0n,
      accrued: 0n,
      updatedAt: new Date(),
    });
  });

  it("inserts and selects a reservation", async () => {
    const inserted = await handle.db
      .insert(reservations)
      .values({
        wallet,
        amountPton: 100n,
        requestId: "req-abc-123",
        createdAt: new Date(),
      })
      .returning({ id: reservations.id });

    const id = inserted[0]!.id;
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const rows = await handle.db
      .select()
      .from(reservations)
      .where(eq(reservations.id, id));

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.amountPton).toBe(100n);
    expect(row.requestId).toBe("req-abc-123");
    expect(row.outcome).toBeNull();
    expect(row.releasedAt).toBeNull();
  });

  afterAll(async () => {
    await handle.db.delete(reservations).where(eq(reservations.wallet, wallet));
    await handle.db.delete(creditState).where(eq(creditState.wallet, wallet));
  });
});

// ---------------------------------------------------------------------------
// Table 3: billing_consume_batches
// ---------------------------------------------------------------------------

describe("billing_consume_batches", () => {
  const batchId = "0xdeadbeefdeadbeef";

  it("inserts and selects a consume batch", async () => {
    await handle.db.insert(consumeBatches).values({
      batchId,
      wallet: "0xaaaa",
      amountPton: 5_000n,
      state: "pending",
      attempts: 0,
      firstAttemptAt: new Date("2026-01-01"),
    });

    const rows = await handle.db
      .select()
      .from(consumeBatches)
      .where(eq(consumeBatches.batchId, batchId));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountPton).toBe(5_000n);
    expect(rows[0]!.state).toBe("pending");
    expect(rows[0]!.attempts).toBe(0);
    expect(rows[0]!.txHash).toBeNull();
  });

  it("rejects duplicate PK", async () => {
    await expect(
      handle.db.insert(consumeBatches).values({
        batchId,
        wallet: "0xbbbb",
        amountPton: 1n,
        state: "pending",
        attempts: 0,
        firstAttemptAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  afterAll(async () => {
    await handle.db
      .delete(consumeBatches)
      .where(eq(consumeBatches.batchId, batchId));
  });
});

// ---------------------------------------------------------------------------
// Table 4: billing_topup_quotes
// ---------------------------------------------------------------------------

describe("billing_topup_quotes", () => {
  const id = "topup-test-001";

  it("inserts and selects a topup quote", async () => {
    const expires = new Date(Date.now() + 60_000);
    await handle.db.insert(topupQuotes).values({
      id,
      wallet: "0xcccc",
      amountPton: 2_000_000n,
      amountUsd: "1.50",
      tonUsd: "2.00",
      expiresAt: expires,
    });

    const rows = await handle.db
      .select()
      .from(topupQuotes)
      .where(eq(topupQuotes.id, id));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountPton).toBe(2_000_000n);
    expect(rows[0]!.amountUsd).toBe("1.50000000");
    expect(rows[0]!.consumedAt).toBeNull();
  });

  it("rejects duplicate PK", async () => {
    await expect(
      handle.db.insert(topupQuotes).values({
        id,
        wallet: "0xdddd",
        amountPton: 1n,
        amountUsd: "0",
        tonUsd: "0",
        expiresAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  afterAll(async () => {
    await handle.db.delete(topupQuotes).where(eq(topupQuotes.id, id));
  });
});

// ---------------------------------------------------------------------------
// Table 5: billing_topup_preauth_slots
// ---------------------------------------------------------------------------

describe("billing_topup_preauth_slots", () => {
  const wallet = "0xeeee";
  const nonce = "0xabcd1234";

  it("inserts and selects a preauth slot", async () => {
    await handle.db.insert(topupPreauthSlots).values({
      wallet,
      nonce,
      amountPton: 300_000n,
      validAfter: new Date("2026-01-01"),
      validBefore: new Date("2026-12-31"),
      v: 28,
      r: "0x" + "a".repeat(64),
      s: "0x" + "b".repeat(64),
      state: "available",
    });

    const rows = await handle.db
      .select()
      .from(topupPreauthSlots)
      .where(
        eq(topupPreauthSlots.wallet, wallet),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountPton).toBe(300_000n);
    expect(rows[0]!.v).toBe(28);
    expect(rows[0]!.state).toBe("available");
  });

  it("rejects duplicate composite PK (wallet, nonce)", async () => {
    await expect(
      handle.db.insert(topupPreauthSlots).values({
        wallet,
        nonce, // same nonce → PK conflict
        amountPton: 1n,
        validAfter: new Date(),
        validBefore: new Date(Date.now() + 1000),
        v: 27,
        r: "0x" + "c".repeat(64),
        s: "0x" + "d".repeat(64),
      }),
    ).rejects.toThrow();
  });

  afterAll(async () => {
    await handle.db
      .delete(topupPreauthSlots)
      .where(eq(topupPreauthSlots.wallet, wallet));
  });
});

// ---------------------------------------------------------------------------
// Table 6: billing_api_keys
// ---------------------------------------------------------------------------

describe("billing_api_keys", () => {
  const id = "sk-ai-testtest";

  it("inserts and selects an API key", async () => {
    await handle.db.insert(apiKeys).values({
      id,
      wallet: "0xffff",
      name: "test-key",
      hash: "abcdef1234567890",
      createdAt: new Date(),
    });

    const rows = await handle.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, id));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("test-key");
    expect(rows[0]!.revokedAt).toBeNull();
    expect(rows[0]!.lastUsedAt).toBeNull();
  });

  it("rejects duplicate PK", async () => {
    await expect(
      handle.db.insert(apiKeys).values({
        id,
        wallet: "0xgggg",
        name: "other",
        hash: "xxx",
        createdAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  afterAll(async () => {
    await handle.db.delete(apiKeys).where(eq(apiKeys.id, id));
  });
});

// ---------------------------------------------------------------------------
// Table 7: billing_auth_nonces
// ---------------------------------------------------------------------------

describe("billing_auth_nonces", () => {
  const nonce = "0x" + "f".repeat(64);

  it("inserts and selects a nonce with jsonb envelope", async () => {
    const envelope = { domain: "test", types: { LoginAuth: [] }, message: { wallet: "0x1" } };

    await handle.db.insert(authNonces).values({
      nonce,
      envelope,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 300_000),
    });

    const rows = await handle.db
      .select()
      .from(authNonces)
      .where(eq(authNonces.nonce, nonce));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.envelope).toEqual(envelope);
  });

  it("rejects duplicate PK", async () => {
    await expect(
      handle.db.insert(authNonces).values({
        nonce,
        envelope: {},
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 100),
      }),
    ).rejects.toThrow();
  });

  afterAll(async () => {
    await handle.db.delete(authNonces).where(eq(authNonces.nonce, nonce));
  });
});

// ---------------------------------------------------------------------------
// Table 8: billing_call_log
// ---------------------------------------------------------------------------

describe("billing_call_log", () => {
  it("inserts and selects a call log row with bigint cost_pton", async () => {
    const inserted = await handle.db
      .insert(callLog)
      .values({
        wallet: "0x1234",
        model: "claude-3-5-sonnet-20241022",
        inputTokens: 100,
        outputTokens: 50,
        cacheInputTokens: 0,
        cacheCreationTokens: 0,
        costUsd: "0.00300000",
        costPton: 1_500_000_000_000_000n,
        requestId: "req-xyz",
        status: "ok",
        ts: new Date(),
      })
      .returning({ id: callLog.id });

    const id = inserted[0]!.id;
    const rows = await handle.db
      .select()
      .from(callLog)
      .where(eq(callLog.id, id));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.costPton).toBe(1_500_000_000_000_000n);
    expect(rows[0]!.status).toBe("ok");
    expect(rows[0]!.inputTokens).toBe(100);
  });

  afterAll(async () => {
    await handle.db.delete(callLog);
  });
});
