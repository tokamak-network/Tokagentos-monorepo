import type { Action, ActionResult, HandlerOptions } from '@elizaos/core';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';
import { TokagentVaultClient } from '@tokagent/plugin-tokagent-shared';
import {
  getPublicClient,
  getWalletClient,
  resolveAgentPrivateKey,
} from '@tokagent/plugin-tokagent-shared';
import { DEFAULT_HL_API_URL, HL_FETCH_TIMEOUT_MS } from '../types.js';
import type { ClearinghouseState } from '../types.js';
import {
  buildLimitOrderCall,
  computeLimitPriceCoreUnits,
  computeSzCoreUnits,
  resolveAssetInfo,
} from '../shared/build-limit-order-call.js';
import { encodeCoreWriterLimitOrder, TIF_IOC } from '../corewriter.js';
import { encodeFunctionData } from 'viem';

const HYPEREVM_CHAIN_ID = 999;
const UNDEPLOYED_PLACEHOLDER = '0x0000000000000000000000000000000000000000';

const DISPATCH_COREWRITER_ABI = [
  {
    name: 'dispatchCoreWriter',
    type: 'function',
    inputs: [{ name: 'actionBytes', type: 'bytes' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

function resolveHelperAddress(runtime: IAgentRuntime): { address: string } | { error: string } {
  const addr = (
    runtime.getSetting('TOKAGENT_HYPERLIQUID_HELPER_ADDRESS') as string | undefined
  )?.trim();
  if (!addr || addr === UNDEPLOYED_PLACEHOLDER) {
    return {
      error:
        'TokagentHyperEvmHelper is not deployed. ' +
        'Set TOKAGENT_HYPERLIQUID_HELPER_ADDRESS after deploying DeployTokagentHyperEvmHelper.s.sol.',
    };
  }
  return { address: addr };
}

function resolveVaultAddress(runtime: IAgentRuntime): string | undefined {
  return (
    (runtime.getSetting('TOKAGENT_VAULT_ADDRESS_999') as string | undefined) ??
    (runtime.getSetting('TOKAGENT_VAULT_ADDRESS') as string | undefined)
  );
}

export const closePerpPositionAction: Action = {
  name: 'CLOSE_PERP_POSITION',
  description:
    'Close an open Hyperliquid perpetual position through the TokagentVault on HyperEVM. ' +
    'Sends a reduceOnly CoreWriter limit order. If no position exists, returns success.',
  similes: [
    'close perp',
    'close position',
    'exit position',
    'close long',
    'close short',
    'flat position',
    'exit trade',
  ],
  contexts: ['wallet'],

  parameters: [
    {
      name: 'symbol',
      description: 'Asset symbol of the position to close, e.g. "BTC", "ETH"',
      required: true,
      schema: { type: 'string' },
      examples: ['BTC', 'ETH', 'SOL'],
    },
    {
      name: 'sizeSz',
      description:
        'Optional: size to close in asset units (szDecimals precision). ' +
        'If omitted, closes the full position.',
      required: false,
      schema: { type: 'number' },
    },
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<boolean> => {
    const vaultAddress = resolveVaultAddress(runtime);
    if (!vaultAddress) return false;
    const helperResult = resolveHelperAddress(runtime);
    if ('error' in helperResult) return false;
    try {
      resolveAgentPrivateKey(runtime as unknown as Parameters<typeof resolveAgentPrivateKey>[0]);
    } catch {
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    options?: HandlerOptions | Record<string, unknown>,
  ): Promise<ActionResult | undefined> => {
    const params = (options as HandlerOptions | undefined)?.parameters;

    const rawSymbol = params?.symbol;
    const rawSizeSz = params?.sizeSz;

    if (!rawSymbol) {
      return { success: false, text: 'Missing required parameter: symbol.', error: 'missing symbol' };
    }

    const symbol = String(rawSymbol).toUpperCase().trim();

    // ── Resolve infrastructure ──────────────────────────────────────────────
    const vaultAddress = resolveVaultAddress(runtime);
    if (!vaultAddress) {
      return {
        success: false,
        text: 'TOKAGENT_VAULT_ADDRESS_999 is not set.',
        error: 'vault address not configured',
      };
    }

    const helperResult = resolveHelperAddress(runtime);
    if ('error' in helperResult) {
      return { success: false, text: helperResult.error, error: 'helper not deployed' };
    }
    const helperAddress = helperResult.address;

    let privateKey: `0x${string}`;
    try {
      privateKey = resolveAgentPrivateKey(runtime as unknown as Parameters<typeof resolveAgentPrivateKey>[0]);
    } catch (e) {
      return {
        success: false,
        text: e instanceof Error ? e.message : String(e),
        error: 'private key missing',
      };
    }

    const apiUrl =
      (runtime.getSetting('HYPERLIQUID_API_URL') as string | undefined) ?? DEFAULT_HL_API_URL;

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), HL_FETCH_TIMEOUT_MS);

    try {
      // ── Fetch current position ────────────────────────────────────────────
      let clearingState: ClearinghouseState;
      try {
        const resp = await fetch(`${apiUrl}/info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'clearinghouseState', user: vaultAddress }),
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error(`Hyperliquid API returned ${resp.status}`);
        clearingState = (await resp.json()) as ClearinghouseState;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          text: `Failed to fetch position data: ${msg}`,
          error: msg,
        };
      }

      const positionEntry = clearingState.assetPositions?.find(
        (ap) => ap.position.coin === symbol,
      );
      const currentSzi = positionEntry ? parseFloat(positionEntry.position.szi) : 0;

      if (currentSzi === 0) {
        return {
          success: true,
          text: `No open ${symbol} position. Nothing to close.`,
          data: { symbol, closed: false },
        };
      }

      // ── Fetch asset info for mark price ──────────────────────────────────
      let assetIndex: number;
      let szDecimals: number;
      let markPx: number;

      try {
        ({ assetIndex, szDecimals, markPx } = await resolveAssetInfo(symbol, apiUrl, controller.signal));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          text: `Failed to fetch market data for "${symbol}": ${msg}`,
          error: msg,
        };
      }

      // ── Determine close side and size ─────────────────────────────────────
      // To close: if we're long (szi > 0) → sell (isBuy=false); if short (szi < 0) → buy (isBuy=true)
      const isLong = currentSzi > 0;
      const isBuy  = !isLong; // close direction is opposite

      // Determine sz: use provided sizeSz or the full absolute position size
      let szBigInt: bigint;
      if (rawSizeSz != null) {
        const szDecimalMultiplier = 10 ** szDecimals;
        szBigInt = BigInt(Math.floor(Number(rawSizeSz) * szDecimalMultiplier));
      } else {
        // Full close: use absolute szi, scaled to szDecimals precision
        const szDecimalMultiplier = 10 ** szDecimals;
        szBigInt = BigInt(Math.floor(Math.abs(currentSzi) * szDecimalMultiplier));
      }

      if (szBigInt === 0n) {
        return {
          success: false,
          text: 'Computed close size is 0. Check position size and szDecimals.',
          error: 'zero close size',
        };
      }

      // Close uses opposite side for limit price: closing a long → selling → limit below mark
      const closeSide = isLong ? 'short' : 'long';
      const limitPx = computeLimitPriceCoreUnits(markPx, closeSide);

      const actionBytes = encodeCoreWriterLimitOrder({
        asset: assetIndex,
        isBuy,
        limitPx,
        sz: szBigInt,
        reduceOnly: true, // CRITICAL: reduceOnly prevents accidentally reversing direction
        tif: TIF_IOC,
        cloid: 0n,
      });

      const dispatchCalldata = encodeFunctionData({
        abi: DISPATCH_COREWRITER_ABI,
        functionName: 'dispatchCoreWriter',
        args: [actionBytes],
      });

      // ── Submit via vault ──────────────────────────────────────────────────
      let txHash: string;
      try {
        const publicClient = getPublicClient(HYPEREVM_CHAIN_ID);
        const walletClient = getWalletClient(HYPEREVM_CHAIN_ID, privateKey);
        const vaultClient  = new TokagentVaultClient(
          vaultAddress as `0x${string}`,
          publicClient,
          walletClient,
        );
        txHash = await vaultClient.executeBatch([{
          target: helperAddress as `0x${string}`,
          data: dispatchCalldata,
          value: 0n,
        }]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          text: `Transaction failed: ${msg}`,
          error: msg,
        };
      }

      return {
        success: true,
        text: [
          `Close order submitted for ${symbol} ${isLong ? 'LONG' : 'SHORT'}.`,
          `  Current position: ${currentSzi > 0 ? '+' : ''}${currentSzi} ${symbol}`,
          `  Close size: ${rawSizeSz != null ? rawSizeSz : 'full position'} (reduceOnly)`,
          `  Mark: $${markPx.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          `  Tx: ${txHash}`,
          '',
          'CoreWriter orders are processed asynchronously. Verify via GET_PERPS_MARKET_INFO.',
        ].join('\n'),
        data: { symbol, currentSzi, isLong, txHash },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  },
};
