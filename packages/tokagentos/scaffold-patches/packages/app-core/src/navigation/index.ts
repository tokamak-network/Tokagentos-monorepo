/**
 * Navigation — tabs + onboarding.
 *
 * Tokagent scaffold-patch: restricts ALL_TAB_GROUPS to Chat, Automations, and
 * Settings. The upstream groups (Apps, Character, Wallet, Browser, Stream) are
 * intentionally removed for the Tokagent DeFi product.
 *
 * Type exports and helper signatures are kept identical to upstream so
 * downstream consumers (navigation hooks, view routers) type-check without
 * modification.
 */

import type { LucideIcon } from "lucide-react";
import { Clock3, MessageSquare, Settings } from "lucide-react";

/** Built-in tab identifiers. */
export type BuiltinTab =
  | "chat"
  | "lifeops"
  | "tasks"
  | "automations"
  | "browser"
  | "companion"
  | "stream"
  | "apps"
  | "character"
  | "character-select"
  | "inventory"
  | "knowledge"
  | "connectors"
  | "triggers"
  | "plugins"
  | "skills"
  | "advanced"
  | "fine-tuning"
  | "trajectories"
  | "relationships"
  | "memories"
  | "rolodex"
  | "voice"
  | "runtime"
  | "database"
  | "desktop"
  | "settings"
  | "logs";

/**
 * Tab identifier — includes all built-in tabs plus arbitrary strings
 * for dynamic plugin-provided nav-page widgets.
 */
export type Tab = BuiltinTab | (string & {});

export interface TabGroup {
  label: string;
  tabs: Tab[];
  icon: LucideIcon;
  description?: string;
}

/**
 * Tokagent product tab groups — Chat, Automations, Settings only.
 * Connectors tab is excluded from Chat since we are not shipping connector
 * plugins in this product.
 */
export const ALL_TAB_GROUPS: TabGroup[] = [
  {
    label: "Chat",
    tabs: ["chat"],
    icon: MessageSquare,
    description: "Conversations with your agent",
  },
  {
    label: "Automations",
    tabs: ["automations"],
    icon: Clock3,
    description: "Tasks, scheduled tasks, and recurring workflows",
  },
  {
    label: "Settings",
    tabs: ["settings"],
    icon: Settings,
    description: "Configuration and preferences",
  },
];

/** A plugin-provided nav-page widget that should appear in the navigation. */
export interface DynamicNavTab {
  /** Tab ID — used as the route path segment. */
  tabId: string;
  /** Human-readable label for the nav button. */
  label: string;
  /** Which existing TabGroup to join, or a new group label to create. */
  navGroup?: string;
  /** Icon for new groups (lucide component). Falls back to Settings. */
  icon?: LucideIcon;
  /** Description for new groups. */
  description?: string;
}

/**
 * Compute visible tab groups.
 *
 * The `streamEnabled`, `walletEnabled`, and `browserEnabled` parameters are
 * accepted for API compatibility with upstream callers but are ignored —
 * groups are always the three Tokagent-configured tabs.
 */
export function getTabGroups(
  _streamEnabled?: boolean,
  _walletEnabled?: boolean,
  _browserEnabled?: boolean,
  dynamicTabs?: DynamicNavTab[],
): TabGroup[] {
  const groups: TabGroup[] = ALL_TAB_GROUPS.map((g) => ({ ...g, tabs: [...g.tabs] }));

  // Merge dynamic plugin-provided nav-page tabs into groups.
  if (dynamicTabs?.length) {
    for (const dt of dynamicTabs) {
      const targetGroup = dt.navGroup
        ? groups.find((g) => g.label === dt.navGroup)
        : null;
      if (targetGroup) {
        if (!targetGroup.tabs.includes(dt.tabId)) {
          targetGroup.tabs.push(dt.tabId);
        }
      } else {
        // Create a new group for this tab.
        groups.push({
          label: dt.label,
          tabs: [dt.tabId],
          icon: dt.icon ?? Settings,
          description: dt.description,
        });
      }
    }
  }

  return groups;
}

const TAB_PATHS: Record<BuiltinTab, string> = {
  chat: "/chat",
  lifeops: "/apps/lifeops",
  tasks: "/apps/tasks",
  browser: "/browser",
  companion: "/companion",
  stream: "/stream",
  apps: "/apps",
  character: "/character",
  "character-select": "/character/select",
  automations: "/automations",
  triggers: "/automations",
  inventory: "/inventory",
  knowledge: "/character/knowledge",
  connectors: "/connectors",
  plugins: "/apps/plugins",
  skills: "/apps/skills",
  advanced: "/apps/fine-tuning",
  "fine-tuning": "/apps/fine-tuning",
  trajectories: "/apps/trajectories",
  relationships: "/apps/relationships",
  memories: "/apps/memories",
  rolodex: "/rolodex",
  voice: "/settings/voice",
  runtime: "/apps/runtime",
  database: "/apps/database",
  desktop: "/desktop",
  settings: "/settings",
  logs: "/apps/logs",
};

/** Legacy path redirects — old paths that now map to new tabs. */
const LEGACY_PATHS: Record<string, Tab> = {
  "/game": "apps",
  "/agent": "character",
  "/wallets": "inventory",
  "/features": "plugins",
  "/admin": "fine-tuning",
  "/config": "settings",
  "/triggers": "automations",
  "/heartbeats": "automations",
  // Old top-level paths that moved under /character/
  "/character-select": "character-select",
  "/knowledge": "knowledge",
  // Old top-level paths that moved under /apps/
  "/lifeops": "lifeops",
  "/tasks": "automations",
  "/plugins": "plugins",
  "/skills": "skills",
  "/advanced": "fine-tuning",
  "/fine-tuning": "fine-tuning",
  "/trajectories": "trajectories",
  "/relationships": "relationships",
  "/memories": "memories",
  "/runtime": "runtime",
  "/database": "database",
  "/logs": "logs",
  // Old/legacy connector paths
  "/connectors": "connectors",
  "/settings/connectors": "connectors",
  "/voice": "settings",
  // /companion stays as a legacy redirect — companion is now an overlay app at /apps/companion
  "/companion": "chat",
};

const PATH_TO_TAB = new Map(
  Object.entries(TAB_PATHS).map(([tab, p]) => [p, tab as Tab]),
);

function normalizePathForLookup(pathname: string, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  let p = pathname || "/";
  if (base) {
    if (p === base) p = "/";
    else if (p.startsWith(`${base}/`)) p = p.slice(base.length);
  }
  let normalized = normalizePath(p).toLowerCase();
  if (normalized.endsWith("/index.html")) normalized = "/";
  return normalized;
}

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const p = TAB_PATHS[tab as BuiltinTab] ?? `/${tab}`;
  return base ? `${base}${p}` : p;
}

export function isRouteRootPath(pathname: string, basePath = ""): boolean {
  return normalizePathForLookup(pathname, basePath) === "/";
}

export function resolveInitialTabForPath(
  pathname: string,
  fallbackTab: Tab,
  basePath = "",
): Tab {
  if (isRouteRootPath(pathname, basePath)) {
    return fallbackTab;
  }
  return tabFromPath(pathname, basePath) ?? fallbackTab;
}

/** Known apps-tool sub-paths under /apps/ (not actual app slugs). */
const APPS_SUB_TABS: Record<string, Tab> = {
  lifeops: "lifeops",
  tasks: "automations",
  plugins: "plugins",
  skills: "skills",
  "fine-tuning": "fine-tuning",
  trajectories: "trajectories",
  relationships: "relationships",
  memories: "memories",
  runtime: "runtime",
  database: "database",
  logs: "logs",
  // Note: "companion" is intentionally NOT here — /apps/companion is an app slug
  // that AppsView auto-launches as an overlay, not a tool tab.
};

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const normalized = normalizePathForLookup(pathname, basePath);
  if (normalized === "/") return "chat";

  if (
    normalized === "/node-catalog" ||
    normalized === "/automations/node-catalog"
  ) {
    return "automations";
  }

  // /apps/<sub> — known tool tabs resolve to their tab; everything else is an app slug
  if (normalized.startsWith("/apps/")) {
    const sub = normalized.slice("/apps/".length);
    return APPS_SUB_TABS[sub] ?? "apps";
  }

  // /character/<sub> — resolve nested character paths
  if (normalized.startsWith("/character/")) {
    const sub = normalized.slice("/character/".length);
    if (sub === "knowledge") return "knowledge";
    if (sub === "select") return "character-select";
    return "character";
  }

  // /settings/<sub> — resolve nested settings paths
  if (normalized.startsWith("/settings/")) {
    const sub = normalized.slice("/settings/".length);
    if (sub === "connectors") return "connectors";
    if (sub === "voice") return "settings";
    return "settings";
  }

  // Check current paths first, then legacy redirects
  return PATH_TO_TAB.get(normalized) ?? LEGACY_PATHS[normalized] ?? null;
}

function normalizeBasePath(basePath: string): string {
  if (!basePath) return "";
  let base = basePath.trim();
  if (!base.startsWith("/")) base = `/${base}`;
  if (base === "/") return "";
  if (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

function normalizePath(p: string): string {
  if (!p) return "/";
  let normalized = p.trim();
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (normalized.length > 1 && normalized.endsWith("/"))
    normalized = normalized.slice(0, -1);
  return normalized;
}

/**
 * Extract an app slug from a `/apps/<slug>` path.
 * Returns `null` when the path doesn't contain a slug segment.
 */
export function getAppSlugFromPath(
  pathname: string,
  basePath = "",
): string | null {
  const normalized = normalizePathForLookup(pathname, basePath);
  if (!normalized.startsWith("/apps/")) return null;
  const slug = normalized.slice("/apps/".length);
  return slug || null;
}

export function titleForTab(tab: Tab): string {
  switch (tab) {
    case "chat":
      return "Chat";
    case "lifeops":
      return "LifeOps";
    case "browser":
      return "Browser";
    case "companion":
      return "Companion";
    case "apps":
      return "Apps";
    case "character":
      return "Character";
    case "character-select":
      return "Character Select";
    case "automations":
      return "Automations";
    case "triggers":
      return "Automations";
    case "inventory":
      return "Wallet";
    case "knowledge":
      return "Knowledge";
    case "connectors":
      return "Connectors";
    case "plugins":
      return "Plugins";
    case "skills":
      return "Skills";
    case "advanced":
      return "Fine-Tuning";
    case "fine-tuning":
      return "Fine-Tuning";
    case "trajectories":
      return "Trajectories";
    case "relationships":
      return "Relationships";
    case "memories":
      return "Memories";
    case "rolodex":
      return "Rolodex";
    case "voice":
      return "Voice";
    case "runtime":
      return "Runtime";
    case "database":
      return "Databases";
    case "settings":
      return "Settings";
    case "logs":
      return "Logs";
    case "stream":
      return "Stream";
    default:
      // Dynamic plugin tabs — capitalize the tab ID as a fallback title.
      return tab.charAt(0).toUpperCase() + tab.slice(1).replace(/-/g, " ");
  }
}
