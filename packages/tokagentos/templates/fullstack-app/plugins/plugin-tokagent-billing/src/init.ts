/**
 * Plugin.init / Plugin.dispose runners for the tokagent-billing plugin.
 *
 * Decision Z27: consolidate all pg.Pool construction into a single shared
 * pool at plugin boot. Services consume the pool via `getBillingState()`
 * (Decision Z28) rather than constructing independent pools.
 *
 * `initBillingPlugin(runtime)`:
 *   1. Reads all BILLING_* settings from the agent runtime.
 *   2. Runs `loadBillingConfig()` (Zod-validated; throws BillingConfigError).
 *   3. If `BILLING_ENABLED=false`, logs and returns early — billing is a
 *      no-op until the operator sets the flag (Decision Z31).
 *   4. Constructs a single `pg.Pool` and probes connectivity.
 *   5. Runs Drizzle migrations against the billing schema.
 *   6. Builds viem clients and stores everything via `setBillingState`.
 *
 * `disposeBillingPlugin()`:
 *   - Calls `clearBillingState()` which closes the pool.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import {
  schema,
  createBillingClients,
  loadBillingConfig,
} from "@tokagentos/billing";
import { logger, type IAgentRuntime } from "@elizaos/core";
import {
  setBillingState,
  clearBillingState,
  isBillingStateInitialized,
} from "./state.js";

const log = logger.child({ src: "billing:init" });

// ---------------------------------------------------------------------------
// Known BILLING_* keys — read from runtime settings and forwarded to
// loadBillingConfig() as a NodeJS.ProcessEnv-shaped object.
// ---------------------------------------------------------------------------
const BILLING_KEYS = [
  "BILLING_ENABLED",
  "BILLING_AUTH_REQUIRED",
  "BILLING_AUTH_SECRET",
  "BILLING_AUTH_SESSION_TTL_MS",
  "BILLING_AUTH_LOGIN_NONCE_TTL_MS",
  "BILLING_RATE_LIMIT_ENABLED",
  "BILLING_RATE_LIMIT_QUOTE_PER_MIN",
  "BILLING_RATE_LIMIT_SETTLE_PER_MIN",
  "BILLING_TOPUP_AMOUNT_PTON",
  "BILLING_LITELLM_BASE_URL",
  "BILLING_LITELLM_API_KEY",
  "BILLING_DATABASE_URL",
  // Phase 2-5 envs:
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEnv(runtime: IAgentRuntime): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const k of BILLING_KEYS) {
    const val = runtime.getSetting(k);
    if (val !== null && val !== undefined) {
      env[k] = String(val);
    }
  }
  return env as NodeJS.ProcessEnv;
}

/**
 * Resolve the Drizzle migrations folder.
 *
 * The authoritative migrations live in `packages/billing/drizzle/migrations/`.
 * When running from the workspace (Bun's source-import mode), `import.meta.url`
 * points to this file at `plugins/plugin-tokagent-billing/src/init.ts`, so we
 * walk up 3 levels (src → plugin-tokagent-billing → plugins → workspace root)
 * then descend into `packages/billing/drizzle/migrations`.
 *
 * TODO(phase-8): derive path from `require.resolve('@tokagentos/billing/package.json')`
 * for published-package robustness.
 */
function resolveMigrationsFolder(): string {
  const thisFile = fileURLToPath(import.meta.url);

  // Preferred: resolve `@tokagentos/billing/package.json` from the plugin's
  // module context — works for publisher monorepo, scaffolded apps, and any
  // future packaging where the billing lib path moves.
  try {
    const req = createRequire(thisFile);
    const pkgPath = req.resolve("@tokagentos/billing/package.json");
    return path.join(path.dirname(pkgPath), "drizzle", "migrations");
  } catch {
    // Fall through to known-layout fallback.
  }

  // Fallback: scaffolded-app layout
  // src/init.ts → plugin root → plugins/ → project root → tokagent/packages/billing/
  const projectRoot = path.resolve(path.dirname(thisFile), "..", "..", "..");
  return path.join(
    projectRoot,
    "tokagent",
    "packages",
    "billing",
    "drizzle",
    "migrations",
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the billing plugin: build pool, run migrations, wire state.
 *
 * Called from `Plugin.init` in `src/index.ts`. Idempotent guard is in
 * `setBillingState` — calling twice without `dispose` in between throws.
 */
export async function initBillingPlugin(runtime: IAgentRuntime): Promise<void> {
  const env = buildEnv(runtime);
  const config = loadBillingConfig(env);

  // Decision Z31: billing is off by default. No-op when disabled.
  if (!config.enabled) {
    log.info(
      "BILLING_ENABLED=false — billing plugin running in no-op mode; " +
        "middleware and routes are inactive",
    );
    return;
  }

  log.info("billing plugin initializing");

  // ---- 1. Construct pg Pool + probe connectivity ----
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    await pool.end();
    throw new Error(
      `Billing plugin: failed to connect to BILLING_DATABASE_URL: ` +
        `${(err as Error).message}`,
    );
  }

  // ---- 2. Run Drizzle migrations ----
  const db = drizzle(pool, { schema });
  const migrationsFolder = resolveMigrationsFolder();
  try {
    await migrate(db, { migrationsFolder });
    log.info({ migrationsFolder }, "billing migrations applied");
  } catch (err) {
    await pool.end();
    throw new Error(
      `Billing plugin: migrations failed (folder=${migrationsFolder}): ` +
        `${(err as Error).message}`,
    );
  }

  // ---- 3. Build viem clients ----
  const clients = createBillingClients({
    chainRpcUrl: config.chainRpcUrl,
    mainnetRpcUrl: config.mainnetRpcUrl ?? config.chainRpcUrl,
    operatorPrivateKey: config.operatorPrivateKey,
  });

  // ---- 4. Store shared state (Decision Z28) ----
  setBillingState({ pool, db, clients, config });
  log.info("billing plugin initialized — BILLING_ENABLED=true");
}

/**
 * Tear down the billing plugin: close the pg Pool and clear state.
 *
 * Called from `Plugin.dispose` in `src/index.ts`. Safe to call when the
 * plugin was never initialized (BILLING_ENABLED=false path, or test
 * cleanup) — short-circuits silently with no log noise.
 */
export async function disposeBillingPlugin(): Promise<void> {
  if (!isBillingStateInitialized()) {
    // Never initialized — nothing to dispose, no log needed.
    return;
  }
  log.info("billing plugin disposing");
  await clearBillingState();
  log.info("billing plugin disposed");
}
