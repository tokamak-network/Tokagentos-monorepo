import type { Action, ActionResult } from "@tokagentos/core";
import {
  TokagentFactoryClient,
  getChainConfig,
  getPublicClient,
  getWalletClient,
  resolveAgentPrivateKey,
  findPack,
  SUPPORTED_CHAIN_IDS,
  tokagentActionError,
  tokagentActionFailure,
  type ProtocolPack,
  type AllowlistEntry,
  type ApprovalSpec,
} from "@tokagent/plugin-tokagent-shared";
import type { Address, Hex } from "viem";

const CHAIN_IDS_BY_NAME: Record<string, number> = {
  ethereum: 1,
  mainnet: 1,
  eth: 1,
  polygon: 137,
  matic: 137,
  hyperevm: 999,
  hyper: 999,
};

export const deployTokagentVaultAction: Action = {
  name: "DEPLOY_TOKAGENT_VAULT",
  description:
    "Use to provision a new TokagentVault on-chain BEFORE building or running any strategy. " +
    "Deploys a custody-wrapper smart contract pre-allowlisted for one or more DeFi protocol packs (Aave, Hyperliquid perps, etc.). " +
    "Returns the deployed vault address and tx hash. Defaults: chain='hyperevm', packs=['hyperliquid-perps-hyperevm'] (polygon→['aave-v3-polygon'], ethereum→[]).",
  similes: [
    "deploy vault",
    "create tokagent vault",
    "new vault",
    "set up vault",
    "create a tokagent vault for polygon",
  ],
  parameters: [
    {
      name: "chain",
      description: "Optional. Chain to deploy on: 'ethereum', 'polygon', or 'hyperevm'. Defaults to 'hyperevm'.",
      required: false,
      schema: { type: "string", enum: ["ethereum", "polygon", "hyperevm"] },
    },
    {
      name: "packs",
      description:
        "Optional. Protocol packs to allowlist at deploy time. Available: 'aave-v3-polygon', 'hyperliquid-perps-hyperevm'. " +
        "Defaults: hyperevm→['hyperliquid-perps-hyperevm'], polygon→['aave-v3-polygon'], ethereum→[].",
      required: false,
      schema: { type: "array", items: { type: "string" } },
    },
    {
      name: "operator",
      description:
        "Optional operator address. Defaults to the agent's hot-wallet address derived from TOKAGENT_PRIVATE_KEY.",
      required: false,
      schema: { type: "string" },
    },
  ],

  validate: async (runtime) => {
    try {
      // Build a minimal runtime-like adapter — getSetting on IAgentRuntime may
      // return string | boolean | number | null; AgentRuntimeLike expects string | undefined.
      const runtimeLike = {
        getSetting: (key: string): string | undefined => {
          const v = runtime.getSetting(key);
          if (v === null || v === undefined) return undefined;
          return String(v) || undefined;
        },
      };
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

    // Default chain to "hyperevm" if not provided
    const chainNameRaw = String(params.chain ?? "")
      .toLowerCase()
      .trim();
    const chainName = chainNameRaw || "hyperevm";

    const chainId = CHAIN_IDS_BY_NAME[chainName];
    if (!chainId || !SUPPORTED_CHAIN_IDS.has(chainId)) {
      return tokagentActionError("invalid_chain", { provided: chainName });
    }

    // Default packs per chain when not provided
    const DEFAULT_PACKS_BY_CHAIN_ID: Record<number, string[]> = {
      999: ["hyperliquid-perps-hyperevm"],
      137: ["aave-v3-polygon"],
      1: [],
    };
    const packIds = Array.isArray(params.packs) && params.packs.length > 0
      ? (params.packs as string[])
      : (DEFAULT_PACKS_BY_CHAIN_ID[chainId] ?? []);

    // Resolve packs
    const packs: ProtocolPack[] = [];
    for (const pid of packIds) {
      const pack = findPack(pid, chainId);
      if (!pack) {
        return tokagentActionFailure(
          "unknown_pack",
          `Vault deploy aborted — protocol pack "${pid}" is not available on ${chainName}.`,
          { pack: pid, chain: chainName, chainId },
        );
      }
      packs.push(pack);
    }

    const entries: AllowlistEntry[] = packs.flatMap((p) =>
      p.entries.map((e) => ({ target: e.target, selector: e.selector, humanLabel: e.humanLabel })),
    );
    const approvals: ApprovalSpec[] = packs.flatMap((p) =>
      p.approvals.map((a) => ({
        token: a.token,
        spender: a.spender,
        humanLabel: a.humanLabel,
      })),
    );

    const runtimeLike = {
      getSetting: (key: string): string | undefined => {
        const v = runtime.getSetting(key);
        if (v === null || v === undefined) return undefined;
        return String(v) || undefined;
      },
    };

    let privateKey: Hex;
    try {
      privateKey = resolveAgentPrivateKey(runtimeLike);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return tokagentActionFailure(
        "private_key_missing",
        "Vault deploy aborted — operator private key is not configured. Set TOKAGENT_PRIVATE_KEY in .env.",
        { error: msg },
      );
    }

    const publicClient = getPublicClient(chainId);
    const walletClient = getWalletClient(chainId, privateKey);

    const chainConfig = getChainConfig(chainId);
    const factory = new TokagentFactoryClient(chainConfig.factoryProxy, publicClient, walletClient);

    // Operator defaults to the wallet's account address
    const operator: Address =
      (params.operator as Address | undefined) ?? (walletClient.account?.address as Address);
    if (!operator) {
      return tokagentActionFailure(
        "operator_unresolved",
        "Vault deploy aborted — could not resolve an operator address. Pass `operator` explicitly or configure TOKAGENT_PRIVATE_KEY.",
      );
    }

    const userSalt: Hex = `0x${Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("")}` as Hex;

    try {
      const { vault, txHash } = await factory.deployTokagentVault({
        operator,
        initialAllowlist: entries,
        initialApprovals: approvals,
        userSalt,
      });
      // CRITICAL: persist the deployed vault address so subsequent turns
      // (vaultContextProvider, BUILD_STRATEGY default-resolution) can
      // see it. Without this, the cascade is: deploy succeeds → next
      // turn's [vault-context] still says "none deployed" → BUILD_STRATEGY
      // returns no_vault_for_chain → LLM hallucinates "build failed".
      try {
        await runtime.setSetting(
          `TOKAGENT_VAULT_ADDRESS_${chainId}`,
          vault,
        );
      } catch (persistErr) {
        // Persistence failure shouldn't undo the deploy — log and continue.
        console.warn(
          `[deploy-vault] vault deployed at ${vault} but failed to persist setting: ${
            persistErr instanceof Error ? persistErr.message : String(persistErr)
          }`,
        );
      }
      return {
        success: true,
        text: `Vault deploy CONFIRMED on-chain on ${chainName} at ${vault}. Operator: ${operator}. Packs: ${packIds.join(", ")}. Tx: ${txHash}`,
        data: { vault, txHash, chainId, operator, packs: packIds },
      } as ActionResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return tokagentActionFailure(
        "vault_deploy_failed",
        `Vault deploy failed on-chain: ${msg.slice(0, 240)}`,
        { error: msg, chain: chainName, chainId },
      );
    }
  },

  // ── Two-turn pattern ────────────────────────────────────────────────────
  // Turn 1: PROPOSE in future tense, end with a question, do NOT emit the
  //   action (`actions: []`). The agent commits to nothing yet.
  // Turn 2: only after user confirms, EXECUTE with `actions: ["DEPLOY_..."]`.
  // Never use "i'm deploying" / "deploying now" on the proposal turn —
  // that's a lie until the receipt confirms on-chain.
  examples: [
    [
      {
        name: "user",
        content: { text: "Deploy me a vault on Polygon with Aave" },
      },
      {
        name: "agent",
        content: {
          text: "I can deploy a TokagentVault on Polygon with the aave-v3-polygon pack allowlisted. Confirm and I'll submit the on-chain tx.",
          actions: [],
        },
      },
      { name: "user", content: { text: "yes" } },
      {
        name: "agent",
        content: {
          text: "Submitting now.",
          actions: ["DEPLOY_TOKAGENT_VAULT"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "deploy a vault" },
      },
      {
        name: "agent",
        content: {
          text: "I'll default to hyperevm with the hyperliquid-perps pack — that fits a perp-trading workflow. Confirm or tell me a different chain (polygon for Aave, ethereum for plain custody).",
          actions: [],
        },
      },
      { name: "user", content: { text: "go" } },
      {
        name: "agent",
        content: {
          text: "Submitting deploy.",
          actions: ["DEPLOY_TOKAGENT_VAULT"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "I want to start a perp funding arb strategy" },
      },
      {
        name: "agent",
        content: {
          text: "You'll need a vault first. The fit is hyperevm + hyperliquid-perps pack. I can deploy that now and then build the strategy on it — confirm?",
          actions: [],
        },
      },
      { name: "user", content: { text: "yes please" } },
      {
        name: "agent",
        content: {
          text: "Deploying the vault first; I'll build the strategy once the deploy confirms.",
          actions: ["DEPLOY_TOKAGENT_VAULT"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "make a strategy that earns yield" },
      },
      {
        name: "agent",
        content: {
          text: "Yield runs on Polygon Aave. I'd deploy a TokagentVault on Polygon with the aave-v3-polygon pack first, then build the strategy. Confirm?",
          actions: [],
        },
      },
      { name: "user", content: { text: "yes" } },
      {
        name: "agent",
        content: {
          text: "Deploying the vault.",
          actions: ["DEPLOY_TOKAGENT_VAULT"],
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "set up a custody wrapper on hyperevm" },
      },
      {
        name: "agent",
        content: {
          text: "I'll deploy a TokagentVault on HyperEVM with the hyperliquid-perps pack. Confirm and I'll submit.",
          actions: [],
        },
      },
      { name: "user", content: { text: "do it" } },
      {
        name: "agent",
        content: {
          text: "Submitting.",
          actions: ["DEPLOY_TOKAGENT_VAULT"],
        },
      },
    ],
  ],
};
