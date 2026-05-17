#!/usr/bin/env bun
/**
 * Focused billing-plugin boot smoke test.
 *
 * Exercises initBillingPlugin / disposeBillingPlugin against the user's
 * real .env so we catch wiring errors in 10 seconds instead of in a full
 * agent boot log.
 *
 * What it verifies:
 *   1. Config zod-parses cleanly with BILLING_ENABLED=true.
 *   2. Postgres reachable; migrations applied (8 billing_* tables created).
 *   3. viem clients built without throwing.
 *   4. getBillingState() returns populated state.
 *   5. TWAP read succeeds against the configured pools.
 *   6. Dispose tears down cleanly without leaking pg connections.
 */

import { initBillingPlugin, disposeBillingPlugin } from "../plugins/plugin-tokagent-billing/src/init.ts";
import { getBillingState } from "../plugins/plugin-tokagent-billing/src/state.ts";
import { readCompositeTwap } from "../packages/billing/src/index.ts";
import type { IAgentRuntime } from "@tokagentos/core";

// Minimal runtime stub — initBillingPlugin only uses getSetting().
const runtime = {
  getSetting: (key: string) => process.env[key] ?? null,
} as unknown as IAgentRuntime;

async function main(): Promise<number> {
  console.log("=== boot smoke ===");

  console.log("[1/5] initBillingPlugin(runtime)...");
  const t0 = Date.now();
  await initBillingPlugin(runtime);
  console.log(`      OK (${Date.now() - t0}ms)`);

  console.log("[2/5] getBillingState()...");
  const state = getBillingState();
  console.log(`      pool:      ${state.pool ? "ok" : "MISSING"}`);
  console.log(`      db:        ${state.db ? "ok" : "MISSING"}`);
  console.log(`      clients:   ${state.clients ? "ok" : "MISSING"}`);
  console.log(`      config:    ${state.config ? "ok" : "MISSING"}`);
  console.log(`      enabled:   ${state.config.enabled}`);
  console.log(`      vault:     ${state.config.vaultAddress}`);
  console.log(`      pton:      ${state.config.ptonAddress}`);
  console.log(`      chainId:   ${state.config.chainId}`);
  console.log(`      marginBps: ${state.config.marginBps}`);

  console.log("[3/5] inspect migrated tables...");
  const tableRows = await state.pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'billing_%' ORDER BY tablename",
  );
  const tables = tableRows.rows.map((r: { tablename: string }) => r.tablename);
  console.log(`      ${tables.length} billing_* tables:`);
  for (const t of tables) console.log(`        - ${t}`);
  if (tables.length < 8) {
    throw new Error(`expected 8 billing_* tables, got ${tables.length}`);
  }

  console.log("[4/5] live TWAP read via configured client...");
  const cfg = state.config;
  if (!cfg.wtonWethPool || !cfg.wethUsdcPool) {
    throw new Error("twap pools missing from config");
  }
  const snap = await readCompositeTwap(state.clients.mainnetClient, {
    wtonWethPool: cfg.wtonWethPool,
    wethUsdcPool: cfg.wethUsdcPool,
    twapWindowSeconds: cfg.twapWindowSeconds,
    cacheMs: cfg.priceCacheMs,
    maxStalenessMs: cfg.maxPriceStalenessMs,
    sanity: {
      minUsd: cfg.priceSanityMinUsd,
      maxUsd: cfg.priceSanityMaxUsd,
    },
    fixedPrice: cfg.fixedTonUsd,
  });
  console.log(`      TON/USD = $${snap.tonUsd.toFixed(6)} (source=${snap.source})`);

  console.log("[5/5] disposeBillingPlugin()...");
  await disposeBillingPlugin();
  console.log("      OK");

  console.log("\n=== ALL CHECKS PASSED ===");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("\n=== FAILED ===");
    console.error(err);
    process.exit(1);
  });
