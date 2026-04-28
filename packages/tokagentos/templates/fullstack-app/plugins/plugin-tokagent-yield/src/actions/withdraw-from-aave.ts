import type { Action, ActionResult, HandlerOptions } from '@elizaos/core';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';
import type { AgentRuntimeLike } from '@tokagent/plugin-tokagent-shared';
import {
  getPublicClient,
  getWalletClient,
  resolveAgentPrivateKey,
  TokagentVaultClient,
} from '@tokagent/plugin-tokagent-shared';
import { encodeFunctionData } from 'viem';
import type { Address } from 'viem';
import {
  AAVE_V3_POOL_ADDRESS,
  POOL_WITHDRAW_ABI,
  USDC_E_ADDRESS,
  WITHDRAW_ALL,
} from '../types.js';

/** Cast IAgentRuntime.getSetting (string|boolean|number|null) to string|undefined for shared lib compat. */
function str(runtime: IAgentRuntime, key: string): string | undefined {
  const v = runtime.getSetting(key);
  if (v === null || v === undefined) return undefined;
  return String(v) || undefined;
}

export const withdrawFromAaveAction: Action = {
  name: 'WITHDRAW_FROM_AAVE',
  description: 'Withdraw USDC from Aave v3 on Polygon back to the user\'s TokagentVault.',
  similes: ['withdraw aave', 'pull from aave', 'take out of aave'],
  contexts: ['wallet'],
  suppressPostActionContinuation: false,

  parameters: [
    {
      name: 'amount',
      description: 'USDC amount to withdraw in human units, or "all" / "max" to withdraw everything',
      required: true,
      schema: { type: 'string' },
    },
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<boolean> => {
    const vault = str(runtime, 'TOKAGENT_VAULT_ADDRESS_137');
    const key = str(runtime, 'TOKAGENT_PRIVATE_KEY');
    return Boolean(vault && key);
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    options?: HandlerOptions | Record<string, unknown>,
  ): Promise<ActionResult | undefined> => {
    const vaultAddress = str(runtime, 'TOKAGENT_VAULT_ADDRESS_137');
    if (!vaultAddress) {
      return {
        success: false,
        error: 'TOKAGENT_VAULT_ADDRESS_137 not set',
      };
    }

    // Build an AgentRuntimeLike wrapper for the shared lib
    const runtimeLike: AgentRuntimeLike = { getSetting: (k: string) => str(runtime, k) };

    let privateKey: `0x${string}`;
    try {
      privateKey = resolveAgentPrivateKey(runtimeLike);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, text: msg, error: msg };
    }

    // Extract parameters
    const params = (options as HandlerOptions | undefined)?.parameters;
    const rawAmount = params?.amount;

    if (rawAmount === undefined || rawAmount === null) {
      return {
        success: false,
        error: 'amount parameter is required',
      };
    }

    const amountStr = String(rawAmount).trim().toLowerCase();
    let amountUnits: bigint;
    let amountDisplay: string;

    if (amountStr === 'all' || amountStr === 'max' || amountStr === 'everything') {
      // Aave interprets uint256 max as "withdraw full balance"
      amountUnits = WITHDRAW_ALL;
      amountDisplay = 'all';
    } else {
      const amountNum = Number(amountStr);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return {
          success: false,
          error: 'amount must be positive or "all"',
        };
      }
      amountUnits = BigInt(Math.floor(amountNum * 1e6));
      amountDisplay = String(amountNum);
    }

    const rpcOverride = str(runtime, 'POLYGON_RPC_URL');
    const publicClient = getPublicClient(137, rpcOverride);
    const walletClient = getWalletClient(137, privateKey, rpcOverride);

    const vaultClient = new TokagentVaultClient(vaultAddress as Address, publicClient, walletClient);

    // Encode Pool.withdraw — the vault is the recipient so funds return to vault
    const calldata = encodeFunctionData({
      abi: POOL_WITHDRAW_ABI,
      functionName: 'withdraw',
      args: [USDC_E_ADDRESS, amountUnits, vaultAddress as Address],
    });

    let txHash: `0x${string}`;
    try {
      txHash = await vaultClient.executeBatch([
        {
          target: AAVE_V3_POOL_ADDRESS,
          data: calldata,
          value: 0n,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('CallNotAllowlisted') || msg.includes('not allowlisted') || msg.includes('Allowlist')) {
        return {
          success: false,
          error: msg,
        };
      }
      return {
        success: false,
        error: msg,
      };
    }

    return {
      success: true,
      text: `Withdrew ${amountDisplay} USDC from Aave v3 on Polygon back to the vault. Tx: ${txHash}`,
      data: { txHash, amount: amountDisplay, chain: 'polygon' },
    };
  },
};
