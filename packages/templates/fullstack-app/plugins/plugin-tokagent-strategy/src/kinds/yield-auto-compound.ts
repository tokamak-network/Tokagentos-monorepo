/**
 * yield-auto-compound — supply idle USDC.e into Aave v3 on Polygon.
 *
 * evaluate: check vault's raw USDC.e balance (not yet deposited).
 * execute: call Pool.supply(USDC.e, amount, vault, 0) via TokagentVaultClient.executeBatch.
 */

import { z } from "zod";
import { createPublicClient, http, encodeFunctionData } from "viem";
import { polygon } from "viem/chains";
import {
  TokagentVaultClient,
  getWalletClient,
  resolveAgentPrivateKey,
} from "@tokagent/plugin-tokagent-shared";
import type { StrategyKindImpl } from "../types.js";

// ─── Addresses (Polygon mainnet) ─────────────────────────────────────────────

const USDC_E: `0x${string}` = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const A_USDC_E: `0x${string}` = "0x625E7708f30cA75bfd92586e17077590C60eb4cD";
const AAVE_POOL: `0x${string}` = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
const POLYGON_CHAIN_ID = 137;

// ─── Minimal ABIs ────────────────────────────────────────────────────────────

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Only index 3 (currentLiquidityRate) matters; we read the full struct. */
const AAVE_POOL_ABI = [
  {
    name: "getReserveData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "configuration", type: "tuple", components: [{ name: "data", type: "uint256" }] },
          { name: "liquidityIndex", type: "uint128" },
          { name: "currentLiquidityRate", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "currentVariableBorrowRate", type: "uint128" },
          { name: "currentStableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "id", type: "uint16" },
          { name: "aTokenAddress", type: "address" },
          { name: "stableDebtTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "unbacked", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" },
        ],
      },
    ],
  },
] as const;

/** Pool.supply(asset, amount, onBehalfOf, referralCode) selector: 0x617ba037 */
const POOL_SUPPLY_ABI = [
  {
    name: "supply",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
] as const;

// ─── Param schema ─────────────────────────────────────────────────────────────

export const yieldAutoCompoundParamSchema = z.object({
  asset: z.enum(["USDC"]),
  minHarvestAmount: z.number().positive(),
  targetApy: z.number().positive().optional(),
});

type Params = z.infer<typeof yieldAutoCompoundParamSchema>;

// ─── Implementation ──────────────────────────────────────────────────────────

export const yieldAutoCompoundKind: StrategyKindImpl<Params> = {
  kind: "yield-auto-compound",
  paramSchema: yieldAutoCompoundParamSchema,

  async evaluate(params, vault, _runtime) {
    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(),
    });

    // Read raw USDC.e balance of the vault
    const usdcRaw = await publicClient.readContract({
      address: USDC_E,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [vault.address],
    }) as bigint;

    // USDC has 6 decimals
    const usdcHuman = Number(usdcRaw) / 1e6;

    // Read aUSDC.e balance (already supplying)
    const aUsdcRaw = await publicClient.readContract({
      address: A_USDC_E,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [vault.address],
    }) as bigint;
    const aUsdcHuman = Number(aUsdcRaw) / 1e6;

    // Read current APY from Aave (ray = 1e27)
    let currentApyPct = 0;
    try {
      const reserveData = await publicClient.readContract({
        address: AAVE_POOL,
        abi: AAVE_POOL_ABI,
        functionName: "getReserveData",
        args: [USDC_E],
      }) as { currentLiquidityRate: bigint };
      // ray fraction → APY % (simple, non-compounded)
      currentApyPct = (Number(reserveData.currentLiquidityRate) / 1e27) * 100;
    } catch {
      // Non-fatal — APY is advisory only
    }

    if (usdcHuman < params.minHarvestAmount) {
      return {
        shouldExecute: false,
        summary: `Vault USDC balance $${usdcHuman.toFixed(2)} < minHarvestAmount $${params.minHarvestAmount}; nothing to compound. aUSDC.e in Aave: $${aUsdcHuman.toFixed(2)}. Aave APY: ${currentApyPct.toFixed(2)}%.`,
      };
    }

    return {
      shouldExecute: true,
      summary: `Vault USDC balance $${usdcHuman.toFixed(2)} ≥ minHarvestAmount $${params.minHarvestAmount}. aUSDC.e in Aave: $${aUsdcHuman.toFixed(2)}. APY: ${currentApyPct.toFixed(2)}%. Will supply ${usdcHuman.toFixed(2)} USDC.e to Aave.`,
      context: { amountToSupply: usdcRaw.toString(), amountHuman: usdcHuman },
    };
  },

  async execute(params, vault, context, runtime) {
    if (!context) {
      throw new Error("yield-auto-compound execute called without context from evaluate");
    }

    const amountRaw = BigInt(context["amountToSupply"] as string);

    // Build Pool.supply calldata
    const supplyCalldata = encodeFunctionData({
      abi: POOL_SUPPLY_ABI,
      functionName: "supply",
      args: [USDC_E, amountRaw, vault.address, 0],
    });

    // Resolve the wallet
    const runtimeLike = {
      getSetting: (key: string): string | undefined => {
        const v = runtime.getSetting(key);
        if (v === null || v === undefined) return undefined;
        return String(v) || undefined;
      },
    };
    const privateKey = resolveAgentPrivateKey(runtimeLike);
    const walletClient = getWalletClient(POLYGON_CHAIN_ID, privateKey);

    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(),
    });

    const vaultClient = new TokagentVaultClient(vault.address, publicClient, walletClient);

    const txHash = await vaultClient.executeBatch([
      {
        target: AAVE_POOL,
        data: supplyCalldata,
        value: 0n,
      },
    ]);

    const amountHuman = Number(amountRaw) / 1e6;
    return {
      summary: `Supplied $${amountHuman.toFixed(2)} USDC.e to Aave v3 on Polygon via vault ${vault.address}.`,
      txHashes: [txHash],
    };
  },
};
