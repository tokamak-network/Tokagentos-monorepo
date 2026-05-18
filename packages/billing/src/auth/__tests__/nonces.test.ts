/**
 * SIWE nonce store tests — issue, consume (one-shot), sweep.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createTestDb, type TestDbHandle } from "../../ledger/__tests__/db-harness.js";
import { issueNonce, consumeNonce, sweepExpiredNonces } from "../nonces.js";

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

const ENVELOPE = {
  domain: { name: "Tokagent", version: "1", chainId: 1 },
  types: { LoginAuth: [{ name: "wallet", type: "address" }] },
  message: { wallet: "0xface" },
};

describe("issueNonce()", () => {
  it("returns a 0x-prefixed 64-char hex nonce", async () => {
    const nonce = await issueNonce(handle.db, ENVELOPE, 300_000);
    expect(nonce).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("two issues produce different nonces", async () => {
    const a = await issueNonce(handle.db, ENVELOPE, 300_000);
    const b = await issueNonce(handle.db, ENVELOPE, 300_000);
    expect(a).not.toBe(b);
  });
});

describe("consumeNonce()", () => {
  it("returns the envelope on first consumption", async () => {
    const nonce = await issueNonce(handle.db, ENVELOPE, 300_000);
    const result = await consumeNonce(handle.db, nonce, new Date());
    expect(result).toEqual(ENVELOPE);
  });

  it("returns null on second consumption (one-shot semantics)", async () => {
    const nonce = await issueNonce(handle.db, ENVELOPE, 300_000);
    await consumeNonce(handle.db, nonce, new Date());
    const second = await consumeNonce(handle.db, nonce, new Date());
    expect(second).toBeNull();
  });

  it("returns null for unknown nonce", async () => {
    const result = await consumeNonce(handle.db, "0x" + "0".repeat(64), new Date());
    expect(result).toBeNull();
  });

  it("returns null when nonce is expired", async () => {
    const nonce = await issueNonce(handle.db, ENVELOPE, 1); // TTL = 1ms
    await new Promise((r) => setTimeout(r, 5)); // wait for expiry
    const result = await consumeNonce(handle.db, nonce, new Date());
    expect(result).toBeNull();
  });

  it("concurrent consumption of the same nonce: exactly one returns the envelope", async () => {
    const nonce = await issueNonce(handle.db, ENVELOPE, 300_000);
    const now = new Date();

    const results = await Promise.all([
      consumeNonce(handle.db, nonce, now),
      consumeNonce(handle.db, nonce, now),
      consumeNonce(handle.db, nonce, now),
      consumeNonce(handle.db, nonce, now),
      consumeNonce(handle.db, nonce, now),
    ]);

    const successes = results.filter((r) => r !== null).length;
    const nulls = results.filter((r) => r === null).length;
    expect(successes).toBe(1);
    expect(nulls).toBe(4);
    // Winner returned the actual envelope
    const winner = results.find((r) => r !== null);
    expect(winner).toEqual(ENVELOPE);
  });
});

describe("sweepExpiredNonces()", () => {
  it("deletes expired nonces and returns count", async () => {
    // Issue one that expires immediately, one with long TTL
    const expired = await issueNonce(handle.db, ENVELOPE, 1);
    const valid = await issueNonce(handle.db, ENVELOPE, 300_000);

    await new Promise((r) => setTimeout(r, 5));

    const count = await sweepExpiredNonces(handle.db, new Date());
    expect(count).toBeGreaterThanOrEqual(1);

    // The expired nonce should be gone
    const expiredResult = await consumeNonce(handle.db, expired, new Date());
    expect(expiredResult).toBeNull();

    // Cleanup valid nonce
    await consumeNonce(handle.db, valid, new Date());
  });
});
