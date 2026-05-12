/**
 * Smoke tests for check-ledger-consistency.ts (Phase 8 — F2).
 *
 * Tests the `runConsistencyCheck` function directly using a PGLite DB and a
 * mock `readOnChainCredits` function. No external services, no real RPC, no
 * real postgres — all test infrastructure is in-process.
 *
 * Scenarios:
 *   1. All wallets consistent  → driftCount=0
 *   2. One wallet drifted      → driftCount=1, correct wallet identified
 *   3. Zero-balance wallet     → consistent with on-chain 0
 *   4. main() rejects missing env → exit code 1
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  runConsistencyCheck,
  main,
  type CheckDeps,
  type ConsistencyReport,
} from "../check-ledger-consistency.js";
import { creditState, type Schema } from "../../src/ledger/schema.js";

// ---------------------------------------------------------------------------
// PGLite setup
// ---------------------------------------------------------------------------

let pglite: PGlite;
let db: PgliteDatabase<Schema>;

const WALLET_A = "0x1111111111111111111111111111111111111111";
const WALLET_B = "0x2222222222222222222222222222222222222222";
const WALLET_C = "0x3333333333333333333333333333333333333333";

beforeAll(async () => {
  pglite = new PGlite();
  db = drizzle(pglite) as PgliteDatabase<Schema>;
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });

  // Seed credit state rows:
  //   WALLET_A: balance=1000, reserved=200, accrued=300  → expected=1500
  //   WALLET_B: balance=5000, reserved=0,   accrued=100  → expected=5100
  //   WALLET_C: balance=0,    reserved=0,   accrued=0    → expected=0
  await db.insert(creditState).values([
    {
      wallet: WALLET_A,
      balance: 1000n,
      reserved: 200n,
      accrued: 300n,
      updatedAt: new Date(),
    },
    {
      wallet: WALLET_B,
      balance: 5000n,
      reserved: 0n,
      accrued: 100n,
      updatedAt: new Date(),
    },
    {
      wallet: WALLET_C,
      balance: 0n,
      reserved: 0n,
      accrued: 0n,
      updatedAt: new Date(),
    },
  ]);
});

afterAll(async () => {
  await pglite.close();
});

// ---------------------------------------------------------------------------
// Helper: build CheckDeps from PGLite + an on-chain credits map
// ---------------------------------------------------------------------------

function buildDeps(onChainMap: Record<string, bigint>): CheckDeps {
  return {
    queryWallets: async (maxRows) => {
      const result = await pglite.query<{
        wallet: string;
        balance: string;
        reserved: string;
        accrued: string;
      }>(
        `SELECT wallet, balance::text, reserved::text, accrued::text
         FROM billing_credit_state
         ORDER BY wallet
         LIMIT $1`,
        [maxRows],
      );
      return result.rows;
    },
    readOnChainCredits: async (wallet) => {
      const lower = wallet.toLowerCase();
      return onChainMap[lower] ?? 0n;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runConsistencyCheck", () => {
  it("returns driftCount=0 when all wallets are consistent", async () => {
    const deps = buildDeps({
      [WALLET_A]: 1500n, // matches balance+reserved+accrued = 1000+200+300
      [WALLET_B]: 5100n, // matches 5000+0+100
      [WALLET_C]: 0n,    // matches 0+0+0
    });

    const report: ConsistencyReport = await runConsistencyCheck(deps, {
      json: false,
      toleranceAtto: 1_000_000n,
      maxRows: 100,
    });

    expect(report.totalWallets).toBe(3);
    expect(report.consistent).toBe(3);
    expect(report.driftCount).toBe(0);
    expect(report.problems).toHaveLength(0);
    expect(report.totalDrift).toBe(0n);
  });

  it("returns driftCount=1 when WALLET_B has drift > tolerance", async () => {
    // WALLET_B on-chain is 4000n; DB expects 5100n → drift = 1100n
    const deps = buildDeps({
      [WALLET_A]: 1500n,
      [WALLET_B]: 4000n, // drifted
      [WALLET_C]: 0n,
    });

    const report = await runConsistencyCheck(deps, {
      json: false,
      toleranceAtto: 500n, // tolerance of 500; 1100 exceeds it
      maxRows: 100,
    });

    expect(report.driftCount).toBe(1);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0].wallet).toBe(WALLET_B);
    expect(report.problems[0].drift).toBe(1100n);
    expect(report.problems[0].consistent).toBe(false);
    expect(report.maxDrift).toBe(1100n);
    expect(report.maxDriftWallet).toBe(WALLET_B);
  });

  it("treats zero-balance wallet as consistent when on-chain is also 0", async () => {
    const deps = buildDeps({
      [WALLET_A]: 1500n,
      [WALLET_B]: 5100n,
      [WALLET_C]: 0n, // zero on-chain matches zero DB
    });

    const report = await runConsistencyCheck(deps, {
      json: false,
      toleranceAtto: 1n,
      maxRows: 100,
    });

    // WALLET_C should be consistent
    const walletCResult = report.problems.find((p) => p.wallet === WALLET_C);
    expect(walletCResult).toBeUndefined(); // not in problems list
    expect(report.driftCount).toBe(0);
  });

  it("drift within tolerance is still counted as consistent", async () => {
    // drift = 500n; tolerance = 1_000_000n → consistent
    const deps = buildDeps({
      [WALLET_A]: 1500n,
      [WALLET_B]: 5100n - 500n, // drift of 500 atto-PTON
      [WALLET_C]: 0n,
    });

    const report = await runConsistencyCheck(deps, {
      json: false,
      toleranceAtto: 1_000_000n,
      maxRows: 100,
    });

    expect(report.driftCount).toBe(0);
    expect(report.totalDrift).toBe(500n);
  });
});

describe("main() — env validation", () => {
  it("returns exit code 1 when BILLING_DATABASE_URL is missing", async () => {
    const saved = {
      dbUrl: process.env.BILLING_DATABASE_URL,
      vault: process.env.BILLING_VAULT_ADDRESS,
      rpc: process.env.BILLING_CHAIN_RPC_URL,
    };
    delete process.env.BILLING_DATABASE_URL;
    delete process.env.BILLING_VAULT_ADDRESS;
    delete process.env.BILLING_CHAIN_RPC_URL;

    const exitCode = await main(["bun", "check-ledger-consistency.ts"]);
    expect(exitCode).toBe(1);

    // Restore
    if (saved.dbUrl !== undefined) process.env.BILLING_DATABASE_URL = saved.dbUrl;
    if (saved.vault !== undefined) process.env.BILLING_VAULT_ADDRESS = saved.vault;
    if (saved.rpc !== undefined) process.env.BILLING_CHAIN_RPC_URL = saved.rpc;
  });
});
