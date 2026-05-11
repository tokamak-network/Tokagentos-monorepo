/**
 * Unit tests for the DB-backed credit ledger primitives.
 *
 * Each test creates a fresh credit_state row and exercises one
 * ledger function, verifying the DB state after the operation.
 */

import { describe, it, beforeEach, afterEach, beforeAll, afterAll, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDbHandle } from "./db-harness.js";
import { creditState, reservations } from "../schema.js";
import {
  reserve,
  release,
  commit,
  hydrate,
  flushAccrued,
} from "../ledger.js";
import type { Address } from "viem";

const WALLET = "0xaaaa000000000000000000000000000000000001" as Address;

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

// Reset per test: delete reservations and credit_state for the test wallet.
beforeEach(async () => {
  await handle.db.delete(reservations).where(eq(reservations.wallet, WALLET.toLowerCase()));
  await handle.db.delete(creditState).where(eq(creditState.wallet, WALLET.toLowerCase()));
  // Seed a fresh balance of 1000n
  await handle.db.insert(creditState).values({
    wallet: WALLET.toLowerCase(),
    balance: 1000n,
    reserved: 0n,
    accrued: 0n,
    updatedAt: new Date(),
  });
});

afterEach(async () => {
  await handle.db.delete(reservations).where(eq(reservations.wallet, WALLET.toLowerCase()));
  await handle.db.delete(creditState).where(eq(creditState.wallet, WALLET.toLowerCase()));
});

// ---------------------------------------------------------------------------
// reserve()
// ---------------------------------------------------------------------------

describe("reserve()", () => {
  it("succeeds when balance is sufficient", async () => {
    const result = await reserve(handle.db, {
      wallet: WALLET,
      amount: 100n,
      requestId: "req-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    expect(result.available).toBe(900n);
    expect(result.reservationId).toBeTruthy();

    const rows = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, WALLET.toLowerCase()));
    expect(rows[0]!.balance).toBe(900n);
    expect(rows[0]!.reserved).toBe(100n);
  });

  it("fails when balance is insufficient", async () => {
    const result = await reserve(handle.db, {
      wallet: WALLET,
      amount: 9999n, // more than 1000n balance
      requestId: "req-2",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.available).toBe(1000n);

    // State unchanged
    const rows = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, WALLET.toLowerCase()));
    expect(rows[0]!.balance).toBe(1000n);
    expect(rows[0]!.reserved).toBe(0n);
  });

  it("fails exactly at balance boundary (amount === balance + 1)", async () => {
    const result = await reserve(handle.db, {
      wallet: WALLET,
      amount: 1001n,
      requestId: "req-3",
    });
    expect(result.ok).toBe(false);
  });

  it("succeeds at exact balance (amount === balance)", async () => {
    const result = await reserve(handle.db, {
      wallet: WALLET,
      amount: 1000n,
      requestId: "req-4",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.available).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// commit()
// ---------------------------------------------------------------------------

describe("commit()", () => {
  it("decrements reserved and increments accrued", async () => {
    const r = await reserve(handle.db, {
      wallet: WALLET,
      amount: 200n,
      requestId: "req-c1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");

    await commit(handle.db, r.reservationId, 150n);

    const rows = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, WALLET.toLowerCase()));
    const s = rows[0]!;
    expect(s.reserved).toBe(0n); // fully consumed
    expect(s.accrued).toBe(150n); // actual charge
    expect(s.balance).toBe(850n); // 1000 - 200 reservation + 50 refund
    expect(s.firstAccrualAt).toBeInstanceOf(Date);
  });

  it("caps charge at reservation amount when totalPton > reserved", async () => {
    const r = await reserve(handle.db, {
      wallet: WALLET,
      amount: 100n,
      requestId: "req-c2",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");

    // totalPton > reservation — charge is capped at reservation
    await commit(handle.db, r.reservationId, 500n);

    const rows = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, WALLET.toLowerCase()));
    expect(rows[0]!.accrued).toBe(100n); // capped at reservation
    expect(rows[0]!.balance).toBe(900n); // 1000 - 100 (no refund since all consumed)
  });

  it("throws if reservation already committed", async () => {
    const r = await reserve(handle.db, {
      wallet: WALLET,
      amount: 50n,
      requestId: "req-c3",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");

    await commit(handle.db, r.reservationId, 50n);

    await expect(commit(handle.db, r.reservationId, 50n)).rejects.toThrow(
      /already committed/i,
    );
  });
});

// ---------------------------------------------------------------------------
// release()
// ---------------------------------------------------------------------------

describe("release()", () => {
  it("restores balance after released_complete", async () => {
    const r = await reserve(handle.db, {
      wallet: WALLET,
      amount: 300n,
      requestId: "req-r1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");

    await release(handle.db, r.reservationId, "released_complete");

    const rows = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, WALLET.toLowerCase()));
    expect(rows[0]!.balance).toBe(1000n);
    expect(rows[0]!.reserved).toBe(0n);
  });

  it("restores balance after released_abort", async () => {
    const r = await reserve(handle.db, {
      wallet: WALLET,
      amount: 400n,
      requestId: "req-r2",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");

    await release(handle.db, r.reservationId, "released_abort");

    const rows = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, WALLET.toLowerCase()));
    expect(rows[0]!.balance).toBe(1000n);
  });

  it("throws if reservation already released", async () => {
    const r = await reserve(handle.db, {
      wallet: WALLET,
      amount: 50n,
      requestId: "req-r3",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");

    await release(handle.db, r.reservationId, "released_complete");
    await expect(
      release(handle.db, r.reservationId, "released_abort"),
    ).rejects.toThrow(/already released/i);
  });
});

// ---------------------------------------------------------------------------
// hydrate()
// ---------------------------------------------------------------------------

describe("hydrate()", () => {
  it("sets balance from on-chain reading (initial hydration)", async () => {
    await hydrate(handle.db, WALLET, 5000n);

    const rows = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, WALLET.toLowerCase()));
    // balance = onChain - reserved - accrued = 5000 - 0 - 0
    expect(rows[0]!.balance).toBe(5000n);
    expect(rows[0]!.lastHydratedAt).toBeInstanceOf(Date);
  });

  it("accounts for reserved + accrued when setting balance", async () => {
    // Reserve 100 first
    const r = await reserve(handle.db, {
      wallet: WALLET,
      amount: 100n,
      requestId: "req-h1",
    });
    expect(r.ok).toBe(true);

    // On-chain says 1000 total; local reserved=100 accrued=0
    // expected balance = 1000 - 100 - 0 = 900
    await hydrate(handle.db, WALLET, 1000n);

    const rows = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, WALLET.toLowerCase()));
    expect(rows[0]!.balance).toBe(900n);
  });

  it("clamps balance to 0 when on-chain is below committed (outside-withdraw race)", async () => {
    // Reserve 800 — so reserved=800, balance=200
    const r = await reserve(handle.db, {
      wallet: WALLET,
      amount: 800n,
      requestId: "req-h2",
    });
    expect(r.ok).toBe(true);

    // On-chain now shows only 500 (user withdrew externally)
    // localCommitted = 800, onChain = 500 → balance clamped to 0
    await hydrate(handle.db, WALLET, 500n);

    const rows = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, WALLET.toLowerCase()));
    expect(rows[0]!.balance).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// flushAccrued()
// ---------------------------------------------------------------------------

describe("flushAccrued()", () => {
  it("returns null when accrued is zero", async () => {
    const result = await flushAccrued(handle.db, WALLET);
    expect(result).toBeNull();
  });

  it("returns accrued amount and zeros it out", async () => {
    // Build up some accrual via reserve+commit
    const r1 = await reserve(handle.db, {
      wallet: WALLET,
      amount: 300n,
      requestId: "req-f1",
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) throw new Error();
    await commit(handle.db, r1.reservationId, 300n);

    const r2 = await reserve(handle.db, {
      wallet: WALLET,
      amount: 200n,
      requestId: "req-f2",
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) throw new Error();
    await commit(handle.db, r2.reservationId, 150n);

    // Total accrued = 300 + 150 = 450
    const flushed = await flushAccrued(handle.db, WALLET);
    expect(flushed).not.toBeNull();
    expect(flushed!.amount).toBe(450n);
    expect(flushed!.firstAccrualAt).toBeInstanceOf(Date);

    // Second flush: accrued is now 0
    const second = await flushAccrued(handle.db, WALLET);
    expect(second).toBeNull();

    // DB state: accrued = 0n, firstAccrualAt = null
    const rows = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, WALLET.toLowerCase()));
    expect(rows[0]!.accrued).toBe(0n);
    expect(rows[0]!.firstAccrualAt).toBeNull();
  });
});
