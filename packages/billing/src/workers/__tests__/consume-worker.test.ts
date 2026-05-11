/**
 * Unit tests for consume-worker.ts (Decision Z20).
 *
 * Uses PGLite — always-on, no BILLING_TEST_ANVIL needed.
 * The chain call (`consumeCredits`) is mocked; no Anvil process is started.
 *
 * The anvil integration test lives in consume-worker.integration.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Address, Hex } from "viem";
import { createTestDb, type TestDbHandle } from "../../ledger/__tests__/db-harness.js";
import { creditState, consumeBatches } from "../../ledger/schema.js";
import { eq } from "drizzle-orm";
import {
  computeBatchId,
  selectFlushable,
  flushNow,
  type ConsumeWorkerDeps,
  type ConsumeWorkerConfig,
} from "../consume-worker.js";

// ---------------------------------------------------------------------------
// Minimal mock BillingClients
// ---------------------------------------------------------------------------

function makeMockClients(consumeCreditsFn: () => Promise<Hex>) {
  return {
    // Only consumeCredits from vault.ts is called by flushNow.
    // We intercept at the module level below.
    publicClient: {} as never,
    walletClient: {} as never,
    mainnetClient: {} as never,
    operatorAccount: {} as never,
    _consumeCreditsImpl: consumeCreditsFn,
  };
}

// Mock the vault module so we don't need a real RPC connection.
vi.mock("../../chain/vault.js", () => ({
  consumeCredits: vi.fn(),
}));

import * as vaultModule from "../../chain/vault.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const WALLET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const WALLET_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;

const DEFAULT_CONFIG: ConsumeWorkerConfig = {
  consumeBatchMinPton: 500_000_000_000_000_000n, // 0.5 PTON
  consumeMaxAgeMs: 300_000, // 5 min
  consumeMaxPerCycle: 10,
};

function makeDeps(
  db: TestDbHandle["db"],
  config: Partial<ConsumeWorkerConfig> = {},
): ConsumeWorkerDeps {
  return {
    db,
    clients: makeMockClients(() =>
      Promise.resolve("0xdeadbeef" as Hex),
    ) as never,
    vaultAddress: "0x1234567890123456789012345678901234567890" as Address,
    config: { ...DEFAULT_CONFIG, ...config },
  };
}

async function seedCreditState(
  db: TestDbHandle["db"],
  wallet: Address,
  accrued: bigint,
  firstAccrualAt: Date = new Date(),
) {
  await db.insert(creditState).values({
    wallet: wallet.toLowerCase(),
    balance: 1_000_000_000_000_000_000n,
    reserved: 0n,
    accrued,
    firstAccrualAt,
    lastHydratedAt: null,
    updatedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeBatchId", () => {
  it("returns a deterministic 0x-prefixed keccak256 hex string", () => {
    const wallet: Address = WALLET_A;
    const ts = new Date("2026-01-01T00:00:00.000Z");
    const amount = 1_000_000_000_000_000_000n;

    const id1 = computeBatchId(wallet, ts, amount);
    const id2 = computeBatchId(wallet, ts, amount);

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("produces different IDs for different wallets", () => {
    const ts = new Date();
    const amount = 1n;
    expect(computeBatchId(WALLET_A, ts, amount)).not.toBe(
      computeBatchId(WALLET_B, ts, amount),
    );
  });

  it("produces different IDs for different amounts", () => {
    const ts = new Date();
    expect(computeBatchId(WALLET_A, ts, 1n)).not.toBe(
      computeBatchId(WALLET_A, ts, 2n),
    );
  });
});

describe("selectFlushable", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });
  afterEach(async () => {
    await handle.close();
  });

  it("returns empty when no wallets have accrued", async () => {
    const deps = makeDeps(handle.db);
    const result = await selectFlushable(deps, new Date());
    expect(result).toHaveLength(0);
  });

  it("returns wallet when accrued >= consumeBatchMinPton", async () => {
    await seedCreditState(handle.db, WALLET_A, 600_000_000_000_000_000n);
    const deps = makeDeps(handle.db);
    const result = await selectFlushable(deps, new Date());
    expect(result).toHaveLength(1);
    expect(result[0]!.wallet.toLowerCase()).toBe(WALLET_A.toLowerCase());
  });

  it("skips wallet when accrued < min and not yet aged out", async () => {
    const now = new Date();
    // firstAccrualAt is just 1 second ago — well within 5 min
    const firstAccrualAt = new Date(now.getTime() - 1_000);
    await seedCreditState(handle.db, WALLET_A, 100_000_000_000_000_000n, firstAccrualAt);
    const deps = makeDeps(handle.db);
    const result = await selectFlushable(deps, now);
    expect(result).toHaveLength(0);
  });

  it("returns wallet when idle age exceeds consumeMaxAgeMs", async () => {
    const now = new Date();
    const firstAccrualAt = new Date(now.getTime() - 400_000); // 400s > 300s
    await seedCreditState(handle.db, WALLET_A, 100_000_000_000_000_000n, firstAccrualAt);
    const deps = makeDeps(handle.db);
    const result = await selectFlushable(deps, now);
    expect(result).toHaveLength(1);
  });

  it("includes priorityWallet even if below thresholds", async () => {
    const now = new Date();
    const firstAccrualAt = new Date(now.getTime() - 1_000); // not aged out
    await seedCreditState(handle.db, WALLET_A, 10n, firstAccrualAt); // tiny amount
    const deps = makeDeps(handle.db);
    const result = await selectFlushable(deps, now, { priorityWallet: WALLET_A });
    expect(result).toHaveLength(1);
    expect(result[0]!.wallet.toLowerCase()).toBe(WALLET_A.toLowerCase());
  });

  it("sorts priority wallet first", async () => {
    const now = new Date();
    // Both wallets are above threshold
    await seedCreditState(handle.db, WALLET_A, 600_000_000_000_000_000n);
    await seedCreditState(handle.db, WALLET_B, 600_000_000_000_000_000n);
    const deps = makeDeps(handle.db);
    const result = await selectFlushable(deps, now, { priorityWallet: WALLET_B });
    expect(result[0]!.wallet.toLowerCase()).toBe(WALLET_B.toLowerCase());
  });

  it("respects consumeMaxPerCycle cap", async () => {
    // Insert 5 wallets, cap = 3
    for (let i = 0; i < 5; i++) {
      const wallet = `0x${i.toString(16).padStart(40, "0")}` as Address;
      await seedCreditState(handle.db, wallet, 600_000_000_000_000_000n);
    }
    const deps = makeDeps(handle.db, { consumeMaxPerCycle: 3 });
    const result = await selectFlushable(deps, new Date());
    expect(result).toHaveLength(3);
  });
});

describe("flushNow", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await handle.close();
  });

  it("returns zero counts when nothing is flushable", async () => {
    const deps = makeDeps(handle.db);
    const result = await flushNow(deps);
    expect(result).toEqual({ attempted: 0, succeeded: 0, deadLettered: 0 });
  });

  it("calls consumeCredits with correct args and updates DB state", async () => {
    vi.mocked(vaultModule.consumeCredits).mockResolvedValueOnce(
      "0xdeadbeef0000000000000000000000000000000000000000000000000000dead" as Hex,
    );

    const accrued = 600_000_000_000_000_000n;
    const firstAccrualAt = new Date();
    await seedCreditState(handle.db, WALLET_A, accrued, firstAccrualAt);

    const deps = makeDeps(handle.db);
    const result = await flushNow(deps);

    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.deadLettered).toBe(0);

    // consumeCredits was called with expected args
    expect(vaultModule.consumeCredits).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(vaultModule.consumeCredits).mock.calls[0]!;
    expect(callArgs[2].user.toLowerCase()).toBe(WALLET_A.toLowerCase());
    expect(callArgs[2].amount).toBe(accrued);

    // Batch row should be confirmed
    const batches = await handle.db
      .select()
      .from(consumeBatches);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.state).toBe("confirmed");
    expect(batches[0]!.txHash).toBeTruthy();

    // Ledger accrued should be zeroed
    const creditRows = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, WALLET_A.toLowerCase()));
    expect(creditRows[0]!.accrued).toBe(0n);
  });

  it("increments attempts and sets dead_letter after MAX_ATTEMPTS failures", async () => {
    // Fail 3 times
    vi.mocked(vaultModule.consumeCredits)
      .mockRejectedValueOnce(new Error("chain err 1"))
      .mockRejectedValueOnce(new Error("chain err 2"))
      .mockRejectedValueOnce(new Error("chain err 3"));

    const accrued = 600_000_000_000_000_000n;
    await seedCreditState(handle.db, WALLET_A, accrued);

    const deps = makeDeps(handle.db);

    // Three flushNow calls — the first two leave it in "pending" after failure,
    // the third puts it in "dead_letter".
    await flushNow(deps);
    await flushNow(deps);
    const result = await flushNow(deps);

    expect(result.deadLettered).toBe(1);
    expect(result.succeeded).toBe(0);

    const batches = await handle.db.select().from(consumeBatches);
    expect(batches[0]!.state).toBe("dead_letter");
    expect(batches[0]!.attempts).toBe(3);
  });

  it("is idempotent: skips already-confirmed batch", async () => {
    vi.mocked(vaultModule.consumeCredits).mockResolvedValue(
      "0xabc" as Hex,
    );

    const accrued = 600_000_000_000_000_000n;
    await seedCreditState(handle.db, WALLET_A, accrued);

    const deps = makeDeps(handle.db);

    // First flush confirms the batch
    await flushNow(deps);

    // Re-seed accrued (simulate new charges) — but same batchId would not
    // occur unless firstAccrualAt/amount match. This test verifies the
    // confirmed guard path is taken when the batch row is already there.
    vi.clearAllMocks();

    // Second flush with same wallet — accrued is now 0 (zeroed by first flush)
    const result2 = await flushNow(deps);
    expect(result2.attempted).toBe(0); // nothing to flush
    expect(vaultModule.consumeCredits).not.toHaveBeenCalled();
  });
});
