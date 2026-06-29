/**
 * Cloud status/credits routes were removed upstream
 * (agent commit "chore(agent): delete cloud-managed API route files").
 *
 * This is a no-op shim retained so server.ts keeps compiling: the
 * /api/cloud/status and /api/cloud/credits routes now respond 404.
 */
import type http from "node:http";

export interface CloudConfigLike {
  [key: string]: unknown;
}

export interface CloudStatusRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  config: unknown;
  runtime: unknown;
  json: (res: http.ServerResponse, body: unknown, status?: number) => void;
}

export async function handleCloudStatusRoutes(
  ctx: CloudStatusRouteContext,
): Promise<boolean> {
  ctx.json(ctx.res, { error: "Cloud routes are not available." }, 404);
  return true;
}
