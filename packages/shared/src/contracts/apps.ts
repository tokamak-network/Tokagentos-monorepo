/**
 * Shared app manager contracts.
 */

import type { IAgentRuntime } from "@tokagentos/core";

export type AppSessionMode = "viewer" | "spectate-and-steer" | "external";

export type AppSessionFeature =
  | "commands"
  | "telemetry"
  | "pause"
  | "resume"
  | "suggestions";

export type AppSessionControlAction = "pause" | "resume";
export type AppRunViewerAttachment = "attached" | "detached" | "unavailable";
export type AppRunHealthState = "healthy" | "degraded" | "offline";
export type AppRunCapabilityAvailability =
  | "available"
  | "unavailable"
  | "unknown";
export type AppRunEventKind =
  | "launch"
  | "refresh"
  | "attach"
  | "detach"
  | "stop"
  | "status"
  | "summary"
  | "health";
export type AppRunEventSeverity = "info" | "warning" | "error";

export type AppSessionJsonValue =
  | string
  | number
  | boolean
  | null
  | AppSessionJsonValue[]
  | { [key: string]: AppSessionJsonValue };

export interface AppViewerAuthMessage {
  type: string;
  authToken?: string;
  characterId?: string;
  sessionToken?: string;
  agentId?: string;
  followEntity?: string;
}

export interface AppSessionRecommendation {
  id: string;
  label: string;
  type?: string;
  reason?: string | null;
  priority?: number | null;
  command?: string | null;
}

export interface AppSessionActivityItem {
  id: string;
  type: string;
  message: string;
  timestamp?: number | null;
  severity?: "info" | "warning" | "error";
}

export interface AppViewerConfig {
  url: string;
  embedParams?: Record<string, string>;
  postMessageAuth?: boolean;
  sandbox?: string;
  authMessage?: AppViewerAuthMessage;
}

export interface AppSessionConfig {
  mode: AppSessionMode;
  features?: AppSessionFeature[];
}

export interface AppUiExtensionConfig {
  detailPanelId: string;
}

export interface RegistryAppSupports {
  v0: boolean;
  v1: boolean;
  v2: boolean;
}

export interface RegistryAppNpmInfo {
  package: string;
  v0Version: string | null;
  v1Version: string | null;
  v2Version: string | null;
}

export interface RegistryAppInfo {
  name: string;
  displayName: string;
  description: string;
  category: string;
  launchType: string;
  launchUrl: string | null;
  icon: string | null;
  /**
   * Absolute or app-scoped URL to a large hero image (ideally a 1024×1024
   * square webp) used as the card background on the apps page. Apps declare
   * this in their `package.json` under `tokagentos.app.heroImage` as a path
   * relative to the package root; the runtime rewrites the relative path
   * to `/api/apps/hero/<slug>` before surfacing the field to clients.
   */
  heroImage: string | null;
  capabilities: string[];
  stars: number;
  repository: string;
  latestVersion: string | null;
  supports: RegistryAppSupports;
  npm: RegistryAppNpmInfo;
  uiExtension?: AppUiExtensionConfig;
  viewer?: Omit<AppViewerConfig, "authMessage">;
  session?: AppSessionConfig;
}

export interface AppSessionState {
  sessionId: string;
  appName: string;
  mode: AppSessionMode;
  status: string;
  displayName?: string;
  agentId?: string;
  characterId?: string;
  followEntity?: string;
  canSendCommands?: boolean;
  controls?: AppSessionControlAction[];
  summary?: string | null;
  goalLabel?: string | null;
  suggestedPrompts?: string[];
  recommendations?: AppSessionRecommendation[];
  activity?: AppSessionActivityItem[];
  telemetry?: Record<string, AppSessionJsonValue> | null;
}

export interface AppSessionActionResult {
  success: boolean;
  message: string;
  session?: AppSessionState | null;
}

export interface AppRunHealth {
  state: AppRunHealthState;
  message: string | null;
}

export interface AppRunHealthFacet {
  state: AppRunHealthState | "unknown";
  message: string | null;
}

export interface AppRunHealthDetails {
  checkedAt: string | null;
  auth: AppRunHealthFacet;
  runtime: AppRunHealthFacet;
  viewer: AppRunHealthFacet;
  chat: AppRunHealthFacet;
  control: AppRunHealthFacet;
  message: string | null;
}

export interface AppRunEvent {
  eventId: string;
  kind: AppRunEventKind;
  severity: AppRunEventSeverity;
  message: string;
  createdAt: string;
  status?: string | null;
  details?: Record<string, AppSessionJsonValue> | null;
}

export interface AppRunAwaySummary {
  generatedAt: string;
  message: string;
  eventCount: number;
  since: string | null;
  until: string | null;
}

export interface AppRunSummary {
  runId: string;
  appName: string;
  displayName: string;
  pluginName: string;
  launchType: string;
  launchUrl: string | null;
  viewer: AppViewerConfig | null;
  session: AppSessionState | null;
  characterId: string | null;
  agentId: string | null;
  status: string;
  summary: string | null;
  startedAt: string;
  updatedAt: string;
  lastHeartbeatAt: string | null;
  supportsBackground: boolean;
  supportsViewerDetach: boolean;
  chatAvailability: AppRunCapabilityAvailability;
  controlAvailability: AppRunCapabilityAvailability;
  viewerAttachment: AppRunViewerAttachment;
  recentEvents: AppRunEvent[];
  awaySummary: AppRunAwaySummary | null;
  health: AppRunHealth;
  healthDetails: AppRunHealthDetails;
}

export interface AppRunActionResult {
  success: boolean;
  message: string;
  run?: AppRunSummary | null;
}

export type AppLaunchDiagnosticSeverity = "info" | "warning" | "error";

export interface AppLaunchDiagnostic {
  code: string;
  severity: AppLaunchDiagnosticSeverity;
  message: string;
}

export interface AppLaunchPreparation {
  diagnostics?: AppLaunchDiagnostic[];
  launchUrl?: string | null;
  viewer?: Omit<AppViewerConfig, "authMessage"> | null;
}

export interface AppLaunchResult {
  pluginInstalled: boolean;
  needsRestart: boolean;
  displayName: string;
  launchType: string;
  launchUrl: string | null;
  viewer: AppViewerConfig | null;
  session: AppSessionState | null;
  run: AppRunSummary | null;
  diagnostics?: AppLaunchDiagnostic[];
}

// ── App Session Contexts ──────────────────────────────────────────────────

/** Context available during app launch (before a run is started). */
export interface AppLaunchSessionContext {
  appName: string;
  launchUrl: string | null;
  runtime: IAgentRuntime | null;
  viewer: AppLaunchResult["viewer"] | null;
}

/** Context available during an active app run. */
export interface AppRunSessionContext extends AppLaunchSessionContext {
  runId?: string;
  session: AppSessionState | null;
}

export interface InstalledAppInfo {
  name: string;
  displayName: string;
  pluginName: string;
  version: string;
  installedAt: string;
}

export interface TokagentCuratedAppDefinition {
  slug: string;
  canonicalName: string;
  aliases: string[];
}

export interface AppStopResult {
  success: boolean;
  appName: string;
  runId: string | null;
  stoppedAt: string;
  pluginUninstalled: boolean;
  needsRestart: boolean;
  stopScope: "plugin-uninstalled" | "viewer-session" | "no-op";
  message: string;
}

function packageNameToBasename(packageName: string): string {
  return packageName
    .trim()
    .replace(/^@[^/]+\//, "")
    .trim();
}

export const TOKAGENT_CURATED_APP_DEFINITIONS: readonly TokagentCuratedAppDefinition[] =
  [
    {
      slug: "companion",
      canonicalName: "@tokagentos/app-companion",
      aliases: [],
    },
    {
      slug: "hyperscape",
      canonicalName: "@hyperscape/plugin-hyperscape",
      aliases: ["@tokagentos/app-hyperscape"],
    },
    {
      slug: "babylon",
      canonicalName: "@tokagentos/app-babylon",
      aliases: [],
    },
    {
      slug: "2004scape",
      canonicalName: "@tokagentos/app-2004scape",
      aliases: [],
    },
    {
      slug: "scape",
      canonicalName: "@tokagentos/app-scape",
      aliases: [],
    },
    {
      slug: "defense-of-the-agents",
      canonicalName: "@tokagentos/app-defense-of-the-agents",
      aliases: [],
    },
    {
      slug: "vincent",
      canonicalName: "@tokagentos/app-vincent",
      aliases: [],
    },
    {
      slug: "shopify",
      canonicalName: "@tokagentos/app-shopify",
      aliases: ["@tokagentos/plugin-shopify"],
    },
    {
      slug: "clawville",
      canonicalName: "@clawville/app-clawville",
      aliases: [],
    },
  ] as const;

function getTokagentCuratedAppMatchKeys(
  definition: TokagentCuratedAppDefinition,
): string[] {
  const keys = new Set<string>([
    definition.slug.trim().toLowerCase(),
    definition.canonicalName.trim().toLowerCase(),
  ]);

  for (const alias of definition.aliases) {
    const trimmed = alias.trim().toLowerCase();
    if (!trimmed) continue;
    keys.add(trimmed);

    const routeSlug = packageNameToAppRouteSlug(alias)?.trim().toLowerCase();
    if (routeSlug) {
      keys.add(routeSlug);
    }
  }

  const canonicalRouteSlug = packageNameToAppRouteSlug(definition.canonicalName)
    ?.trim()
    .toLowerCase();
  if (canonicalRouteSlug) {
    keys.add(canonicalRouteSlug);
  }

  return Array.from(keys);
}

const TOKAGENT_CURATED_APP_DEFINITION_BY_KEY = new Map<
  string,
  TokagentCuratedAppDefinition
>(
  TOKAGENT_CURATED_APP_DEFINITIONS.flatMap((definition) =>
    getTokagentCuratedAppMatchKeys(definition).map((key) => [key, definition]),
  ),
);

export function packageNameToAppRouteSlug(packageName: string): string | null {
  const basename = packageNameToBasename(packageName);
  if (!basename) return null;

  const withoutPrefix = basename.replace(/^(app|plugin)-/, "").trim();
  return withoutPrefix || basename;
}

export function packageNameToAppDisplayName(packageName: string): string {
  const slug =
    packageNameToAppRouteSlug(packageName) ??
    packageNameToBasename(packageName) ??
    packageName.trim();

  return slug
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function hasAppInterface(
  value: { kind?: string | null; appMeta?: unknown } | null | undefined,
): boolean {
  return Boolean(value && (value.kind === "app" || value.appMeta));
}

export function getTokagentCuratedAppDefinition(
  value: string,
): TokagentCuratedAppDefinition | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const directMatch = TOKAGENT_CURATED_APP_DEFINITION_BY_KEY.get(
    trimmed.toLowerCase(),
  );
  if (directMatch) {
    return directMatch;
  }

  const routeSlug = packageNameToAppRouteSlug(trimmed)?.trim().toLowerCase();
  if (!routeSlug) {
    return null;
  }

  return TOKAGENT_CURATED_APP_DEFINITION_BY_KEY.get(routeSlug) ?? null;
}

export function normalizeTokagentCuratedAppName(value: string): string | null {
  return getTokagentCuratedAppDefinition(value)?.canonicalName ?? null;
}

export function isTokagentCuratedAppName(value: string): boolean {
  return normalizeTokagentCuratedAppName(value) !== null;
}

// ---------------------------------------------------------------------------
// Curated app registry — allows plugins to register additional curated app
// definitions at runtime without modifying the hardcoded list.
// ---------------------------------------------------------------------------

const _registeredCuratedApps: TokagentCuratedAppDefinition[] = [];

/**
 * Register an additional curated app definition at runtime.
 * Plugins should call this during initialization to add their app to the
 * curated catalog.
 */
export function registerCuratedApp(def: TokagentCuratedAppDefinition): void {
  const existing = _registeredCuratedApps.findIndex((d) => d.slug === def.slug);
  if (existing >= 0) {
    _registeredCuratedApps[existing] = def;
  } else {
    _registeredCuratedApps.push(def);
  }
  // Rebuild the lookup map so runtime-registered apps are discoverable
  _rebuildCuratedAppLookup();
}

/**
 * Get all curated app definitions: hardcoded list merged with
 * runtime-registered apps. Runtime registrations with the same slug
 * override hardcoded entries.
 */
export function getCuratedAppDefinitions(): TokagentCuratedAppDefinition[] {
  const merged = new Map<string, TokagentCuratedAppDefinition>();
  for (const def of TOKAGENT_CURATED_APP_DEFINITIONS) {
    merged.set(def.slug, def);
  }
  for (const def of _registeredCuratedApps) {
    merged.set(def.slug, def);
  }
  return Array.from(merged.values());
}

function _rebuildCuratedAppLookup(): void {
  // Add registered apps to the mutable lookup map
  for (const def of _registeredCuratedApps) {
    for (const key of getTokagentCuratedAppMatchKeys(def)) {
      TOKAGENT_CURATED_APP_DEFINITION_BY_KEY.set(key, def);
    }
  }
}

export function getTokagentCuratedAppCatalogOrder(value: string): number {
  const canonicalName = normalizeTokagentCuratedAppName(value);
  if (!canonicalName) {
    return Number.MAX_SAFE_INTEGER;
  }

  const index = TOKAGENT_CURATED_APP_DEFINITIONS.findIndex(
    (definition) => definition.canonicalName === canonicalName,
  );
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

export function getTokagentCuratedAppLookupNames(value: string): string[] {
  const definition = getTokagentCuratedAppDefinition(value);
  if (!definition) {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return Array.from(
    new Set([
      definition.canonicalName,
      ...definition.aliases,
      definition.slug,
      ...definition.aliases
        .map((alias) => packageNameToAppRouteSlug(alias))
        .filter((alias): alias is string => Boolean(alias)),
      packageNameToAppRouteSlug(definition.canonicalName) ?? definition.slug,
    ]),
  );
}
