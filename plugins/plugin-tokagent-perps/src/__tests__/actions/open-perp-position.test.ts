import { describe, expect, it, vi, beforeEach } from 'vitest';
import { openPerpPositionAction } from '../../actions/open-perp-position.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Shared mock executeBatch that can be swapped per test
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

/** Build a minimal Hyperliquid meta response */
function makeMeta(symbols: string[], szDecimalsMap: Record<string, number> = {}) {
  return {
    universe: symbols.map((name) => ({
      name,
      szDecimals: szDecimalsMap[name] ?? 3,
    })),
  };
}

/** Build a minimal metaAndAssetCtxs response */
function makeCtxs(symbols: string[], markPxMap: Record<string, string>) {
  return [
    { universe: symbols.map((name) => ({ name })) },
    symbols.map((name) => ({
      funding: '0.0001',
      openInterest: '1000',
      prevDayPx: '0',
      dayNtlVlm: '1000000',
      markPx: markPxMap[name] ?? '100',
      midPx: markPxMap[name] ?? '100',
    })),
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('openPerpPositionAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('validate', () => {
    it('returns false when vault address is not set', async () => {
      const runtime = makeRuntime({
        TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: '0x' + '1'.repeat(40),
      });
      const valid = await openPerpPositionAction.validate(runtime as any, fakeMessage, fakeState);
      expect(valid).toBe(false);
    });

    it('returns false when helper address is unset (placeholder)', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_999: '0x' + '2'.repeat(40),
        TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: '0x' + '0'.repeat(40),
      });
      const valid = await openPerpPositionAction.validate(runtime as any, fakeMessage, fakeState);
      expect(valid).toBe(false);
    });

    it('returns true when vault + helper are configured', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_999: '0x' + '2'.repeat(40),
        TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: '0x' + '1'.repeat(40),
      });
      const valid = await openPerpPositionAction.validate(runtime as any, fakeMessage, fakeState);
      expect(valid).toBe(true);
    });
  });

  describe('handler', () => {
    const VAULT   = '0x' + '2'.repeat(40);
    const HELPER  = '0x' + '1'.repeat(40);
    const symbols = ['BTC', 'ETH'];

    function setupFetch() {
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        let data: unknown;
        if (callCount === 1) {
          // meta
          data = makeMeta(symbols, { BTC: 5, ETH: 3 });
        } else {
          // metaAndAssetCtxs
          data = makeCtxs(symbols, { BTC: '65000', ETH: '3200' });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      }));
    }

    it('returns error for missing symbol parameter', async () => {
      const runtime = makeRuntime({ TOKAGENT_VAULT_ADDRESS_999: VAULT, TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER });
      const result = await openPerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { side: 'long', sizeUsd: 1000 } } as any,
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain('symbol');
    });

    it('returns error for missing side parameter', async () => {
      const runtime = makeRuntime({ TOKAGENT_VAULT_ADDRESS_999: VAULT, TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER });
      const result = await openPerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { symbol: 'BTC', sizeUsd: 1000 } } as any,
      );
      expect(result?.success).toBe(false);
    });

    it('returns deployment instructions when helper address is placeholder', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_999: VAULT,
        TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: '0x' + '0'.repeat(40),
      });
      const result = await openPerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { symbol: 'BTC', side: 'long', sizeUsd: 1000 } } as any,
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain('TokagentHyperEvmHelper is not deployed');
      expect(result?.text).toContain('forge script');
    });

    it('returns deployment instructions when helper address is unset', async () => {
      const runtime = makeRuntime({ TOKAGENT_VAULT_ADDRESS_999: VAULT });
      const result = await openPerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { symbol: 'BTC', side: 'long', sizeUsd: 1000 } } as any,
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain('not deployed');
    });

    it('returns error when vault address is not configured', async () => {
      const runtime = makeRuntime({ TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER });
      const result = await openPerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { symbol: 'BTC', side: 'long', sizeUsd: 1000 } } as any,
      );
      expect(result?.success).toBe(false);
      expect(result?.text).toContain('TOKAGENT_VAULT_ADDRESS_999');
    });

    it('happy path: submits vault executeBatch with correct Call shape', async () => {
      setupFetch();
      mockExecuteBatch.mockResolvedValue('0xcafebabe');

      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_999: VAULT,
        TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER,
      });

      const result = await openPerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { symbol: 'BTC', side: 'long', sizeUsd: 1000 } } as any,
      );

      expect(result?.success).toBe(true);
      expect(result?.text).toContain('LONG BTC');
      expect(result?.text).toContain('0xcafebabe');

      // Verify executeBatch was called with a valid Call
      expect(mockExecuteBatch).toHaveBeenCalledTimes(1);
      const [calls] = mockExecuteBatch.mock.calls[0];
      expect(Array.isArray(calls)).toBe(true);
      expect(calls).toHaveLength(1);

      const call = calls[0];
      // target should be the helper address
      expect(call.target.toLowerCase()).toBe(HELPER.toLowerCase());
      // data must start with dispatchCoreWriter selector: 0xa62c829a
      expect(call.data.toLowerCase().startsWith('0xa62c829a')).toBe(true);
      // no native value sent
      expect(call.value).toBe(0n);
    });

    it('returns error when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_999: VAULT,
        TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER,
      });

      const result = await openPerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { symbol: 'BTC', side: 'long', sizeUsd: 1000 } } as any,
      );

      expect(result?.success).toBe(false);
      expect(result?.text).toContain('Failed to fetch market data');
    });

    it('returns error for invalid side value', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_999: VAULT,
        TOKAGENT_HYPERLIQUID_HELPER_ADDRESS: HELPER,
      });

      const result = await openPerpPositionAction.handler(
        runtime as any, fakeMessage, fakeState,
        { parameters: { symbol: 'BTC', side: 'up', sizeUsd: 1000 } } as any,
      );

      expect(result?.success).toBe(false);
      expect(result?.text).toContain('side');
    });
  });
});
