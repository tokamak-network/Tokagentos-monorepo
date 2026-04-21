import type { RouteRequestContext } from "@tokagentos/agent/api";
import { handleMemoryRoutes as handleAutonomousMemoryRoutes } from "@tokagentos/agent/api/memory-routes";
import type { AgentRuntime } from "@tokagentos/core";

export interface MemoryRouteContext extends RouteRequestContext {
  url: URL;
  runtime: AgentRuntime | null;
  agentName: string;
}

export async function handleMemoryRoutes(
  ctx: MemoryRouteContext,
): Promise<boolean> {
  return handleAutonomousMemoryRoutes(ctx);
}
