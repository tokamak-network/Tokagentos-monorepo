/**
 * @tokagentos/shared — Browser-safe code shared between agent and app-core.
 * Use subpath imports for granular access (e.g. @tokagentos/shared/contracts).
 */

export * from "./connectors";
export { migrateLegacyRuntimeConfig } from "./contracts/onboarding";
export * from "./env-utils";
export * from "./recent-messages-state";
export * from "./restart";
export * from "./runtime-env";
export {
  isTokagentSettingsDebugEnabled,
  sanitizeForSettingsDebug,
  settingsDebugCloudSummary,
} from "./settings-debug";
export { sanitizeSpeechText } from "./spoken-text";
export * from "./type-guards";
export * from "./types";
