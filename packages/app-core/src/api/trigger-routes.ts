import type { RouteHelpers, RouteRequestContext } from "@tokagentos/agent/api";
import {
  type TriggerRouteContext as AutonomousTriggerRouteContext,
  handleTriggerRoutes as handleAutonomousTriggerRoutes,
} from "@tokagentos/agent/api/trigger-routes";
import {
  buildTriggerConfig,
  buildTriggerMetadata,
  DISABLED_TRIGGER_INTERVAL_MS,
  executeTriggerTask,
  getTriggerHealthSnapshot,
  getTriggerLimit,
  listTriggerTasks,
  normalizeTriggerDraft,
  readTriggerConfig,
  readTriggerRuns,
  TRIGGER_TASK_NAME,
  TRIGGER_TASK_TAGS,
  taskToTriggerSummary,
  triggersFeatureEnabled,
} from "@tokagentos/agent/triggers";
import type { AgentRuntime } from "@tokagentos/core";

export type TriggerRouteHelpers = RouteHelpers;

export interface TriggerRouteContext extends RouteRequestContext {
  runtime: AgentRuntime | null;
}

function toAutonomousContext(
  ctx: TriggerRouteContext,
): AutonomousTriggerRouteContext {
  return {
    ...ctx,
    executeTriggerTask,
    getTriggerHealthSnapshot,
    getTriggerLimit,
    listTriggerTasks,
    readTriggerConfig,
    readTriggerRuns,
    taskToTriggerSummary,
    triggersFeatureEnabled,
    buildTriggerConfig,
    buildTriggerMetadata,
    normalizeTriggerDraft,
    DISABLED_TRIGGER_INTERVAL_MS,
    TRIGGER_TASK_NAME,
    TRIGGER_TASK_TAGS: [...TRIGGER_TASK_TAGS],
  };
}

export async function handleTriggerRoutes(
  ctx: TriggerRouteContext,
): Promise<boolean> {
  return handleAutonomousTriggerRoutes(toAutonomousContext(ctx));
}
