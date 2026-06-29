/**
 * Cloud-managed API routes were removed upstream
 * (agent commit "chore(agent): delete cloud-managed API route files").
 *
 * This is a no-op shim retained so server.ts keeps compiling: the cloud routes
 * are inert and the handler reports "not handled" so the request falls through
 * to the remaining routers.
 */
import type http from "node:http";

export interface CloudRouteState {
  [key: string]: unknown;
}

export async function handleCloudRoute(
  _req: http.IncomingMessage,
  _res: http.ServerResponse,
  _pathname: string,
  _method: string,
  _opts: { config?: unknown; runtime?: unknown; cloudManager?: unknown },
): Promise<boolean> {
  // Cloud-managed routes were removed — not handled; caller falls through.
  return false;
}
