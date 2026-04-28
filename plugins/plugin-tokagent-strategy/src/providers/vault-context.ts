/**
 * VAULT_CONTEXT provider — runs every chat turn and emits a compact
 * `[vault-context]` block describing the operator's current Tokagent
 * state: which vaults are deployed (per chain), wallet readiness, and
 * a one-line strategies count.
 *
 * Why: without this context, the LLM has no idea whether a vault
 * already exists. It either invents addresses (the original `0x123…`
 * bug), asks the user for one, or routes to BUILD_STRATEGY too eagerly.
 * With the block in the prompt, the agent can deterministically reach
 * for `DEPLOY_TOKAGENT_VAULT` when chains are empty, and short-circuit
 * to the existing vault otherwise.
 *
 * Stays compact (≈12 lines per turn). Reads only env settings + the
 * persistence layer; no network calls.
 */

import type { Provider, ProviderResult, IAgentRuntime } from "@tokagentos/core";
import { SUPPORTED_CHAIN_IDS } from "@tokagent/plugin-tokagent-shared";
import { listActiveStrategies } from "../persistence.js";

interface SettingReader {
  getSetting: (key: string) => string | undefined;
}

function toReader(runtime: IAgentRuntime): SettingReader {
  return {
    getSetting: (key) => {
      const v = runtime.getSetting(key);
      if (v === null || v === undefined) return undefined;
      const s = String(v).trim();
      return s.length > 0 ? s : undefined;
    },
  };
}

function chainSlug(chainId: number): string {
  switch (chainId) {
    case 1:
      return "ethereum";
    case 137:
      return "polygon";
    case 999:
      return "hyperevm";
    default:
      return `chain-${chainId}`;
  }
}

function readVaultAddresses(reader: SettingReader): Array<{ chain: string; address: string | undefined }> {
  // SUPPORTED_CHAIN_IDS is a ReadonlySet<number>, not an array — spread first.
  return [...SUPPORTED_CHAIN_IDS].map((chainId) => ({
    chain: chainSlug(chainId),
    address: reader.getSetting(`TOKAGENT_VAULT_ADDRESS_${chainId}`),
  }));
}

function readWalletAddresses(reader: SettingReader): { evm: string | undefined; solana: string | undefined } {
  // Tokagent's user-facing key is TOKAGENT_PRIVATE_KEY, mirrored to
  // EVM_PRIVATE_KEY by core-plugins.ts. Read addresses if set;
  // otherwise leave undefined (avoid deriving from key here — that's
  // plugin-evm's job and we don't want to import its dependencies).
  return {
    evm: reader.getSetting("TOKAGENT_MANAGED_EVM_ADDRESS") ?? reader.getSetting("EVM_WALLET_ADDRESS"),
    solana: reader.getSetting("SOLANA_WALLET_ADDRESS"),
  };
}

export const vaultContextProvider: Provider = {
  name: "vaultContext",
  description:
    "Tokagent vault and wallet state: which chains have a TokagentVault deployed, wallet readiness, and strategy count. Use this to decide whether DEPLOY_TOKAGENT_VAULT is needed before BUILD_STRATEGY.",
  get: async (runtime): Promise<ProviderResult> => {
    const reader = toReader(runtime);
    const vaults = readVaultAddresses(reader);
    const wallet = readWalletAddresses(reader);

    let strategyCount = 0;
    try {
      const strategies = await listActiveStrategies(reader);
      strategyCount = strategies.length;
    } catch {
      // Persistence may be uninitialized in fresh sessions — fall back
      // to "unknown" rather than throwing. Provider failures should
      // never break a chat turn.
      strategyCount = -1;
    }

    const deployedVaults = vaults.filter((v) => v.address !== undefined);
    const lines: string[] = ["[vault-context]"];
    if (deployedVaults.length === 0) {
      lines.push("Vaults: none deployed yet — call DEPLOY_TOKAGENT_VAULT before any strategy/trade actions.");
    } else {
      lines.push(`Vaults (${deployedVaults.length}):`);
      for (const v of deployedVaults) {
        lines.push(`  - ${v.chain}: ${v.address}`);
      }
      const missing = vaults.filter((v) => v.address === undefined).map((v) => v.chain);
      if (missing.length > 0) {
        lines.push(`Other supported chains (no vault): ${missing.join(", ")}`);
      }
    }

    const evmStatus = wallet.evm ? wallet.evm : "not configured";
    const solStatus = wallet.solana ? wallet.solana : "not configured";
    lines.push(`Wallet: EVM=${evmStatus}; Solana=${solStatus}`);

    if (strategyCount === -1) {
      lines.push("Strategies: (status unavailable this turn)");
    } else if (strategyCount === 0) {
      lines.push("Strategies: 0 (call BUILD_STRATEGY to compose one once a vault exists)");
    } else {
      lines.push(`Strategies: ${strategyCount} active — call LIST_STRATEGIES for details`);
    }

    return {
      text: lines.join("\n"),
      data: {
        vaults: vaults.map((v) => ({ chain: v.chain, address: v.address ?? null })),
        wallet,
        strategyCount,
      },
    };
  },
};
