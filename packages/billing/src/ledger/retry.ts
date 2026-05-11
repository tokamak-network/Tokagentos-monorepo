/**
 * Retry helper for SERIALIZABLE transactions (Decision D15).
 *
 * PostgreSQL (and PGLite) throw error code 40001 on serialization failure when
 * two concurrent SERIALIZABLE transactions conflict. This helper wraps the
 * operation in an exponential-backoff retry loop so the caller can write clean
 * transaction logic without explicit retry plumbing.
 *
 * Parameters:
 *   maxAttempts — default 5
 *   baseMs      — default 10ms; jitter ±50% of baseMs per attempt
 */

import type { BillingDatabase } from "./schema.js";

/** Postgres serialization failure code. */
const SERIALIZATION_FAILURE_CODE = "40001";

function isSerializationFailure(err: unknown): boolean {
  if (err instanceof Error) {
    // pg driver exposes `code` as a property on the error object.
    // PGLite uses the same Postgres wire protocol so the code is identical.
    const code = (err as Error & { code?: string }).code;
    return code === SERIALIZATION_FAILURE_CODE;
  }
  return false;
}

function jitter(baseMs: number): number {
  // ±50% jitter so simultaneous retries don't stay in lockstep.
  return baseMs * (0.5 + Math.random());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute `op` inside a SERIALIZABLE transaction. On serialization failure
 * (code 40001), retry with exponential backoff. Throws the last error after
 * `maxAttempts` exhaustion.
 */
export async function withSerializableRetry<T>(
  db: BillingDatabase,
  op: (tx: BillingDatabase) => Promise<T>,
  opts?: { maxAttempts?: number; baseMs?: number },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 5;
  const baseMs = opts?.baseMs ?? 10;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await (db as BillingDatabase).transaction(
        async (tx) => op(tx as BillingDatabase),
        { isolationLevel: "serializable" },
      );
    } catch (err) {
      if (isSerializationFailure(err) && attempt < maxAttempts) {
        lastErr = err;
        const delay = jitter(baseMs * 2 ** (attempt - 1));
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  // This line is only reachable if maxAttempts reached on serialization failure
  throw lastErr;
}
