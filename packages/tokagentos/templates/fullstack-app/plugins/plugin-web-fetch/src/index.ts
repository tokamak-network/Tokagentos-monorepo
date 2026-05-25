/**
 * @tokagent/plugin-web-fetch
 *
 * Two actions for letting the agent reach the live web:
 *
 *   FETCH_URL    — retrieve a single http(s) URL's raw content using Node's
 *                  built-in fetch. No external service, no API key. Best
 *                  for static HTML, JSON APIs, RSS feeds. No JS rendering.
 *
 *   WEB_SEARCH   — search the entire web for a query, return ranked
 *                  results with snippets. Backed by Tavily's HTTP API
 *                  (the same backend elizaOS's `plugin-web-search` uses).
 *                  Requires TAVILY_API_KEY in env (free tier: 1k/month at
 *                  https://app.tavily.com/sign-in). Cleanly errors when
 *                  the key is missing — never silently no-ops.
 *
 * Output is truncated to MAX_BYTES so a giant response can't blow the
 * LLM's context window. Both actions have a defensive timeout so the
 * autonomy loop stays responsive.
 */

import type {
  Action,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Plugin,
  State,
} from "@elizaos/core";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 30_000;
const MAX_BYTES = 16_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) tokagent-web-fetch/0.1.0 Safari/537.36";

// ---------------------------------------------------------------------------
// URL extraction (shared)
// ---------------------------------------------------------------------------

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`)]+/i;

function extractUrlFromOptions(
  options: Record<string, unknown> | undefined,
): string | null {
  if (!options) return null;
  const direct = options.url ?? options.URL ?? options.target;
  if (typeof direct === "string" && URL_PATTERN.test(direct)) {
    return direct.match(URL_PATTERN)?.[0] ?? null;
  }
  return null;
}

function extractUrlFromMessage(message: Memory): string | null {
  const text =
    typeof message.content?.text === "string" ? message.content.text : "";
  if (!text) return null;
  return text.match(URL_PATTERN)?.[0] ?? null;
}

// ===========================================================================
// FETCH_URL
// ===========================================================================

export const fetchUrlAction: Action = {
  name: "FETCH_URL",
  similes: [
    "WEB_FETCH",
    "GET_URL",
    "DOWNLOAD_URL",
    "FETCH_PAGE",
    "READ_URL",
    "READ_WEB_PAGE",
    "RETRIEVE_URL",
  ],
  description:
    "Retrieve the raw body of an http(s) URL. Use whenever the user asks " +
    "you to read, summarize, check, or fetch ANY web content identified " +
    "by a URL — RSS feeds, JSON APIs, blog posts, news pages, status " +
    "pages, etc. Cannot execute JavaScript. Output is truncated to 16 KB.",

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
  ): Promise<boolean> => {
    const text =
      typeof message.content?.text === "string" ? message.content.text : "";
    if (URL_PATTERN.test(text)) return true;
    return /\b(fetch|download|retrieve|read|scrape|grab|pull|crawl|check)\b.*\b(url|link|page|site|feed|rss|api|endpoint)\b/i.test(
      text,
    );
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<undefined> => {
    const url = extractUrlFromOptions(options) ?? extractUrlFromMessage(message);
    if (!url) {
      await callback?.({
        text:
          "FETCH_URL requires a target URL. Include the http(s):// URL in " +
          "the instruction text, or pass it via the action's `url` option.",
        action: "FETCH_URL",
        source: "web-fetch",
      } as Content);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9," +
            "application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        },
        signal: controller.signal,
      });

      const contentType = resp.headers.get("content-type") ?? "unknown";
      const status = resp.status;
      const raw = await resp.text();
      const byteLength = Buffer.byteLength(raw, "utf8");
      const body =
        byteLength > MAX_BYTES
          ? `${raw.slice(0, MAX_BYTES)}\n…[truncated — original size ${byteLength} bytes]`
          : raw;

      await callback?.({
        text:
          `Fetched ${url}\n` +
          `Status: ${status}  Content-Type: ${contentType}  Size: ${byteLength} bytes\n\n` +
          body,
        action: "FETCH_URL",
        source: "web-fetch",
        url,
      } as Content);
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? `timed out after ${FETCH_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : String(err);
      await callback?.({
        text: `FETCH_URL failed for ${url}: ${message}`,
        action: "FETCH_URL",
        source: "web-fetch",
      } as Content);
    } finally {
      clearTimeout(timer);
    }
    return undefined;
  },

  examples: [
    [
      { name: "user", content: { text: "Fetch https://news.ycombinator.com/rss" } },
      {
        name: "agent",
        content: { text: "Fetching the Hacker News RSS feed.", action: "FETCH_URL" },
      },
    ],
  ],
};

// ===========================================================================
// WEB_SEARCH (Tavily-backed, matches elizaOS pattern)
// ===========================================================================

type TavilySearchDepth = "basic" | "advanced";

const TAVILY_DEFAULT_MAX_RESULTS = 5;
const TAVILY_MAX_RESULTS_CEILING = 20;
const TAVILY_TIMEOUT_MS = 30_000;
const TAVILY_ENDPOINT = "https://api.tavily.com/search";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
}

interface TavilyResponse {
  answer?: string;
  query?: string;
  results?: TavilyResult[];
  response_time?: number;
}

function extractQueryFromOptions(
  options: Record<string, unknown> | undefined,
): string | null {
  if (!options) return null;
  const direct = options.query ?? options.q ?? options.search;
  return typeof direct === "string" && direct.trim() ? direct.trim() : null;
}

function extractQueryFromMessage(message: Memory): string | null {
  const text =
    typeof message.content?.text === "string" ? message.content.text : "";
  if (!text.trim()) return null;
  const m = text.match(
    /(?:search\s+(?:for|the\s+web\s+for)|find|look\s+up|google)\s+(?:about\s+)?["']?([^"'\n.?!]{3,200})/i,
  );
  if (m?.[1]) return m[1].trim();
  return text.trim().slice(0, 400);
}

function clampMaxResults(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return TAVILY_DEFAULT_MAX_RESULTS;
  return Math.min(Math.floor(n), TAVILY_MAX_RESULTS_CEILING);
}

function formatTavilyResults(payload: TavilyResponse, query: string): string {
  const lines: string[] = [];
  lines.push(`Web search results for: "${query}"`);
  if (typeof payload.response_time === "number") {
    lines.push(`(response_time=${payload.response_time.toFixed(2)}s)`);
  }
  lines.push("");
  if (payload.answer) {
    lines.push("Synthesized answer:");
    lines.push(payload.answer);
    lines.push("");
  }
  const results = payload.results ?? [];
  if (results.length === 0) {
    lines.push("No results returned.");
  } else {
    lines.push(`Top ${results.length} results:`);
    results.forEach((r, i) => {
      lines.push("");
      lines.push(`${i + 1}. ${r.title ?? "(untitled)"}`);
      if (r.url) lines.push(`   URL: ${r.url}`);
      if (r.published_date) lines.push(`   Published: ${r.published_date}`);
      if (typeof r.score === "number") {
        lines.push(`   Relevance: ${r.score.toFixed(3)}`);
      }
      if (r.content) {
        const snippet =
          r.content.length > 600 ? `${r.content.slice(0, 600)}…` : r.content;
        lines.push(`   ${snippet}`);
      }
    });
  }
  const out = lines.join("\n");
  return out.length > MAX_BYTES
    ? `${out.slice(0, MAX_BYTES)}\n…[truncated]`
    : out;
}

export const webSearchAction: Action = {
  name: "WEB_SEARCH",
  similes: [
    "SEARCH_WEB",
    "GOOGLE",
    "SEARCH_THE_WEB",
    "FIND_ONLINE",
    "LOOK_UP_ONLINE",
    "INTERNET_SEARCH",
    "WEB_QUERY",
  ],
  description:
    "Search the entire web for a query and return ranked results with " +
    "snippets and a synthesized answer (when available). Use whenever the " +
    "user asks you to find, search, look up, or discover information " +
    "online without specifying a URL. Backed by Tavily — requires " +
    "TAVILY_API_KEY in env.",

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
  ): Promise<boolean> => {
    const text =
      typeof message.content?.text === "string" ? message.content.text : "";
    if (!text.trim()) return false;
    return /\b(search|find|look\s*up|google|google\s+for|web|online|internet|news|trends?|latest|what.?s\s+new|discover)\b/i.test(
      text,
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<undefined> => {
    // Server-side log breadcrumb so we can trace what the agent invoked
    // even when the LLM paraphrases the result. Look for [WEB_SEARCH]
    // lines in the agent boot/run log.
    const log = (msg: string, extra?: Record<string, unknown>) => {
      try {
        // biome-ignore lint/suspicious/noConsole: intentional diagnostic
        console.info(`[WEB_SEARCH] ${msg}`, extra ?? {});
      } catch {
        // ignore
      }
    };

    const apiKey =
      (typeof runtime.getSetting === "function"
        ? runtime.getSetting("TAVILY_API_KEY")
        : undefined) ?? process.env.TAVILY_API_KEY;
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      log("missing TAVILY_API_KEY");
      await callback?.({
        text:
          "WEB_SEARCH is not configured: TAVILY_API_KEY is missing. " +
          "Get a free key at https://app.tavily.com/sign-in (1,000 " +
          "searches/month, no credit card), then add " +
          "`TAVILY_API_KEY=tvly-...` to your project's .env (or set it " +
          "via Settings → Plugins → web-fetch) and restart the agent.",
        action: "WEB_SEARCH",
        source: "web-fetch",
      } as Content);
      return undefined;
    }

    const query =
      extractQueryFromOptions(options) ?? extractQueryFromMessage(message);
    if (!query) {
      log("missing query");
      await callback?.({
        text:
          "WEB_SEARCH requires a query. Include the search terms in the " +
          "instruction or pass them via the action's `query` option.",
        action: "WEB_SEARCH",
        source: "web-fetch",
      } as Content);
      return undefined;
    }

    const searchDepth: TavilySearchDepth =
      options?.searchDepth === "advanced" ? "advanced" : "basic";
    const maxResults = clampMaxResults(options?.maxResults);
    log("dispatching to Tavily", {
      queryPreview: query.slice(0, 120),
      searchDepth,
      maxResults,
      keyPrefix: apiKey.trim().slice(0, 8),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const resp = await fetch(TAVILY_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({
          api_key: apiKey.trim(),
          query,
          search_depth: searchDepth,
          max_results: maxResults,
          include_answer: true,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        log("Tavily HTTP error", {
          status: resp.status,
          statusText: resp.statusText,
          bodyPreview: errBody.slice(0, 300),
          elapsedMs: Date.now() - startedAt,
        });
        const hint =
          resp.status === 401 || resp.status === 403
            ? "  — verify TAVILY_API_KEY is correct."
            : resp.status === 429
              ? "  — Tavily rate limit reached; check your usage dashboard."
              : "";
        await callback?.({
          text: `WEB_SEARCH failed (${resp.status} ${resp.statusText})${hint}\n${errBody.slice(0, 400)}`,
          action: "WEB_SEARCH",
          source: "web-fetch",
        } as Content);
        return undefined;
      }

      const payload = (await resp.json()) as TavilyResponse;
      const resultCount = payload.results?.length ?? 0;
      log("Tavily ok", {
        elapsedMs: Date.now() - startedAt,
        resultCount,
        hasAnswer: Boolean(payload.answer),
        firstUrl: payload.results?.[0]?.url ?? null,
      });
      await callback?.({
        text: formatTavilyResults(payload, query),
        action: "WEB_SEARCH",
        source: "web-fetch",
        query,
      } as Content);
    } catch (err) {
      const errMessage =
        err instanceof Error && err.name === "AbortError"
          ? `timed out after ${TAVILY_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : String(err);
      log("Tavily call threw", {
        error: errMessage,
        elapsedMs: Date.now() - startedAt,
      });
      await callback?.({
        text: `WEB_SEARCH failed: ${errMessage}`,
        action: "WEB_SEARCH",
        source: "web-fetch",
      } as Content);
    } finally {
      clearTimeout(timer);
    }
    return undefined;
  },

  examples: [
    [
      { name: "user", content: { text: "Find the latest AI trends online" } },
      {
        name: "agent",
        content: {
          text: "Searching the web for the latest AI trends.",
          action: "WEB_SEARCH",
        },
      },
    ],
  ],
};

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

export const webFetchPlugin: Plugin = {
  name: "web-fetch",
  description:
    "Two actions to reach the live web: FETCH_URL (Node fetch — static " +
    "HTML/JSON/RSS, no key) and WEB_SEARCH (Tavily-backed search — " +
    "requires TAVILY_API_KEY).",
  actions: [fetchUrlAction, webSearchAction],
  providers: [],
  services: [],
  evaluators: [],
};

export default webFetchPlugin;
