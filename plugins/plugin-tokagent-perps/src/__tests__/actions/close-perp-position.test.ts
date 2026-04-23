import { describe, expect, it, vi, beforeEach } from 'vitest';
import { closePerpPositionAction } from '../../actions/close-perp-position.js';

const mockExecuteBatch = vi.fn().mockResolvedValue('0xdeadbeef');

vi.mock('@tokagent/plugin-tokagent-shared', () => ({
  getPublicClient: vi.fn(),
  getWalletClient: vi.fn(),
  resolveAgentPrivateKey: vi.fn(() => '0x' + 'a'.repeat(64)),
  TokagentVaultClient: vi.fn(function () {
    return { executeBatch: mockExecuteBatch };
  }),
}));

const fakeMessage = {} as any;
const fakeState   = {} as any;

function makeRuntime(settings: Record<string, string | undefined> = {}) {
  return { getSetting: (key: string) => settings[key] };
}

function makeClearingState(positions: Array<{ coin: string; szi: string }>) {
  return {
    marginSummary: { accountValue: '10000', totalMarginUsed: '2000' },
    assetPositions: positions.map((p) => ({
      position: {
        coin: p.coin,
        szi: p.szi,
        entryPx: '65000',
        unrealizedPnl: '100',
        liquidationPx: '50000',
      },
    })),
  };
}

function makeMeta(symbols: string[]) {
  return { universe: symbols.map((name) => ({ name, szDecimals: 5 })) };
}

function makeCtxs(symbols: string[]) {
  return [
    { universe: symbols.map((name) => ({ name })) },
    symbols.map(() => ({
      funding: '0.0001',
      openInterest: '1000',
      prevDayPx: '0',
      dayNtlVlm: '1000000',
      markPx: '65000',
      midPx: '65000',
    })),
  ];
}

const VAULT  = '0x' + '2'.repeat(40);
const HELPER = '0x' + '1'.repeat(40);

describe('closePerpPositionAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('validate', () => {
    it('returns false when vault not configured', async () => {
      const runtime = makeRuntime({ TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER });
      expect(await closePerpPositionAction.validate(runtime as any, fakeMessage, fakeState)).toBe(false);
    });

    it('returns false when helper is placeholder', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_999: VAULT,
        TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: '0x' + '0'.repeat(40),
      });
      expect(await closePerpPositionAction.validate(runtime as any, fakeMessage, fakeState)).toBe(false);
    });

    it('returns true when all configured', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_999: VAULT,
        TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER,
      });
      expect(await closePerpPositionAction.validate(runtime as any, fakeMessage, fakeState)).toBe(true);
    });
  });

  describe('handler', () => {
    it('returns success with "no position" when szi=0', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeClearingState([{ coin: 'BTC', szi: '0' }])),
      }));

      const runtime = makeRuntime({ TOKAGENT_VAULT_ADDRESS_999: VAULT, TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER });
      const result = await closePerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { symbol: 'BTC' } } as any,
      );
      expect(result?.success).toBe(true);
      expect(result?.text).toContain('No open BTC position');
    });

    it('returns success with "no position" when coin not in assetPositions', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeClearingState([])),
      }));

      const runtime = makeRuntime({ TOKAGENT_VAULT_ADDRESS_999: VAULT, TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER });
      const result = await closePerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { symbol: 'ETH' } } as any,
      );
      expect(result?.success).toBe(true);
      expect(result?.text).toContain('No open ETH position');
    });

    it('returns error for missing symbol', async () => {
      const runtime = makeRuntime({ TOKAGENT_VAULT_ADDRESS_999: VAULT, TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER });
      const result = await closePerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: {} } as any,
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain('symbol');
    });

    it('returns deployment instructions when helper is placeholder', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_999: VAULT,
        TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: '0x' + '0'.repeat(40),
      });
      const result = await closePerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { symbol: 'BTC' } } as any,
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain('not deployed');
    });

    it('happy path: submits reduceOnly order for long position', async () => {
      let fetchCallCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        fetchCallCount++;
        let data: unknown;
        if (fetchCallCount === 1) {
          data = makeClearingState([{ coin: 'BTC', szi: '0.5' }]);
        } else if (fetchCallCount === 2) {
          data = makeMeta(['BTC']);
        } else {
          data = makeCtxs(['BTC']);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      }));
      mockExecuteBatch.mockResolvedValue('0xclosebeef');

      const runtime = makeRuntime({ TOKAGENT_VAULT_ADDRESS_999: VAULT, TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER });
      const result = await closePerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { symbol: 'BTC' } } as any,
      );

      expect(result?.success).toBe(true);
      expect(result?.text).toContain('0xclosebeef');
      expect(result?.text).toContain('LONG');

      expect(mockExecuteBatch).toHaveBeenCalledTimes(1);
      const [calls] = mockExecuteBatch.mock.calls[0];
      const call = calls[0];
      expect(call.target.toLowerCase()).toBe(HELPER.toLowerCase());
      expect(call.data.toLowerCase().startsWith('0xa62c829a')).toBe(true);
      expect(call.value).toBe(0n);
    });

    it('happy path: submits reduceOnly order for short position', async () => {
      let fetchCallCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        fetchCallCount++;
        let data: unknown;
        if (fetchCallCount === 1) {
          data = makeClearingState([{ coin: 'ETH', szi: '-1.5' }]);
        } else if (fetchCallCount === 2) {
          data = makeMeta(['ETH']);
        } else {
          data = makeCtxs(['ETH']);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      }));
      mockExecuteBatch.mockResolvedValue('0xshortclose');

      const runtime = makeRuntime({ TOKAGENT_VAULT_ADDRESS_999: VAULT, TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER });
      const result = await closePerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { symbol: 'ETH' } } as any,
      );

      expect(result?.success).toBe(true);
      expect(result?.text).toContain('SHORT');
    });
  });
});
