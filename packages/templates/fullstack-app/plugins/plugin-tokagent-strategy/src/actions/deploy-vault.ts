import type { Action, ActionResult } from "@elizaos/core";
import {
  TokagentFactoryClient,
  getChainConfig,
  getPublicClient,
  getWalletClient,
  resolveAgentPrivateKey,
  findPack,
  SUPPORTED_CHAIN_IDS,
  tokagentActionError,
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
        return {
          success: false,        } as ActionResult;
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
      return { success: false,} as ActionResult;
    }

    const publicClient = getPublicClient(chainId);
    const walletClient = getWalletClient(chainId, privateKey);

    const chainConfig = getChainConfig(chainId);
    const factory = new TokagentFactoryClient(chainConfig.factoryProxy, publicClient, walletClient);

    // Operator defaults to the wallet's account address
    const operator: Address =
      (params.operator as Address | undefined) ?? (walletClient.account?.address as Address);
    if (!operator) {
      return { success: false,} as ActionResult;
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
      return {
        success: true,
        text: `Deployed TokagentVault on ${chainName} at ${vault}. Operator: ${operator}. Packs: ${packIds.join(", ")}. Tx: ${txHash}`,
        data: { vault, txHash, chainId, operator, packs: packIds },
      } as ActionResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,        data: { error: msg },
      } as ActionResult;
    }
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "Deploy me a vault on Polygon with Aave" },
      },
      {
        name: "agent",
        content: {
          text: "Deploying a TokagentVault on Polygon with the aave-v3-polygon pack allowlisted.",
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
          text: "Deploying a TokagentVault on HyperEVM with the hyperliquid-perps pack (defaults).",
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
          text: "You'll need a vault first. Deploying a TokagentVault on HyperEVM with the hyperliquid-perps pack — once it's live I'll build the strategy.",
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
          text: "I need a vault on Polygon to run an Aave yield strategy. Deploying one now with the aave-v3-polygon pack.",
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
          text: "Deploying a TokagentVault on HyperEVM with the hyperliquid-perps pack.",
          actions: ["DEPLOY_TOKAGENT_VAULT"],
        },
      },
    ],
  ],
};
