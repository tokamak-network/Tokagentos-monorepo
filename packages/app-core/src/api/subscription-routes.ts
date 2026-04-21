import type { RouteRequestContext } from "@tokagentos/agent/api";
import {
  type SubscriptionRouteState as AutonomousSubscriptionRouteState,
  handleSubscriptionRoutes as handleAutonomousSubscriptionRoutes,
} from "@tokagentos/agent/api/subscription-routes";
import type { TokagentConfig } from "@tokagentos/agent/config/types";

export type SubscriptionRouteState = Omit<
  AutonomousSubscriptionRouteState,
  "config"
> & {
  config: TokagentConfig;
};

export interface SubscriptionRouteContext extends RouteRequestContext {
  state: SubscriptionRouteState;
  saveConfig: (config: TokagentConfig) => void;
}

export async function handleSubscriptionRoutes(
  ctx: SubscriptionRouteContext,
): Promise<boolean> {
  return handleAutonomousSubscriptionRoutes({
    ...ctx,
    saveConfig: (config: unknown) => ctx.saveConfig(config as TokagentConfig),
    loadSubscriptionAuth: async () =>
      (await import("@tokagentos/agent/auth")) as never,
  } as never);
}
