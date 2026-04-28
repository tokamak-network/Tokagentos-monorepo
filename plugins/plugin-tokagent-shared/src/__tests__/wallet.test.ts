import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPublicClient, getWalletClient, resolveAgentPrivateKey } from '../wallet.js';
import type { AgentRuntimeLike } from '../wallet.js';

// A valid-format 32-byte private key (test only — never use in production)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

describe('wallet', () => {
  describe('getPublicClient', () => {
    it('returns a PublicClient for chain 1', () => {
      const client = getPublicClient(1);
      expect(client).toBeDefined();
      expect(typeof client.readContract).toBe('function');
    });

    it('returns a PublicClient for chain 137', () => {
      const client = getPublicClient(137);
      expect(client).toBeDefined();
    });

    it('returns a PublicClient for chain 999', () => {
      const client = getPublicClient(999);
      expect(client).toBeDefined();
    });

    it('throws for unsupported chain', () => {
      expect(() => getPublicClient(9999)).toThrow(/Unsupported chainId/);
    });

    it('accepts an rpcOverride', () => {
      const client = getPublicClient(1, 'https://cloudflare-eth.com');
      expect(client).toBeDefined();
    });
  });

  describe('getWalletClient', () => {
    it('returns a WalletClient for chain 1', () => {
      const client = getWalletClient(1, TEST_PRIVATE_KEY);
      expect(client).toBeDefined();
      expect(typeof client.writeContract).toBe('function');
    });

    it('returns a WalletClient with the correct account address', () => {
      const client = getWalletClient(1, TEST_PRIVATE_KEY);
      // The known address for the hardhat test key 0xac09...
      expect(client.account?.address?.toLowerCase()).toBe(
        '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      );
    });

    it('throws for unsupported chain', () => {
      expect(() => getWalletClient(42161, TEST_PRIVATE_KEY)).toThrow(/Unsupported chainId/);
    });
  });

  describe('resolveAgentPrivateKey', () => {
    function makeRuntime(value: string | undefined): AgentRuntimeLike {
      return { getSetting: (_key: string) => value };
    }

    let savedTokagentEnv: string | undefined;
    let savedEvmEnv: string | undefined;
    beforeEach(() => {
      // Isolate from the host shell — tests must not depend on whatever
      // private keys happen to be exported in the developer's .env.
      savedTokagentEnv = process.env.TOKAGENT_PRIVATE_KEY;
      savedEvmEnv = process.env.EVM_PRIVATE_KEY;
      delete process.env.TOKAGENT_PRIVATE_KEY;
      delete process.env.EVM_PRIVATE_KEY;
    });
    afterEach(() => {
      if (savedTokagentEnv === undefined) delete process.env.TOKAGENT_PRIVATE_KEY;
      else process.env.TOKAGENT_PRIVATE_KEY = savedTokagentEnv;
      if (savedEvmEnv === undefined) delete process.env.EVM_PRIVATE_KEY;
      else process.env.EVM_PRIVATE_KEY = savedEvmEnv;
    });

    it('returns the key when valid', () => {
      const runtime = makeRuntime(TEST_PRIVATE_KEY);
      expect(resolveAgentPrivateKey(runtime)).toBe(TEST_PRIVATE_KEY);
    });

    it('throws when key is missing (undefined)', () => {
      const runtime = makeRuntime(undefined);
      expect(() => resolveAgentPrivateKey(runtime)).toThrow(/TOKAGENT_PRIVATE_KEY is not set/);
    });

    it('throws when key is not hex', () => {
      const runtime = makeRuntime('not-a-hex-string');
      expect(() => resolveAgentPrivateKey(runtime)).toThrow(/0x-prefixed hex/);
    });

    it('throws when key is too short (16 bytes instead of 32)', () => {
      const shortKey = '0x' + 'ab'.repeat(16); // 16 bytes = 32 hex chars
      const runtime = makeRuntime(shortKey);
      expect(() => resolveAgentPrivateKey(runtime)).toThrow(/32 bytes/);
    });

    it('throws when key is too long (33 bytes)', () => {
      const longKey = '0x' + 'ab'.repeat(33); // 33 bytes = 66 hex chars
      const runtime = makeRuntime(longKey);
      expect(() => resolveAgentPrivateKey(runtime)).toThrow(/32 bytes/);
    });

    it('falls back to process.env.TOKAGENT_PRIVATE_KEY when runtime returns undefined', () => {
      // Repro for the bug where runtime.getSetting() does not pick up the
      // .env-loaded key (TokagentOS getSetting allowlist gate). The wallet UI
      // reads the env var directly and shows the balance, but plugin actions
      // would otherwise fail with "TOKAGENT_PRIVATE_KEY is not set".
      process.env.TOKAGENT_PRIVATE_KEY = TEST_PRIVATE_KEY;
      const runtime = makeRuntime(undefined);
      expect(resolveAgentPrivateKey(runtime)).toBe(TEST_PRIVATE_KEY);
    });

    it('falls back to process.env.EVM_PRIVATE_KEY (alias used by plugin-evm)', () => {
      // core-plugins.ts mirrors TOKAGENT_PRIVATE_KEY → EVM_PRIVATE_KEY, but
      // a user who set only EVM_PRIVATE_KEY directly should still resolve.
      process.env.EVM_PRIVATE_KEY = TEST_PRIVATE_KEY;
      const runtime = makeRuntime(undefined);
      expect(resolveAgentPrivateKey(runtime)).toBe(TEST_PRIVATE_KEY);
    });

    it('runtime setting wins over process.env when both are present', () => {
      process.env.TOKAGENT_PRIVATE_KEY = '0x' + 'ff'.repeat(32);
      const runtime = makeRuntime(TEST_PRIVATE_KEY);
      expect(resolveAgentPrivateKey(runtime)).toBe(TEST_PRIVATE_KEY);
    });
  });
});
