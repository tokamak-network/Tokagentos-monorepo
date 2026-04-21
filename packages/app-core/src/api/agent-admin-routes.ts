import type { RouteHelpers, RouteRequestMeta } from "@tokagentos/agent/api";
import {
  type AgentAdminRouteState,
  handleAgentAdminRoutes as handleAutonomousAgentAdminRoutes,
} from "@tokagentos/agent/api/agent-admin-routes";
import type { TokagentConfig } from "@tokagentos/agent/config/types";

export type { AgentAdminRouteState };

export interface AgentAdminRouteContext
  extends Omit<
      import("@tokagentos/agent/api/agent-admin-routes").AgentAdminRouteContext,
      "state"
    >,
    RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {
  state: AgentAdminRouteState & { config: TokagentConfig };
}

export async function handleAgentAdminRoutes(
  ctx: AgentAdminRouteContext,
): Promise<boolean> {
  return handleAutonomousAgentAdminRoutes(ctx);
}
