import type { Action, ActionResult } from "@elizaos/core";
import {
  TokagentFactoryClient,
  getChainConfig,
  getPublicClient,
  persistVaultAddress,
  resolveAgentPrivateKey,
  SUPPORTED_CHAIN_IDS,
  tokagentActionError,
  tokagentActionFailure,
} from "@tokagent/plugin-tokagent-shared";
import type { Address } from "viem";

const CHAIN_IDS_BY_NAME: Record<string, number> = {
  ethereum: 1,
  mainnet: 1,
  eth: 1,
  polygon: 137,
  matic: 137,
  hyperevm: 999,
  hyper: 999,
};

/**
 * Recovery action — record an already-deployed Tokagent vault address into
 * the agent's runtime + on-disk `.env` so subsequent turns route writes
 * through it.
 *
 * Why this exists: the deploy path can fail to extract the vault address
 * from the receipt (RPC strips logs, ABI drift, etc.) even though the
 * factory deployed the vault correctly on-chain. Without a recovery
 * action, the user is stuck — `vault-context` keeps reporting "none
 * deployed" and the agent re-proposes a fresh deploy.
 *
 * This action verifies the address against `factory.isDeployedVault(vault)`
 * before persisting — so an LLM that hallucinates an address can't poison
 * agent state.
 */
export const registerExistingVaultAction: Action = {
  name: "REGISTER_EXISTING_VAULT",
  description:
    "Use to record an already-deployed TokagentVault's address into agent state, " +
    "after the factory has deployed it on-chain. Reach for this when a previous " +
    "DEPLOY_TOKAGENT_VAULT call surfaced a parsing error but the vault contract " +
    "is verifiably live on-chain (the user pastes the address from a block " +
    "explorer or the deploy tx). Verifies via factory.isDeployedVault() before " +
    "persisting; rejects unknown addresses.",
  similes: [
    "register vault",
    "register existing vault",
    "the vault was deployed at",
    "the vault is at",
    "use existing vault",
    "use this vault",
    "vault address is",
    "i have a vault at",
    "set the vault to",
    "recover vault",
  ],
  parameters: [
    {
      name: "vaultAddress",
      description:
        "Required. The 0x-prefixed 20-byte address of the already-deployed TokagentVault.",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "chain",
      description:
        "Required. Chain the vault was deployed on: 'ethereum', 'polygon', or 'hyperevm'.",
      required: true,
      schema: { type: "string", enum: ["ethereum", "polygon", "hyperevm"] },
    },
  ],

  validate: async (runtime) => {
    try {
      const runtimeLike = {
        getSetting: (key: string): string | undefined => {
          const v = runtime.getSetting(key);
          if (v === null || v === undefined) return undefined;
          return String(v) || undefined;
        },
      };
      // We don't actually USE the private key (the verifying call is a
      // view function), but reusing the same readiness gate as
      // DEPLOY_TOKAGENT_VAULT keeps the action surface consistent: an
      // operator who can't deploy shouldn't be registering vaults
      // either, since they'd be unable to drive the resulting vault.
      resolveAgentPrivateKey(runtimeLike);
      return true;
    } catch {
      return false;
    }
  },

  handler: async (runtime, _message, _state, options) => {
    const params = (
      (options as { parameters?: Record<string, unknown> } | undefined)?.parameters ?? options ?? {}
    ) as Record<string, unknown>;

    const chainNameRaw = String(params.chain ?? "").toLowerCase().trim();
    if (!chainNameRaw) {
      return tokagentActionError("missing_chain", {
        hint: "Pass `chain` (ethereum | polygon | hyperevm).",
      });
    }
    const chainId = CHAIN_IDS_BY_NAME[chainNameRaw];
    if (!chainId || !SUPPORTED_CHAIN_IDS.has(chainId)) {
      return tokagentActionError("invalid_chain", { provided: chainNameRaw });
    }

    const rawVaultAddress = String(params.vaultAddress ?? "").trim();
    if (!rawVaultAddress) {
      return tokagentActionError("missing_vault_address", {
        hint: "Pass `vaultAddress` as a 0x-prefixed 20-byte address.",
      });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(rawVaultAddress)) {
      return tokagentActionError("invalid_vault_address", {
        provided: rawVaultAddress,
        expected: "0x-prefixed 20-byte hex address",
      });
    }
    const vaultAddress = rawVaultAddress as Address;

    const publicClient = getPublicClient(chainId);
    const chainConfig = getChainConfig(chainId);
    // No wallet client — verification is a pure view call.
    const factory = new TokagentFactoryClient(chainConfig.factoryProxy, publicClient);

    let isDeployed: boolean;
    try {
      isDeployed = await factory.isDeployedVault(vaultAddress);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return tokagentActionFailure(
        "registry_lookup_failed",
        `Could not verify vault ${vaultAddress} on ${chainNameRaw} — RPC error: ${msg.slice(0, 200)}`,
        { error: msg, chain: chainNameRaw, chainId },
      );
    }

    if (!isDeployed) {
      return tokagentActionFailure(
        "not_a_tokagent_vault",
        `Address ${vaultAddress} is not a deployed Tokagent vault on ${chainNameRaw}. Verify the address and chain match.`,
        { vaultAddress, chain: chainNameRaw, chainId },
      );
    }

    try {
      await persistVaultAddress(runtime, chainId, vaultAddress);
    } catch (persistErr) {
      // persistVaultAddress already swallows disk errors; this catch is
      // for the in-memory setSetting path. We still consider the action
      // a success (the user can manually edit .env if needed).
      console.warn(
        `[register-existing-vault] verified ${vaultAddress} but failed to persist setting: ${
          persistErr instanceof Error ? persistErr.message : String(persistErr)
        }`,
      );
    }

    return {
      success: true,
      text: `Vault ${vaultAddress} registered for ${chainNameRaw}. The agent will now route writes through it.`,
      data: { vault: vaultAddress, chainId, chain: chainNameRaw },
    } as ActionResult;
  },

  // ── Recovery is single-turn ─────────────────────────────────────────────
  // Unlike DEPLOY_TOKAGENT_VAULT (two-turn propose/confirm because it
  // burns gas), REGISTER_EXISTING_VAULT is a read + setting write. When
  // the user pastes "the vault was deployed at 0x... on hyperevm", the
  // agent should call this directly — no confirmation needed.
  examples: [
    [
      {
        name: "user",
        content: {
          text:
            "the vault was deployed at 0x9796aECE92498649377888bc94372cca312222ee on hyperevm",
        },
      },
      {
        name: "agent",
        content: {
          text:
            "Verifying that vault against the factory and registering it for hyperevm now.",
          actions: ["REGISTER_EXISTING_VAULT"],
        },
      },
    ],
    [
      {
        name: "user",
        content: {
          text:
            "the deploy looked broken but the contract is at 0x9796aECE92498649377888bc94372cca312222ee on hyperevm — use that one",
        },
      },
      {
        name: "agent",
        content: {
          text: "Recording that vault for hyperevm.",
          actions: ["REGISTER_EXISTING_VAULT"],
        },
      },
    ],
    [
      {
        name: "user",
        content: {
          text: "use existing vault 0x9796aECE92498649377888bc94372cca312222ee on polygon",
        },
      },
      {
        name: "agent",
        content: {
          text: "Verifying that address belongs to the Polygon factory before registering.",
          actions: ["REGISTER_EXISTING_VAULT"],
        },
      },
    ],
  ],
};
