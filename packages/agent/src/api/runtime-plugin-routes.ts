/**
 * Dispatches tokagentOS AgentRuntime plugin routes (runtime.routes) on the Tokagent
 * raw Node HTTP server. Core registers paths like `/music-player/stream`; without
 * this bridge those handlers never run.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentRuntime, Route } from "@tokagentos/core";

const EXPRESS_SHIM = Symbol("tokagentExpressResponseShim");

export function matchPluginRoutePath(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const norm = (p: string) => p.split("/").filter((s) => s.length > 0);
  const pSegs = norm(pattern);
  const pathSegs = norm(pathname);
  if (pSegs.length !== pathSegs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pSegs.length; i++) {
    const p = pSegs[i];
    const c = pathSegs[i];
    if (!p || c === undefined) return null;
    if (p.startsWith(":")) {
      try {
        params[p.slice(1)] = decodeURIComponent(c);
      } catch {
        params[p.slice(1)] = c;
      }
    } else if (p !== c) {
      return null;
    }
  }
  return params;
}

function searchParamsToQuery(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of url.searchParams.keys()) {
    const vals = url.searchParams.getAll(key);
    out[key] = vals.length <= 1 ? (vals[0] ?? "") : vals;
  }
  return out;
}

function attachExpressResponseHelpers(res: ServerResponse): void {
  const marked = res as ServerResponse & { [EXPRESS_SHIM]?: boolean };
  if (marked[EXPRESS_SHIM]) return;
  marked[EXPRESS_SHIM] = true;

  // Concrete writers used by both the chained and the non-chained helpers.
  // The RouteResponse interface in @tokagentos/typescript declares json/send/
  // end/setHeader as methods directly on `res`, so plugin code following the
  // interface contract may call `res.status(n); res.json(body)` (two calls)
  // instead of the chained `res.status(n).json(body)`. Both must work.
  const writeJson = (data: unknown): void => {
    if (res.headersSent) return;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
  };
  const writeSend = (data: unknown): void => {
    if (res.headersSent) return;
    if (typeof data === "string" || Buffer.isBuffer(data)) {
      res.end(data);
    } else {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(data));
    }
  };

  const r = res as ServerResponse & {
    status: (code: number) => ServerResponse;
    json: (data: unknown) => ServerResponse;
    send: (data: unknown) => ServerResponse;
  };

  r.status = (code: number) => {
    res.statusCode = code;
    return r;
  };
  r.json = (data: unknown) => {
    writeJson(data);
    return r;
  };
  r.send = (data: unknown) => {
    writeSend(data);
    return r;
  };
}

function augmentRequest(
  req: IncomingMessage,
  url: URL,
  params: Record<string, string>,
): IncomingMessage {
  const query = searchParamsToQuery(url);
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto =
    typeof protoHeader === "string"
      ? protoHeader.split(",")[0]?.trim() || "http"
      : "http";

  const base = req as IncomingMessage & {
    query?: Record<string, string | string[]>;
    params?: Record<string, string>;
    protocol?: string;
    path?: string;
    get?: (name: string) => string | undefined;
  };
  base.query = query;
  base.params = params;
  base.protocol = proto;
  base.path = url.pathname;
  base.get = (name: string) => {
    const v = req.headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  return req;
}

/**
 * Read and JSON-parse the request body for routes that expect one.
 *
 * Plugin route handlers (registered via `Route` definitions on a Plugin) call
 * `req.body.field` expecting the body to be a parsed JSON object — that's the
 * RouteRequest contract in @tokagentos/typescript. But this dispatcher
 * historically never read the request stream, so `req.body` was always
 * undefined for POST/PUT/PATCH routes and handlers crashed with
 * "Cannot read properties of undefined" or rejected the request as missing
 * required body fields. This populates `req.body` once per request (idempotent
 * — skip if a previous middleware already parsed it) for methods that carry a
 * body, when content-type is JSON. For non-JSON bodies we leave req.body
 * alone — the handler can read the stream itself if it cares.
 */
async function parseJsonBodyIfApplicable(
  req: IncomingMessage,
  method: string,
): Promise<void> {
  if (method === "GET" || method === "HEAD" || method === "DELETE") return;
  const withBody = req as IncomingMessage & { body?: unknown };
  if (withBody.body !== undefined) return; // already parsed by upstream middleware
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (!ct.includes("application/json")) return;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    withBody.body = {};
    return;
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw.length === 0) {
    withBody.body = {};
    return;
  }
  try {
    withBody.body = JSON.parse(raw);
  } catch {
    // Leave req.body undefined for the handler to decide how to handle
    // invalid JSON. Most handlers return a 400 in this case anyway.
    withBody.body = undefined;
  }
}

/**
 * Runs the first matching runtime plugin route. Returns true if matched (even on handler error).
 */
export async function tryHandleRuntimePluginRoute(options: {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  runtime: AgentRuntime | null | undefined;
  isAuthorized: () => boolean;
}): Promise<boolean> {
  const { req, res, method, pathname, url, runtime, isAuthorized } = options;
  if (!runtime?.routes?.length) return false;

  for (const route of runtime.routes as Route[]) {
    if (route.type === "STATIC") continue;
    if (route.type !== method) continue;
    if (!route.handler) continue;

    const params = matchPluginRoutePath(route.path, pathname);
    if (params === null) continue;

    if (route.public !== true && !isAuthorized()) {
      if (!res.headersSent) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Unauthorized" }));
      }
      return true;
    }

    attachExpressResponseHelpers(res);
    augmentRequest(req, url, params);
    await parseJsonBodyIfApplicable(req, method);

    try {
      await route.handler(req as never, res as never, runtime);
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : "Internal server error",
          }),
        );
      }
      return true;
    }

    // Do not auto-end: handlers may return after attaching long-lived streams
    // (e.g. music-player) before headers or first bytes are flushed.
    return true;
  }

  return false;
}
