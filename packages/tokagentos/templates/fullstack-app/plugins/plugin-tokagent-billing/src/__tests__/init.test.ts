/**
 * Tests for the Plugin.init / Plugin.dispose lifecycle (`init.ts`).
 *
 * Strategy: mock `pg.Pool` (and the migrator) so we don't need a real Postgres
 * in tests. The `BillingPluginState` shape and `setBillingState`/`getBillingState`
 * lifecycle are exercised directly.
 *
 * Coverage:
 *   - BILLING_ENABLED=false short-circuit (no pool, no state set)
 *   - Happy path (pool probe + migrate + setBillingState)
 *   - Pool probe failure throws with a clear message
 *   - Double-init guard rejects the second call
 *   - dispose clears state
 */

import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (hoisted via vi.mock — must run before imports of init.ts).
//
// Shared mock state lives inside `vi.hoisted(...)` so the closures in the
// vi.mock factories below can capture it without violating the no-top-level-
// reference rule for hoisted mocks.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const poolState = {
    shouldFailQuery: false,
    queryError: undefined as Error | undefined,
    endCallCount: 0,
    connectionString: undefined as string | undefined,
    queries: [] as string[],
  };

  class MockPool {
    constructor(opts: { connectionString?: string }) {
      poolState.connectionString = opts.connectionString;
    }
    async query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }> {
      poolState.queries.push(sql);
      if (poolState.shouldFailQuery) {
        throw poolState.queryError ?? new Error("mock pool query failed");
      }
      return { rows: [{ "?column?": 1 }] };
    }
    async end(): Promise<void> {
      poolState.endCallCount++;
    }
  }

  const migrateState = {
    callCount: 0,
    lastMigrationsFolder: undefined as string | undefined,
    shouldFail: false,
  };

  return { poolState, MockPool, migrateState };
});

vi.mock("pg", () => ({
  Pool: mocks.MockPool,
  default: { Pool: mocks.MockPool },
}));

vi.mock("drizzle-orm/node-postgres/migrator", () => ({
  migrate: async (_db: unknown, opts: { migrationsFolder: string }): Promise<void> => {
    mocks.migrateState.callCount++;
    mocks.migrateState.lastMigrationsFolder = opts.migrationsFolder;
    if (mocks.migrateState.shouldFail) {
      throw new Error("mock migrate failed");
    }
  },
}));

// The drizzle factory returns a sentinel — init.ts only uses the result as a
// generic db handle passed to `migrate` and `createBillingClients`.
vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: (_pool: unknown, _opts: unknown) => ({ __mockDb: true }),
}));

// Local aliases for the hoisted mock state (so test bodies don't repeat `mocks.`).
const poolState = mocks.poolState;
const migrateState = mocks.migrateState;

// createBillingClients calls privateKeyToAccount which requires a valid
// hex key. We pass a real fixture key in env, so no mock needed — viem
// handles the rest with HTTP transports that are never actually called.

// ---------------------------------------------------------------------------
// Imports (after vi.mock declarations above)
// ---------------------------------------------------------------------------

import { initBillingPlugin, disposeBillingPlugin } from "../init.js";
import {
  getBillingState,
  isBillingStateInitialized,
  clearBillingState,
} from "../state.js";
import type { IAgentRuntime } from "@elizaos/core";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A valid fixture private key (anvil account 0) accepted by viem. */
const FIXTURE_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const FIXTURE_ADDR_A = "0x0000000000000000000000000000000000000001";
const FIXTURE_ADDR_B = "0x0000000000000000000000000000000000000002";

/** Build a stub runtime whose getSetting returns values from the given env. */
function makeRuntime(env: Record<string, string | undefined>): IAgentRuntime {
  return {
    getSetting: (key: string) => env[key],
  } as unknown as IAgentRuntime;
}

/** Minimum env required for a successful BILLING_ENABLED=true boot. */
function fullEnabledEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    BILLING_ENABLED: "true",
    BILLING_AUTH_REQUIRED: "true",
    BILLING_AUTH_SECRET: "test-secret-for-init",
    BILLING_DATABASE_URL: "postgres://mock/billing",
    BILLING_CHAIN_RPC_URL: "http://localhost:8545",
    BILLING_CHAIN_ID: "31337",
    BILLING_VAULT_ADDRESS: FIXTURE_ADDR_A,
    BILLING_PTON_ADDRESS: FIXTURE_ADDR_B,
    BILLING_OPERATOR_PRIVATE_KEY: FIXTURE_PK,
    BILLING_MAINNET_RPC_URL: "http://localhost:8545",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  poolState.shouldFailQuery = false;
  poolState.queryError = undefined;
  poolState.endCallCount = 0;
  poolState.connectionString = undefined;
  poolState.queries = [];
  migrateState.callCount = 0;
  migrateState.lastMigrationsFolder = undefined;
  migrateState.shouldFail = false;
  await clearBillingState();
});

afterEach(async () => {
  await clearBillingState();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("initBillingPlugin — BILLING_ENABLED=false short-circuit", () => {
  it("does nothing when billing is disabled (no pool, no state)", async () => {
    const runtime = makeRuntime({ BILLING_ENABLED: "false" });
    await initBillingPlugin(runtime);

    expect(isBillingStateInitialized()).toBe(false);
    expect(poolState.connectionString).toBeUndefined();
    expect(migrateState.callCount).toBe(0);
    expect(() => getBillingState()).toThrow(/not initialized/);
  });

  it("does nothing when BILLING_ENABLED is missing (defaults to false)", async () => {
    const runtime = makeRuntime({}); // no settings at all
    await initBillingPlugin(runtime);

    expect(isBillingStateInitialized()).toBe(false);
    expect(poolState.connectionString).toBeUndefined();
  });
});

describe("initBillingPlugin — happy path", () => {
  it("builds the pool, runs migrations, and stores state", async () => {
    const env = fullEnabledEnv();
    await initBillingPlugin(makeRuntime(env));

    // Pool was constructed with the configured database URL.
    expect(poolState.connectionString).toBe(env.BILLING_DATABASE_URL);

    // Connectivity probe ran.
    expect(poolState.queries).toContain("SELECT 1");

    // Migrate was invoked once with a real-looking path.
    expect(migrateState.callCount).toBe(1);
    expect(migrateState.lastMigrationsFolder).toMatch(/packages\/billing\/drizzle\/migrations$/);

    // State was stored.
    expect(isBillingStateInitialized()).toBe(true);
    const state = getBillingState();
    expect(state.config.enabled).toBe(true);
    expect(state.db).toBeDefined();
    expect(state.clients).toBeDefined();
  });

  it("disposeBillingPlugin clears state and ends the pool", async () => {
    await initBillingPlugin(makeRuntime(fullEnabledEnv()));
    expect(isBillingStateInitialized()).toBe(true);

    await disposeBillingPlugin();

    expect(isBillingStateInitialized()).toBe(false);
    expect(poolState.endCallCount).toBe(1);
    expect(() => getBillingState()).toThrow(/not initialized/);
  });
});

describe("initBillingPlugin — failure paths", () => {
  it("throws with a clear message when the pool probe (SELECT 1) fails", async () => {
    poolState.shouldFailQuery = true;
    poolState.queryError = new Error("ECONNREFUSED 127.0.0.1:5432");

    await expect(initBillingPlugin(makeRuntime(fullEnabledEnv()))).rejects.toThrow(
      /failed to connect to BILLING_DATABASE_URL.*ECONNREFUSED/i,
    );

    // Pool was ended before the throw (cleanup).
    expect(poolState.endCallCount).toBe(1);
    // No state was stored.
    expect(isBillingStateInitialized()).toBe(false);
  });

  it("throws with a clear message when migrations fail", async () => {
    migrateState.shouldFail = true;

    await expect(initBillingPlugin(makeRuntime(fullEnabledEnv()))).rejects.toThrow(
      /migrations failed/i,
    );

    // Pool was ended before the throw.
    expect(poolState.endCallCount).toBe(1);
    expect(isBillingStateInitialized()).toBe(false);
  });
});

describe("initBillingPlugin — double-init guard", () => {
  it("rejects the second init() call until disposeBillingPlugin runs", async () => {
    await initBillingPlugin(makeRuntime(fullEnabledEnv()));
    expect(isBillingStateInitialized()).toBe(true);

    // Second call must throw via setBillingState's guard.
    await expect(initBillingPlugin(makeRuntime(fullEnabledEnv()))).rejects.toThrow(
      /already initialized/,
    );
  });

  it("re-init works after disposeBillingPlugin", async () => {
    await initBillingPlugin(makeRuntime(fullEnabledEnv()));
    await disposeBillingPlugin();
    expect(isBillingStateInitialized()).toBe(false);

    await initBillingPlugin(makeRuntime(fullEnabledEnv()));
    expect(isBillingStateInitialized()).toBe(true);
  });
});
