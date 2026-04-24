import type {
  BrowserWorkspaceCommand,
  BrowserWorkspaceTab,
} from "./browser-workspace-types.js";

export interface HostedSearchResponse {
  answer: string;
  model: string;
  provider: "google";
  query: string;
  responseTime: number;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
  searchQueries: string[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: number;
}

export interface HostedExtractResponse {
  provider: "firecrawl";
  url: string;
  markdown: string | null;
  html: string | null;
  screenshot: string | null;
  links: string[];
  metadata: Record<string, unknown>;
}

interface HostedBrowserSessionApiResponse {
  session: BrowserWorkspaceTab;
}

interface HostedBrowserListApiResponse {
  sessions: BrowserWorkspaceTab[];
}

interface HostedBrowserCommandApiResponse {
  output?: unknown;
  session: BrowserWorkspaceTab;
  snapshot?: { data: string };
}

function normalizeApiKey(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Hosted cloud tooling is not part of this product.
export function isHostedCloudToolingConfigured(
  _env: NodeJS.ProcessEnv = process.env,
): boolean {
  return false;
}

async function requestHostedCloudTool<T>(
  _pathname: string,
  _init: RequestInit | undefined,
  _env: NodeJS.ProcessEnv,
): Promise<T> {
  throw new Error("Tokagent Cloud hosted tools are not configured.");
}

export async function searchHostedCloudWeb(
  body: {
    maxResults?: number;
    model?: string;
    query: string;
    source?: string;
    timeRange?: "d" | "day" | "m" | "month" | "w" | "week" | "y" | "year";
    topic?: "finance" | "general";
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<HostedSearchResponse> {
  return requestHostedCloudTool<HostedSearchResponse>(
    "/search",
    {
      body: JSON.stringify(body),
      method: "POST",
    },
    env,
  );
}

export async function extractHostedCloudPage(
  body: {
    formats?: Array<"html" | "links" | "markdown" | "screenshot">;
    onlyMainContent?: boolean;
    timeoutMs?: number;
    url: string;
    waitFor?: number;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<HostedExtractResponse> {
  return requestHostedCloudTool<HostedExtractResponse>(
    "/extract",
    {
      body: JSON.stringify(body),
      method: "POST",
    },
    env,
  );
}

export async function listHostedCloudBrowserSessions(
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab[]> {
  const payload = await requestHostedCloudTool<HostedBrowserListApiResponse>(
    "/browser/sessions",
    { method: "GET" },
    env,
  );
  return Array.isArray(payload.sessions) ? payload.sessions : [];
}

export async function getHostedCloudBrowserSession(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab> {
  const payload = await requestHostedCloudTool<HostedBrowserSessionApiResponse>(
    `/browser/sessions/${encodeURIComponent(id)}`,
    { method: "GET" },
    env,
  );
  return payload.session;
}

export async function createHostedCloudBrowserSession(
  body: {
    activityTtl?: number;
    show?: boolean;
    title?: string;
    ttl?: number;
    url?: string;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab> {
  const payload = await requestHostedCloudTool<HostedBrowserSessionApiResponse>(
    "/browser/sessions",
    {
      body: JSON.stringify(body),
      method: "POST",
    },
    env,
  );
  return payload.session;
}

export async function deleteHostedCloudBrowserSession(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const payload = await requestHostedCloudTool<{ closed?: boolean }>(
    `/browser/sessions/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    env,
  );
  return payload.closed === true;
}

export async function navigateHostedCloudBrowserSession(
  id: string,
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BrowserWorkspaceTab> {
  const payload = await requestHostedCloudTool<HostedBrowserSessionApiResponse>(
    `/browser/sessions/${encodeURIComponent(id)}/navigate`,
    {
      body: JSON.stringify({ url }),
      method: "POST",
    },
    env,
  );
  return payload.session;
}

export async function snapshotHostedCloudBrowserSession(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ data: string }> {
  const payload = await requestHostedCloudTool<{ data: string }>(
    `/browser/sessions/${encodeURIComponent(id)}/snapshot`,
    { method: "GET" },
    env,
  );
  return payload;
}

export async function executeHostedCloudBrowserCommand(
  id: string,
  command: BrowserWorkspaceCommand,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HostedBrowserCommandApiResponse> {
  return requestHostedCloudTool<HostedBrowserCommandApiResponse>(
    `/browser/sessions/${encodeURIComponent(id)}/command`,
    {
      body: JSON.stringify(command),
      method: "POST",
    },
    env,
  );
}
