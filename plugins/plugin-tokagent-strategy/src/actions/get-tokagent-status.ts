/**
 * GET_TOKAGENT_STATUS — discovery action.
 *
 * The first thing a Tokagent agent should call when the user opens
 * with a vague question ("what can you do?", "where are we?", "what's
 * running?"). Returns a structured snapshot the LLM can describe to
 * the user without inventing state.
 *
 * Complements the `vaultContext` provider (which gets read every turn
 * implicitly): this action exposes the same data through the explicit
 * action surface so the LLM can chain it deterministically — e.g.
 *   user: "what's going on?"
 *   agent: GET_TOKAGENT_STATUS → describes vaults + strategies + wallet
 *
 * No network calls; reads runtime settings + persistence only.
 */

import type { Action, ActionResult, IAgentRuntime } from "@tokagentos/core";
import { SUPPORTED_CHAIN_IDS } from "@tokagent/plugin-tokagent-shared";
import { loadStrategies } from "../persistence.js";

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

export const getTokagentStatusAction: Action = {
  name: "GET_TOKAGENT_STATUS",
  description:
    "Use FIRST when the user opens with a vague question about the agent ('what can you do?', 'what's running?', 'where are we?', 'what do you know?'). " +
    "Returns a structured snapshot of deployed Tokagent vaults (per chain), wallet readiness, and active/draft strategies. " +
    "Read the snapshot before suggesting next steps so you don't invent state.",
  similes: [
    "what can you do",
    "what is the status",
    "what's running",
    "where are we",
    "show me the dashboard",
    "summarize my setup",
    "what do you know about my account",
  ],
  parameters: [],
  validate: async () => true,
  handler: async (runtime, _msg, _state, _opts): Promise<ActionResult> => {
    const reader = toReader(runtime);

    const vaultsPerChain = [...SUPPORTED_CHAIN_IDS].map((chainId) => ({
      chainId,
      chain: chainSlug(chainId),
      vaultAddress: reader.getSetting(`TOKAGENT_VAULT_ADDRESS_${chainId}`) ?? null,
    }));
    const deployedVaults = vaultsPerChain.filter((v) => v.vaultAddress !== null);

    const wallet = {
      evm:
        reader.getSetting("TOKAGENT_MANAGED_EVM_ADDRESS") ??
        reader.getSetting("EVM_WALLET_ADDRESS") ??
        null,
      solana: reader.getSetting("SOLANA_WALLET_ADDRESS") ?? null,
    };

    let strategiesByStatus: Record<string, number> = {};
    let strategyError: string | null = null;
    try {
      const all = await loadStrategies(reader);
      strategiesByStatus = all.reduce(
        (acc, s) => {
          const status = String(s.status ?? "unknown");
          acc[status] = (acc[status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
    } catch (err) {
      strategyError = err instanceof Error ? err.message : String(err);
    }

    const supportedChains = vaultsPerChain.map((v) => v.chain);
    const supportedKinds = [
      "yield-auto-compound",
      "polymarket-value-hunt",
      "perp-funding-arb",
    ];

    return {
      success: true,
      data: {
        vaults: vaultsPerChain,
        deployedVaultsCount: deployedVaults.length,
        wallet,
        strategiesByStatus,
        strategyError,
        supportedChains,
        supportedKinds,
        availableActions: [
          "DEPLOY_TOKAGENT_VAULT",
          "BUILD_STRATEGY",
          "LIST_STRATEGIES",
          "START_STRATEGY",
          "STOP_STRATEGY",
          "BACKTEST_STRATEGY",
          "OPEN_PERP_POSITION",
          "CLOSE_PERP_POSITION",
          "GET_PERPS_MARKET_INFO",
          "DEPOSIT_TO_AAVE",
          "WITHDRAW_FROM_AAVE",
          "DESCRIBE_POLYMARKET_MARKET",
        ],
      },
    } as ActionResult;
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "what can you do?" },
      },
      {
        name: "agent",
        content: {
          text:
            "Reading state… you have no vault deployed yet. I can compose strategies, deploy a Tokagent vault on hyperevm/polygon/ethereum, run perp trades on Hyperliquid, place Polymarket bets, or earn yield on Aave. Want me to deploy a vault?",
          action: "GET_TOKAGENT_STATUS",
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "where are we?" },
      },
      {
        name: "agent",
        content: {
          text:
            "Pulling status. One vault on hyperevm (0x…), 2 strategies active. EVM wallet ready, Solana not configured.",
          action: "GET_TOKAGENT_STATUS",
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "summarize my setup" },
      },
      {
        name: "agent",
        content: {
          text:
            "Checking. No vault deployed, no strategies, EVM wallet configured. Ready to deploy a vault when you tell me which chain and what to run on it.",
          action: "GET_TOKAGENT_STATUS",
        },
      },
    ],
    [
      {
        name: "user",
        content: { text: "what do you know about my account" },
      },
      {
        name: "agent",
        content: {
          text:
            "Reading runtime state — vaults, wallet, and strategies. I don't see any deployed vaults yet; want me to walk through deployment?",
          action: "GET_TOKAGENT_STATUS",
        },
      },
    ],
  ],
};
