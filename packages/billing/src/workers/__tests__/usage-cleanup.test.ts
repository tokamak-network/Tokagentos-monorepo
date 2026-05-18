/**
 * Unit tests for usage-cleanup.ts (Decision Z20).
 *
 * Uses PGLite — always-on, no external dependencies.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDbHandle } from "../../ledger/__tests__/db-harness.js";
import { callLog } from "../../ledger/schema.js";
import {
  sweepOldCallLog,
  sweepAllExpired,
  type UsageCleanupDeps,
} from "../usage-cleanup.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function insertCallLog(
  db: TestDbHandle["db"],
  ts: Date,
) {
  await db.insert(callLog).values({
    wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    apiKeyId: null,
    ts,
    model: "claude-3-5-sonnet-20241022",
    inputTokens: 100,
    outputTokens: 50,
    cacheInputTokens: 0,
    cacheCreationTokens: 0,
    costUsd: "0.001",
    costPton: 1_000_000_000_000_000n,
    requestId: `req-${Math.random().toString(36).slice(2)}`,
    status: "ok",
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sweepOldCallLog", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });
  afterEach(async () => {
    await handle.close();
  });

  it("returns 0 when no rows exist", async () => {
    const deps: UsageCleanupDeps = { db: handle.db, retentionDays: 90 };
    const result = await sweepOldCallLog(deps, new Date());
    expect(result).toBe(0);
  });

  it("deletes rows older than retention window", async () => {
    const now = new Date("2026-05-11T00:00:00.000Z");

    // Old row — 100 days ago (beyond 90-day retention)
    const oldTs = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
    await insertCallLog(handle.db, oldTs);

    // Recent row — 10 days ago
    const recentTs = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    await insertCallLog(handle.db, recentTs);

    const deps: UsageCleanupDeps = { db: handle.db, retentionDays: 90 };
    const deleted = await sweepOldCallLog(deps, now);

    expect(deleted).toBe(1);

    // Recent row is still there
    const remaining = await handle.db.select().from(callLog);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.ts).toEqual(recentTs);
  });

  it("deletes all rows when all are beyond retention", async () => {
    const now = new Date("2026-05-11T00:00:00.000Z");
    const oldTs = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000);
    await insertCallLog(handle.db, oldTs);
    await insertCallLog(handle.db, oldTs);

    const deps: UsageCleanupDeps = { db: handle.db, retentionDays: 90 };
    const deleted = await sweepOldCallLog(deps, now);

    expect(deleted).toBe(2);
  });
});

describe("sweepAllExpired", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });
  afterEach(async () => {
    await handle.close();
  });

  it("returns zeroed result when all tables are empty", async () => {
    const deps: UsageCleanupDeps = { db: handle.db, retentionDays: 90 };
    const result = await sweepAllExpired(deps, new Date());
    expect(result).toEqual({ callLog: 0, nonces: 0, quotes: 0, preauth: 0 });
  });

  it("sweeps call log and returns correct count", async () => {
    const now = new Date("2026-05-11T00:00:00.000Z");
    const oldTs = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
    await insertCallLog(handle.db, oldTs);
    await insertCallLog(handle.db, oldTs);

    const deps: UsageCleanupDeps = { db: handle.db, retentionDays: 90 };
    const result = await sweepAllExpired(deps, now);

    expect(result.callLog).toBe(2);
    expect(result.nonces).toBe(0);
    expect(result.quotes).toBe(0);
    expect(result.preauth).toBe(0);
  });
});
