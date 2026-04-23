import type { Action, ActionResult, HandlerOptions } from '@elizaos/core';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';
import {
  CONDITION_ID_PATTERN,
  DEFAULT_GAMMA_URL,
  PM_FETCH_TIMEOUT_MS,
} from '../types.js';
import type { PolymarketMarket, MarketOutcome } from '../types.js';

/** Fetch helper with shared abort signal */
async function pmGet(url: string, signal: AbortSignal): Promise<unknown> {
  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal,
  });
  if (!resp.ok) throw new Error(`Polymarket gamma API returned ${resp.status} for ${url}`);
  return resp.json();
}

/** Parse outcome titles + prices from Polymarket's peculiar JSON-inside-JSON fields */
function parseOutcomes(market: PolymarketMarket): MarketOutcome[] {
  try {
    const titles: string[] = market.outcomes ? JSON.parse(market.outcomes) : [];
    const prices: number[] = market.outcomePrices
      ? JSON.parse(market.outcomePrices).map(Number)
      : [];
    return titles.map((title, i) => ({ title, price: prices[i] ?? 0 }));
  } catch {
    return [];
  }
}

export const describePolymarketMarketAction: Action = {
  name: 'DESCRIBE_POLYMARKET_MARKET',
  description: 'Look up current odds, liquidity, and metadata for a Polymarket prediction market.',
  similes: [
    'polymarket odds',
    'prediction market',
    'betting odds',
    'polymarket market',
  ],
  contexts: ['wallet'],

  parameters: [
    {
      name: 'query',
      description: 'A search phrase, slug, or 0x condition ID to identify the Polymarket market',
      required: true,
      schema: { type: 'string' },
      examples: ['will-trump-win-2024', 'Will Bitcoin hit $100k by end of 2025?', '0x...conditionId'],
    },
  ],

  validate: async (_runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<boolean> => {
    // Public read-only endpoint — always available
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    options?: HandlerOptions | Record<string, unknown>,
  ): Promise<ActionResult | undefined> => {
    const params = (options as HandlerOptions | undefined)?.parameters;
    const rawQuery = params?.query;

    if (!rawQuery) {
      return {
        success: false,
        text: 'Please specify a market to look up (e.g. "Will BTC hit $100k by end of 2025?" or a Polymarket slug).',
        error: 'query parameter is required',
      };
    }

    const query = String(rawQuery).trim();
    const gammaUrl = runtime.getSetting('POLYMARKET_GAMMA_URL') ?? DEFAULT_GAMMA_URL;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PM_FETCH_TIMEOUT_MS);

    try {
      let markets: PolymarketMarket[] | null = null;

      // Condition ID path
      if (CONDITION_ID_PATTERN.test(query)) {
        const data = await pmGet(
          `${gammaUrl}/markets?condition_ids=${query}`,
          controller.signal,
        ) as PolymarketMarket[];
        markets = Array.isArray(data) ? data : null;
      } else {
        // Slug search
        const slugData = await pmGet(
          `${gammaUrl}/markets?slug=${encodeURIComponent(query)}`,
          controller.signal,
        ) as PolymarketMarket[];
        if (Array.isArray(slugData) && slugData.length > 0) {
          markets = slugData;
        } else {
          // Keyword search fallback
          const searchData = await pmGet(
            `${gammaUrl}/markets?search=${encodeURIComponent(query)}`,
            controller.signal,
          ) as PolymarketMarket[];
          if (Array.isArray(searchData) && searchData.length > 0) {
            markets = searchData;
          }
        }
      }

      if (!markets || markets.length === 0) {
        return {
          success: false,
          text: `No Polymarket market matches '${query}'. Try a different search phrase or slug.`,
          error: 'no markets found',
        };
      }

      const market = markets[0];
      const outcomes = parseOutcomes(market);

      const outcomeLines =
        outcomes.length > 0
          ? outcomes
              .map((o) => `  ${o.title}: ${(o.price * 100).toFixed(1)}%`)
              .join('\n')
          : '  (outcome prices unavailable)';

      const resolveDate = market.endDate
        ? new Date(market.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'TBD';

      const liquidityDisplay = typeof market.liquidity === 'number'
        ? `$${market.liquidity.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
        : 'N/A';

      const volumeDisplay = typeof market.volume === 'number'
        ? `$${market.volume.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
        : 'N/A';

      const text = [
        `Market: ${market.question}`,
        outcomeLines,
        `Liquidity: ${liquidityDisplay}, Volume: ${volumeDisplay}, Resolves: ${resolveDate}`,
      ].join('\n');

      return {
        success: true,
        text,
        data: {
          market: {
            conditionId: market.conditionId,
            question: market.question,
            slug: market.slug,
            liquidity: market.liquidity,
            volume: market.volume,
            endDate: market.endDate,
            outcomes,
          },
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('aborted') || msg.includes('abort')) {
        return {
          success: false,
          text: 'Polymarket API unreachable (request timed out).',
          error: msg,
        };
      }
      return {
        success: false,
        text: `Polymarket API unreachable: ${msg}`,
        error: msg,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  },
};
