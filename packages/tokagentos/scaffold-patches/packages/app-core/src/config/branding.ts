import { createContext, useContext } from "react";

/**
 * Custom provider that apps can inject into the onboarding flow.
 * Uses `string` for id/family so apps aren't restricted to the built-in union.
 */
export interface CustomProviderOption {
  id: string;
  name: string;
  envKey: string | null;
  pluginName: string;
  keyPrefix: string | null;
  description: string;
  family: string;
  authMode: "api-key" | "cloud" | "credentials" | "local" | "subscription";
  group: "cloud" | "local" | "subscription";
  order: number;
  recommended?: boolean;
  /** Dark-mode logo path (e.g. "/logos/my-provider.png") */
  logoDark?: string;
  /** Light-mode logo path */
  logoLight?: string;
}

export interface BrandingConfig {
  /** Product name shown in UI ("Eliza" | "the app") */
  appName: string;
  /** GitHub org ("elizaos" | "elizaos") */
  orgName: string;
  /** GitHub repo name ("eliza" | "eliza") */
  repoName: string;
  /** Documentation site URL */
  docsUrl: string;
  /** App origin URL */
  appUrl: string;
  /** GitHub bug report URL */
  bugReportUrl: string;
  /** Twitter hashtag ("#ElizaAgent" | "#AppAgent") */
  hashtag: string;
  /** Agent file extension (".eliza-agent" | ".eliza-agent") */
  fileExtension: string;
  /** npm package scope ("elizaos" | "elizaos") */
  packageScope: string;
  /** Custom providers injected by the app into the onboarding flow */
  customProviders?: CustomProviderOption[];
  /** When true, the app requires Eliza Cloud — local backend mode is disabled. */
  cloudOnly?: boolean;
}

/**
 * Tokagent overlay: replaced upstream "Eliza" branding defaults with
 * Tokagent's product identity. These values feed every i18n string that
 * interpolates `{{appName}}` and every UI surface that reads
 * `branding.appName` (chat pane labels, onboarding copy, page titles,
 * docs/bug-report links).
 */

/** Default for i18n copy that uses `{{appName}}` (e.g. "Where should {{appName}} run?"). */
export const DEFAULT_APP_DISPLAY_NAME = "Tokagent";

export const DEFAULT_BRANDING: BrandingConfig = {
  appName: DEFAULT_APP_DISPLAY_NAME,
  orgName: "tokamak-network",
  repoName: "Tokamak-AI-Layer",
  docsUrl: "https://www.tokagent.network",
  appUrl: "https://www.tokagent.network",
  bugReportUrl:
    "https://github.com/tokamak-network/Tokamak-AI-Layer/issues/new",
  hashtag: "#Tokagent",
  fileExtension: ".tokagent-agent",
  packageScope: "tokagent",
};

export const BrandingContext = createContext<BrandingConfig>(DEFAULT_BRANDING);

export function useBranding(): BrandingConfig {
  return useContext(BrandingContext);
}

/** Pass to `t(key, appNameInterpolationVars(branding))` when the string contains `{{appName}}`. */
export function appNameInterpolationVars(branding: BrandingConfig): {
  appName: string;
} {
  const name = branding.appName?.trim();
  return { appName: name || DEFAULT_APP_DISPLAY_NAME };
}
