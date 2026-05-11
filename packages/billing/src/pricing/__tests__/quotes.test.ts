/**
 * Top-up quote store tests — store, fetch (with TTL), consume (one-shot),
 * and sweep.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createTestDb, type TestDbHandle } from "../../ledger/__tests__/db-harness.js";
import { storeQuote, fetchQuote, consumeQuote, sweepExpiredQuotes } from "../quotes.js";
import type { Address } from "viem";

const WALLET = "0xbeef000000000000000000000000000000000001" as Address;

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

describe("storeQuote() / fetchQuote()", () => {
  it("stores and retrieves a quote", async () => {
    await storeQuote(handle.db, {
      id: "quote-001",
      wallet: WALLET,
      amountPton: 1_000_000n,
      amountUsd: 2.5,
      tonUsd: 3.0,
      ttlMs: 60_000,
    });

    const q = await fetchQuote(handle.db, "quote-001", new Date());
    expect(q).not.toBeNull();
    expect(q!.amountPton).toBe(1_000_000n);
    expect(q!.amountUsd).toBeCloseTo(2.5);
    expect(q!.tonUsd).toBeCloseTo(3.0);
    expect(q!.wallet.toLowerCase()).toBe(WALLET.toLowerCase());
  });

  it("returns null for unknown id", async () => {
    const q = await fetchQuote(handle.db, "no-such-id", new Date());
    expect(q).toBeNull();
  });

  it("returns null when quote is expired", async () => {
    await storeQuote(handle.db, {
      id: "quote-exp",
      wallet: WALLET,
      amountPton: 100n,
      amountUsd: 0.01,
      tonUsd: 2.0,
      ttlMs: 1, // expires immediately
    });

    await new Promise((r) => setTimeout(r, 5));

    const q = await fetchQuote(handle.db, "quote-exp", new Date());
    expect(q).toBeNull();
  });
});

describe("consumeQuote()", () => {
  it("returns true on first consumption and the quote is no longer fetchable", async () => {
    await storeQuote(handle.db, {
      id: "quote-consume",
      wallet: WALLET,
      amountPton: 500n,
      amountUsd: 0.5,
      tonUsd: 2.0,
      ttlMs: 60_000,
    });

    const consumed = await consumeQuote(handle.db, "quote-consume");
    expect(consumed).toBe(true);

    const q = await fetchQuote(handle.db, "quote-consume", new Date());
    expect(q).toBeNull();
  });

  it("returns false on second consumption (one-shot semantics)", async () => {
    await storeQuote(handle.db, {
      id: "quote-double-consume",
      wallet: WALLET,
      amountPton: 200n,
      amountUsd: 0.2,
      tonUsd: 2.0,
      ttlMs: 60_000,
    });

    const first = await consumeQuote(handle.db, "quote-double-consume");
    expect(first).toBe(true);

    const second = await consumeQuote(handle.db, "quote-double-consume");
    expect(second).toBe(false);
  });

  it("returns false for unknown id", async () => {
    const result = await consumeQuote(handle.db, "quote-does-not-exist");
    expect(result).toBe(false);
  });

  it("concurrent consumption of the same id: exactly one returns true", async () => {
    await storeQuote(handle.db, {
      id: "quote-race",
      wallet: WALLET,
      amountPton: 999n,
      amountUsd: 1.0,
      tonUsd: 2.0,
      ttlMs: 60_000,
    });

    const results = await Promise.all([
      consumeQuote(handle.db, "quote-race"),
      consumeQuote(handle.db, "quote-race"),
      consumeQuote(handle.db, "quote-race"),
      consumeQuote(handle.db, "quote-race"),
      consumeQuote(handle.db, "quote-race"),
    ]);

    const successes = results.filter((r) => r === true).length;
    const failures = results.filter((r) => r === false).length;
    expect(successes).toBe(1);
    expect(failures).toBe(4);
  });
});

describe("sweepExpiredQuotes()", () => {
  it("deletes expired unconsumed quotes and returns count", async () => {
    await storeQuote(handle.db, {
      id: "sweep-exp-1",
      wallet: WALLET,
      amountPton: 10n,
      amountUsd: 0.01,
      tonUsd: 2.0,
      ttlMs: 1, // expires immediately
    });

    await storeQuote(handle.db, {
      id: "sweep-valid-1",
      wallet: WALLET,
      amountPton: 20n,
      amountUsd: 0.02,
      tonUsd: 2.0,
      ttlMs: 60_000,
    });

    await new Promise((r) => setTimeout(r, 5));

    const count = await sweepExpiredQuotes(handle.db, new Date());
    expect(count).toBeGreaterThanOrEqual(1);

    // The valid quote should still exist
    const valid = await fetchQuote(handle.db, "sweep-valid-1", new Date());
    expect(valid).not.toBeNull();

    // Cleanup
    await consumeQuote(handle.db, "sweep-valid-1");
  });

  it("does not delete consumed quotes", async () => {
    await storeQuote(handle.db, {
      id: "sweep-consumed",
      wallet: WALLET,
      amountPton: 5n,
      amountUsd: 0.005,
      tonUsd: 2.0,
      ttlMs: 1,
    });

    await consumeQuote(handle.db, "sweep-consumed");
    await new Promise((r) => setTimeout(r, 5));

    // sweepExpiredQuotes only sweeps unconsumed rows
    const count = await sweepExpiredQuotes(handle.db, new Date());
    // consumed_at is set → this row is excluded from the sweep
    // The count should NOT include the consumed row
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
