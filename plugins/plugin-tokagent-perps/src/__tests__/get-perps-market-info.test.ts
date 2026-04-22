import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getPerpsMarketInfoAction } from '../actions/get-perps-market-info.js';

const fakeMessage = {} as any;
const fakeState = {} as any;

function makeRuntime(settings: Record<string, string | undefined> = {}) {
  return { getSetting: (key: string) => settings[key] };
}

/** Build minimal metaAndAssetCtxs-style responses */
function makeMeta(symbols: string[]) {
  return { universe: symbols.map((name) => ({ name, szDecimals: 3 })) };
}

function makeCtxs(symbols: string[], ctxData: Array<{
  markPx: string; funding: string; dayNtlVlm: string;
}>) {
  return [
    { universe: symbols.map((name) => ({ name })) },
    ctxData.map((c) => ({
      funding: c.funding,
      openInterest: '1000',
      prevDayPx: '0',
      dayNtlVlm: c.dayNtlVlm,
      markPx: c.markPx,
      midPx: c.markPx,
    })),
  ];
}

describe('getPerpsMarketInfoAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('validate', () => {
    it('always returns true (public endpoint)', async () => {
      const runtime = makeRuntime();
      const valid = await getPerpsMarketInfoAction.validate(runtime as any, fakeMessage, fakeState);
      expect(valid).toBe(true);
    });
  });

  describe('handler', () => {
    it('returns market info for a known symbol', async () => {
      const symbols = ['BTC', 'ETH', 'SOL'];
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        let data: unknown;
        if (callCount === 1) {
          data = makeMeta(symbols);
        } else {
          data = makeCtxs(symbols, [
            { markPx: '65000', funding: '0.0001', dayNtlVlm: '500000000' }, // BTC
            { markPx: '3200', funding: '-0.00005', dayNtlVlm: '200000000' }, // ETH
            { markPx: '150', funding: '0.0002', dayNtlVlm: '50000000' },     // SOL
          ]);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      }));

      const runtime = makeRuntime();
      const result = await getPerpsMarketInfoAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { symbol: 'BTC' } } as any,
      );

      expect(result?.success).toBe(true);
      expect(result?.text).toContain('BTC perp');
      expect(result?.text).toContain('65');
      expect(result?.data?.['symbol']).toBe('BTC');
      expect(result?.data?.['mark']).toBeCloseTo(65000);
      expect(result?.data?.['funding']).toBeCloseTo(0.0001);
      expect(result?.data?.['volume24h']).toBeCloseTo(500); // 500M
    });

    it('handles lowercase symbol input', async () => {
      const symbols = ['ETH'];
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        const data = callCount === 1
          ? makeMeta(symbols)
          : makeCtxs(symbols, [{ markPx: '3200', funding: '0.0001', dayNtlVlm: '100000000' }]);
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      }));

      const runtime = makeRuntime();
      const result = await getPerpsMarketInfoAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { symbol: 'eth' } } as any,
      );

      expect(result?.success).toBe(true);
      expect(result?.data?.['symbol']).toBe('ETH');
    });

    it('returns error for unknown symbol', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeMeta(['BTC', 'ETH'])),
      }));

      const runtime = makeRuntime();
      const result = await getPerpsMarketInfoAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { symbol: 'FAKECOIN' } } as any,
      );

      expect(result?.success).toBe(false);
      expect(result?.text).toContain('FAKECOIN');
    });

    it('returns error when symbol parameter is missing', async () => {
      const runtime = makeRuntime();
      const result = await getPerpsMarketInfoAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: {} } as any,
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain('symbol');
    });

    it('returns unreachable when fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const runtime = makeRuntime();
      const result = await getPerpsMarketInfoAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { symbol: 'BTC' } } as any,
      );

      expect(result?.success).toBe(false);
      expect(result?.text).toContain('unreachable');
    });

    it('uses HYPERLIQUID_API_URL override', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeMeta(['BTC'])),
      });
      vi.stubGlobal('fetch', mockFetch);

      const runtime = makeRuntime({
        HYPERLIQUID_API_URL: 'https://custom-hl.example.com',
      });

      // Will fail at the symbol lookup but we just want to confirm URL usage
      await getPerpsMarketInfoAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { symbol: 'BTC' } } as any,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-hl.example.com/info',
        expect.anything(),
      );
    });
  });
});
