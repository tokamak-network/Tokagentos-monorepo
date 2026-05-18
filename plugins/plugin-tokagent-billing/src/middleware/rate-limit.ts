/**
 * Token-bucket rate limiter for the billing plugin (Phase 6).
 *
 * Ported from llm-api-gateway/proxy/src/rateLimit.ts. Kept in-memory
 * per-instance; multi-instance rate-limiting is Phase 9+.
 *
 * The factory `createRateLimiter()` returns a new independent limiter.
 * Callers that want separate buckets per endpoint (quote vs settle) should
 * create separate instances (matching the source's design: one limiter per
 * route group).
 *
 * Design:
 *   - Token bucket with capacity = `capacity` tokens
 *   - Refills at `capacity / windowMs` tokens per millisecond
 *   - Depleted buckets reject until enough time has passed
 *   - Idle keys are evicted after `idleMs` to prevent unbounded growth
 */

// ---------------------------------------------------------------------------
// Core types (matches source's rateLimit.ts interface)
// ---------------------------------------------------------------------------

export interface RateLimiterOptions {
  /** Maximum tokens (also starting amount). */
  capacity: number;
  /** Window over which `capacity` tokens refill. */
  windowMs: number;
  /** Clock source, defaults to Date.now. Injectable for tests. */
  now?: () => number;
  /**
   * Idle key TTL — keys with full buckets and no activity for this many ms
   * are evicted. Defaults to max(windowMs * 10, 60_000).
   */
  idleMs?: number;
}

export interface ConsumeResult {
  allowed: boolean;
  /** Seconds to wait before retrying. 0 when allowed. */
  retryAfterSec: number;
  /** Remaining tokens (fractional) after this call. */
  remaining: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

// ---------------------------------------------------------------------------
// TokenBucketLimiter
// ---------------------------------------------------------------------------

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly clock: () => number;
  private readonly idleMs: number;
  private lastSweepMs = 0;

  constructor(opts: RateLimiterOptions) {
    if (!(opts.capacity > 0)) {
      throw new Error(`capacity must be > 0, got ${opts.capacity}`);
    }
    if (!(opts.windowMs > 0)) {
      throw new Error(`windowMs must be > 0, got ${opts.windowMs}`);
    }
    this.capacity = opts.capacity;
    this.refillPerMs = opts.capacity / opts.windowMs;
    this.clock = opts.now ?? Date.now;
    this.idleMs = opts.idleMs ?? Math.max(opts.windowMs * 10, 60_000);
  }

  /**
   * Attempt to spend one token for `key`.
   * Returns whether it was allowed, retry wait, and remaining token count.
   */
  consume(key: string): ConsumeResult {
    const now = this.clock();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, lastRefillMs: now };
      this.buckets.set(key, b);
    } else {
      // Non-decreasing elapsed; backward clock = 0 refill (not "debt").
      const elapsedMs = Math.max(0, now - b.lastRefillMs);
      const refill = elapsedMs * this.refillPerMs;
      if (refill > 0) {
        b.tokens = Math.min(this.capacity, b.tokens + refill);
        b.lastRefillMs = now;
      }
    }

    if (b.tokens >= 1) {
      b.tokens -= 1;
      this.maybeSweep(now);
      return { allowed: true, retryAfterSec: 0, remaining: b.tokens };
    }

    const deficit = 1 - b.tokens;
    const waitMs = deficit / this.refillPerMs;
    const retryAfterSec = Math.ceil(waitMs / 1000);
    this.maybeSweep(now);
    return { allowed: false, retryAfterSec, remaining: b.tokens };
  }

  /** Test/ops hook — current tracked key count. */
  size(): number {
    return this.buckets.size;
  }

  /** Test hook — reset all state. */
  reset(): void {
    this.buckets.clear();
    this.lastSweepMs = 0;
  }

  private maybeSweep(now: number): void {
    if (now - this.lastSweepMs < this.idleMs) return;
    this.lastSweepMs = now;
    for (const [k, v] of this.buckets) {
      if (v.tokens >= this.capacity && now - v.lastRefillMs >= this.idleMs) {
        this.buckets.delete(k);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new independent token-bucket rate limiter.
 *
 * Usage:
 *   ```ts
 *   const quoteLimiter = createRateLimiter({ capacity: 60, windowMs: 60_000 });
 *   const result = quoteLimiter.consume(wallet);
 *   if (!result.allowed) { ... }
 *   ```
 */
export function createRateLimiter(
  opts: RateLimiterOptions,
): TokenBucketLimiter {
  return new TokenBucketLimiter(opts);
}
