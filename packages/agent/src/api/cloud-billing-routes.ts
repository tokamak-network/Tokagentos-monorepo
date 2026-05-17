/**
 * Stub: Tokagent Cloud billing route handler.
 *
 * `packages/app-core/src/api/server.ts:6` imports `handleCloudBillingRoute`
 * from this path, but the real implementation has never been committed to
 * this repo (no git history, no upstream reference). The import is a
 * load-time blocker for the API server.
 *
 * This stub responds with **501 Not Implemented** for any request to
 * `/api/cloud/billing/*` so the URL prefix is owned (caller sees `true`,
 * i.e. "handled") instead of falling through to other dispatchers that
 * would 404. When the real handler lands, replace this whole file.
 *
 * Until then, the in-plugin billing dashboard (`/v1/billing/dashboard`)
 * and the on-chain billing routes the tokagent-billing plugin provides
 * (`/v1/messages`, `/v1/topup/*`, `/v1/keys`, etc.) cover the entire
 * billing UX. The `/api/cloud/billing/*` namespace is for Tokagent Cloud's
 * managed-billing integration, which isn't wired up yet.
 *
 * See: docs/eng-tickets/2026-05-16-tokagentos-boot-vs-plugin-sql-version-skew.md
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export interface CloudBillingRouteOptions {
  config: unknown;
  runtime: unknown;
}

export async function handleCloudBillingRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _method: string,
  _opts: CloudBillingRouteOptions,
): Promise<boolean> {
  // Claim the URL prefix with a polite 501 so the caller doesn't fall
  // through to other dispatchers expecting to own this path.
  if (!res.headersSent) {
    res.writeHead(501, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "not_implemented",
        message:
          "Tokagent Cloud billing routes are not available in this build. " +
          "Use the on-chain billing routes at /v1/* instead.",
        pathname,
      }),
    );
  }
  return true;
}
