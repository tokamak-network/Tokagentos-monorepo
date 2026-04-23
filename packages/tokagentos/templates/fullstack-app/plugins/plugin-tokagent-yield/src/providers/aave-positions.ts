import type { Provider, ProviderResult } from '@elizaos/core';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';
import { getPublicClient } from '@tokagent/plugin-tokagent-shared';
import type { Address } from 'viem';
import {
  AUSDC_E_ADDRESS,
  ERC20_BALANCE_ABI,
} from '../types.js';

export const aavePositionsProvider: Provider = {
  name: 'aavePositions',
  description: 'Returns the vault aUSDC balance on Aave v3 Polygon.',
  dynamic: true,
  contexts: ['wallet'],

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> => {
    const vaultAddress = runtime.getSetting('TOKAGENT_VAULT_ADDRESS_137') as string | undefined ?? undefined;
    if (!vaultAddress) {
      return {
        text: 'No Polygon vault configured. Deploy one via `tokagentos deploy --kind tokagent --pack aave-v3-polygon`.',
        data: { configured: false },
      };
    }

    const rpcOverride = (runtime.getSetting('POLYGON_RPC_URL') as string | undefined) ?? undefined;
    const publicClient = getPublicClient(137, rpcOverride);

    let rawBalance: bigint;
    try {
      rawBalance = await publicClient.readContract({
        address: AUSDC_E_ADDRESS,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [vaultAddress as Address],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        text: `Failed to read aUSDC balance: ${msg}`,
        data: { error: msg },
      };
    }

    // aUSDC is pegged 1:1 to USDC.e which has 6 decimals
    const humanBalance = Number(rawBalance) / 1e6;
    const atokenBalance = rawBalance.toString();

    return {
      text: `Vault holds ${humanBalance.toFixed(2)} aUSDC on Aave Polygon (≈ $${humanBalance.toFixed(2)} earning variable APY).`,
      data: {
        chainId: 137,
        atokenAddress: AUSDC_E_ADDRESS,
        atokenBalance,
        humanBalance,
      },
    };
  },
};
