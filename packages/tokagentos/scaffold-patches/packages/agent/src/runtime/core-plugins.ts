/**
 * Tokagent overlay over upstream eliza's `core-plugins.ts`.
 *
 * Strategy: keep upstream's plugin list **verbatim** so the elizaOS chat
 * surface (companion, cron, shell, agent-skills, commands, lifeops, browser-
 * bridge, …) loads exactly as designed. On top of that we ADD the Tokagent
 * plugins (strategy + yield + perps + polymarket) and `@elizaos/plugin-evm`
 * for direct hot-wallet flows.
 *
 * Source of truth for the upstream lists: eliza/develop
 *   packages/agent/src/runtime/core-plugins.ts
 * When upstream adds a plugin, mirror it here.
 *
 * Env mirroring: Tokagent's user-facing env knobs are TOKAGENT_PRIVATE_KEY
 * and TOKAGENT_RPC_URL. The upstream wallet UI / plugin-evm read
 * EVM_PRIVATE_KEY, EVM_PROVIDER_URL, ETHEREUM_PROVIDER_URL,
 * ETHEREUM_PROVIDER_MAINNET, ETHEREUM_RPC_URL, EVM_PROVIDER_MAINNET. Mirror
 * at module load — before any agent code derives addresses.
 */

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
mirrorTokagentEnvAlias("TOKAGENT_RPC_URL", "ETHEREUM_RPC_URL");

/**
 * Plugins that depend on PTY/native workspace tooling.
 * Keep them out of cloud images where those binaries are intentionally absent.
 * (Upstream verbatim.)
 */
export const DESKTOP_ONLY_PLUGINS: readonly string[] = ["agent-orchestrator"];

/**
 * Tokagent vault-execution plugins — build the strategy orchestrator + the
 * 3 vault-write integrations on top of upstream eliza. Always loaded so the
 * agent can describe + execute Tokamak vault flows from chat regardless of
 * which other capabilities the user enables.
 */
const TOKAGENT_PLUGINS: readonly string[] = [
  "@tokagent/plugin-tokagent-strategy", // BUILD_STRATEGY, DEPLOY_TOKAGENT_VAULT, backtest
  "@tokagent/plugin-tokagent-yield", // Aave deposit/withdraw via vault allowlist
  "@tokagent/plugin-tokagent-perps", // Hyperliquid perps via vault allowlist
  "@tokagent/plugin-tokagent-polymarket", // Polymarket buy/sell/redeem via vault allowlist
];

/** Core plugins always loaded. Upstream list, then Tokagent overlays. */
export const CORE_PLUGINS: readonly string[] = [
  // ── upstream verbatim ──────────────────────────────────────────────────
  "@elizaos/plugin-sql",
  "@elizaos/plugin-local-embedding",
  "@elizaos/app-companion",
  "@elizaos/plugin-cron",
  "@elizaos/plugin-app-control",
  "@elizaos/plugin-shell",
  "@elizaos/plugin-agent-skills",
  "@elizaos/plugin-commands",
  "@elizaos/app-lifeops",
  "@elizaos/plugin-browser-bridge",
  // ── tokagent additions ─────────────────────────────────────────────────
  "@elizaos/plugin-evm", // EVM wallet for direct hot-wallet flows
  ...TOKAGENT_PLUGINS,
];

/**
 * Plugins that can be enabled from the admin panel.
 * Not loaded by default — require explicit configuration or have platform
 * dependencies. Upstream verbatim.
 */
export const OPTIONAL_CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-pdf",
  "@elizaos/plugin-cua",
  "@elizaos/plugin-obsidian",
  "@elizaos/plugin-code",
  "@elizaos/plugin-repoprompt",
  "@elizaos/plugin-claude-code-workbench",
  "@elizaos/plugin-computeruse",
  "@elizaos/plugin-browser",
  "@elizaos/plugin-vision",
  "@elizaos/plugin-cli",
  "@elizaos/plugin-discord",
  "@elizaos/plugin-discord-local",
  "@elizaos/plugin-bluebubbles",
  "@elizaos/plugin-telegram",
  "@elizaos/plugin-signal",
  "@elizaos/plugin-twitch",
  "@elizaos/plugin-edge-tts",
  "@elizaos/plugin-elevenlabs",
  "@elizaos/plugin-music-library",
  "@elizaos/plugin-music-player",
];
