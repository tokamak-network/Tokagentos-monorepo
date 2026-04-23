import type { Action, ActionResult } from "@tokagentos/core";
import {
  TokagentFactoryClient,
  getChainConfig,
  getPublicClient,
  getWalletClient,
  resolveAgentPrivateKey,
  findPack,
  SUPPORTED_CHAIN_IDS,
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
    "Deploy a new TokagentVault smart contract on a chain, pre-configured for one or more DeFi protocols. The vault becomes the user's custody wrapper — they deposit funds into it, and the agent operator can invoke allowlisted protocol functions on their behalf.",
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
      description: "Chain to deploy on: 'ethereum', 'polygon', or 'hyperevm'.",
      required: true,
      schema: { type: "string", enum: ["ethereum", "polygon", "hyperevm"] },
    },
    {
      name: "packs",
      description:
        "Protocol packs to allowlist at deploy time. Available: 'aave-v3-polygon'. Repeatable.",
      required: true,
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

    const chainName = String(params.chain ?? "")
      .toLowerCase()
      .trim();
    const packIds = Array.isArray(params.packs) ? (params.packs as string[]) : [];

    const chainId = CHAIN_IDS_BY_NAME[chainName];
    if (!chainId || !SUPPORTED_CHAIN_IDS.has(chainId)) {
      return {
        success: false,
        text: `Unsupported chain '${chainName}'. Supported: ethereum, polygon, hyperevm.`,
      } as ActionResult;
    }
    if (packIds.length === 0) {
      return {
        success: false,
        text: "No protocol packs specified. Example: packs=['aave-v3-polygon'] for Aave v3 yield on Polygon.",
      } as ActionResult;
    }

    // Resolve packs
    const packs: ProtocolPack[] = [];
    for (const pid of packIds) {
      const pack = findPack(pid, chainId);
      if (!pack) {
        return {
          success: false,
          text: `Unknown pack '${pid}' for chain '${chainName}'. Available for chain ${chainId}: run LIST_PROTOCOL_PACKS to see options.`,
        } as ActionResult;
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
      return { success: false, text: msg } as ActionResult;
    }

    const publicClient = getPublicClient(chainId);
    const walletClient = getWalletClient(chainId, privateKey);

    const chainConfig = getChainConfig(chainId);
    const factory = new TokagentFactoryClient(chainConfig.factoryProxy, publicClient, walletClient);

    // Operator defaults to the wallet's account address
    const operator: Address =
      (params.operator as Address | undefined) ?? (walletClient.account?.address as Address);
    if (!operator) {
      return { success: false, text: "Could not resolve operator address." } as ActionResult;
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
        success: false,
        text: `Vault deploy failed: ${msg}. Check: (1) TOKAGENT_PRIVATE_KEY is set; (2) the deployer has gas on ${chainName}; (3) the factory at ${chainConfig.factoryProxy} has the Tokagent code store configured.`,
        data: { error: msg },
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
          text: "I'll deploy a TokagentVault on Polygon with the Aave v3 pack allowlisted. Using the default operator.",
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "Create a tokagent vault for yield farming" },
      },
      {
        name: "agent",
        content: {
          text: "Setting up a Polygon vault with aave-v3-polygon pack.",
        },
      },
    ],
  ],
};
