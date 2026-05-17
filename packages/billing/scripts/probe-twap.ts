#!/usr/bin/env bun
/**
 * TWAP smoke probe — pre-launch operational check.
 *
 * Reads the configured composite TWAP (WTON/WETH × WETH/USDC) once against
 * the live RPC and prints the result. Designed to be run BEFORE booting
 * tokagentos with BILLING_ENABLED=true so that any pool-address, decimals,
 * or token0-ordering error surfaces in isolation instead of crashing the
 * gateway at first quote.
 *
 * Exit codes:
 *   0 — TWAP read produced a sane TON/USD price
 *   1 — read failed or price outside sanity bounds
 *
 * Usage:
 *   BILLING_MAINNET_RPC_URL=... bun run packages/billing/scripts/probe-twap.ts
 *   or:
 *   bun run packages/billing/scripts/probe-twap.ts --rpc=https://...
 *
 * Env (all optional except RPC):
 *   BILLING_MAINNET_RPC_URL              — mainnet RPC (required)
 *   BILLING_WTON_WETH_POOL_ADDRESS       — default: 0xC29271E3a68A7647Fd1399298Ef18FeCA3879F59
 *   BILLING_WETH_USDC_POOL_ADDRESS       — default: 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640
 *   BILLING_TWAP_WINDOW_SECONDS          — default: 1800
 *   BILLING_PRICE_SANITY_MIN_USD         — default: 0.05
 *   BILLING_PRICE_SANITY_MAX_USD         — default: 10
 */

import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { readCompositeTwap, type OracleConfig } from "../src/twap/oracle.js";

function getArg(name: string): string | undefined {
  const flag = `--${name}=`;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(flag)) return a.slice(flag.length);
  }
  return undefined;
}

function getEnv(key: string, fallback?: string): string | undefined {
  const v = process.env[key];
  return v !== undefined && v !== "" ? v : fallback;
}

async function main(): Promise<number> {
  const rpc =
    getArg("rpc") ??
    getEnv("BILLING_MAINNET_RPC_URL") ??
    getEnv("MAINNET_RPC_URL");
  if (!rpc) {
    console.error(
      "ERROR: pass --rpc=... or set BILLING_MAINNET_RPC_URL/MAINNET_RPC_URL",
    );
    return 1;
  }

  // Mainnet-verified pool addresses (2026-05-14). Override via env if the
  // caller is probing a non-mainnet deployment.
  const wtonWethPoolAddress = (getEnv(
    "BILLING_WTON_WETH_POOL_ADDRESS",
    "0xC29271E3a68A7647Fd1399298Ef18FeCA3879F59",
  ) as string) as Address;
  const wethUsdcPoolAddress = (getEnv(
    "BILLING_WETH_USDC_POOL_ADDRESS",
    "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
  ) as string) as Address;

  const config: OracleConfig = {
    wtonWethPool: {
      address: wtonWethPoolAddress,
      // WTON > WETH numerically, so WETH is token0 and WTON is token1.
      baseIsToken0: false,
      baseDecimals: Number(getEnv("BILLING_WTON_DECIMALS", "27")),
      quoteDecimals: Number(getEnv("BILLING_WETH_DECIMALS", "18")),
    },
    wethUsdcPool: {
      address: wethUsdcPoolAddress,
      // USDC < WETH numerically, so USDC is token0 and WETH is token1.
      baseIsToken0: false,
      baseDecimals: Number(getEnv("BILLING_WETH_DECIMALS", "18")),
      quoteDecimals: Number(getEnv("BILLING_USDC_DECIMALS", "6")),
    },
    twapWindowSeconds: Number(getEnv("BILLING_TWAP_WINDOW_SECONDS", "1800")),
    cacheMs: 60_000,
    maxStalenessMs: 600_000,
    sanity: {
      minUsd: Number(getEnv("BILLING_PRICE_SANITY_MIN_USD", "0.05")),
      maxUsd: Number(getEnv("BILLING_PRICE_SANITY_MAX_USD", "10")),
    },
  };

  console.log("probe-twap: reading composite TON/USD from", rpc);
  console.log("  WTON/WETH pool:", wtonWethPoolAddress);
  console.log("  WETH/USDC pool:", wethUsdcPoolAddress);
  console.log("  TWAP window:    ", config.twapWindowSeconds, "seconds");
  console.log(
    "  sanity bounds:  ",
    `[$${config.sanity.minUsd}, $${config.sanity.maxUsd}]`,
  );

  const client = createPublicClient({ chain: mainnet, transport: http(rpc) });

  const start = Date.now();
  try {
    const snap = await readCompositeTwap(client, config);
    const elapsed = Date.now() - start;
    console.log("---");
    console.log("  TON/USD:        $" + snap.tonUsd.toFixed(6));
    console.log(
      "  source:         ",
      snap.source,
      "(elapsed",
      elapsed + "ms)",
    );
    if (snap.legs) {
      console.log(
        "  legs:           ",
        `WTON/WETH=${(1 / snap.legs.wtonPerWeth).toFixed(8)} WETH/WTON, ` +
          `WETH/USDC=$${snap.legs.wethUsd.toFixed(2)}/WETH`,
      );
    }
    console.log("");
    console.log("OK: TWAP reads cleanly. Safe to boot with BILLING_ENABLED=true.");
    return 0;
  } catch (err) {
    console.error("---");
    console.error("FAIL:", (err as Error).message);
    console.error("");
    console.error("Common causes:");
    console.error(
      "  - Pool address typo or wrong fee tier (verify with `cast call <pool> 'fee()(uint24)' --rpc-url $RPC`)",
    );
    console.error(
      "  - token0/token1 inverted (BILLING_*_IS_TOKEN0_IN_*_POOL flag wrong)",
    );
    console.error(
      "  - Pool has insufficient observation cardinality for TWAP window (try lowering BILLING_TWAP_WINDOW_SECONDS)",
    );
    console.error("  - RPC provider rate-limited or returning stale data");
    return 1;
  }
}

main().then((code) => process.exit(code));
