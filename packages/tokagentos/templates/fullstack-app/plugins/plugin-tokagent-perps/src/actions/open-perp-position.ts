import type { Action, ActionResult, HandlerOptions } from '@elizaos/core';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';
import { TokagentVaultClient } from '@tokagent/plugin-tokagent-shared';
import {
  getPublicClient,
  getWalletClient,
  resolveAgentPrivateKey,
} from '@tokagent/plugin-tokagent-shared';
import { DEFAULT_HL_API_URL, HL_FETCH_TIMEOUT_MS } from '../types.js';
import {
  buildLimitOrderCall,
  resolveAssetInfo,
} from '../shared/build-limit-order-call.js';

const HYPEREVM_CHAIN_ID = 999;

/** Placeholder value — set when helper is not deployed */
const UNDEPLOYED_PLACEHOLDER = '0x0000000000000000000000000000000000000000';

/**
 * Resolve and validate helper address from runtime settings.
 * Returns null with an error message if the helper is not deployed.
 */
function resolveHelperAddress(runtime: IAgentRuntime): { address: string } | { error: string } {
  const addr = (
    runtime.getSetting('TOKAGENT_HYPERLIQUID_HELPER_ADDRESS') as string | undefined
  )?.trim();

  if (!addr || addr === UNDEPLOYED_PLACEHOLDER) {
    return {
      error:
        'TokagentHyperEvmHelper is not deployed.\n\n' +
        'To use perp write actions:\n' +
        '  1. Deploy the helper on HyperEVM:\n' +
        '     forge script contracts/script/deploy/DeployTokagentHyperEvmHelper.s.sol \\\n' +
        '       --rpc-url https://rpc.hyperliquid.xyz/evm --private-key $PK \\\n' +
        '       --broadcast --legacy --gas-limit 3000000\n' +
        '  2. Set TOKAGENT_HYPERLIQUID_HELPER_ADDRESS=<deployed-address> in your agent config\n' +
        '  3. Apply the hyperliquid-perps-hyperevm protocol pack to your vault\n' +
        '  4. Fund the vault with HYPE for HyperCore gas\n' +
        '  5. Register your vault as an API wallet on Hyperliquid\n' +
        '  6. Open a seed position via REST API to initialize leverage > 0',
    };
  }
  return { address: addr };
}

/**
 * Resolve the vault address for HyperEVM from runtime settings.
 */
function resolveVaultAddress(runtime: IAgentRuntime): string | undefined {
  return (
    (runtime.getSetting('TOKAGENT_VAULT_ADDRESS_999') as string | undefined) ??
    (runtime.getSetting('TOKAGENT_VAULT_ADDRESS') as string | undefined)
  );
}

export const openPerpPositionAction: Action = {
  name: 'OPEN_PERP_POSITION',
  description:
    'Open a Hyperliquid perpetual position (long or short) through the TokagentVault on HyperEVM. ' +
    'Sends a CoreWriter limit order via the TokagentHyperEvmHelper.',
  similes: [
    'open perp',
    'long btc',
    'short eth',
    'buy perp',
    'sell perp',
    'open position',
    'hyperliquid trade',
    'perp trade',
  ],
  contexts: ['wallet'],

  parameters: [
    {
      name: 'symbol',
      description: 'Asset symbol to trade, e.g. "BTC", "ETH", "SOL"',
      required: true,
      schema: { type: 'string' },
      examples: ['BTC', 'ETH', 'SOL'],
    },
    {
      name: 'side',
      description: '"long" to buy / go long, "short" to sell / go short',
      required: true,
      schema: { type: 'string', enum: ['long', 'short'] },
      examples: ['long', 'short'],
    },
    {
      name: 'sizeUsd',
      description: 'Notional position size in USD (e.g. 1000 = $1,000)',
      required: true,
      schema: { type: 'number' },
      examples: [500, 1000, 5000],
    },
    {
      name: 'limitPrice',
      description:
        'Optional limit price override in USD. ' +
        'If omitted, computed as mark ± 5% (inside HyperCore oracle band).',
      required: false,
      schema: { type: 'number' },
    },
    {
      name: 'tif',
      description: 'Time-in-force: "GTC" (good-till-cancel), "ALO" (post-only), "IOC" (immediate-or-cancel, default)',
      required: false,
      schema: { type: 'string', enum: ['GTC', 'ALO', 'IOC'] },
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

    // ── Parameter extraction ────────────────────────────────────────────────
    const rawSymbol = params?.symbol;
    const rawSide   = params?.side;
    const rawSize   = params?.sizeUsd;
    const rawPrice  = params?.limitPrice;
    const rawTif    = params?.tif;

    if (!rawSymbol || !rawSide || !rawSize) {
      return {
        success: false,
        text: 'Missing required parameters: symbol, side, sizeUsd.',
        error: 'missing parameters',
      };
    }

    const symbol  = String(rawSymbol).toUpperCase().trim();
    const side    = String(rawSide).toLowerCase().trim() as 'long' | 'short';
    const sizeUsd = Number(rawSize);

    if (side !== 'long' && side !== 'short') {
      return {
        success: false,
        text: 'Parameter "side" must be "long" or "short".',
        error: 'invalid side',
      };
    }
    if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
      return {
        success: false,
        text: 'Parameter "sizeUsd" must be a positive number.',
        error: 'invalid sizeUsd',
      };
    }

    // TIF mapping
    const tifMap = { GTC: 0, ALO: 1, IOC: 2 } as const;
    const tif = rawTif ? (tifMap[String(rawTif).toUpperCase() as keyof typeof tifMap] ?? 2) : 2;

    // ── Resolve infrastructure ──────────────────────────────────────────────
    const vaultAddress = resolveVaultAddress(runtime);
    if (!vaultAddress) {
      return {
        success: false,
        text:
          'TOKAGENT_VAULT_ADDRESS_999 (or TOKAGENT_VAULT_ADDRESS) is not set. ' +
          'Configure your HyperEVM vault address.',
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
      // Cast to AgentRuntimeLike: IAgentRuntime.getSetting returns
      // string|number|boolean|null but resolveAgentPrivateKey only uses strings.
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

    // ── Fetch asset info ────────────────────────────────────────────────────
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), HL_FETCH_TIMEOUT_MS);

    let assetIndex: number;
    let szDecimals: number;
    let markPx: number;

    try {
      ({ assetIndex, szDecimals, markPx } = await resolveAssetInfo(symbol, apiUrl, controller.signal));
    } catch (err) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        text: `Failed to fetch market data for "${symbol}": ${msg}`,
        error: msg,
      };
    } finally {
      clearTimeout(timeoutId);
    }

    // ── Build the CoreWriter call ────────────────────────────────────────────
    let call: ReturnType<typeof buildLimitOrderCall>;
    try {
      call = buildLimitOrderCall({
        symbol,
        side,
        sizeUsd,
        markPx,
        assetIndex,
        szDecimals,
        helperAddress,
        limitPriceOverride: rawPrice != null ? Number(rawPrice) : undefined,
        tifOverride: tif as 0 | 1 | 2,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, text: `Order build failed: ${msg}`, error: msg };
    }

    // ── Submit via vault ────────────────────────────────────────────────────
    let txHash: string;
    try {
      const publicClient = getPublicClient(HYPEREVM_CHAIN_ID);
      const walletClient = getWalletClient(HYPEREVM_CHAIN_ID, privateKey);
      const vaultClient  = new TokagentVaultClient(
        vaultAddress as `0x${string}`,
        publicClient,
        walletClient,
      );
      txHash = await vaultClient.executeBatch([call]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const explanation = msg.toLowerCase().includes('callnotallowlisted')
        ? ' The vault does not have the hyperliquid-perps-hyperevm pack allowlisted. ' +
          'Apply the pack via vault.setAllowlist() or redeploy with the pack.'
        : '';
      return {
        success: false,
        text: `Transaction failed: ${msg}${explanation}`,
        error: msg,
      };
    }

    const tifNames = ['GTC', 'ALO', 'IOC'];
    return {
      success: true,
      text: [
        `${side.toUpperCase()} ${symbol} position opened.`,
        `  Size: $${sizeUsd.toLocaleString('en-US')} notional`,
        `  Mark: $${markPx.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        `  TIF: ${tifNames[tif]}`,
        `  Tx: ${txHash}`,
        '',
        'Note: CoreWriter orders are processed asynchronously by HyperCore.',
        'Verify your position via GET_PERPS_MARKET_INFO or the Hyperliquid UI.',
        'Silent rejection causes: price band violation, leverage=0, insufficient margin.',
      ].join('\n'),
      data: { symbol, side, sizeUsd, markPx, tif: tifNames[tif], txHash },
    };
  },
};
