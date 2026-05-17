/**
 * Stub: Tokagent Cloud compat route handler.
 *
 * `packages/app-core/src/api/server.ts:7` imports `handleCloudCompatRoute`
 * from this path, but the real implementation has never been committed to
 * this repo (no git history, no upstream reference). The import is a
 * load-time blocker for the API server.
 *
 * This stub responds with **501 Not Implemented** for any request to
 * `/api/cloud/compat/*` so the URL prefix is owned (caller sees `true`,
 * i.e. "handled") instead of falling through to other dispatchers that
 * would 404. When the real handler lands, replace this whole file.
 *
 * The compat routes are an aggregator that proxies the dashboard's
 * "compat agents / jobs / runs" lookups to Tokagent Cloud's upstream.
 * Without it, the dashboard's cloud-compat panels will see 501s for
 * those panels only — local agent functionality is unaffected.
 *
 * See: docs/eng-tickets/2026-05-16-tokagentos-boot-vs-plugin-sql-version-skew.md
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export interface CloudCompatRouteOptions {
  config: unknown;
  runtime: unknown;
}

export async function handleCloudCompatRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _method: string,
  _opts: CloudCompatRouteOptions,
): Promise<boolean> {
  if (!res.headersSent) {
    res.writeHead(501, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "not_implemented",
        message:
          "Tokagent Cloud compat routes are not available in this build.",
        pathname,
      }),
    );
  }
  return true;
}
