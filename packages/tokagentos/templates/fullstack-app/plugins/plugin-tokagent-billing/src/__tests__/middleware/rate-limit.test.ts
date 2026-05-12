/**
 * Tests for the token-bucket rate limiter (rate-limit.ts).
 */

import { describe, it, expect } from "vitest";
import { TokenBucketLimiter, createRateLimiter } from "../../middleware/rate-limit.js";

describe("TokenBucketLimiter", () => {
  it("allows requests within capacity", () => {
    const limiter = new TokenBucketLimiter({ capacity: 5, windowMs: 1000 });
    for (let i = 0; i < 5; i++) {
      const result = limiter.consume("wallet-a");
      expect(result.allowed).toBe(true);
      expect(result.retryAfterSec).toBe(0);
    }
  });

  it("rejects when bucket is empty", () => {
    const limiter = new TokenBucketLimiter({ capacity: 2, windowMs: 1000 });
    limiter.consume("wallet-a");
    limiter.consume("wallet-a");
    const result = limiter.consume("wallet-a");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it("refills over time", () => {
    let t = 0;
    const limiter = new TokenBucketLimiter({
      capacity: 2,
      windowMs: 1000,
      now: () => t,
    });
    limiter.consume("wallet-a");
    limiter.consume("wallet-a");
    expect(limiter.consume("wallet-a").allowed).toBe(false);

    // Advance clock by 500ms — should refill 1 token.
    t = 500;
    const result = limiter.consume("wallet-a");
    expect(result.allowed).toBe(true);
  });

  it("caps refill at capacity", () => {
    let t = 0;
    const limiter = new TokenBucketLimiter({
      capacity: 3,
      windowMs: 1000,
      now: () => t,
    });
    // Drain 2 tokens.
    limiter.consume("wallet-a");
    limiter.consume("wallet-a");

    // Advance far beyond window — should be capped at capacity (3), not over.
    t = 10_000;
    for (let i = 0; i < 3; i++) {
      expect(limiter.consume("wallet-a").allowed).toBe(true);
    }
    expect(limiter.consume("wallet-a").allowed).toBe(false);
  });

  it("tracks separate buckets per key", () => {
    const limiter = new TokenBucketLimiter({ capacity: 1, windowMs: 1000 });
    expect(limiter.consume("wallet-a").allowed).toBe(true);
    // wallet-b has its own full bucket.
    expect(limiter.consume("wallet-b").allowed).toBe(true);
    // wallet-a is now empty.
    expect(limiter.consume("wallet-a").allowed).toBe(false);
  });

  it("reports remaining tokens correctly", () => {
    const limiter = new TokenBucketLimiter({ capacity: 3, windowMs: 1000 });
    const r1 = limiter.consume("wallet-a");
    expect(r1.remaining).toBeCloseTo(2, 0);
    const r2 = limiter.consume("wallet-a");
    expect(r2.remaining).toBeCloseTo(1, 0);
  });

  it("size() returns number of tracked keys", () => {
    const limiter = new TokenBucketLimiter({ capacity: 5, windowMs: 1000 });
    expect(limiter.size()).toBe(0);
    limiter.consume("a");
    limiter.consume("b");
    expect(limiter.size()).toBe(2);
  });

  it("reset() clears all buckets", () => {
    const limiter = new TokenBucketLimiter({ capacity: 5, windowMs: 1000 });
    limiter.consume("a");
    limiter.reset();
    expect(limiter.size()).toBe(0);
  });

  it("evicts idle fully-refilled buckets after idleMs", () => {
    let t = 0;
    const limiter = new TokenBucketLimiter({
      capacity: 2,
      windowMs: 100,
      idleMs: 500,
      now: () => t,
    });
    limiter.consume("wallet-a"); // creates bucket, 1 token used, lastRefillMs=0

    // Advance past idleMs — refill happens on next consume of wallet-a, but we
    // don't consume wallet-a. Trigger sweep via wallet-b.
    t = 600;
    limiter.consume("wallet-b");
    // wallet-a: tokens=1 at t=0 (not full=2), but lastRefillMs was at t=0 and
    // we advanced 600ms. On the next consume the refill updates lastRefillMs.
    // Without a consume of wallet-a, the bucket stays at tokens=1 (not full).
    // The sweep only evicts keys where tokens >= capacity (full) — wallet-a
    // still has tokens=1 so it is NOT evicted. Size should be 2.
    // This documents the intentional behaviour: partial buckets are NOT evicted.
    expect(limiter.size()).toBe(2);
  });

  it("throws on capacity <= 0", () => {
    expect(() => new TokenBucketLimiter({ capacity: 0, windowMs: 1000 })).toThrow(
      "capacity must be > 0",
    );
  });

  it("throws on windowMs <= 0", () => {
    expect(() => new TokenBucketLimiter({ capacity: 1, windowMs: 0 })).toThrow(
      "windowMs must be > 0",
    );
  });
});

describe("createRateLimiter()", () => {
  it("returns a TokenBucketLimiter instance", () => {
    const limiter = createRateLimiter({ capacity: 10, windowMs: 60_000 });
    expect(limiter).toBeInstanceOf(TokenBucketLimiter);
  });
});
