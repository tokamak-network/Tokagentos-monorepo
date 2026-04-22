/**
 * Tokagent-specific core plugin set. This file is applied by scaffold.ts as a
 * post-clone overlay over the upstream elizaOS `core-plugins.ts`. The Tokagent
 * product intentionally ships a minimal plugin surface tailored to DeFi
 * operations — upstream's wider plugin catalog is removed to keep the scaffold
 * install small and the agent focused.
 */

export const DESKTOP_ONLY_PLUGINS: readonly string[] = [];

/** Core plugins always loaded. Minimal set for the Tokagent product. */
export const CORE_PLUGINS: readonly string[] = [
  // Database adapter — required
  "@elizaos/plugin-sql",
  // Local embeddings — required for memory
  "@elizaos/plugin-local-embedding",
  // Tokagent product plugins — DeFi surface
  "@tokagent/plugin-tokagent-yield",
  "@tokagent/plugin-tokagent-perps",
  "@tokagent/plugin-tokagent-polymarket",
];

/**
 * Plugins auto-enabled from environment / character config. Kept minimal.
 * LLM provider plugins (plugin-openai, plugin-anthropic, etc.) continue to be
 * auto-loaded by the upstream PROVIDER_PLUGINS map in plugin-auto-enable.ts
 * based on the character's modelProvider field — no entries needed here.
 */
export const OPTIONAL_CORE_PLUGINS: readonly string[] = [];
