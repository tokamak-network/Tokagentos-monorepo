import { describe, expect, it } from 'vitest';
import type { PublicClient, WalletClient } from 'viem';
import { TokagentVaultClient } from '../clients/TokagentVaultClient.js';

const VAULT_ADDR = '0x2222222222222222222222222222222222222222' as const;
const OWNER_ADDR = '0x1111111111111111111111111111111111111111' as const;

describe('TokagentVaultClient', () => {
  it('delegates owner() to publicClient.readContract', async () => {
    const calls: unknown[] = [];
    const publicClient = {
      readContract: (args: unknown) => {
        calls.push(args);
        return Promise.resolve(OWNER_ADDR);
      },
    } as unknown as PublicClient;

    const client = new TokagentVaultClient(VAULT_ADDR, publicClient);
    const owner = await client.owner();

    expect(owner).toBe(OWNER_ADDR);
    expect(calls).toHaveLength(1);
    expect((calls[0] as { functionName: string }).functionName).toBe('owner');
    expect((calls[0] as { address: string }).address).toBe(VAULT_ADDR);
  });

  it('delegates operator() to publicClient.readContract', async () => {
    const publicClient = {
      readContract: () => Promise.resolve('0x3333333333333333333333333333333333333333'),
    } as unknown as PublicClient;

    const client = new TokagentVaultClient(VAULT_ADDR, publicClient);
    const op = await client.operator();
    expect(op).toBe('0x3333333333333333333333333333333333333333');
  });

  it('delegates isAllowlisted() with correct args', async () => {
    const calls: unknown[] = [];
    const publicClient = {
      readContract: (args: unknown) => {
        calls.push(args);
        return Promise.resolve(true);
      },
    } as unknown as PublicClient;

    const client = new TokagentVaultClient(VAULT_ADDR, publicClient);
    const result = await client.isAllowlisted(
      '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      '0x617ba037',
    );

    expect(result).toBe(true);
    expect((calls[0] as { functionName: string }).functionName).toBe('isAllowlisted');
    expect((calls[0] as { args: unknown[] }).args).toEqual([
      '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      '0x617ba037',
    ]);
  });

  it('executeBatch requires walletClient', async () => {
    const publicClient = {
      readContract: () => Promise.resolve('0x0'),
    } as unknown as PublicClient;

    const client = new TokagentVaultClient(VAULT_ADDR, publicClient);

    await expect(
      client.executeBatch([
        { target: '0x3333333333333333333333333333333333333333', data: '0xdeadbeef', value: 0n },
      ]),
    ).rejects.toThrow(/walletClient required/);
  });

  it('approveToken requires walletClient', async () => {
    const publicClient = {
      readContract: () => Promise.resolve('0x0'),
    } as unknown as PublicClient;

    const client = new TokagentVaultClient(VAULT_ADDR, publicClient);

    await expect(
      client.approveToken(
        '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        1000000n,
      ),
    ).rejects.toThrow(/walletClient required/);
  });

  it('executeBatch delegates to walletClient.writeContract', async () => {
    const calls: unknown[] = [];
    const publicClient = {} as unknown as PublicClient;
    const walletClient = {
      chain: null,
      account: { address: OWNER_ADDR },
      writeContract: (args: unknown) => {
        calls.push(args);
        return Promise.resolve('0xabc123' as `0x${string}`);
      },
    } as unknown as WalletClient;

    const client = new TokagentVaultClient(VAULT_ADDR, publicClient, walletClient);
    const txHash = await client.executeBatch([
      { target: '0x3333333333333333333333333333333333333333', data: '0xdeadbeef', value: 0n },
    ]);

    expect(txHash).toBe('0xabc123');
    expect(calls).toHaveLength(1);
    expect((calls[0] as { functionName: string }).functionName).toBe('executeBatch');
  });

  it('vault address is accessible as a public property', () => {
    const publicClient = {} as unknown as PublicClient;
    const client = new TokagentVaultClient(VAULT_ADDR, publicClient);
    expect(client.vault).toBe(VAULT_ADDR);
  });
});
