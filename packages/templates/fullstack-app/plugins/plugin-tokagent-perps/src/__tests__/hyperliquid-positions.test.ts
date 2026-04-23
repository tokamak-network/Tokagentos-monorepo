import { describe, expect, it, vi, beforeEach } from 'vitest';
import { hyperliquidPositionsProvider } from '../providers/hyperliquid-positions.js';

const fakeMessage = {} as any;
const fakeState = {} as any;

function makeRuntime(settings: Record<string, string | undefined>) {
  return { getSetting: (key: string) => settings[key] };
}

/** Build a canned clearinghouseState response */
function makeClearinghouseState(positions: Array<{
  coin: string; szi: string; entryPx: string; unrealizedPnl: string;
}>) {
  return {
    marginSummary: { accountValue: '5000.00', totalMarginUsed: '1000.00' },
    assetPositions: positions.map((p) => ({
      position: { ...p, liquidationPx: null },
    })),
  };
}

describe('hyperliquidPositionsProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns not-configured when vault address is missing', async () => {
    const runtime = makeRuntime({});
    const result = await hyperliquidPositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(result.text).toContain('No HyperEVM vault configured');
    expect(result.data?.['configured']).toBe(false);
  });

  it('returns formatted positions on successful API call', async () => {
    const state = makeClearinghouseState([
      { coin: 'BTC', szi: '0.5', entryPx: '60000', unrealizedPnl: '250.00' },
      { coin: 'ETH', szi: '-2.0', entryPx: '3000', unrealizedPnl: '-50.00' },
    ]);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(state),
    }));

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_999: '0xdeadbeef00000000000000000000000000000001',
    });

    const result = await hyperliquidPositionsProvider.get(runtime as any, fakeMessage, fakeState);

    expect(result.text).toContain('$5000.00 USD equity');
    expect(result.text).toContain('2 positions');
    expect(result.text).toContain('BTC');
    expect(result.text).toContain('LONG');
    expect(result.text).toContain('ETH');
    expect(result.text).toContain('SHORT');
    const data = result.data as any;
    expect(data.positions).toHaveLength(2);
    expect(data.accountValue).toBe('5000.00');
  });

  it('returns no-positions message when all positions are zero size', async () => {
    const state = makeClearinghouseState([
      { coin: 'BTC', szi: '0', entryPx: '60000', unrealizedPnl: '0' },
    ]);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(state),
    }));

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_999: '0xdeadbeef00000000000000000000000000000001',
    });

    const result = await hyperliquidPositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(result.text).toContain('no open positions');
  });

  it('returns error text when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_999: '0xdeadbeef00000000000000000000000000000001',
    });

    const result = await hyperliquidPositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(result.text).toContain('unreachable');
    expect(result.data?.['error']).toBeTruthy();
  });

  it('returns error text when API returns non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn(),
    }));

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_999: '0xdeadbeef00000000000000000000000000000001',
    });

    const result = await hyperliquidPositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(result.text).toContain('unreachable');
  });

  it('uses HYPERLIQUID_API_URL override', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(makeClearinghouseState([])),
    });
    vi.stubGlobal('fetch', mockFetch);

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_999: '0xdeadbeef00000000000000000000000000000001',
      HYPERLIQUID_API_URL: 'https://my-custom-hl.example.com',
    });

    await hyperliquidPositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://my-custom-hl.example.com/info',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
