import type { RouteHelpers, RouteRequestMeta } from "@tokagentos/agent/api";
import {
  type AgentLifecycleRouteState,
  handleAgentLifecycleRoutes as handleAutonomousAgentLifecycleRoutes,
} from "@tokagentos/agent/api/agent-lifecycle-routes";

export type { AgentLifecycleRouteState };

export interface AgentLifecycleRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "error" | "json" | "readJsonBody"> {
  state: AgentLifecycleRouteState;
}

export async function handleAgentLifecycleRoutes(
  ctx: AgentLifecycleRouteContext,
): Promise<boolean> {
  return handleAutonomousAgentLifecycleRoutes(ctx);
}
