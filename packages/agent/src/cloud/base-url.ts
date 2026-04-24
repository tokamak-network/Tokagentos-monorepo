const DEFAULT_CLOUD_SITE_URL = "https://www.tokagentcloud.ai";

const LEGACY_CLOUD_HOST_ALIASES = new Set([
  "tokagentcloud.ai",
  "www.tokagentcloud.ai",
]);

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("127.")
  );
}

function trimApiPath(pathname: string): string {
  const normalized = pathname.trim().replace(/\/+$/, "");
  if (!normalized) return "";
  if (normalized === "/api/v1") return "";
  if (normalized.endsWith("/api/v1")) {
    return normalized.slice(0, -"/api/v1".length);
  }
  return normalized;
}

export function normalizeCloudSiteUrl(rawUrl?: string): string {
  const candidate = rawUrl?.trim() || DEFAULT_CLOUD_SITE_URL;

  try {
    const parsed = new URL(candidate);
    const pathname = trimApiPath(parsed.pathname);
    const host = parsed.hostname.toLowerCase();
    const preserveLocalOrigin = isLoopbackHost(host);

    parsed.hash = "";
    parsed.search = "";
    if (!preserveLocalOrigin) {
      parsed.protocol = "https:";
      parsed.port = "";
    }
    parsed.pathname = pathname;

    if (LEGACY_CLOUD_HOST_ALIASES.has(host)) {
      parsed.hostname = "www.tokagentcloud.ai";
      parsed.pathname = "";
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return candidate.replace(/\/+$/, "");
  }
}

export function resolveCloudApiBaseUrl(rawUrl?: string): string {
  return `${normalizeCloudSiteUrl(rawUrl)}/api/v1`;
}
