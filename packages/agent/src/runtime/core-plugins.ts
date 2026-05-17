/**
 * Core plugin package lists shared by runtime startup and the API server.
 *
 * Keeping this in a standalone module avoids a circular dependency between
 * `api/server.ts` and `runtime/tokagent.ts`.
 */

/**
 * Plugins that depend on PTY/native workspace tooling.
 * Keep them out of cloud images where those binaries are intentionally absent.
 */
export const DESKTOP_ONLY_PLUGINS: readonly string[] = [];

/** Core plugins that should always be loaded. collectPluginNames() seeds from this list only. */
export const CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql", // database adapter — required
  "@elizaos/plugin-local-embedding", // local embeddings — required for memory
  // @tokagentos/app-form — now built-in as advanced capability (form); enabled when advancedCapabilities: true
  "@tokagentos/app-companion", // VRM companion emotes; actions gated until app session is active
  "@elizaos/plugin-agent-skills", // skill execution and marketplace runtime
  "@tokagent/plugin-tokagent-billing", // Web3 credit billing — registers routes + middleware; no-op unless BILLING_ENABLED=true
  "@tokagentos/app-lifeops", // LifeOps: personal ops — tasks, goals, calendar, inbox, browser companions, website blocking
  // Built-in runtime capabilities (no longer external plugins):
  // - experience, form, clipboard, personality: advanced capabilities (advancedCapabilities: true)
  // - trust: core capability (enableTrust: true)
  // - secrets-manager: core capability (enableSecretsManager: true)
  // - plugin-manager: core capability (enablePluginManager: true)
  // - knowledge, relationships, trajectories: native features
];

/**
 * Plugins that can be enabled from the admin panel.
 * Not loaded by default — require explicit configuration or have platform dependencies.
 */
export const OPTIONAL_CORE_PLUGINS: readonly string[] = [
  // plugin-manager, secrets-manager, trust: now built-in core capabilities
  // Enable via character settings: ENABLE_PLUGIN_MANAGER, ENABLE_SECRETS_MANAGER, ENABLE_TRUST
  // "@tokagentos/app-lifeops" — moved to CORE_PLUGINS above
  "@elizaos/plugin-pdf", // PDF processing (published bundle broken in alpha.15)
  "@elizaos/plugin-cua", // CUA computer-use agent (cloud sandbox automation)
  "@elizaos/plugin-obsidian", // Obsidian vault CLI integration
  "@elizaos/plugin-code", // code writing and file operations
  "@elizaos/plugin-repoprompt", // RepoPrompt CLI integration and workflow orchestration
  "@elizaos/plugin-claude-code-workbench", // Claude Code companion workflows for this monorepo
  "@elizaos/plugin-browser", // browser automation (requires stagehand-server)
  "@elizaos/plugin-vision", // vision/image understanding (feature-gated)
  "@elizaos/plugin-discord", // Discord bot integration
  "@elizaos/plugin-discord-local", // Local Discord desktop integration for macOS
  "@elizaos/plugin-bluebubbles", // BlueBubbles-backed iMessage integration for macOS
  "@elizaos/plugin-telegram", // Telegram bot integration
  "@elizaos/plugin-signal", // Signal user-account integration
  "@elizaos/plugin-twitch", // Twitch integration
  "@elizaos/plugin-elevenlabs", // ElevenLabs text-to-speech
  // "@elizaos/plugin-directives", // directive processing - not yet ready
  // "@elizaos/plugin-mcp", // MCP protocol support - not yet ready
  // "@elizaos/plugin-scheduling", // scheduling - not yet ready
  // clipboard: now built-in as advanced capability (advancedCapabilities: true)
];
