import fs from "node:fs";
import path from "node:path";

/**
 * Brand configuration for the tokagentOS desktop shell.
 *
 * All user-facing brand strings (app name, identifiers, URLs) are resolved
 * here from environment variables with sensible defaults. Brand-specific
 * apps (e.g. the app) override via env or by importing and calling
 * `overrideBrandConfig()` before the shell boots.
 *
 * Env precedence: TOKAGENT_ > TOKAGENT_ (legacy) > default.
 */

export interface DesktopBrandConfig {
  /** Display name shown in menus, notifications, window titles. */
  appName: string;
  /** Reverse-DNS app identifier (macOS bundle ID, etc.). */
  appId: string;
  /** URL scheme for deep links (e.g. "tokagentos" -> tokagentos://). */
  urlScheme: string;
  /** Base URL for release/update artifacts. */
  releaseUrl: string;
  /** Config export file name. */
  configExportFileName: string;
  /** User-facing description. */
  appDescription: string;
  /** Default namespace for state directory (~/.tokagent/ or ~/.tokagent/). */
  namespace: string;
  /** Config directory name (used under ~/.config/ on Unix, %APPDATA% on Windows). */
  configDirName: string;
  /** Startup log file name. */
  startupLogFileName: string;
  /** macOS launch agent plist file name. */
  macLaunchAgentPlist: string;
  /** macOS launch agent label. */
  macLaunchAgentLabel: string;
  /** Linux desktop file name (without path). */
  linuxDesktopFileName: string;
  /** Linux desktop entry display name. */
  linuxDesktopEntryName: string;
  /** Windows registry autostart value name. */
  windowsRegistryValueName: string;
  /** CEF version marker file name. */
  cefVersionMarkerFileName: string;
  /** Runtime dist directory name inside packaged bundles. */
  runtimeDistDirName: string;
  /** mDNS/Bonjour service type. */
  mdnsServiceType: string;
  /** Desktop music guild ID. */
  desktopMusicGuildId: string;
  /** Browser workspace partition name. */
  browserWorkspacePartition: string;
  /** Release notes partition name. */
  releaseNotesPartition: string;
  /** CEF desktop partition name. */
  cefDesktopPartition: string;
  /** Trusted close message type for cloud auth windows. */
  trustedCloseMessageType: string;
}

function env(key: string): string {
  return (process.env[key] ?? "").trim();
}

function envFallback(...keys: string[]): string {
  for (const key of keys) {
    const val = env(key);
    if (val) return val;
  }
  return "";
}

function loadFileConfig(): Partial<DesktopBrandConfig> {
  const envPath = envFallback("TOKAGENT_BRAND_CONFIG_PATH", "TOKAGENT_BRAND_CONFIG_PATH");
  const candidatePaths = [
    envPath,
    path.resolve(process.cwd(), "brand-config.json"),
    path.resolve(import.meta.dir ?? process.cwd(), "..", "brand-config.json"),
    path.resolve(import.meta.dir ?? process.cwd(), "brand-config.json"),
  ].filter(Boolean);

  for (const candidate of candidatePaths) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (parsed && typeof parsed === "object") {
        return parsed as Partial<DesktopBrandConfig>;
      }
    } catch {
      // Ignore malformed or inaccessible brand config and fall back to env/defaults.
    }
  }

  return {};
}

const DEFAULT_CONFIG: DesktopBrandConfig = {
  appName: "tokagentOS",
  appId: "ai.tokagentos.app",
  urlScheme: "tokagentos",
  releaseUrl: "",
  configExportFileName: "tokagent-config.json",
  appDescription: "AI agents for the desktop",
  namespace: "tokagent",
  configDirName: "tokagentOS",
  startupLogFileName: "tokagent-startup.log",
  macLaunchAgentPlist: "ai.tokagentos.app.plist",
  macLaunchAgentLabel: "ai.tokagentos.app",
  linuxDesktopFileName: "tokagentos.desktop",
  linuxDesktopEntryName: "tokagentOS",
  windowsRegistryValueName: "tokagentOS",
  cefVersionMarkerFileName: ".tokagent-version",
  runtimeDistDirName: "tokagent-dist",
  mdnsServiceType: "_tokagent._tcp",
  desktopMusicGuildId: "tokagent-desktop",
  browserWorkspacePartition: "persist:tokagent-browser",
  releaseNotesPartition: "persist:tokagent-release-notes",
  cefDesktopPartition: "persist:tokagent-desktop-cef",
  trustedCloseMessageType: "tokagent.trusted-tokagent-window.close",
};

let resolvedConfig: DesktopBrandConfig | null = null;

/**
 * Override specific brand config values. Must be called before `getBrandConfig()`.
 */
export function overrideBrandConfig(
  overrides: Partial<DesktopBrandConfig>,
): void {
  resolvedConfig = { ...resolveBrandConfig(), ...overrides };
}

function resolveBrandConfig(): DesktopBrandConfig {
  const fileConfig = loadFileConfig();
  const appName =
    envFallback("TOKAGENT_APP_NAME", "TOKAGENT_APP_NAME") ||
    fileConfig.appName ||
    DEFAULT_CONFIG.appName;
  const appId =
    envFallback("TOKAGENT_APP_ID", "TOKAGENT_APP_ID") ||
    fileConfig.appId ||
    DEFAULT_CONFIG.appId;

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    appName,
    appId,
    urlScheme:
      envFallback("TOKAGENT_URL_SCHEME", "TOKAGENT_URL_SCHEME") ||
      fileConfig.urlScheme ||
      DEFAULT_CONFIG.urlScheme,
    releaseUrl:
      envFallback("TOKAGENT_RELEASE_URL", "TOKAGENT_RELEASE_URL") ||
      fileConfig.releaseUrl ||
      DEFAULT_CONFIG.releaseUrl,
    configExportFileName:
      fileConfig.configExportFileName ??
      `${appName.toLowerCase().replace(/\s+/g, "-")}-config.json`,
    namespace:
      envFallback("TOKAGENT_NAMESPACE", "TOKAGENT_NAMESPACE") ||
      fileConfig.namespace ||
      DEFAULT_CONFIG.namespace,
    configDirName: fileConfig.configDirName ?? appName,
  };
}

/**
 * Get the resolved brand configuration. Values are resolved once and cached.
 */
export function getBrandConfig(): DesktopBrandConfig {
  if (!resolvedConfig) {
    resolvedConfig = resolveBrandConfig();
  }
  return resolvedConfig;
}

/**
 * Reset cached config (for tests).
 */
export function resetBrandConfigForTests(): void {
  resolvedConfig = null;
}
