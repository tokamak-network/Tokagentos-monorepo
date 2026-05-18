/**
 * Environment variable normalization helpers.
 *
 * Consolidates the `normalizeSecret` / `normalizeEnvValue` pattern that was
 * independently implemented in cloud-connection.ts, steward-bridge.ts, and
 * server-wallet-trade.ts.
 */

/**
 * Normalize an env value: trim whitespace, return `undefined` for empty/missing.
 * Accepts `unknown` so callers don't need to narrow first (useful for config objects).
 */
export function normalizeEnvValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Same as `normalizeEnvValue` but returns `null` instead of `undefined`.
 * Convenient when building option objects where `null` means "absent".
 */
export function normalizeEnvValueOrNull(value: unknown): string | null {
  return normalizeEnvValue(value) ?? null;
}

/**
 * Returns `true` if a boolean-ish env var is falsy (`"0"`, `"false"`, `"off"`, `"no"`).
 * Missing or empty values return `false` (i.e. the feature is enabled by default).
 */
export function isEnvDisabled(value: string | undefined): boolean {
  const raw = value?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "0" || raw === "false" || raw === "off" || raw === "no";
}

/**
 * Sync app brand env vars → tokagentOS equivalents.
 * Extracted from identical copies in runtime/tokagent.ts, api/server.ts,
 * api/server-wallet-trade.ts, api/server-startup.ts, and api/server-security.ts.
 */
export {
  syncBrandEnvToTokagent,
  syncTokagentEnvToBrand,
} from "../config/boot-config.js";

import {
  getBootConfig,
  syncBrandEnvToTokagent,
  syncTokagentEnvToBrand,
} from "../config/boot-config.js";

export function syncAppEnvToTokagent(): void {
  const aliases = getBootConfig().envAliases;
  if (aliases) syncBrandEnvToTokagent(aliases);
}

export function syncTokagentEnvAliases(): void {
  const aliases = getBootConfig().envAliases;
  if (aliases) syncTokagentEnvToBrand(aliases);
}

// Backward-compat alias (elizaOS pre-rename)
export const syncElizaEnvAliases = syncTokagentEnvAliases;
export const syncAppEnvToEliza = syncAppEnvToTokagent;
