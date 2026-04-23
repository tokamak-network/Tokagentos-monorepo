import { describe, expect, it, vi, beforeEach } from 'vitest';
import { polymarketPositionsProvider } from '../providers/polymarket-positions.js';

const fakeMessage = {} as any;
const fakeState = {} as any;

function makeRuntime(settings: Record<string, string | undefined>) {
  return { getSetting: (key: string) => settings[key] };
}

function makePositions() {
  return [
    {
      conditionId: '0x' + 'a'.repeat(64),
      outcome: 'Yes',
      size: 100,
      avgPrice: 0.6,
      currentPrice: 0.65,
      title: 'Will BTC hit $100k in 2025?',
      slug: 'btc-100k-2025',
    },
    {
      conditionId: '0x' + 'b'.repeat(64),
      outcome: 'No',
      size: 50,
      avgPrice: 0.4,
      currentPrice: 0.35,
      title: 'Will ETH 2.0 launch in Q1?',
      slug: 'eth2-q1',
    },
  ];
}

describe('polymarketPositionsProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns not-configured when vault address is missing', async () => {
    const runtime = makeRuntime({});
    const result = await polymarketPositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(result.text).toContain('No Polygon vault configured');
    expect(result.data?.['configured']).toBe(false);
  });

  it('returns formatted positions on successful fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(makePositions()),
    }));

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
    });

    const result = await polymarketPositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(result.text).toContain('2 open positions');
    expect(result.text).toContain('Will BTC hit');
    expect(result.text).toContain('65.0%');
    const data = result.data as any;
    expect(data.positions).toHaveLength(2);
    expect(typeof data.totalNotional).toBe('number');
  });

  it('returns empty message when positions array is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    }));

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
    });

    const result = await polymarketPositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(result.text).toContain('no open Polymarket positions');
    expect((result.data?.['positions'] as unknown[]).length).toBe(0);
  });

  it('returns error text when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
    });

    const result = await polymarketPositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(result.text).toContain('unreachable');
  });

  it('returns error when API returns non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn(),
    }));

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
    });

    const result = await polymarketPositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(result.text).toContain('unreachable');
  });

  it('uses POLYMARKET_DATA_URL override', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      POLYMARKET_DATA_URL: 'https://my-data-api.example.com',
    });

    await polymarketPositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(mockFetch.mock.calls[0][0]).toContain('my-data-api.example.com');
  });
});
