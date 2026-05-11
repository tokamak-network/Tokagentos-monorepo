/**
 * Runtime → billing deps resolver (Decision Z19, Z23).
 *
 * Centralizes the mapping from elizaOS IAgentRuntime settings to the
 * `{ db, clients, config }` bundle that all billing services need.
 *
 * Decision Z23 — DB wiring (Option 2):
 *   `@elizaos/plugin-sql` does not expose a public typed `BillingDatabase`
 *   surface that billing can use — its internal `getDb()` / `ctx.getDb()` are
 *   bound to the plugin-sql schema, not the billing schema. Inspecting the
 *   plugin-sql JS bundle confirms only internal `AgentStore` / `MemoryStore`
 *   classes call `ctx.getDb()`.
 *
 *   Therefore we pick **Option 2**: construct a `node-postgres` (`pg`) +
 *   Drizzle connection from `BILLING_DATABASE_URL` at service start time.
 *   `pg` is declared in the plugin's `dependencies` (Phase 5.1 fix).
 *
 *   Phase 6 plugin init is responsible for running migrations and providing
 *   the `BILLING_DATABASE_URL` setting. This module reads it and creates the
 *   connection pool; it does NOT run migrations (that is a plugin.init concern).
 *
 * Phase 5.2 changes:
 *   - `BILLING_DATABASE_URL` is now validated by Zod inside `loadBillingConfig`
 *     (Fix 1) — read from `config.databaseUrl`, not via a separate
 *     `runtime.getSetting('BILLING_DATABASE_URL')`. Typos surface as a
 *     `BillingConfigError` at config-load time, not a service-start throw.
 *   - An eager `SELECT 1` probe runs after pool construction (Fix 4).
 *     Unreachable databases fail in milliseconds, not after the first
 *     scheduled tick.
 *
 * TODO(phase-6): replace with a proper BillingDatabase setter once plugin.init
 * wires the DB via drizzle migrations + pooled connection management. The
 * current approach creates a new Pool per service start; at scale, a single
 * shared pool should be passed via plugin.init.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { IAgentRuntime } from "@tokagentos/core";
import {
  loadBillingConfig,
  createBillingClients,
  type BillingConfig,
  type BillingClients,
  type BillingDatabase,
  schema,
} from "@tokagentos/billing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BillingRuntimeDeps {
  db: BillingDatabase;
  clients: BillingClients;
  config: BillingConfig;
  /** Call stop() to close the underlying pg Pool. */
  stop: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// resolveBillingRuntime
// ---------------------------------------------------------------------------

/**
 * Construct all billing deps from the agent runtime settings.
 *
 * Reads `BILLING_*` env values via `runtime.getSetting(key)` and builds:
 *   - `config`  — from `loadBillingConfig(env)` (Zod-validated; throws
 *                  `BillingConfigError` on missing/malformed envs)
 *   - `clients` — from `createBillingClients(config)`
 *   - `db`      — from `pg.Pool` + `drizzle` on `config.databaseUrl`
 *
 * Probes the pool with `SELECT 1` before returning so unreachable databases
 * fail fast (Phase 5.2 Fix 4).
 *
 * Returns a `stop()` function that closes the pg Pool on service teardown.
 *
 * @throws BillingConfigError if required env vars are missing or malformed.
 * @throws Error if the database is not reachable.
 */
export async function resolveBillingRuntime(
  runtime: IAgentRuntime,
): Promise<BillingRuntimeDeps> {
  // ---- 1. Build env-shaped object from runtime settings ----
  const KEYS = [
    "BILLING_MAINNET_RPC_URL",
    "BILLING_WTON_WETH_POOL_ADDRESS",
    "BILLING_WTON_IS_TOKEN0_IN_WETH_POOL",
    "BILLING_WTON_DECIMALS",
    "BILLING_WETH_USDC_POOL_ADDRESS",
    "BILLING_WETH_IS_TOKEN0_IN_USDC_POOL",
    "BILLING_WETH_DECIMALS",
    "BILLING_USDC_DECIMALS",
    "BILLING_TWAP_WINDOW_SECONDS",
    "BILLING_PRICE_CACHE_MS",
    "BILLING_MAX_PRICE_STALENESS_MS",
    "BILLING_PRICE_SANITY_MIN_USD",
    "BILLING_PRICE_SANITY_MAX_USD",
    "BILLING_MARGIN_BPS",
    "BILLING_MARGIN_FLOOR_BPS",
    "BILLING_PROMOTION_DISCOUNT_BPS",
    "BILLING_FIXED_TON_USD",
    "BILLING_CHAIN_RPC_URL",
    "BILLING_CHAIN_ID",
    "BILLING_VAULT_ADDRESS",
    "BILLING_PTON_ADDRESS",
    "BILLING_OPERATOR_PRIVATE_KEY",
    "BILLING_DATABASE_URL",
    "BILLING_CONSUME_BATCH_MIN_PTON",
    "BILLING_CONSUME_MAX_AGE_MS",
    "BILLING_CONSUME_SCAN_INTERVAL_MS",
    "BILLING_CONSUME_MAX_PER_CYCLE",
    "BILLING_USAGE_RETENTION_DAYS",
    "BILLING_USAGE_CLEANUP_INTERVAL_MS",
    "BILLING_PRICE_REFRESH_INTERVAL_MS",
  ] as const;

  const env: Record<string, string | undefined> = {};
  for (const key of KEYS) {
    const val = runtime.getSetting(key);
    if (val !== null && val !== undefined) {
      env[key] = String(val);
    }
  }

  // ---- 2. Load and validate billing config (throws BillingConfigError on bad input) ----
  const config = loadBillingConfig(env as NodeJS.ProcessEnv);

  // ---- 3. Create viem clients ----
  const clients = createBillingClients({
    chainRpcUrl: config.chainRpcUrl,
    mainnetRpcUrl: config.mainnetRpcUrl ?? config.chainRpcUrl,
    operatorPrivateKey: config.operatorPrivateKey,
  });

  // ---- 4. Construct pg Pool + Drizzle (Decision Z23 Option 2) ----
  // `config.databaseUrl` is Zod-validated as a URL — non-null, well-formed.
  const pool = new Pool({ connectionString: config.databaseUrl });
  const db = drizzle(pool, { schema }) as BillingDatabase;

  // ---- 5. Eager connection probe (Phase 5.2 Fix 4) ----
  // Fail fast on unreachable databases instead of waiting up to
  // `consumeScanIntervalMs` (30s) for the first query to surface the error.
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    await pool.end();
    throw new Error(
      `Failed to connect to BILLING_DATABASE_URL: ${(err as Error).message}. ` +
        `Check the URL, credentials, and that the database is reachable.`,
    );
  }

  return {
    db,
    clients,
    config,
    stop: async () => {
      await pool.end();
    },
  };
}
