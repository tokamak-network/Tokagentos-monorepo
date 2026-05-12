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

function mirrorTokagentEnvAliasOverride(from: string, to: string): void {
  const src = process.env[from]?.trim();
  if (src) {
    process.env[to] = src;
  }
}

/**
 * LiteLLM Proxy support. When LITELLM_API_KEY and LITELLM_BASE_URL are both
 * set, mirror them (and the optional model-name knobs) onto the OPENAI_*
 * names that @elizaos/plugin-openai consumes natively. Override semantics:
 * if a user has both LITELLM_* and OPENAI_*, LiteLLM wins.
 *
 * Coupled validation: if only one of {LITELLM_API_KEY, LITELLM_BASE_URL} is
 * set, suppress the mirror entirely. Mirroring just the key would route the
 * virtual key against api.openai.com and produce a confusing 401; mirroring
 * just the URL would change the OpenAI plugin's endpoint while keeping the
 * real OpenAI key, which is also wrong.
 */
function configureLitellmEnvMirror(): void {
  const hasKey = !!process.env.LITELLM_API_KEY?.trim();
  const hasUrl = !!process.env.LITELLM_BASE_URL?.trim();
  if (hasKey !== hasUrl) {
    console.warn(
      "[tokagent] LITELLM_API_KEY and LITELLM_BASE_URL must be set together; one is missing — skipping LiteLLM mirror. Either set both or neither.",
    );
    return;
  }
  if (!hasKey) {
    return;
  }
  const willOverride =
    !!process.env.OPENAI_API_KEY?.trim() ||
    !!process.env.OPENAI_BASE_URL?.trim();
  if (willOverride) {
    console.warn(
      "[tokagent] LITELLM_* env vars detected; overriding OPENAI_*",
    );
  }
  mirrorTokagentEnvAliasOverride("LITELLM_API_KEY", "OPENAI_API_KEY");
  mirrorTokagentEnvAliasOverride("LITELLM_BASE_URL", "OPENAI_BASE_URL");
  mirrorTokagentEnvAliasOverride("LITELLM_SMALL_MODEL", "OPENAI_SMALL_MODEL");
  mirrorTokagentEnvAliasOverride("LITELLM_LARGE_MODEL", "OPENAI_LARGE_MODEL");
}
configureLitellmEnvMirror();

/**
 * Plugins that depend on PTY/native workspace tooling.
 * Keep them out of cloud images where those binaries are intentionally absent.
 * (Upstream verbatim.)
 */
export const DESKTOP_ONLY_PLUGINS: readonly string[] = ["agent-orchestrator"];

/**
 * Mobile-safe core plugins. Used when `MILADY_PLATFORM=android` (or `ios`).
 *
 * Phones cannot host the desktop-only chat surface (PTY, ffmpeg, osascript,
 * /usr/bin/open, etc.), so the upstream mobile boot ships only the SQL
 * adapter. Tokagent's vault-execution flows need a wallet, signed RPC, and
 * a desktop UI; running them on mobile is out of scope for now. Mirror
 * upstream verbatim so `plugin-collector.ts`'s import resolves; if a future
 * mobile build needs the Tokagent plugins, add them here explicitly after
 * verifying they have no native deps.
 */
export const MOBILE_CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql",
];

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
  // Phase 9 (Z46): billing plugin auto-loads in setup-only mode.
  // Plugin.init() short-circuits when BILLING_ENABLED=false (no-op log and return),
  // so auto-loading is safe — it only makes the SETUP_BILLING action reachable
  // before the operator has configured billing. The kill switch is BILLING_ENABLED.
  "@tokagent/plugin-tokagent-billing",
];

/** Core plugins always loaded. Upstream list, then Tokagent overlays. */
export const CORE_PLUGINS: readonly string[] = [
  // ── upstream essentials kept for the chat surface ─────────────────────
  "@elizaos/plugin-sql", // database adapter (required)
  "@elizaos/plugin-local-embedding", // memory embeddings (required)
  "@elizaos/app-companion", // VRM companion + emote dispatch
  "@elizaos/plugin-app-control", // launch/close apps from chat
  "@elizaos/plugin-shell", // shell command execution
  "@elizaos/plugin-agent-skills", // skill execution + marketplace
  "@elizaos/plugin-commands", // slash command handling
  "@elizaos/plugin-browser-bridge", // companion browser bridge
  // ── upstream extras NOT loaded by default ─────────────────────────────
  // Removed because the upstream plugin-installer cache resolves them
  // via runtime-imports paths that break inter-plugin requires
  // (`Cannot find module '../../../plugins/plugin-browser-bridge/src/...`).
  // Tokagent's strategy runner schedules its own ticks, so plugin-cron
  // isn't required; LifeOps is a personal-ops product surface that's not
  // core to the vault-operator persona. Re-enable individually via
  // OPTIONAL_CORE_PLUGINS or character config if a deployment needs them.
  //   "@elizaos/plugin-cron",
  //   "@elizaos/app-lifeops",
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
