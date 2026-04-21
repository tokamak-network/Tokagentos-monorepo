import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to `tokagent/packages/native-plugins` (Capacitor + Electrobun plugin packages).
 * Resolved from `apps/app/scripts/` so build scripts and repo utilities share one root.
 */
export const NATIVE_PLUGINS_ROOT = path.resolve(
  __dirname,
  "../../../tokagent/packages/native-plugins",
);

/** Short names of each workspace package under {@link NATIVE_PLUGINS_ROOT}. */
export const CAPACITOR_PLUGIN_NAMES = [
  "gateway",
  "swabble",
  "camera",
  "screencapture",
  "canvas",
  "desktop",
  "location",
  "mobile-signals",
  "talkmode",
  "agent",
  "websiteblocker",
  // Imported as side-effects by
  // tokagent/packages/app-core/src/platform/native-plugin-entrypoints.ts
  // — must be built before vite's dep scan, or resolution fails.
  "llama",
  "appblocker",
];
