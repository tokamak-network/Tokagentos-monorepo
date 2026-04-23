import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the shared library before importing the provider
vi.mock('@tokagent/plugin-tokagent-shared', () => ({
  getPublicClient: vi.fn(),
}));

import { aavePositionsProvider } from '../providers/aave-positions.js';
import { getPublicClient } from '@tokagent/plugin-tokagent-shared';

// Minimal stubs
function makeRuntime(settings: Record<string, string | undefined>) {
  return {
    getSetting: (key: string) => settings[key],
  };
}
const fakeMessage = {} as any;
const fakeState = {} as any;

describe('aavePositionsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns "not configured" when vault address is missing', async () => {
    const runtime = makeRuntime({});
    const result = await aavePositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(result.text).toContain('No Polygon vault configured');
    expect(result.data?.['configured']).toBe(false);
  });

  it('returns formatted balance when readContract succeeds', async () => {
    const mockReadContract = vi.fn().mockResolvedValue(142_350_000n); // 142.35 USDC
    (getPublicClient as any).mockReturnValue({ readContract: mockReadContract });

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
    });

    const result = await aavePositionsProvider.get(runtime as any, fakeMessage, fakeState);

    expect(result.text).toContain('142.35 aUSDC');
    expect(result.text).toContain('Aave Polygon');
    expect(result.data?.['chainId']).toBe(137);
    expect(result.data?.['humanBalance']).toBeCloseTo(142.35, 1);
    expect(result.data?.['atokenBalance']).toBe('142350000');
  });

  it('returns a zero balance message when balance is 0', async () => {
    const mockReadContract = vi.fn().mockResolvedValue(0n);
    (getPublicClient as any).mockReturnValue({ readContract: mockReadContract });

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
    });

    const result = await aavePositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(result.data?.['humanBalance']).toBe(0);
  });

  it('passes POLYGON_RPC_URL override to getPublicClient', async () => {
    const mockReadContract = vi.fn().mockResolvedValue(0n);
    (getPublicClient as any).mockReturnValue({ readContract: mockReadContract });

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      POLYGON_RPC_URL: 'https://my-custom-rpc.example.com',
    });

    await aavePositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(getPublicClient).toHaveBeenCalledWith(137, 'https://my-custom-rpc.example.com');
  });

  it('returns error text when readContract throws', async () => {
    const mockReadContract = vi.fn().mockRejectedValue(new Error('RPC timeout'));
    (getPublicClient as any).mockReturnValue({ readContract: mockReadContract });

    const runtime = makeRuntime({
      TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
    });

    const result = await aavePositionsProvider.get(runtime as any, fakeMessage, fakeState);
    expect(result.text).toContain('RPC timeout');
    expect(result.data?.['error']).toBe('RPC timeout');
  });
});
