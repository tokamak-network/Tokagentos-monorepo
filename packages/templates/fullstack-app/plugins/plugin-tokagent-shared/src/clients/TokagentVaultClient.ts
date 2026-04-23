import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import { TokagentVaultABI } from '../abi/TokagentVault.js';

export interface TokagentEntry {
  target: Address;
  selector: Hex;
}

export interface TokagentCall {
  target: Address;
  data: Hex;
  value: bigint;
}

/** Light-weight client that exposes the operator + view surface of a deployed TokagentVault. */
export class TokagentVaultClient {
  constructor(
    public readonly vault: Address,
    private readonly publicClient: PublicClient,
    private readonly walletClient?: WalletClient,
  ) {}

  async owner(): Promise<Address> {
    return await this.publicClient.readContract({
      address: this.vault,
      abi: TokagentVaultABI,
      functionName: 'owner',
    });
  }

  async operator(): Promise<Address> {
    return await this.publicClient.readContract({
      address: this.vault,
      abi: TokagentVaultABI,
      functionName: 'operator',
    });
  }

  async vaultKind(): Promise<Hex> {
    return await this.publicClient.readContract({
      address: this.vault,
      abi: TokagentVaultABI,
      functionName: 'vaultKind',
    });
  }

  async isAllowlisted(target: Address, selector: Hex): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.vault,
      abi: TokagentVaultABI,
      functionName: 'isAllowlisted',
      args: [target, selector],
    });
  }

  async executeBatch(calls: TokagentCall[]): Promise<Hex> {
    this.requireWallet();
    return await this.walletClient!.writeContract({
      chain: this.walletClient!.chain ?? null,
      account: this.walletClient!.account!,
      address: this.vault,
      abi: TokagentVaultABI,
      functionName: 'executeBatch',
      args: [calls],
    });
  }

  async approveToken(token: Address, spender: Address, amount: bigint): Promise<Hex> {
    this.requireWallet();
    return await this.walletClient!.writeContract({
      chain: this.walletClient!.chain ?? null,
      account: this.walletClient!.account!,
      address: this.vault,
      abi: TokagentVaultABI,
      functionName: 'approveToken',
      args: [token, spender, amount],
    });
  }

  private requireWallet(): void {
    if (!this.walletClient) {
      throw new Error('walletClient required for write operations');
    }
  }
}
