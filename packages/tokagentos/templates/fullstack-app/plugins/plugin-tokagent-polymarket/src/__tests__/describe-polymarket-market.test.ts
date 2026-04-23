import { describe, expect, it, vi, beforeEach } from 'vitest';
import { describePolymarketMarketAction } from '../actions/describe-polymarket-market.js';

const fakeMessage = {} as any;
const fakeState = {} as any;

function makeRuntime(settings: Record<string, string | undefined> = {}) {
  return { getSetting: (key: string) => settings[key] };
}

function makeMarket(overrides: Partial<{
  question: string;
  slug: string;
  conditionId: string;
  liquidity: number;
  volume: number;
  endDate: string;
  outcomes: string;
  outcomePrices: string;
}> = {}) {
  return {
    conditionId: '0x' + 'a'.repeat(64),
    question: 'Will BTC hit $100k by end of 2025?',
    slug: 'btc-100k-2025',
    liquidity: 500000,
    volume: 2000000,
    endDate: '2025-12-31T00:00:00Z',
    outcomes: JSON.stringify(['Yes', 'No']),
    outcomePrices: JSON.stringify(['0.65', '0.35']),
    ...overrides,
  };
}

describe('describePolymarketMarketAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('validate', () => {
    it('always returns true (public endpoint)', async () => {
      const runtime = makeRuntime();
      const valid = await describePolymarketMarketAction.validate(runtime as any, fakeMessage, fakeState);
      expect(valid).toBe(true);
    });
  });

  describe('handler', () => {
    it('returns market info when found by slug', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([makeMarket()]),
      }));

      const runtime = makeRuntime();
      const result = await describePolymarketMarketAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { query: 'btc-100k-2025' } } as any,
      );

      expect(result?.success).toBe(true);
      expect(result?.text).toContain('Will BTC hit $100k');
      expect(result?.text).toContain('Yes: 65.0%');
      expect(result?.text).toContain('No: 35.0%');
      expect(result?.text).toContain('$500,000');
      expect((result?.data?.['market'] as any)?.question).toBe('Will BTC hit $100k by end of 2025?');
    });

    it('uses condition ID path when query is a hex condition ID', async () => {
      const conditionId = '0x' + 'c'.repeat(64);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([makeMarket({ conditionId })]),
      });
      vi.stubGlobal('fetch', mockFetch);

      const runtime = makeRuntime();
      await describePolymarketMarketAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { query: conditionId } } as any,
      );

      // Should use condition_ids= parameter
      expect(mockFetch.mock.calls[0][0]).toContain('condition_ids=');
    });

    it('falls back to search when slug returns empty', async () => {
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        const data = callCount === 1 ? [] : [makeMarket()]; // slug empty, search returns result
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      }));

      const runtime = makeRuntime();
      const result = await describePolymarketMarketAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { query: 'bitcoin hundred k' } } as any,
      );

      expect(result?.success).toBe(true);
      expect(callCount).toBe(2); // slug then search
    });

    it('returns not-found when no markets match', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([]),
      }));

      const runtime = makeRuntime();
      const result = await describePolymarketMarketAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { query: 'xyzzy-no-such-market' } } as any,
      );

      expect(result?.success).toBe(false);
      expect(result?.text).toContain("xyzzy-no-such-market");
    });

    it('returns error when query parameter is missing', async () => {
      const runtime = makeRuntime();
      const result = await describePolymarketMarketAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: {} } as any,
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain('market to look up');
    });

    it('returns unreachable when fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const runtime = makeRuntime();
      const result = await describePolymarketMarketAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { query: 'btc-100k' } } as any,
      );

      expect(result?.success).toBe(false);
      expect(result?.text).toContain('unreachable');
    });

    it('handles market with no outcome prices gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([makeMarket({ outcomes: undefined, outcomePrices: undefined })]),
      }));

      const runtime = makeRuntime();
      const result = await describePolymarketMarketAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { query: 'btc-100k-2025' } } as any,
      );

      expect(result?.success).toBe(true);
      expect(result?.text).toContain('outcome prices unavailable');
    });

    it('uses POLYMARKET_GAMMA_URL override', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([makeMarket()]),
      });
      vi.stubGlobal('fetch', mockFetch);

      const runtime = makeRuntime({
        POLYMARKET_GAMMA_URL: 'https://my-gamma.example.com',
      });

      await describePolymarketMarketAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { query: 'btc' } } as any,
      );

      expect(mockFetch.mock.calls[0][0]).toContain('my-gamma.example.com');
    });
  });
});
