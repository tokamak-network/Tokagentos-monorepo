#!/usr/bin/env bun
/**
 * Ledger consistency check — Phase 8 operational tool.
 *
 * Compares DB `billing_credit_state.{balance + reserved + accrued}` against
 * on-chain `vault.credits(wallet)` for every wallet in the DB.
 *
 * Exit codes:
 *   0  — all wallets consistent (drift <= tolerance per wallet)
 *   1  — one or more wallets have drift > tolerance
 *
 * Usage:
 *   bun run packages/billing/scripts/check-ledger-consistency.ts
 *   bun run packages/billing/scripts/check-ledger-consistency.ts --json
 *   bun run packages/billing/scripts/check-ledger-consistency.ts --tolerance-atto=1000000
 *   bun run packages/billing/scripts/check-ledger-consistency.ts --max-rows=500
 *
 * Or via package.json script (run from repo root):
 *   bun run --cwd packages/billing check-ledger
 *
 * Required env:
 *   BILLING_DATABASE_URL   — postgres connection string
 *   BILLING_VAULT_ADDRESS  — ClaudeVault contract address (0x-prefixed)
 *   BILLING_CHAIN_RPC_URL  — EVM JSON-RPC endpoint
 *
 * Optional env:
 *   BILLING_TOLERANCE_ATTO — override default tolerance (same as --tolerance-atto)
 *
 * Design note on "expected" balance:
 *   The DB invariant is:
 *     on-chain credits == balance + reserved + accrued
 *   `balance` is the last known on-chain amount (updated after each consume flush).
 *   `reserved` is the in-flight reservation held against balance.
 *   `accrued` is usage that has been committed locally but not yet flushed on-chain.
 *   So at any point in time, the expected on-chain value is balance + reserved + accrued.
 *   After a consume flush, accrued resets to 0n and balance decreases by the flushed amount,
 *   but the sum remains constant.
 *
 * Dependencies: drizzle-orm/node-postgres (already a dep via drizzle-orm), viem.
 *   `pg` is a peer dep of drizzle-orm/node-postgres and is present in the workspace
 *   (plugin-tokagent-billing depends on it). No new transitive deps are added.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { createPublicClient, http, type Address } from "viem";
import { CLAUDE_VAULT_ABI } from "../src/chain/abi/vault.js";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliOptions {
  json: boolean;
  toleranceAtto: bigint;
  maxRows: number;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2); // strip 'bun' + script path
  let json = false;
  let toleranceAtto =
    process.env.BILLING_TOLERANCE_ATTO != null
      ? BigInt(process.env.BILLING_TOLERANCE_ATTO)
      : 1_000_000n; // 0.000001 PTON default
  let maxRows = 10_000;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("--tolerance-atto=")) {
      toleranceAtto = BigInt(arg.split("=")[1]);
    } else if (arg.startsWith("--max-rows=")) {
      maxRows = Number(arg.split("=")[1]);
    }
  }

  return { json, toleranceAtto, maxRows };
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface WalletResult {
  wallet: string;
  dbBalance: bigint;
  dbReserved: bigint;
  dbAccrued: bigint;
  dbExpected: bigint;
  onChain: bigint;
  drift: bigint;
  consistent: boolean;
}

export interface ConsistencyReport {
  totalWallets: number;
  consistent: number;
  driftCount: number;
  maxDrift: bigint;
  maxDriftWallet: string;
  totalDrift: bigint;
  toleranceAtto: bigint;
  problems: WalletResult[];
}

// ---------------------------------------------------------------------------
// Human-readable output helpers
// ---------------------------------------------------------------------------

function attoToHuman(atto: bigint): string {
  if (atto === 0n) return "0";
  const UNIT = 1_000_000_000_000_000_000n;
  const whole = atto / UNIT;
  const frac = atto % UNIT;
  if (frac === 0n) return `${whole}`;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

function printHumanReport(report: ConsistencyReport): void {
  console.log("");
  console.log("=== Ledger Consistency Report ===");
  console.log(`Total wallets:     ${report.totalWallets}`);
  console.log(`Consistent:        ${report.consistent}`);
  console.log(`Drift > tolerance: ${report.driftCount}`);
  console.log(
    `Tolerance:         ${report.toleranceAtto} atto-PTON (${attoToHuman(report.toleranceAtto)} PTON)`,
  );
  console.log(
    `Total drift:       ${report.totalDrift} atto-PTON (${attoToHuman(report.totalDrift)} PTON)`,
  );
  if (report.driftCount > 0) {
    console.log(`Largest drift:     ${report.maxDriftWallet}`);
    console.log(
      `                   ${report.maxDrift} atto-PTON (${attoToHuman(report.maxDrift)} PTON)`,
    );
    console.log("");
    console.log("--- Drifting wallets ---");
    for (const p of report.problems) {
      console.log(`  ${p.wallet}`);
      console.log(
        `    DB  balance=${p.dbBalance}  reserved=${p.dbReserved}  accrued=${p.dbAccrued}`,
      );
      console.log(`    DB  expected=${p.dbExpected}`);
      console.log(`    On-chain:   ${p.onChain}`);
      console.log(`    Drift:      ${p.drift} atto-PTON`);
    }
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Core logic (exported for testing)
// ---------------------------------------------------------------------------

export interface CheckDeps {
  /** Returns rows from billing_credit_state. */
  queryWallets: (maxRows: number) => Promise<
    Array<{ wallet: string; balance: string; reserved: string; accrued: string }>
  >;
  /** Returns on-chain credits for a wallet address (atto-PTON). */
  readOnChainCredits: (wallet: Address) => Promise<bigint>;
}

export async function runConsistencyCheck(
  deps: CheckDeps,
  opts: CliOptions,
): Promise<ConsistencyReport> {
  const rows = await deps.queryWallets(opts.maxRows);

  const walletResults: WalletResult[] = [];
  const problems: WalletResult[] = [];

  for (const row of rows) {
    const dbBalance = BigInt(row.balance);
    const dbReserved = BigInt(row.reserved);
    const dbAccrued = BigInt(row.accrued);
    const dbExpected = dbBalance + dbReserved + dbAccrued;

    let onChain: bigint;
    try {
      onChain = await deps.readOnChainCredits(row.wallet as Address);
    } catch (err) {
      console.error(`Error reading on-chain credits for ${row.wallet}: ${err}`);
      // Treat as maximum drift to surface the error in the report
      onChain = 0n;
    }

    const drift = onChain > dbExpected ? onChain - dbExpected : dbExpected - onChain;
    const consistent = drift <= opts.toleranceAtto;

    const wr: WalletResult = {
      wallet: row.wallet,
      dbBalance,
      dbReserved,
      dbAccrued,
      dbExpected,
      onChain,
      drift,
      consistent,
    };

    walletResults.push(wr);
    if (!consistent) {
      problems.push(wr);
    }
  }

  let maxDrift = 0n;
  let maxDriftWallet = "";
  let totalDrift = 0n;

  for (const wr of walletResults) {
    totalDrift += wr.drift;
    if (wr.drift > maxDrift) {
      maxDrift = wr.drift;
      maxDriftWallet = wr.wallet;
    }
  }

  return {
    totalWallets: walletResults.length,
    consistent: walletResults.filter((w) => w.consistent).length,
    driftCount: problems.length,
    maxDrift,
    maxDriftWallet,
    totalDrift,
    toleranceAtto: opts.toleranceAtto,
    problems,
  };
}

// ---------------------------------------------------------------------------
// Main (wires real DB and chain deps)
// ---------------------------------------------------------------------------

export async function main(argv = process.argv): Promise<number> {
  const opts = parseArgs(argv);

  // ---- Validate required env ----
  const dbUrl = process.env.BILLING_DATABASE_URL;
  const vaultAddressRaw = process.env.BILLING_VAULT_ADDRESS;
  const rpcUrl = process.env.BILLING_CHAIN_RPC_URL;

  if (!dbUrl) {
    console.error("Error: BILLING_DATABASE_URL is not set");
    return 1;
  }
  if (!vaultAddressRaw) {
    console.error("Error: BILLING_VAULT_ADDRESS is not set");
    return 1;
  }
  if (!rpcUrl) {
    console.error("Error: BILLING_CHAIN_RPC_URL is not set");
    return 1;
  }

  const vaultAddress = vaultAddressRaw as Address;

  // ---- Connect to DB via node-postgres + drizzle ----
  const pool = new pg.Pool({ connectionString: dbUrl });

  // ---- Connect to chain ----
  const publicClient = createPublicClient({
    transport: http(rpcUrl),
  });

  const deps: CheckDeps = {
    queryWallets: async (maxRows) => {
      const result = await pool.query<{
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
      return await publicClient.readContract({
        address: vaultAddress,
        abi: CLAUDE_VAULT_ABI,
        functionName: "credits",
        args: [wallet],
      });
    },
  };

  try {
    if (!opts.json) {
      console.log(`Checking wallets against vault ${vaultAddress} ...`);
    }

    const report = await runConsistencyCheck(deps, opts);

    // ---- Output ----
    if (opts.json) {
      const jsonReport = {
        totalWallets: report.totalWallets,
        consistent: report.consistent,
        driftCount: report.driftCount,
        maxDrift: report.maxDrift.toString(),
        maxDriftWallet: report.maxDriftWallet,
        totalDrift: report.totalDrift.toString(),
        toleranceAtto: report.toleranceAtto.toString(),
        problems: report.problems.map((p) => ({
          wallet: p.wallet,
          dbBalance: p.dbBalance.toString(),
          dbReserved: p.dbReserved.toString(),
          dbAccrued: p.dbAccrued.toString(),
          dbExpected: p.dbExpected.toString(),
          onChain: p.onChain.toString(),
          drift: p.drift.toString(),
          consistent: p.consistent,
        })),
      };
      console.log(JSON.stringify(jsonReport, null, 2));
    } else {
      printHumanReport(report);
    }

    return report.driftCount > 0 ? 1 : 0;
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// `import.meta.main` is true in Bun when this file is executed directly.
// Checking for it avoids calling main() when the file is imported in tests.
if ((import.meta as { main?: boolean }).main) {
  main(process.argv)
    .then((exitCode) => process.exit(exitCode))
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
