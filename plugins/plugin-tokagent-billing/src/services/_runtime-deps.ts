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
 *   `pg` is already a transitive dependency in the workspace.
 *
 *   Phase 6 plugin init is responsible for running migrations and providing
 *   the `BILLING_DATABASE_URL` setting. This module reads it and creates the
 *   connection pool; it does NOT run migrations (that is a plugin.init concern).
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
 *   - `config`  — from `loadBillingConfig(env)`
 *   - `clients` — from `createBillingClients(config)`
 *   - `db`      — from `pg.Pool` + `drizzle` on `BILLING_DATABASE_URL`
 *
 * Returns a `stop()` function that closes the pg Pool on service teardown.
 *
 * @throws BillingConfigError if required env vars are missing.
 * @throws Error if BILLING_DATABASE_URL is missing.
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

  // ---- 2. Load and validate billing config ----
  const config = loadBillingConfig(env as NodeJS.ProcessEnv);

  // ---- 3. Create viem clients ----
  const clients = createBillingClients({
    chainRpcUrl: config.chainRpcUrl,
    mainnetRpcUrl: config.mainnetRpcUrl ?? config.chainRpcUrl,
    operatorPrivateKey: config.operatorPrivateKey,
  });

  // ---- 4. Construct pg Pool + Drizzle (Decision Z23 Option 2) ----
  const dbUrl = runtime.getSetting("BILLING_DATABASE_URL");
  if (!dbUrl) {
    throw new Error(
      "resolveBillingRuntime: BILLING_DATABASE_URL is required but not set in runtime settings. " +
        "TODO(phase-6): plugin.init should provide this before services start.",
    );
  }

  const pool = new Pool({ connectionString: String(dbUrl) });
  const db = drizzle(pool, { schema }) as BillingDatabase;

  return {
    db,
    clients,
    config,
    stop: async () => {
      await pool.end();
    },
  };
}
