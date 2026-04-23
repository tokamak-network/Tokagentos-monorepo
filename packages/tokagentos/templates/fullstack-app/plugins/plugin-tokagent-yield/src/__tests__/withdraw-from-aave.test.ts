import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@tokagent/plugin-tokagent-shared', () => {
  const mockExecuteBatch = vi.fn();
  function MockTokagentVaultClient() {
    return { executeBatch: mockExecuteBatch };
  }
  MockTokagentVaultClient.prototype.executeBatch = mockExecuteBatch;
  return {
    getPublicClient: vi.fn(() => ({})),
    getWalletClient: vi.fn(() => ({})),
    resolveAgentPrivateKey: vi.fn(),
    TokagentVaultClient: MockTokagentVaultClient,
  };
});

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    encodeFunctionData: vi.fn().mockReturnValue('0xwithdrawcalldata'),
  };
});

import { withdrawFromAaveAction } from '../actions/withdraw-from-aave.js';
import {
  resolveAgentPrivateKey,
  TokagentVaultClient,
} from '@tokagent/plugin-tokagent-shared';

const FAKE_TX = '0x999888777666555444333222111000aaabbbcccdddeeefff1234567890abcdef';
const FAKE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function makeRuntime(settings: Record<string, string | undefined>) {
  return { getSetting: (key: string) => settings[key] };
}
const fakeMessage = {} as any;
const fakeState = {} as any;

function getExecuteBatchMock() {
  const instance = new (TokagentVaultClient as any)();
  return instance.executeBatch as ReturnType<typeof vi.fn>;
}

describe('withdrawFromAaveAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveAgentPrivateKey as any).mockReturnValue(FAKE_KEY);
    const inst = new (TokagentVaultClient as any)();
    inst.executeBatch.mockResolvedValue(FAKE_TX);
  });

  describe('validate', () => {
    it('returns true when vault and key are set', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xvault',
        TOKAGENT_PRIVATE_KEY: FAKE_KEY,
      });
      expect(await withdrawFromAaveAction.validate(runtime as any, fakeMessage, fakeState)).toBe(true);
    });

    it('returns false when vault is missing', async () => {
      const runtime = makeRuntime({ TOKAGENT_PRIVATE_KEY: FAKE_KEY });
      expect(await withdrawFromAaveAction.validate(runtime as any, fakeMessage, fakeState)).toBe(false);
    });
  });

  describe('handler', () => {
    it('succeeds with a specific amount', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      });
      const result = await withdrawFromAaveAction.handler(runtime as any, fakeMessage, fakeState, {
        parameters: { amount: '75' },
      } as any);
      expect(result?.success).toBe(true);
      expect(result?.text).toContain('75 USDC');
      expect(result?.data?.['txHash']).toBe(FAKE_TX);
    });

    it('succeeds with "all" keyword', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      });
      const result = await withdrawFromAaveAction.handler(runtime as any, fakeMessage, fakeState, {
        parameters: { amount: 'all' },
      } as any);
      expect(result?.success).toBe(true);
      expect(result?.text).toContain('all USDC');
    });

    it('succeeds with "max" keyword', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      });
      const result = await withdrawFromAaveAction.handler(runtime as any, fakeMessage, fakeState, {
        parameters: { amount: 'max' },
      } as any);
      expect(result?.success).toBe(true);
    });

    it('returns error when vault address is not set', async () => {
      const runtime = makeRuntime({});
      const result = await withdrawFromAaveAction.handler(runtime as any, fakeMessage, fakeState, {
        parameters: { amount: '10' },
      } as any);
      expect(result?.success).toBe(false);
      expect(result?.text).toContain('No Polygon vault configured');
    });

    it('returns error when amount is zero', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      });
      const result = await withdrawFromAaveAction.handler(runtime as any, fakeMessage, fakeState, {
        parameters: { amount: '0' },
      } as any);
      expect(result?.success).toBe(false);
    });

    it('returns allowlist error on CallNotAllowlisted revert', async () => {
      const execBatch = getExecuteBatchMock();
      execBatch.mockRejectedValue(new Error('CallNotAllowlisted'));

      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      });
      const result = await withdrawFromAaveAction.handler(runtime as any, fakeMessage, fakeState, {
        parameters: { amount: '50' },
      } as any);
      expect(result?.success).toBe(false);
      expect(result?.text).toContain('allowlist');
    });
  });
});
