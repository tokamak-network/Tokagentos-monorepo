import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";

// We test persistence against a real temp directory.
import {
  loadStrategies,
  saveStrategy,
  deleteStrategy,
  getStrategy,
  listActiveStrategies,
  updateStrategy,
  appendTick,
  STRATEGY_SCHEMA,
} from "../persistence.js";
import type { Strategy } from "../types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRuntime(dataDir: string) {
  return {
    getSetting: (key: string) => {
      if (key === "TOKAGENT_DATA_DIR") return dataDir;
      return undefined;
    },
  };
}

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "test-id-1",
    name: "Test Strategy",
    description: "A test strategy",
    kind: "yield-auto-compound",
    params: { threshold: 0.5 },
    vault: { chainId: 137, address: "0xdeadbeef00000000000000000000000000000001" },
    schedule: { everyMs: 60_000 },
    status: "draft",
    createdAt: Date.now(),
    tickHistory: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("persistence", () => {
  let dataDir: string;
  let runtime: ReturnType<typeof makeRuntime>;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "tokagent-test-"));
    runtime = makeRuntime(dataDir);
  });

  // Cleanup after each test (best-effort)
  afterEach(async () => {
    try {
      await rm(dataDir, { recursive: true, force: true });
    } catch {}
  });

  it("returns [] when strategies.json does not exist", async () => {
    const result = await loadStrategies(runtime);
    expect(result).toEqual([]);
  });

  it("save and load roundtrip", async () => {
    const s = makeStrategy();
    await saveStrategy(runtime, s);
    const loaded = await loadStrategies(runtime);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("test-id-1");
    expect(loaded[0].name).toBe("Test Strategy");
  });

  it("upserts an existing strategy by id", async () => {
    const s = makeStrategy();
    await saveStrategy(runtime, s);
    await saveStrategy(runtime, { ...s, name: "Updated Name" });
    const loaded = await loadStrategies(runtime);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("Updated Name");
  });

  it("saves multiple strategies", async () => {
    const s1 = makeStrategy({ id: "id-1" });
    const s2 = makeStrategy({ id: "id-2", name: "Second" });
    await saveStrategy(runtime, s1);
    await saveStrategy(runtime, s2);
    const loaded = await loadStrategies(runtime);
    expect(loaded).toHaveLength(2);
  });

  it("getStrategy returns undefined for missing id", async () => {
    const result = await getStrategy(runtime, "nonexistent");
    expect(result).toBeUndefined();
  });

  it("getStrategy returns the correct strategy", async () => {
    const s = makeStrategy();
    await saveStrategy(runtime, s);
    const result = await getStrategy(runtime, "test-id-1");
    expect(result?.id).toBe("test-id-1");
  });

  it("deleteStrategy returns false for missing id", async () => {
    const result = await deleteStrategy(runtime, "nonexistent");
    expect(result).toBe(false);
  });

  it("deleteStrategy removes the strategy", async () => {
    const s = makeStrategy();
    await saveStrategy(runtime, s);
    const deleted = await deleteStrategy(runtime, "test-id-1");
    expect(deleted).toBe(true);
    const loaded = await loadStrategies(runtime);
    expect(loaded).toHaveLength(0);
  });

  it("listActiveStrategies returns only active and testing", async () => {
    const statuses = ["draft", "testing", "active", "paused", "stopped"] as const;
    for (const status of statuses) {
      await saveStrategy(runtime, makeStrategy({ id: status, status }));
    }
    const active = await listActiveStrategies(runtime);
    const ids = active.map((s) => s.id).sort();
    expect(ids).toEqual(["active", "testing"]);
  });

  it("updateStrategy throws if strategy not found", async () => {
    await expect(updateStrategy(runtime, "nonexistent", { name: "x" })).rejects.toThrow(
      "not found",
    );
  });

  it("updateStrategy applies patch correctly", async () => {
    const s = makeStrategy();
    await saveStrategy(runtime, s);
    const updated = await updateStrategy(runtime, "test-id-1", { name: "Patched", status: "active" });
    expect(updated.name).toBe("Patched");
    expect(updated.status).toBe("active");
    // Other fields preserved
    expect(updated.kind).toBe("yield-auto-compound");
  });

  it("appendTick caps tickHistory at 50 entries", async () => {
    const s = makeStrategy();
    await saveStrategy(runtime, s);

    // Add 55 tick entries
    for (let i = 0; i < 55; i++) {
      await appendTick(runtime, "test-id-1", { at: i, action: "evaluated", result: `entry ${i}` });
    }

    const loaded = await loadStrategies(runtime);
    expect(loaded[0].tickHistory).toHaveLength(50);
    // Most recent 50: entries 5..54
    expect(loaded[0].tickHistory[0].at).toBe(5);
    expect(loaded[0].tickHistory[49].at).toBe(54);
  });

  it("appendTick silently ignores missing strategy id", async () => {
    // Should not throw
    await appendTick(runtime, "nonexistent", { at: 0, action: "evaluated", result: "ok" });
  });

  it("concurrent writes are serialized", async () => {
    // Spawn 10 overlapping saveStrategy calls and verify consistent final state
    const promises = Array.from({ length: 10 }, (_, i) =>
      saveStrategy(
        runtime,
        makeStrategy({ id: `concurrent-${i}`, name: `Strategy ${i}` }),
      ),
    );
    await Promise.all(promises);

    const loaded = await loadStrategies(runtime);
    expect(loaded).toHaveLength(10);
  });

  it("STRATEGY_SCHEMA validates a valid strategy", () => {
    const s = makeStrategy();
    const result = STRATEGY_SCHEMA.safeParse(s);
    expect(result.success).toBe(true);
  });

  it("STRATEGY_SCHEMA rejects invalid vault address", () => {
    const s = makeStrategy({ vault: { chainId: 137, address: "not-an-address" as any } });
    const result = STRATEGY_SCHEMA.safeParse(s);
    expect(result.success).toBe(false);
  });

  it("STRATEGY_SCHEMA rejects unknown status", () => {
    const s = makeStrategy({ status: "unknown" as any });
    const result = STRATEGY_SCHEMA.safeParse(s);
    expect(result.success).toBe(false);
  });
});
