/**
 * Navigation — tabs + onboarding.
 */

import type { LucideIcon } from "lucide-react";
import { Gamepad2, KeyRound } from "lucide-react";

/** Built-in tab identifiers. */
export type BuiltinTab = "operator";

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

export const ALL_TAB_GROUPS: TabGroup[] = [
  {
    label: "Operator",
    tabs: ["operator"],
    icon: KeyRound,
    description:
      "Local operator console — x402 credits & agent-to-agent network",
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
  /** Icon for new groups (lucide component). Falls back to Gamepad2. */
  icon?: LucideIcon;
  /** Description for new groups. */
  description?: string;
}

/** Compute visible tab groups. Accepts optional dynamic plugin-provided tabs. */
export function getTabGroups(dynamicTabs?: DynamicNavTab[]): TabGroup[] {
  const groups = [...ALL_TAB_GROUPS];

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
          icon: dt.icon ?? Gamepad2,
          description: dt.description,
        });
      }
    }
  }

  return groups;
}

const TAB_PATHS: Record<BuiltinTab, string> = {
  operator: "/operator",
};

/** Legacy path redirects — retired paths all redirect to the operator console. */
const LEGACY_PATHS: Record<string, Tab> = {
  "/": "operator",
  "/settings": "operator",
  "/chat": "operator",
  "/billing": "operator",
  "/inventory": "operator",
  "/wallets": "operator",
  "/automations": "operator",
  "/apps": "operator",
  "/browser": "operator",
  "/stream": "operator",
  "/connectors": "operator",
  "/character": "operator",
  "/companion": "operator",
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

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const normalized = normalizePathForLookup(pathname, basePath);
  if (normalized === "/") return "operator";

  // Check current paths first, then legacy redirects
  return PATH_TO_TAB.get(normalized) ?? LEGACY_PATHS[normalized] ?? "operator";
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

export function titleForTab(tab: Tab): string {
  switch (tab) {
    case "operator":
      return "Operator";
    default:
      return tab.charAt(0).toUpperCase() + tab.slice(1).replace(/-/g, " ");
  }
}
