/**
 * Unit tests for withdraw-watcher.ts (Decision Z20).
 *
 * The handler logic is tested without a chain subscription.
 * flushNow is mocked so we don't need an actual vault or DB writes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Address, Hex } from "viem";
import { createTestDb, type TestDbHandle } from "../../ledger/__tests__/db-harness.js";
import { creditState } from "../../ledger/schema.js";
import {
  handleWithdrawRequested,
  type WithdrawWatcherDeps,
  type WithdrawRequestedEvent,
} from "../withdraw-watcher.js";

// Mock the consume-worker flushNow so we don't need a real chain.
vi.mock("../consume-worker.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../consume-worker.js")>();
  return {
    ...mod,
    flushNow: vi.fn(),
  };
});

import * as consumeWorkerModule from "../consume-worker.js";

const WALLET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const VAULT = "0x1234567890123456789012345678901234567890" as Address;

function makeDeps(db: TestDbHandle["db"]): WithdrawWatcherDeps {
  return {
    db,
    clients: {} as never,
    vaultAddress: VAULT,
    config: {
      consumeBatchMinPton: 500_000_000_000_000_000n,
      consumeMaxAgeMs: 300_000,
      consumeMaxPerCycle: 10,
    },
  };
}

describe("handleWithdrawRequested", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
    vi.clearAllMocks();
    vi.mocked(consumeWorkerModule.flushNow).mockResolvedValue({
      attempted: 1,
      succeeded: 1,
      deadLettered: 0,
    });
  });
  afterEach(async () => {
    await handle.close();
  });

  it("does nothing when event has no user field", async () => {
    const deps = makeDeps(handle.db);
    const event: WithdrawRequestedEvent = { args: { amount: 1000n } };
    await handleWithdrawRequested(deps, event);
    expect(consumeWorkerModule.flushNow).not.toHaveBeenCalled();
  });

  it("does nothing when accrued is 0", async () => {
    // No credit state row → accrued defaults to 0
    const deps = makeDeps(handle.db);
    const event: WithdrawRequestedEvent = {
      args: { user: WALLET_A, amount: 100n },
    };
    await handleWithdrawRequested(deps, event);
    expect(consumeWorkerModule.flushNow).not.toHaveBeenCalled();
  });

  it("calls flushNow with priorityWallet when accrued > 0", async () => {
    await handle.db.insert(creditState).values({
      wallet: WALLET_A.toLowerCase(),
      balance: 0n,
      reserved: 0n,
      accrued: 100_000_000_000_000_000n,
      firstAccrualAt: new Date(),
      lastHydratedAt: null,
      updatedAt: new Date(),
    });

    const deps = makeDeps(handle.db);
    const event: WithdrawRequestedEvent = {
      args: { user: WALLET_A, amount: 1000n, unlockAt: BigInt(Date.now() + 86400000) },
    };
    await handleWithdrawRequested(deps, event);

    expect(consumeWorkerModule.flushNow).toHaveBeenCalledOnce();
    const [, opts] = vi.mocked(consumeWorkerModule.flushNow).mock.calls[0]!;
    expect(opts?.priorityWallet?.toLowerCase()).toBe(WALLET_A.toLowerCase());
  });

  it("swallows flushNow errors without throwing", async () => {
    vi.mocked(consumeWorkerModule.flushNow).mockRejectedValueOnce(
      new Error("chain exploded"),
    );

    await handle.db.insert(creditState).values({
      wallet: WALLET_A.toLowerCase(),
      balance: 0n,
      reserved: 0n,
      accrued: 100_000_000_000_000_000n,
      firstAccrualAt: new Date(),
      lastHydratedAt: null,
      updatedAt: new Date(),
    });

    const deps = makeDeps(handle.db);
    const event: WithdrawRequestedEvent = {
      args: { user: WALLET_A, amount: 50n },
    };

    // Should not throw even though flushNow rejects.
    await expect(
      handleWithdrawRequested(deps, event),
    ).resolves.toBeUndefined();
  });
});
