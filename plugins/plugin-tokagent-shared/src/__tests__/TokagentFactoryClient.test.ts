import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { PublicClient, WalletClient } from 'viem';
import { TokagentFactoryClient } from '../clients/TokagentFactoryClient.js';
import { AAVE_V3_POLYGON } from '../protocol-packs.js';

const FACTORY_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const VAULT_ADDR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
const OPERATOR_ADDR = '0xcccccccccccccccccccccccccccccccccccccccc' as const;
const OWNER_ADDR = '0xdddddddddddddddddddddddddddddddddddddddd' as const;
const TX_HASH = ('0x' + 'aa'.repeat(32)) as `0x${string}`;
const USER_SALT = ('0x' + '00'.repeat(32)) as `0x${string}`;

// ---------------------------------------------------------------------------
// Module-level mock setup for viem's parseEventLogs.
// We use vi.mock at module scope (gets hoisted by vitest) and control the
// return value per-test via a shared reference.
// ---------------------------------------------------------------------------
const parseEventLogsMock = vi.fn();

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    parseEventLogs: (...args: Parameters<typeof actual.parseEventLogs>) =>
      parseEventLogsMock(...args),
  };
});

describe('TokagentFactoryClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('read-only methods', () => {
    it('isDeployedVault delegates to publicClient.readContract', async () => {
      const calls: unknown[] = [];
      const publicClient = {
        readContract: (args: unknown) => {
          calls.push(args);
          return Promise.resolve(true);
        },
      } as unknown as PublicClient;

      const client = new TokagentFactoryClient(FACTORY_ADDR, publicClient);
      const result = await client.isDeployedVault(VAULT_ADDR);

      expect(result).toBe(true);
      expect((calls[0] as { functionName: string }).functionName).toBe('isDeployedVault');
      expect((calls[0] as { args: string[] }).args).toEqual([VAULT_ADDR]);
    });

    it('getAllVaults returns array', async () => {
      const publicClient = {
        readContract: () => Promise.resolve([VAULT_ADDR]),
      } as unknown as PublicClient;

      const client = new TokagentFactoryClient(FACTORY_ADDR, publicClient);
      const vaults = await client.getAllVaults();
      expect(vaults).toEqual([VAULT_ADDR]);
    });

    it('vaultCount returns bigint', async () => {
      const publicClient = {
        readContract: () => Promise.resolve(5n),
      } as unknown as PublicClient;

      const client = new TokagentFactoryClient(FACTORY_ADDR, publicClient);
      const count = await client.vaultCount();
      expect(count).toBe(5n);
    });

    it('computeTokagentVaultAddress delegates with correct functionName', async () => {
      const calls: unknown[] = [];
      const publicClient = {
        readContract: (args: unknown) => {
          calls.push(args);
          return Promise.resolve(VAULT_ADDR);
        },
      } as unknown as PublicClient;

      const client = new TokagentFactoryClient(FACTORY_ADDR, publicClient);
      const addr = await client.computeTokagentVaultAddress({
        owner: OWNER_ADDR,
        operator: OPERATOR_ADDR,
        initialAllowlist: AAVE_V3_POLYGON.entries,
        initialApprovals: AAVE_V3_POLYGON.approvals,
        userSalt: USER_SALT,
      });

      expect(addr).toBe(VAULT_ADDR);
      expect((calls[0] as { functionName: string }).functionName).toBe(
        'computeTokagentVaultAddress',
      );
    });
  });

  describe('deployTokagentVault', () => {
    it('throws when walletClient is missing', async () => {
      const publicClient = {} as unknown as PublicClient;
      const client = new TokagentFactoryClient(FACTORY_ADDR, publicClient);

      await expect(
        client.deployTokagentVault({
          operator: OPERATOR_ADDR,
          initialAllowlist: AAVE_V3_POLYGON.entries,
          initialApprovals: AAVE_V3_POLYGON.approvals,
          userSalt: USER_SALT,
        }),
      ).rejects.toThrow(/walletClient required/);
    });

    it('parses TokagentVaultDeployed event from receipt and returns vault + txHash', async () => {
      parseEventLogsMock.mockReturnValueOnce([
        { args: { vault: VAULT_ADDR, owner: OWNER_ADDR, operator: OPERATOR_ADDR } },
      ]);

      const publicClient = {
        waitForTransactionReceipt: () => Promise.resolve({ logs: [] }),
      } as unknown as PublicClient;

      const walletClient = {
        chain: null,
        account: { address: OWNER_ADDR },
        writeContract: () => Promise.resolve(TX_HASH),
      } as unknown as WalletClient;

      const client = new TokagentFactoryClient(FACTORY_ADDR, publicClient, walletClient);
      const result = await client.deployTokagentVault({
        operator: OPERATOR_ADDR,
        initialAllowlist: AAVE_V3_POLYGON.entries,
        initialApprovals: AAVE_V3_POLYGON.approvals,
        userSalt: USER_SALT,
      });

      expect(result.vault).toBe(VAULT_ADDR);
      expect(result.txHash).toBe(TX_HASH);
      expect(parseEventLogsMock).toHaveBeenCalledOnce();
    });

    it('throws when TokagentVaultDeployed event is not in receipt', async () => {
      parseEventLogsMock.mockReturnValueOnce([]);

      const publicClient = {
        waitForTransactionReceipt: () => Promise.resolve({ logs: [] }),
      } as unknown as PublicClient;

      const walletClient = {
        chain: null,
        account: { address: OWNER_ADDR },
        writeContract: () => Promise.resolve(TX_HASH),
      } as unknown as WalletClient;

      const client = new TokagentFactoryClient(FACTORY_ADDR, publicClient, walletClient);

      await expect(
        client.deployTokagentVault({
          operator: OPERATOR_ADDR,
          initialAllowlist: [],
          initialApprovals: [],
          userSalt: USER_SALT,
        }),
      ).rejects.toThrow(/TokagentVaultDeployed event not found/);
    });
  });
});
