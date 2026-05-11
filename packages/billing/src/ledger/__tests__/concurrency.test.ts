/**
 * Concurrency stress test — plan validation gate.
 *
 * 10 concurrent reserve() calls on the same wallet must serialize correctly:
 * - With balance=100n and each reservation requesting 20n, exactly 5 should
 *   succeed and 5 should fail.
 * - After all resolve, balance + reserved must equal 100n (no partial-state
 *   races, no double-spending).
 *
 * Tiered execution (Decision D15 note):
 *   Default (always in CI): 100 iterations — fast smoke (~5-15s on PGLite)
 *   Full gate (BILLING_STRESS_FULL=1): 10k iterations — validation criterion
 *
 * PGLite uses Postgres SERIALIZABLE semantics for full correctness.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDbHandle } from "./db-harness.js";
import { creditState, reservations } from "../schema.js";
import { reserve } from "../ledger.js";
import { hydrate } from "../ledger.js";
import type { Address } from "viem";

const WALLET = "0xcccc000000000000000000000000000000000099" as Address;
const BALANCE = 100n;
const RESERVE_AMOUNT = 20n;
const CONCURRENCY = 10;
const EXPECTED_SUCCESSES = 5; // 100 / 20

/**
 * Determine iteration count based on env.
 * CI always runs 100 iterations.
 * Set BILLING_STRESS_FULL=1 to run the full 10k validation gate.
 */
const ITERATIONS =
  process.env["BILLING_STRESS_FULL"] === "1" ? 10_000 : 100;

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

describe("concurrency: 10 concurrent reserves on the same wallet", () => {
  it(
    `serializes ${CONCURRENCY} concurrent reserves (${ITERATIONS} iterations)`,
    { timeout: 300_000 },
    async () => {
      let raceDetected = false;

      for (let iter = 0; iter < ITERATIONS; iter++) {
        // Set up wallet with fresh balance
        await handle.db
          .delete(reservations)
          .where(eq(reservations.wallet, WALLET.toLowerCase()));
        await handle.db
          .delete(creditState)
          .where(eq(creditState.wallet, WALLET.toLowerCase()));

        await hydrate(handle.db, WALLET, BALANCE);

        // Launch 10 concurrent reserves
        const results = await Promise.all(
          Array.from({ length: CONCURRENCY }, (_, i) =>
            reserve(handle.db, {
              wallet: WALLET,
              amount: RESERVE_AMOUNT,
              requestId: `iter${iter}-slot${i}`,
            }),
          ),
        );

        const succeeded = results.filter((r) => r.ok).length;
        const failed = results.filter((r) => !r.ok).length;

        // Invariant 1: exactly EXPECTED_SUCCESSES should succeed
        if (succeeded !== EXPECTED_SUCCESSES) {
          raceDetected = true;
          console.error(
            `[iter ${iter}] Race detected: ${succeeded} succeeded (expected ${EXPECTED_SUCCESSES})`,
          );
          break;
        }

        // Invariant 2: balance + reserved must equal initial BALANCE
        const rows = await handle.db
          .select({
            balance: creditState.balance,
            reserved: creditState.reserved,
          })
          .from(creditState)
          .where(eq(creditState.wallet, WALLET.toLowerCase()));

        const state = rows[0]!;
        const total = state.balance + state.reserved;

        if (total !== BALANCE) {
          raceDetected = true;
          console.error(
            `[iter ${iter}] Balance invariant violated: balance=${state.balance} reserved=${state.reserved} total=${total} (expected ${BALANCE})`,
          );
          break;
        }

        // Invariant 3: failed + succeeded = CONCURRENCY
        if (failed + succeeded !== CONCURRENCY) {
          raceDetected = true;
          break;
        }
      }

      expect(raceDetected).toBe(false);
    },
  );
});
