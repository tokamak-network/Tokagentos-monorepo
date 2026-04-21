import type { RouteRequestContext } from "@tokagentos/agent/api";
import {
  type PermissionRouteState as AutonomousPermissionRouteState,
  handlePermissionRoutes as handleAutonomousPermissionRoutes,
} from "@tokagentos/agent/api/permissions-routes";
import type { TokagentConfig } from "@tokagentos/agent/config/types";
import type { AgentRuntime } from "@tokagentos/core";
import type { PermissionState } from "@tokagentos/shared/contracts/permissions";

export type { PermissionState };

export interface PermissionRouteState {
  runtime: AgentRuntime | null;
  config: TokagentConfig;
  permissionStates?: Record<string, PermissionState>;
  shellEnabled?: boolean;
}

export interface PermissionRouteContext extends RouteRequestContext {
  state: PermissionRouteState;
  saveConfig: (config: TokagentConfig) => void;
  scheduleRuntimeRestart: (reason: string) => void;
}

function toAutonomousState(
  state: PermissionRouteState,
): AutonomousPermissionRouteState {
  return state;
}

export async function handlePermissionRoutes(
  ctx: PermissionRouteContext,
): Promise<boolean> {
  return handleAutonomousPermissionRoutes({
    ...ctx,
    state: toAutonomousState(ctx.state),
    saveConfig: (config) => ctx.saveConfig(config as TokagentConfig),
  });
}
