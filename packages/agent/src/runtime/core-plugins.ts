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
export const DESKTOP_ONLY_PLUGINS: readonly string[] = ["agent-orchestrator"];

/** Core plugins that should always be loaded. collectPluginNames() seeds from this list only. */
export const CORE_PLUGINS: readonly string[] = [
  "@tokagentos/plugin-sql", // database adapter — required
  "@tokagentos/plugin-local-embedding", // local embeddings — required for memory
  // @tokagentos/app-form — now built-in as advanced capability (form); enabled when advancedCapabilities: true
  "@tokagentos/app-companion", // VRM companion emotes; actions gated until app session is active
  // @tokagentos/plugin-agent-orchestrator — opt-in via TOKAGENT_AGENT_ORCHESTRATOR (Tokagent app enables by default)
  "@tokagentos/plugin-cron", // scheduled jobs and automation
  "@tokagentos/plugin-shell", // shell command execution
  "@tokagentos/plugin-agent-skills", // skill execution and marketplace runtime
  "@tokagentos/plugin-commands", // slash command handling (skills auto-register as /commands)
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
  "@tokagentos/plugin-pdf", // PDF processing (published bundle broken in alpha.15)
  "@tokagentos/plugin-cua", // CUA computer-use agent (cloud sandbox automation)
  "@tokagentos/plugin-obsidian", // Obsidian vault CLI integration
  "@tokagentos/plugin-code", // code writing and file operations
  "@tokagentos/plugin-repoprompt", // RepoPrompt CLI integration and workflow orchestration
  "@tokagentos/plugin-claude-code-workbench", // Claude Code companion workflows for this monorepo
  "@tokagentos/plugin-computeruse", // computer use automation (requires platform-specific binaries)
  "@tokagentos/plugin-browser", // browser automation (requires stagehand-server)
  "@tokagentos/plugin-vision", // vision/image understanding (feature-gated)
  "@tokagentos/plugin-cli", // CLI interface
  "@tokagentos/plugin-discord", // Discord bot integration
  "@tokagentos/plugin-discord-local", // Local Discord desktop integration for macOS
  "@tokagentos/plugin-bluebubbles", // BlueBubbles-backed iMessage integration for macOS
  "@tokagentos/plugin-telegram", // Telegram bot integration
  "@tokagentos/plugin-signal", // Signal user-account integration
  "@tokagentos/plugin-twitch", // Twitch integration
  "@tokagentos/plugin-edge-tts", // text-to-speech (Microsoft Edge TTS)
  "@tokagentos/plugin-elevenlabs", // ElevenLabs text-to-speech
  "@tokagentos/plugin-music-library", // music metadata, library, playlists, YouTube search
  "@tokagentos/plugin-music-player", // music playback engine + streaming routes
  // "@tokagentos/plugin-directives", // directive processing - not yet ready
  // "@tokagentos/plugin-mcp", // MCP protocol support - not yet ready
  // "@tokagentos/plugin-scheduling", // scheduling - not yet ready
  // clipboard: now built-in as advanced capability (advancedCapabilities: true)
];
