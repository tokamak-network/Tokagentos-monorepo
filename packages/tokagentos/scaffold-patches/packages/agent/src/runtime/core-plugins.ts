/**
 * Tokagent-specific core plugin set. This file is applied by scaffold.ts as a
 * post-clone overlay over the upstream elizaOS `core-plugins.ts`. The Tokagent
 * product intentionally ships a minimal plugin surface tailored to DeFi
 * operations — upstream's wider plugin catalog is removed to keep the scaffold
 * install small and the agent focused.
 *
 * Execution mode is chosen at agent-boot time via TOKAGENT_EXECUTION_MODE:
 *   - "vault"  (default) — TokagentVault custody model. All writes go through
 *                          the vault's allowlisted executeBatch; plugin-evm is
 *                          NOT loaded so the LLM can't bypass the vault.
 *   - "direct"           — plugin-evm is loaded; Tokagent vault-write plugins
 *                          (yield/perps/polymarket) are NOT loaded. The agent
 *                          signs txs directly from the hot wallet with no
 *                          allowlist.
 *   - "both"             — everything loaded. LLM picks per request. Less safe
 *                          because a misrouted action can drain the wrong wallet.
 */

const EXECUTION_MODE = (process.env.TOKAGENT_EXECUTION_MODE ?? "vault").toLowerCase();
const VALID_MODES = new Set(["vault", "direct", "both"]);
if (!VALID_MODES.has(EXECUTION_MODE)) {
  throw new Error(
    `Invalid TOKAGENT_EXECUTION_MODE: "${EXECUTION_MODE}". Must be "vault" | "direct" | "both".`,
  );
}

// Tokagent → upstream env mirror.
// The Tokagent plugins read TOKAGENT_PRIVATE_KEY (vault custody model). The
// upstream wallet UI (/wallet page, balance API, getWalletAddresses) reads
// EVM_PRIVATE_KEY. Mirror so a single env entry feeds both surfaces.
//
// For RPC: TOKAGENT_RPC_URL is the user-facing knob. Two mirrors are needed:
//   - EVM_PROVIDER_URL / ETHEREUM_PROVIDER_URL satisfy our agent's
//     `rpcReady` capability gate (server-helpers.ts, wallet-capability.ts).
//   - ETHEREUM_PROVIDER_MAINNET satisfies plugin-evm's per-chain RPC
//     resolver (plugins/plugin-evm/typescript/rpc-providers.ts). Without
//     this, plugin-evm's createPublicClient falls back to viem's default
//     mainnet RPC (eth.merkle.io), which is currently slow/unreliable —
//     wallet balance reads time out even though our gate passes.
//
// For other chains (base, polygon, arbitrum…), set ETHEREUM_PROVIDER_<CHAIN>
// directly in .env. Tokagent's single TOKAGENT_RPC_URL is mainnet-only.
//
// This runs at module load — before any agent code derives addresses.
function mirrorTokagentEnvAlias(from: string, to: string): void {
  const src = process.env[from]?.trim();
  if (src && !process.env[to]?.trim()) {
    process.env[to] = src;
  }
}
mirrorTokagentEnvAlias("TOKAGENT_PRIVATE_KEY", "EVM_PRIVATE_KEY");
mirrorTokagentEnvAlias("TOKAGENT_RPC_URL", "EVM_PROVIDER_URL");
mirrorTokagentEnvAlias("TOKAGENT_RPC_URL", "ETHEREUM_PROVIDER_URL");
mirrorTokagentEnvAlias("TOKAGENT_RPC_URL", "ETHEREUM_PROVIDER_MAINNET");
mirrorTokagentEnvAlias("TOKAGENT_RPC_URL", "EVM_PROVIDER_MAINNET");
// ETHEREUM_RPC_URL is what the upstream wallet UI's balance fetcher
// (wallet-rpc.ts → wallet-evm-balance.ts) reads for direct-RPC mainnet
// fallback when no Alchemy key is set.
mirrorTokagentEnvAlias("TOKAGENT_RPC_URL", "ETHEREUM_RPC_URL");

export const DESKTOP_ONLY_PLUGINS: readonly string[] = [];

const BASE_PLUGINS: readonly string[] = [
  // Database adapter — required
  "@elizaos/plugin-sql",
  // Local embeddings — required for memory
  "@elizaos/plugin-local-embedding",
  // Strategy orchestration (BUILD_STRATEGY, LIST/START/STOP, backtest,
  // DEPLOY_TOKAGENT_VAULT). Always-on: the deploy action needs to work even
  // in direct mode so a user can migrate to vault-mode later.
  "@tokagent/plugin-tokagent-strategy",
];

const VAULT_PLUGINS: readonly string[] = [
  "@tokagent/plugin-tokagent-yield",
  "@tokagent/plugin-tokagent-perps",
  "@tokagent/plugin-tokagent-polymarket",
];

const DIRECT_PLUGINS: readonly string[] = [
  // EVM wallet/chain-data — hot-wallet-scoped balance + transfer actions.
  // Bypasses the TokagentVault allowlist; only loaded when the operator
  // explicitly opts into direct mode.
  "@elizaos/plugin-evm",
];

/** Core plugins always loaded. Composition depends on TOKAGENT_EXECUTION_MODE. */
export const CORE_PLUGINS: readonly string[] = [
  ...BASE_PLUGINS,
  ...(EXECUTION_MODE === "vault" || EXECUTION_MODE === "both" ? VAULT_PLUGINS : []),
  ...(EXECUTION_MODE === "direct" || EXECUTION_MODE === "both" ? DIRECT_PLUGINS : []),
];

/**
 * Plugins auto-enabled from environment / character config. Kept minimal.
 * LLM provider plugins (plugin-openai, plugin-anthropic, etc.) continue to be
 * auto-loaded by the upstream PROVIDER_PLUGINS map in plugin-auto-enable.ts
 * based on the character's modelProvider field — no entries needed here.
 */
export const OPTIONAL_CORE_PLUGINS: readonly string[] = [];
