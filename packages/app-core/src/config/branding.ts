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
  /** Product name shown in UI ("Tokagent" | "the app") */
  appName: string;
  /** GitHub org ("tokagentos" | "tokagentos") */
  orgName: string;
  /** GitHub repo name ("tokagent" | "tokagent") */
  repoName: string;
  /** Documentation site URL */
  docsUrl: string;
  /** App origin URL */
  appUrl: string;
  /** GitHub bug report URL */
  bugReportUrl: string;
  /** Twitter hashtag ("#TokagentAgent" | "#AppAgent") */
  hashtag: string;
  /** Agent file extension (".tokagent-agent" | ".tokagent-agent") */
  fileExtension: string;
  /** npm package scope ("tokagentos" | "tokagentos") */
  packageScope: string;
  /** Custom providers injected by the app into the onboarding flow */
  customProviders?: CustomProviderOption[];
  /** When true, the app requires Tokagent Cloud — local backend mode is disabled. */
  cloudOnly?: boolean;
}

/** Default for i18n copy that uses `{{appName}}` (e.g. "Where should {{appName}} run?"). */
export const DEFAULT_APP_DISPLAY_NAME = "Tokagent";

export const DEFAULT_BRANDING: BrandingConfig = {
  appName: DEFAULT_APP_DISPLAY_NAME,
  orgName: "tokagentos",
  repoName: "tokagent",
  docsUrl: "https://docs.tokagentos.ai",
  appUrl: "https://app.tokagentos.ai",
  bugReportUrl:
    "https://github.com/tokagentos/tokagent/issues/new?template=bug_report.yml",
  hashtag: "#TokagentAgent",
  fileExtension: ".tokagent-agent",
  packageScope: "tokagentos",
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
