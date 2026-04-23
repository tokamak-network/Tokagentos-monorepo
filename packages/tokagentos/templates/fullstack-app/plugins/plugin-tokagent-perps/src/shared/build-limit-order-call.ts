/**
 * Pure helper — builds a TokagentCall that dispatches a CoreWriter limit order
 * through TokagentHyperEvmHelper.dispatchCoreWriter(bytes).
 *
 * Used by both the OPEN_PERP_POSITION action and the perp-funding-arb strategy
 * execute() so they share identical order construction without code duplication.
 */

import { encodeFunctionData, isAddress, type Hex } from 'viem';
import {
  encodeCoreWriterLimitOrder,
  TIF_IOC,
  type LimitOrderParams,
} from '../corewriter.js';
import type { AssetCtx } from '../types.js';

// ABI fragment for TokagentHyperEvmHelper.dispatchCoreWriter(bytes)
const DISPATCH_COREWRITER_ABI = [
  {
    name: 'dispatchCoreWriter',
    type: 'function',
    inputs: [{ name: 'actionBytes', type: 'bytes' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export interface BuildLimitOrderCallParams {
  /** Hyperliquid asset symbol, e.g. "BTC" */
  symbol: string;
  /** "long" = buy, "short" = sell */
  side: 'long' | 'short';
  /** Notional size in USD (human units, e.g. 1000 = $1000) */
  sizeUsd: number;
  /** Mark price in USD (e.g. 65000). Used to compute sz and limit price. */
  markPx: number;
  /** Asset index in Hyperliquid universe array */
  assetIndex: number;
  /** szDecimals from Hyperliquid meta (e.g. 5 for BTC → 0.00001 BTC precision) */
  szDecimals: number;
  /** Address of the deployed TokagentHyperEvmHelper */
  helperAddress: string;
  /** Override limit price (USD). If omitted, computed from mark ± 5% slippage. */
  limitPriceOverride?: number;
  /** Override TIF. Defaults to IOC (2). */
  tifOverride?: 0 | 1 | 2;
}

export interface TokagentCallLike {
  target: `0x${string}`;
  data: Hex;
  value: bigint;
}

/**
 * Compute a limit price that falls within HyperCore's oracle price band (~5-10%).
 *
 * For buys (long):  markPx × 1.05 (5% above mark → ensures fill as a taker)
 * For sells (short): markPx × 0.95 (5% below mark → ensures fill as a taker)
 *
 * Returns price in HyperCore native units (1e8 precision, integer).
 * Rounded to nearest $1 for BTC-style assets (tick size handling via integer rounding).
 */
export function computeLimitPriceCoreUnits(markPx: number, side: 'long' | 'short'): bigint {
  const slippageFactor = side === 'long' ? 1.05 : 0.95;
  // Round to nearest dollar to satisfy common tick sizes (BTC tick = $1)
  const rounded = Math.round(markPx * slippageFactor);
  // Convert to HyperCore 1e8 units
  return BigInt(rounded) * 100_000_000n;
}

/**
 * Compute sz (order size) in szDecimals units from a USD notional and mark price.
 * sz = sizeUsd / markPx, rounded down to szDecimals precision.
 */
export function computeSzCoreUnits(sizeUsd: number, markPx: number, szDecimals: number): bigint {
  const szMultiplier = 10 ** szDecimals;
  const szRaw = sizeUsd / markPx;
  const szInt = Math.floor(szRaw * szMultiplier);
  return BigInt(szInt);
}

/**
 * Build a TokagentCall that submits a CoreWriter limit order through the helper.
 *
 * @returns A Call struct ready for TokagentVaultClient.executeBatch().
 * @throws If helperAddress is not a valid hex address.
 */
export function buildLimitOrderCall(params: BuildLimitOrderCallParams): TokagentCallLike {
  if (!isAddress(params.helperAddress)) {
    throw new Error(
      `Invalid helperAddress: "${params.helperAddress}". ` +
        'Set TOKAGENT_HYPERLIQUID_HELPER_ADDRESS to the deployed TokagentHyperEvmHelper address.',
    );
  }

  const isBuy = params.side === 'long';
  const tif = params.tifOverride ?? TIF_IOC;

  const limitPx = params.limitPriceOverride != null
    ? BigInt(Math.round(params.limitPriceOverride * 100_000_000))
    : computeLimitPriceCoreUnits(params.markPx, params.side);

  const sz = computeSzCoreUnits(params.sizeUsd, params.markPx, params.szDecimals);

  if (sz === 0n) {
    throw new Error(
      `Computed sz is 0 for ${params.symbol}: sizeUsd=${params.sizeUsd}, ` +
        `markPx=${params.markPx}, szDecimals=${params.szDecimals}. Increase sizeUsd.`,
    );
  }

  const orderParams: LimitOrderParams = {
    asset: params.assetIndex,
    isBuy,
    limitPx,
    sz,
    reduceOnly: false,
    tif,
    cloid: 0n,
  };

  const actionBytes = encodeCoreWriterLimitOrder(orderParams);

  const dispatchCalldata = encodeFunctionData({
    abi: DISPATCH_COREWRITER_ABI,
    functionName: 'dispatchCoreWriter',
    args: [actionBytes],
  });

  return {
    target: params.helperAddress as `0x${string}`,
    data: dispatchCalldata,
    value: 0n,
  };
}

/**
 * Fetch Hyperliquid meta + mark price for a symbol.
 * Returns assetIndex, szDecimals, and current mark price.
 */
export async function resolveAssetInfo(
  symbol: string,
  apiUrl: string,
  signal: AbortSignal,
): Promise<{ assetIndex: number; szDecimals: number; markPx: number }> {
  const hlPost = async (body: unknown): Promise<unknown> => {
    const resp = await fetch(`${apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!resp.ok) throw new Error(`Hyperliquid API returned ${resp.status}`);
    return resp.json();
  };

  const metaResp = await hlPost({ type: 'meta' }) as {
    universe: Array<{ name: string; szDecimals: number }>;
  };

  const assetIndex = metaResp.universe.findIndex((a) => a.name === symbol);
  if (assetIndex === -1) {
    throw new Error(
      `Symbol "${symbol}" not found in Hyperliquid universe. ` +
        'Check the symbol (e.g. "BTC", "ETH", "SOL").',
    );
  }
  const szDecimals = metaResp.universe[assetIndex].szDecimals;

  // Fetch metaAndAssetCtxs for mark price
  const ctxResp = await hlPost({ type: 'metaAndAssetCtxs' }) as [
    { universe: Array<{ name: string }> },
    AssetCtx[],
  ];
  const ctx = ctxResp[1][assetIndex];
  if (!ctx) {
    throw new Error(`No market context for "${symbol}" at index ${assetIndex}.`);
  }
  const markPx = parseFloat(ctx.markPx);
  if (!Number.isFinite(markPx) || markPx <= 0) {
    throw new Error(`Invalid mark price for "${symbol}": ${ctx.markPx}`);
  }

  return { assetIndex, szDecimals, markPx };
}
