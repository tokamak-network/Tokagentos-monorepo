import type { Action, ActionResult, HandlerOptions } from '@elizaos/core';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';
import { DEFAULT_HL_API_URL, HL_FETCH_TIMEOUT_MS } from '../types.js';
import type { AssetCtx } from '../types.js';

/** Helper: POST to Hyperliquid /info with a 10s timeout */
async function hlPost(apiUrl: string, body: unknown, signal: AbortSignal): Promise<unknown> {
  const resp = await fetch(`${apiUrl}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) throw new Error(`Hyperliquid API returned ${resp.status}`);
  return resp.json();
}

export const getPerpsMarketInfoAction: Action = {
  name: 'GET_PERPS_MARKET_INFO',
  description:
    'Use for a read-only quote on a Hyperliquid perp market — no vault or wallet required. ' +
    'Returns current mark price, hourly funding rate, and 24h notional volume for a single symbol (BTC, ETH, SOL, etc.).',
  similes: [
    'hyperliquid market info',
    'perp market',
    'btc mark price',
    'eth perp price',
    'funding rate',
  ],
  contexts: ['wallet'],

  parameters: [
    {
      name: 'symbol',
      description: 'Asset symbol to look up, e.g. "BTC", "ETH", "SOL"',
      required: true,
      schema: { type: 'string' },
      examples: ['BTC', 'ETH', 'SOL', 'ARB'],
    },
  ],

  validate: async (_runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<boolean> => {
    // Public endpoint — no auth required
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

    if (!rawSymbol) {
      return {
        success: false,        error: 'symbol parameter is required',
      };
    }

    const symbol = String(rawSymbol).toUpperCase().trim();
    const apiUrl = (runtime.getSetting('HYPERLIQUID_API_URL') as string | undefined) ?? DEFAULT_HL_API_URL;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HL_FETCH_TIMEOUT_MS);

    try {
      // 1. Fetch meta to get asset universe + szDecimals
      const metaResp = await hlPost(apiUrl, { type: 'meta' }, controller.signal) as {
        universe: Array<{ name: string; szDecimals: number }>;
      };

      const assetIndex = metaResp.universe.findIndex((a) => a.name === symbol);
      if (assetIndex === -1) {
        return {
          success: false,          error: `symbol not found: ${symbol}`,
        };
      }

      // 2. Fetch metaAndAssetCtxs for funding + volume + mark price
      const ctxResp = await hlPost(apiUrl, { type: 'metaAndAssetCtxs' }, controller.signal) as [
        { universe: Array<{ name: string }> },
        AssetCtx[],
      ];

      const assetCtxs = ctxResp[1];
      const ctx = assetCtxs[assetIndex];

      if (!ctx) {
        return {
          success: false,          error: 'no asset ctx at index',
        };
      }

      const mark = parseFloat(ctx.markPx);
      const funding = parseFloat(ctx.funding);
      // dayNtlVlm is in USD; convert to millions for readability
      const volume24h = parseFloat(ctx.dayNtlVlm) / 1_000_000;

      const text = [
        `${symbol} perp:`,
        `  Mark: $${mark.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`,
        `  Funding: ${(funding * 100).toFixed(4)}%/hr`,
        `  24h Volume: $${volume24h.toFixed(1)}M`,
      ].join('\n');

      return {
        success: true,
        text,
        data: { symbol, mark, funding, volume24h },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('aborted') || msg.includes('abort')) {
        return {
          success: false,          error: msg,
        };
      }
      return {
        success: false,        error: msg,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  },

  examples: [
    [
      { name: 'user', content: { text: "what's the BTC perp price?" } },
      {
        name: 'agent',
        content: {
          text: 'Fetching BTC mark, funding, and 24h volume from Hyperliquid.',
          actions: ['GET_PERPS_MARKET_INFO'],
        },
      },
    ],
    [
      { name: 'user', content: { text: 'ETH funding rate?' } },
      {
        name: 'agent',
        content: {
          text: 'Pulling the current ETH perp funding rate.',
          actions: ['GET_PERPS_MARKET_INFO'],
        },
      },
    ],
    [
      { name: 'user', content: { text: 'how much SOL volume on hyperliquid' } },
      {
        name: 'agent',
        content: {
          text: 'Fetching SOL perp 24h volume.',
          actions: ['GET_PERPS_MARKET_INFO'],
        },
      },
    ],
    [
      { name: 'user', content: { text: 'is hyperliquid expensive to short ARB right now?' } },
      {
        name: 'agent',
        content: {
          text: 'Pulling ARB funding and mark — positive funding means longs pay, so shorts collect.',
          actions: ['GET_PERPS_MARKET_INFO'],
        },
      },
    ],
  ],
};
