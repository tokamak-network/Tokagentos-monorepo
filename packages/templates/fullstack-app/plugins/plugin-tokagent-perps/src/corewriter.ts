/**
 * CoreWriter encoding utilities for HyperCore precompile actions.
 *
 * The CoreWriter precompile at 0x3333...3333 on HyperEVM accepts action bytes
 * encoded as: abi.encodePacked(uint8(version), uint24(actionId), abi.encode(params...))
 *
 * Actions are consumed asynchronously by HyperCore — they are not immediately
 * reflected in HyperEVM state and generally do not revert on HyperCore errors.
 * Silent rejections are a common failure mode (price band violations, leverage=0,
 * insufficient margin). Always verify HyperCore state after dispatching actions.
 *
 * See: https://github.com/hyperliquid-dex/hyper-evm-lib for canonical encoding.
 */

import { encodeAbiParameters, type Hex } from 'viem';

export const COREWRITER_VERSION = 1 as const;

// Action IDs from the Hyperliquid CoreWriter spec
export const COREWRITER_ACTION_LIMIT_ORDER = 1 as const;
export const COREWRITER_ACTION_SPOT_SEND = 6 as const;
export const COREWRITER_ACTION_USD_CLASS_TRANSFER = 7 as const;

export const COREWRITER_ADDRESS = '0x3333333333333333333333333333333333333333' as const;
export const HYPE_BRIDGE_ADDRESS = '0x2222222222222222222222222222222222222222' as const;

/** Time-in-force values for limit orders */
export const TIF_GTC = 0 as const; // Good-Till-Cancel
export const TIF_ALO = 1 as const; // Add-Liquidity-Only (post-only)
export const TIF_IOC = 2 as const; // Immediate-Or-Cancel (closest to market)

/**
 * Build the 4-byte header: uint8(version) || uint24(actionId).
 * First 4 bytes of all CoreWriter actions.
 */
function buildHeader(actionId: number): Hex {
  const versionHex = COREWRITER_VERSION.toString(16).padStart(2, '0');
  const actionHex  = actionId.toString(16).padStart(6, '0');
  return `0x${versionHex}${actionHex}` as Hex;
}

// ─── Limit Order (Action 1) ───────────────────────────────────────────────────

export interface LimitOrderParams {
  /** Asset index from Hyperliquid meta universe array */
  asset: number;
  /** true = long/buy, false = short/sell */
  isBuy: boolean;
  /** Limit price in HyperCore native units (1e8 precision). E.g., $65000 = 6500000000000n */
  limitPx: bigint;
  /** Size in szDecimals units for the asset. E.g., 0.01 BTC with szDecimals=5 → 1000n */
  sz: bigint;
  /** If true, the order can only reduce an existing position */
  reduceOnly: boolean;
  /** Time-in-force: 0=GTC, 1=ALO, 2=IOC */
  tif: 0 | 1 | 2;
  /** Client order ID. Use 0n if unused. */
  cloid: bigint;
}

/**
 * Encode a CoreWriter limit order action.
 *
 * Encoding: abi.encodePacked(uint8(1), uint24(1), abi.encode(uint32, bool, uint64, uint64, bool, uint8, uint128))
 *
 * IMPORTANT: HyperCore silently rejects orders with:
 *   - Price outside oracle band (~5–10%). Use mark × 1.05 for buys, mark × 0.95 for sells.
 *   - Leverage = 0 (first position must be opened via REST API to initialize leverage).
 *   - Insufficient margin (deposit must settle before order — separate tx, wait ~5s).
 *   - Price not on tick boundary (BTC tick = $1; use asset pxDecimals from meta).
 */
export function encodeCoreWriterLimitOrder(params: LimitOrderParams): Hex {
  const paramsAbi = encodeAbiParameters(
    [
      { type: 'uint32' },
      { type: 'bool' },
      { type: 'uint64' },
      { type: 'uint64' },
      { type: 'bool' },
      { type: 'uint8' },
      { type: 'uint128' },
    ],
    [
      params.asset,
      params.isBuy,
      params.limitPx,
      params.sz,
      params.reduceOnly,
      params.tif,
      params.cloid,
    ],
  );
  const header = buildHeader(COREWRITER_ACTION_LIMIT_ORDER);
  return `${header}${paramsAbi.slice(2)}` as Hex;
}

// ─── USD Class Transfer (Action 7) ───────────────────────────────────────────

export interface UsdClassTransferParams {
  /**
   * Amount in 1e6 units (USDC native decimals).
   * E.g., 1 USDC = 1_000_000n.
   * NOTE: NOT 1e8 — usdClassTransfer uses USDC decimals, not HyperCore wei.
   */
  amount: bigint;
  /**
   * Transfer direction:
   *   false = perp margin → spot
   *   true  = spot → perp margin
   */
  toPerp: boolean;
}

/**
 * Encode a CoreWriter usdClassTransfer action (perp ↔ spot USDC).
 *
 * Encoding: abi.encodePacked(uint8(1), uint24(7), abi.encode(uint64, bool))
 *
 * Amount unit: 1e6 (USDC decimals). 1 USDC = 1_000_000n.
 * See memory note: "usdClassTransfer (action 7): amounts in 1e6 units".
 */
export function encodeCoreWriterUsdClassTransfer(params: UsdClassTransferParams): Hex {
  const paramsAbi = encodeAbiParameters(
    [{ type: 'uint64' }, { type: 'bool' }],
    [params.amount, params.toPerp],
  );
  const header = buildHeader(COREWRITER_ACTION_USD_CLASS_TRANSFER);
  return `${header}${paramsAbi.slice(2)}` as Hex;
}

// ─── Spot Send (Action 6) ─────────────────────────────────────────────────────

export interface SpotSendParams {
  /**
   * Destination address on HyperCore.
   * For EVM-side withdrawals, this is the EVM address receiving spot assets.
   */
  destination: string;
  /**
   * Token identifier (e.g., "USDC").
   */
  token: string;
  /**
   * Amount in HyperCore "wei" units (1e8 precision).
   * E.g., 1 USDC = 100_000_000n.
   * NOTE: NOT 1e6 — spotSend uses HyperCore wei, not USDC native decimals.
   * CAUTION: Do NOT send the full spot balance — leave a small margin (e.g., 0.1 USDC).
   *          Sending exactly the full balance is silently rejected by HyperCore.
   */
  amount: bigint;
}

/**
 * Encode a CoreWriter spotSend action (send spot assets to an address).
 *
 * Encoding: abi.encodePacked(uint8(1), uint24(6), abi.encode(string, string, uint64))
 *
 * Amount unit: 1e8 (HyperCore wei). 1 USDC = 100_000_000n.
 * See memory note: "spotSend (action 6): amounts in 1e8 units".
 */
export function encodeCoreWriterSpotSend(params: SpotSendParams): Hex {
  const paramsAbi = encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }, { type: 'uint64' }],
    [params.destination, params.token, params.amount],
  );
  const header = buildHeader(COREWRITER_ACTION_SPOT_SEND);
  return `${header}${paramsAbi.slice(2)}` as Hex;
}
