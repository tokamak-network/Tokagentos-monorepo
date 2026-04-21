import type {
  RouteHelpers,
  RouteRequestContext,
} from "@tokagentos/agent/api/route-helpers";
import { handleTrainingRoutes as handleAutonomousTrainingRoutes } from "@tokagentos/agent/api/training-routes";
import type { TrainingServiceLike } from "@tokagentos/agent/api/training-service-like";
import { isLoopbackHost } from "@tokagentos/agent/security/network-policy";
import type { AgentRuntime } from "@tokagentos/core";

export type TrainingRouteHelpers = RouteHelpers;

export interface TrainingRouteContext extends RouteRequestContext {
  runtime: AgentRuntime | null;
  trainingService: TrainingServiceLike;
}

export async function handleTrainingRoutes(
  ctx: TrainingRouteContext,
): Promise<boolean> {
  return handleAutonomousTrainingRoutes({
    ...ctx,
    isLoopbackHost,
  });
}
