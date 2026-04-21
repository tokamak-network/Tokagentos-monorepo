/**
 * Orchestrator-only settings table for `tokagent/packages/app-core/scripts/dev-platform.mjs`.
 * Plain string (figlet heading + framed table + footer); TTY color applied by dev-platform.
 */
import { prependDevSubsystemFigletHeading } from "@tokagentos/shared/dev-settings-figlet-heading";
import { formatDevSettingsTable } from "@tokagentos/shared/dev-settings-table";
import {
  resolveDesktopApiPortPreference,
  resolveDesktopUiPortPreference,
} from "@tokagentos/shared/runtime-env";

/**
 * @param {object} p
 * @returns {string}
 */
export function formatOrchestratorDesktopDevBanner(p) {
  const {
    worktreePath,
    worktreeLoaded,
    skipApi,
    forceRenderer,
    forceRendererCli,
    viteWatch,
    viteRollupWatch,
    viteDevServer,
    viteDepForce,
    viteDepForceCli,
    viteRollupWatchCli,
    ranInitialViteBuild,
    rendererStaleReason,
    preferredApiPort,
    allocatedApiPort,
    preferredUiPort,
    allocatedUiPort,
    screenshotServerEnabled,
    screenshotPort,
    screenshotTokenRedacted,
    screenshotProxyUrl,
    desktopDevLogPath,
    desktopDevLogOptOut,
    childrenList,
    tokagentNamespace,
    tokagentNamespaceUnset,
  } = p;

  const apiPref = resolveDesktopApiPortPreference(process.env);
  const uiPref = resolveDesktopUiPortPreference(process.env);

  let pipeline = "static dist only (no Vite child)";
  if (viteDevServer) pipeline = "vite dev (HMR)";
  else if (viteRollupWatch) pipeline = "vite build --watch (Rollup)";

  const rendererSource = ranInitialViteBuild
    ? forceRendererCli
      ? "cli — --force-renderer"
      : forceRenderer && !forceRendererCli
        ? "env set — TOKAGENT_DESKTOP_RENDERER_BUILD"
        : `derived — ${rendererStaleReason ?? "dist stale vs sources"}`
    : "default — dist up to date (skipped initial vite build)";

  const rendererChange =
    "bun run dev:desktop -- --force-renderer or TOKAGENT_DESKTOP_RENDERER_BUILD=always; omit to follow mtime heuristic";

  /** @type {import("@tokagentos/shared/dev-settings-table").DevSettingsRow[]} */
  const rows = [
    {
      setting: ".env.worktree",
      effective: worktreeLoaded ? worktreePath : "—",
      source: worktreeLoaded
        ? `file — ${worktreePath}`
        : "default (not present)",
      change: worktreeLoaded
        ? "edit file to change ports/state; bash scripts/worktree-env.sh <slot>"
        : "bash scripts/worktree-env.sh <slot> to generate",
    },
    {
      setting: "--no-api",
      effective: skipApi ? "on" : "off",
      source: skipApi ? "cli — --no-api" : "default (off)",
      change: "bun run dev:desktop -- --no-api to skip API child",
    },
    {
      setting: "--force-renderer / TOKAGENT_DESKTOP_RENDERER_BUILD",
      effective: forceRenderer ? "on" : "off",
      source: forceRendererCli
        ? "cli — --force-renderer"
        : process.env.TOKAGENT_DESKTOP_RENDERER_BUILD?.trim()
          ? `env set — TOKAGENT_DESKTOP_RENDERER_BUILD=${process.env.TOKAGENT_DESKTOP_RENDERER_BUILD}`
          : "default (off — follow mtime)",
      change:
        "unset TOKAGENT_DESKTOP_RENDERER_BUILD or omit --force-renderer for default skip-when-fresh",
    },
    {
      setting: "Initial vite build (apps/app/dist)",
      effective: ranInitialViteBuild ? "ran" : "skipped",
      source: rendererSource,
      change: rendererChange,
    },
    {
      setting: "TOKAGENT_DESKTOP_VITE_WATCH",
      effective: viteWatch ? "1" : "0",
      source: viteWatch
        ? "env set — TOKAGENT_DESKTOP_VITE_WATCH=1 (root package.json dev script sets this)"
        : "default (unset — 0)",
      change:
        "bun run dev sets 1; bun run dev:desktop leaves unset/0 for static dist + faster path",
    },
    {
      setting: "Renderer pipeline",
      effective: pipeline,
      source: "derived — from watch + rollup flags",
      change:
        "TOKAGENT_DESKTOP_VITE_BUILD_WATCH=1 + watch=1 for Rollup; else dev server when watch=1",
    },
    {
      setting: "--vite-force / TOKAGENT_VITE_FORCE / TOKAGENT_VITE_FORCE",
      effective: viteDepForce ? "on" : "off",
      source: viteDepForceCli
        ? "cli — --vite-force"
        : process.env.TOKAGENT_VITE_FORCE === "1"
          ? "env set — TOKAGENT_VITE_FORCE=1"
          : process.env.TOKAGENT_VITE_FORCE === "1"
            ? "env set — TOKAGENT_VITE_FORCE=1"
            : "default (off)",
      change:
        "bun run dev:desktop -- --vite-force or export TOKAGENT_VITE_FORCE=1; unset to disable",
    },
    {
      setting: "--rollup-watch / TOKAGENT_DESKTOP_VITE_BUILD_WATCH",
      effective: viteRollupWatch ? "on" : "off",
      source: viteRollupWatchCli
        ? "cli — --rollup-watch"
        : viteRollupWatch
          ? "env set — TOKAGENT_DESKTOP_VITE_BUILD_WATCH=1"
          : "default (off)",
      change:
        "requires TOKAGENT_DESKTOP_VITE_WATCH=1; bun run dev:desktop -- --rollup-watch or set env",
    },
    {
      setting: "API port (preference)",
      effective: String(preferredApiPort),
      source: apiPref.sourceLabel,
      change: apiPref.changeLabel,
    },
    {
      setting: "API port (allocated for children)",
      effective: String(allocatedApiPort),
      source:
        allocatedApiPort === preferredApiPort
          ? "derived — same as preference"
          : `derived — preferred ${preferredApiPort} busy, next free loopback`,
      change:
        allocatedApiPort === preferredApiPort
          ? "free conflicting listeners or set TOKAGENT_API_PORT to a free port"
          : `unset env ports to retry default, or set TOKAGENT_API_PORT=${allocatedApiPort} explicitly`,
    },
  ];

  if (viteDevServer) {
    rows.push(
      {
        setting: "UI port (preference)",
        effective: String(preferredUiPort),
        source: uiPref.sourceLabel,
        change: uiPref.changeLabel,
      },
      {
        setting: "UI port (allocated for Vite dev)",
        effective: String(allocatedUiPort),
        source:
          allocatedUiPort === preferredUiPort
            ? "derived — same as preference"
            : `derived — preferred ${preferredUiPort} busy`,
        change:
          allocatedUiPort === preferredUiPort
            ? "export TOKAGENT_PORT=<free port> if needed"
            : `export TOKAGENT_PORT=${allocatedUiPort} to pin`,
      },
    );
  } else {
    rows.push({
      setting: "TOKAGENT_PORT (Vite dev UI)",
      effective: "—",
      source: "default (not used — no Vite dev child)",
      change: "enable TOKAGENT_DESKTOP_VITE_WATCH=1 without Rollup-only mode",
    });
  }

  rows.push(
    {
      setting: "TOKAGENT_DESKTOP_SCREENSHOT_SERVER",
      effective: screenshotServerEnabled ? "on" : "off",
      source: screenshotServerEnabled
        ? process.env.TOKAGENT_DESKTOP_SCREENSHOT_SERVER === "1"
          ? "env set — TOKAGENT_DESKTOP_SCREENSHOT_SERVER=1"
          : "default (on)"
        : "env set — opt-out (0/false/no/off)",
      change:
        "export TOKAGENT_DESKTOP_SCREENSHOT_SERVER=0 to disable; unset for default on",
    },
    {
      setting: "TOKAGENT_SCREENSHOT_SERVER_PORT",
      effective: screenshotPort,
      source: process.env.TOKAGENT_SCREENSHOT_SERVER_PORT?.trim()
        ? `env set — TOKAGENT_SCREENSHOT_SERVER_PORT=${screenshotPort}`
        : "default (31339)",
      change: "export TOKAGENT_SCREENSHOT_SERVER_PORT=<port>",
    },
    {
      setting: "TOKAGENT_SCREENSHOT_SERVER_TOKEN",
      effective: screenshotTokenRedacted,
      source: screenshotServerEnabled
        ? "generated — random per orchestrator run"
        : "default (not generated)",
      change:
        "set by orchestrator when screenshot server on; redacted in table",
    },
    {
      setting: "TOKAGENT_ELECTROBUN_SCREENSHOT_URL (API child)",
      effective: screenshotServerEnabled && !skipApi ? screenshotProxyUrl : "—",
      source:
        screenshotServerEnabled && !skipApi
          ? "derived — orchestrator sets for API"
          : skipApi
            ? "default (n/a — --no-api)"
            : "default (n/a — screenshot off)",
      change:
        "set automatically when screenshot enabled; API proxies /api/dev/cursor-screenshot",
    },
    {
      setting: "TOKAGENT_DESKTOP_DEV_LOG",
      effective: desktopDevLogOptOut ? "off" : "on",
      source: desktopDevLogOptOut
        ? "env set — TOKAGENT_DESKTOP_DEV_LOG=0"
        : "default (on)",
      change: "export TOKAGENT_DESKTOP_DEV_LOG=0 to disable aggregated file",
    },
    {
      setting: "TOKAGENT_DESKTOP_DEV_LOG_PATH",
      effective: desktopDevLogPath ?? "—",
      source: desktopDevLogPath
        ? "derived — orchestrator sets path + passes to children"
        : "default (disabled)",
      change:
        "orchestrator writes .tokagent/desktop-dev-console.log when enabled",
    },
    {
      setting: "Children spawned",
      effective: childrenList,
      source: "derived",
      change: "controlled by flags above (e.g. --no-api removes api)",
    },
    {
      setting: "TOKAGENT_NAMESPACE (Vite child env)",
      effective: tokagentNamespace,
      source: tokagentNamespaceUnset
        ? "default (tokagent)"
        : `env set — TOKAGENT_NAMESPACE=${tokagentNamespace}`,
      change: "export TOKAGENT_NAMESPACE=<ns> or unset for tokagent",
    },
    {
      setting: "ELECTROBUN_SKIP_CODESIGN",
      effective: "1",
      source: "derived — dev-platform sets for Electrobun child",
      change: "set by orchestrator (dev only)",
    },
    {
      setting: "TOKAGENT_HEADLESS (API child)",
      effective: skipApi ? "—" : "1",
      source: skipApi ? "default (n/a)" : "derived — dev-platform sets for API",
      change: "set by orchestrator for headless API + runtime",
    },
  );

  const table = formatDevSettingsTable(
    "Desktop dev orchestrator — coordination",
    rows,
  );
  const footer =
    "Per-process settings: Vite, API, and Electrobun print their own tables below.\n" +
    "Other env: inherited process.env; see docs/apps/desktop-local-development.md and @tokagentos/shared/runtime-env.\n";
  return prependDevSubsystemFigletHeading(
    "orchestrator",
    `${table}\n${footer}`,
  );
}
