import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the shared library
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

// Mock viem's encodeFunctionData
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    encodeFunctionData: vi.fn().mockReturnValue('0xabcdef'),
  };
});

import { depositToAaveAction } from '../actions/deposit-to-aave.js';
import {
  getPublicClient,
  getWalletClient,
  resolveAgentPrivateKey,
  TokagentVaultClient,
} from '@tokagent/plugin-tokagent-shared';

const FAKE_TX = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const FAKE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function makeRuntime(settings: Record<string, string | undefined>) {
  return { getSetting: (key: string) => settings[key] };
}
const fakeMessage = {} as any;
const fakeState = {} as any;

// Helper: get the executeBatch mock from TokagentVaultClient's prototype
function getExecuteBatchMock() {
  // Our factory function returns objects where executeBatch is on the instance
  const instance = new (TokagentVaultClient as any)();
  return instance.executeBatch as ReturnType<typeof vi.fn>;
}

describe('depositToAaveAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveAgentPrivateKey as any).mockReturnValue(FAKE_KEY);
    // Set executeBatch to return FAKE_TX by default
    const inst = new (TokagentVaultClient as any)();
    inst.executeBatch.mockResolvedValue(FAKE_TX);
  });

  describe('validate', () => {
    it('returns true when both vault and key are set', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xvault',
        TOKAGENT_PRIVATE_KEY: FAKE_KEY,
      });
      const valid = await depositToAaveAction.validate(runtime as any, fakeMessage, fakeState);
      expect(valid).toBe(true);
    });

    it('returns false when vault address is missing', async () => {
      const runtime = makeRuntime({ TOKAGENT_PRIVATE_KEY: FAKE_KEY });
      const valid = await depositToAaveAction.validate(runtime as any, fakeMessage, fakeState);
      expect(valid).toBe(false);
    });

    it('returns false when private key is missing', async () => {
      const runtime = makeRuntime({ TOKAGENT_VAULT_ADDRESS_137: '0xvault' });
      const valid = await depositToAaveAction.validate(runtime as any, fakeMessage, fakeState);
      expect(valid).toBe(false);
    });
  });

  describe('handler', () => {
    it('returns success with tx hash on valid deposit', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      });

      const result = await depositToAaveAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { amount: 100 } } as any,
      );

      expect(result?.success).toBe(true);
      expect(result?.text).toContain('100 USDC');
      expect(result?.text).toContain(FAKE_TX);
      expect(result?.data?.['chain']).toBe('polygon');
    });

    it('passes correct target address to executeBatch', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      });

      const execBatch = getExecuteBatchMock();
      execBatch.mockResolvedValue(FAKE_TX);

      await depositToAaveAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { amount: 50 } } as any,
      );

      // executeBatch was called with the Aave pool as target
      expect(execBatch).toHaveBeenCalledOnce();
      const [calls] = execBatch.mock.calls[0];
      expect(calls[0].target).toBe('0x794a61358D6845594F94dc1DB02A252b5b4814aD');
      expect(calls[0].value).toBe(0n);
    });

    it('returns error when vault address is not set', async () => {
      const runtime = makeRuntime({});
      const result = await depositToAaveAction.handler(runtime as any, fakeMessage, fakeState, {
        parameters: { amount: 100 },
      } as any);
      expect(result?.success).toBe(false);
      expect(result?.text).toContain('No Polygon vault configured');
    });

    it('returns error when amount is zero', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      });
      const result = await depositToAaveAction.handler(runtime as any, fakeMessage, fakeState, {
        parameters: { amount: 0 },
      } as any);
      expect(result?.success).toBe(false);
      expect(result?.text).toContain('Invalid amount');
    });

    it('returns error when amount is negative', async () => {
      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      });
      const result = await depositToAaveAction.handler(runtime as any, fakeMessage, fakeState, {
        parameters: { amount: -10 },
      } as any);
      expect(result?.success).toBe(false);
    });

    it('returns allowlist error when vault rejects CallNotAllowlisted', async () => {
      const execBatch = getExecuteBatchMock();
      execBatch.mockRejectedValue(new Error('CallNotAllowlisted'));

      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      });

      const result = await depositToAaveAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { amount: 100 } } as any,
      );

      expect(result?.success).toBe(false);
      expect(result?.text).toContain('aave-v3-polygon');
      expect(result?.text).toContain('allowlist');
    });

    it('returns generic error on unexpected revert', async () => {
      const execBatch = getExecuteBatchMock();
      execBatch.mockRejectedValue(new Error('insufficient funds'));

      const runtime = makeRuntime({
        TOKAGENT_VAULT_ADDRESS_137: '0xdeadbeef00000000000000000000000000000001',
      });

      const result = await depositToAaveAction.handler(
        runtime as any,
        fakeMessage,
        fakeState,
        { parameters: { amount: 100 } } as any,
      );

      expect(result?.success).toBe(false);
      expect(result?.text).toContain('insufficient funds');
    });
  });
});
