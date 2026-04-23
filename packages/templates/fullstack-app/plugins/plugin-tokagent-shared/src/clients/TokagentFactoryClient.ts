import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import type { AllowlistEntry, ApprovalSpec } from '../protocol-packs.js';

// Minimal factory ABI — only the functions this plugin set needs.
// Does NOT include ZKP-related deploy functions.
const TokagentFactoryABI = [
  {
    type: 'function',
    name: 'deployTokagentVault',
    inputs: [
      { name: 'operator', type: 'address', internalType: 'address' },
      {
        name: 'initialAllowlist',
        type: 'tuple[]',
        internalType: 'struct TokagentVaultCreationCodeStore.Entry[]',
        components: [
          { name: 'target', type: 'address', internalType: 'address' },
          { name: 'selector', type: 'bytes4', internalType: 'bytes4' },
        ],
      },
      {
        name: 'initialApprovals',
        type: 'tuple[]',
        internalType: 'struct TokagentVaultCreationCodeStore.ApprovalSpec[]',
        components: [
          { name: 'token', type: 'address', internalType: 'address' },
          { name: 'spender', type: 'address', internalType: 'address' },
          { name: 'amount', type: 'uint256', internalType: 'uint256' },
        ],
      },
      { name: 'userSalt', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: 'vault', type: 'address', internalType: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'computeTokagentVaultAddress',
    inputs: [
      { name: 'owner', type: 'address', internalType: 'address' },
      { name: 'operator', type: 'address', internalType: 'address' },
      {
        name: 'initialAllowlist',
        type: 'tuple[]',
        internalType: 'struct TokagentVaultCreationCodeStore.Entry[]',
        components: [
          { name: 'target', type: 'address', internalType: 'address' },
          { name: 'selector', type: 'bytes4', internalType: 'bytes4' },
        ],
      },
      {
        name: 'initialApprovals',
        type: 'tuple[]',
        internalType: 'struct TokagentVaultCreationCodeStore.ApprovalSpec[]',
        components: [
          { name: 'token', type: 'address', internalType: 'address' },
          { name: 'spender', type: 'address', internalType: 'address' },
          { name: 'amount', type: 'uint256', internalType: 'uint256' },
        ],
      },
      { name: 'userSalt', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isDeployedVault',
    inputs: [{ name: 'vault', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAllVaults',
    inputs: [],
    outputs: [{ name: '', type: 'address[]', internalType: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vaultCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokagentVaultCreationCodeStore',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'TokagentVaultDeployed',
    inputs: [
      { name: 'owner', type: 'address', indexed: true, internalType: 'address' },
      { name: 'operator', type: 'address', indexed: true, internalType: 'address' },
      { name: 'vault', type: 'address', indexed: false, internalType: 'address' },
    ],
    anonymous: false,
  },
] as const;

export interface DeployTokagentVaultParams {
  operator: Address;
  initialAllowlist: readonly AllowlistEntry[];
  initialApprovals: readonly ApprovalSpec[];
  userSalt: Hex;
}

export interface ComputeTokagentVaultAddressParams {
  owner: Address;
  operator: Address;
  initialAllowlist: readonly AllowlistEntry[];
  initialApprovals: readonly ApprovalSpec[];
  userSalt: Hex;
}

/**
 * Client for the subset of VaultFactory methods needed by Tokagent product plugins.
 * Covers tokagent-specific vault deployment and discovery only.
 */
export class TokagentFactoryClient {
  constructor(
    private readonly factory: Address,
    private readonly publicClient: PublicClient,
    private readonly walletClient?: WalletClient,
  ) {}

  /**
   * Deploy a new TokagentVault and return the deployed vault address and tx hash.
   * Parses the TokagentVaultDeployed event from the receipt to extract the vault address.
   */
  async deployTokagentVault(
    params: DeployTokagentVaultParams,
  ): Promise<{ vault: Address; txHash: Hex }> {
    if (!this.walletClient) {
      throw new Error('walletClient required for deployTokagentVault');
    }

    const allowlistArgs = params.initialAllowlist.map((e) => ({
      target: e.target,
      selector: e.selector as Hex,
    }));
    const approvalArgs = params.initialApprovals.map((a) => ({
      token: a.token,
      spender: a.spender,
      amount: BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
    }));

    const txHash = await this.walletClient.writeContract({
      chain: this.walletClient.chain ?? null,
      account: this.walletClient.account!,
      address: this.factory,
      abi: TokagentFactoryABI,
      functionName: 'deployTokagentVault',
      args: [params.operator, allowlistArgs, approvalArgs, params.userSalt],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    // Parse TokagentVaultDeployed event from receipt
    const { parseEventLogs } = await import('viem');
    const logs = parseEventLogs({
      abi: TokagentFactoryABI,
      eventName: 'TokagentVaultDeployed',
      logs: receipt.logs,
    });

    if (logs.length === 0) {
      throw new Error('TokagentVaultDeployed event not found in transaction receipt');
    }

    const vault = logs[0].args.vault as Address;
    return { vault, txHash };
  }

  /**
   * Compute the deterministic address of a TokagentVault before deploying.
   */
  async computeTokagentVaultAddress(params: ComputeTokagentVaultAddressParams): Promise<Address> {
    const allowlistArgs = params.initialAllowlist.map((e) => ({
      target: e.target,
      selector: e.selector as Hex,
    }));
    const approvalArgs = params.initialApprovals.map((a) => ({
      token: a.token,
      spender: a.spender,
      amount: BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
    }));

    return await this.publicClient.readContract({
      address: this.factory,
      abi: TokagentFactoryABI,
      functionName: 'computeTokagentVaultAddress',
      args: [params.owner, params.operator, allowlistArgs, approvalArgs, params.userSalt],
    });
  }

  async isDeployedVault(vault: Address): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.factory,
      abi: TokagentFactoryABI,
      functionName: 'isDeployedVault',
      args: [vault],
    });
  }

  async getAllVaults(): Promise<Address[]> {
    const result = await this.publicClient.readContract({
      address: this.factory,
      abi: TokagentFactoryABI,
      functionName: 'getAllVaults',
    });
    return result as Address[];
  }

  async vaultCount(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.factory,
      abi: TokagentFactoryABI,
      functionName: 'vaultCount',
    });
  }
}
