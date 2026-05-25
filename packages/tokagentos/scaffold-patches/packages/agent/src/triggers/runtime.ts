import crypto from "node:crypto";
import type {
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Service,
  Task,
  UUID,
} from "@elizaos/core";
import { EventType, stringToUuid } from "@elizaos/core";

/**
 * Stable, well-known entity ID used as the *sender* of trigger-dispatched
 * instructions. Mirrors the autonomy service's pattern (UUID …0002 for
 * autonomy prompts) so the agent's message pipeline doesn't filter the
 * instruction as "message from self" when entityId === runtime.agentId.
 * The agent's own response is still persisted under runtime.agentId.
 */
const TRIGGER_ENTITY_ID = stringToUuid(
  "00000000-0000-0000-0000-000000000003",
) as UUID;
import {
  buildTriggerMetadata,
  DISABLED_TRIGGER_INTERVAL_MS,
  MAX_TRIGGER_RUN_HISTORY,
} from "./scheduling.js";
import type {
  TriggerConfig,
  TriggerHealthSnapshot,
  TriggerRunRecord,
  TriggerSummary,
  TriggerTaskMetadata,
} from "./types.js";

export const TRIGGER_TASK_NAME = "TRIGGER_DISPATCH" as const;
export const TRIGGER_TASK_TAGS = ["queue", "repeat", "trigger"] as const;
const HEARTBEAT_TASK_TAGS = ["queue", "repeat", "heartbeat"] as const;

const DEFAULT_MAX_ACTIVE_TRIGGERS = 100;

interface TriggerMetricsState {
  totalExecutions: number;
  totalFailures: number;
  totalSkipped: number;
  lastExecutionAt?: number;
}

export interface TriggerExecutionOptions {
  source: "scheduler" | "manual" | "event";
  force?: boolean;
  event?: {
    kind: string;
    payload?: Record<string, unknown>;
  };
}

export interface TriggerExecutionResult {
  status: "success" | "error" | "skipped";
  error?: string;
  taskDeleted: boolean;
  runRecord?: TriggerRunRecord;
  trigger?: TriggerSummary | null;
  // Present when a workflow-kind trigger dispatches to N8N_DISPATCH and
  // the service returns an execution id.
  executionId?: string;
}

const metricsByAgent = new Map<UUID, TriggerMetricsState>();

function getMetrics(agentId: UUID): TriggerMetricsState {
  const current = metricsByAgent.get(agentId);
  if (current) return current;
  const created: TriggerMetricsState = {
    totalExecutions: 0,
    totalFailures: 0,
    totalSkipped: 0,
  };
  metricsByAgent.set(agentId, created);
  return created;
}

function recordExecutionMetric(
  agentId: UUID,
  status: TriggerExecutionResult["status"],
  ts: number,
): void {
  const metrics = getMetrics(agentId);
  if (status === "success" || status === "error") {
    metrics.totalExecutions += 1;
    metrics.lastExecutionAt = ts;
  }
  if (status === "error") {
    metrics.totalFailures += 1;
  }
  if (status === "skipped") {
    metrics.totalSkipped += 1;
  }
}

function appendRunRecord(
  existing: TriggerRunRecord[] | undefined,
  record: TriggerRunRecord,
): TriggerRunRecord[] {
  const runs = [...(existing ?? []), record];
  return runs.length <= MAX_TRIGGER_RUN_HISTORY
    ? runs
    : runs.slice(runs.length - MAX_TRIGGER_RUN_HISTORY);
}

function taskMetadata(task: Task): TriggerTaskMetadata {
  return (task.metadata ?? {}) as TriggerTaskMetadata;
}

export function readTriggerConfig(task: Task): TriggerConfig | null {
  const trigger = taskMetadata(task).trigger;
  if (!trigger || typeof trigger !== "object" || Array.isArray(trigger))
    return null;
  return (trigger as TriggerConfig).triggerId
    ? (trigger as TriggerConfig)
    : null;
}

export function readTriggerRuns(task: Task): TriggerRunRecord[] {
  const runs = taskMetadata(task).triggerRuns;
  return Array.isArray(runs) ? (runs as TriggerRunRecord[]) : [];
}

export function triggersFeatureEnabled(runtime?: IAgentRuntime): boolean {
  const runtimeSetting = runtime?.getSetting("ELIZA_TRIGGERS_ENABLED");
  if (
    runtimeSetting === false ||
    runtimeSetting === "false" ||
    runtimeSetting === "0"
  ) {
    return false;
  }
  const env = process.env.ELIZA_TRIGGERS_ENABLED;
  if (!env) return true;
  const normalized = env.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false";
}

export function getTriggerLimit(runtime?: IAgentRuntime): number {
  const runtimeSetting = runtime?.getSetting("ELIZA_TRIGGERS_MAX_ACTIVE");
  if (typeof runtimeSetting === "number" && Number.isFinite(runtimeSetting)) {
    return Math.max(1, Math.floor(runtimeSetting));
  }
  if (typeof runtimeSetting === "string" && /^\d+$/.test(runtimeSetting)) {
    return Math.max(1, Number(runtimeSetting));
  }
  const env = process.env.ELIZA_TRIGGERS_MAX_ACTIVE;
  if (env && /^\d+$/.test(env)) {
    return Math.max(1, Number(env));
  }
  return DEFAULT_MAX_ACTIVE_TRIGGERS;
}

type AutonomyServiceLike = Service & {
  getAutonomousRoomId?: () => UUID;
  getTargetRoomId?: () => UUID;
  /**
   * Toggles the autonomy loop on. Triggers DEPEND on this loop to
   * process the instruction memories they dispatch — without it the
   * memory sits in the room with nothing to act on it. We invoke this
   * on every dispatch (idempotent — no-op when already running) so a
   * cold-start agent doesn't need any extra config.
   */
  enableAutonomy?: () => Promise<void>;
  isAutonomyEnabled?: () => boolean;
};

async function isAutonomyServiceAvailable(
  runtime: IAgentRuntime,
): Promise<boolean> {
  const svc =
    runtime.getService<AutonomyServiceLike>("AUTONOMY") ??
    runtime.getService<AutonomyServiceLike>("autonomy");
  return svc != null;
}

/**
 * Dispatch a trigger instruction by creating a memory in the autonomy
 * room. The AutonomyService's internal loop picks up new memories and
 * processes them as autonomous actions.
 *
 * This replaces the previous approach of calling a non-existent
 * `injectAutonomousInstruction` method on the service.
 */
async function dispatchInstruction(
  runtime: IAgentRuntime,
  taskId: UUID,
  trigger: TriggerConfig,
  event?: TriggerExecutionOptions["event"],
): Promise<void> {
  // Resolve the autonomy service to find the target room.
  // Retry up to 5 times (500ms, 1s, 1.5s, 2s backoff) because the
  // service may still be registering after a runtime restart or SQL
  // compatibility repair. Worst case: adds ~5s latency to a trigger
  // dispatch that would have failed anyway. The retry is bounded and
  // does not block the event loop (uses setTimeout).
  let autonomyService: AutonomyServiceLike | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    autonomyService =
      runtime.getService<AutonomyServiceLike>("AUTONOMY") ??
      runtime.getService<AutonomyServiceLike>("autonomy");
    if (autonomyService) break;
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  if (!autonomyService) {
    runtime.logger.warn?.(
      `Autonomy service not found after retries (taskId=${taskId}, triggerId=${trigger.triggerId})`,
    );
    throw new Error("Autonomy service unavailable for trigger dispatch");
  }

  // Auto-enable the autonomy loop if it isn't running. Triggers dispatch
  // instruction memories into the autonomy room and rely on the loop to
  // process them; without this nudge a cold-start agent silently swallows
  // every trigger (memory sits unread in the room until the user manually
  // toggles autonomy). enableAutonomy() is idempotent on the service.
  if (typeof autonomyService.enableAutonomy === "function") {
    try {
      await autonomyService.enableAutonomy();
      runtime.logger.debug?.(
        {
          src: "trigger-runtime",
          agentId: runtime.agentId,
          triggerId: trigger.triggerId,
        },
        "Ensured autonomy loop is enabled for trigger dispatch",
      );
    } catch (err) {
      runtime.logger.warn?.(
        {
          src: "trigger-runtime",
          agentId: runtime.agentId,
          triggerId: trigger.triggerId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Failed to auto-enable autonomy loop — trigger may not be processed",
      );
    }
  }

  // Resolve the room to inject the instruction into
  const roomId =
    (typeof autonomyService.getAutonomousRoomId === "function"
      ? autonomyService.getAutonomousRoomId()
      : undefined) ??
    (typeof autonomyService.getTargetRoomId === "function"
      ? autonomyService.getTargetRoomId()
      : undefined);

  if (!roomId) {
    runtime.logger.warn?.(
      `[trigger-runtime] No autonomy room resolvable for trigger ${trigger.triggerId} — cannot dispatch`,
    );
    throw new Error(
      "No autonomy room available for trigger dispatch. Ensure the AutonomyService has a target room configured.",
    );
  }

  // Build the trigger instruction memory. Critical: entityId is the
  // dedicated TRIGGER_ENTITY_ID (not runtime.agentId) — otherwise the
  // message-handler pipeline filters it out as "from self" and the
  // agent never runs.
  const eventText = event
    ? `\n\nEvent: ${event.kind}\nPayload: ${JSON.stringify(event.payload ?? {})}`
    : "";
  const instructionText = `[Heartbeat: ${trigger.displayName}]\n${trigger.instructions}${eventText}`;
  const instructionMemoryId = stringToUuid(crypto.randomUUID()) as UUID;
  const instructionMemory: Memory = {
    id: instructionMemoryId,
    entityId: TRIGGER_ENTITY_ID,
    agentId: runtime.agentId,
    roomId,
    createdAt: Date.now(),
    content: {
      text: instructionText,
      source: "trigger-runtime",
      metadata: {
        triggerId: trigger.triggerId,
        triggerTaskId: taskId,
        wakeMode: trigger.wakeMode,
        isAutonomousInstruction: true,
      },
    },
  };

  // Ensure the trigger entity exists BEFORE inserting the memory. The
  // memories table has a foreign-key constraint on entity_id; inserting
  // a memory authored by a non-existent entity fails with an FK error
  // before we ever reach the pipeline.
  type RuntimeWithEntities = IAgentRuntime & {
    getEntityById?: (id: UUID) => Promise<unknown>;
    createEntity?: (entity: {
      id: UUID;
      names: string[];
      agentId: UUID;
      metadata?: Record<string, unknown>;
    }) => Promise<unknown>;
    upsertEntities?: (
      entities: Array<{
        id: UUID;
        names: string[];
        agentId: UUID;
        metadata?: Record<string, unknown>;
      }>,
    ) => Promise<void>;
  };
  const re = runtime as RuntimeWithEntities;
  try {
    const existing = re.getEntityById
      ? await re.getEntityById(TRIGGER_ENTITY_ID)
      : null;
    if (!existing) {
      const entity = {
        id: TRIGGER_ENTITY_ID,
        names: ["Trigger"],
        agentId: runtime.agentId,
        metadata: {
          type: "trigger-system",
          description: "Dedicated entity for cron-trigger instructions",
        },
      };
      if (typeof re.createEntity === "function") {
        try {
          await re.createEntity(entity);
        } catch {
          // Fall back to upsertEntities for adapters that don't expose
          // createEntity (mirrors AutonomyService.ensureAutonomyEntity).
          await re.upsertEntities?.([entity]);
        }
      } else if (typeof re.upsertEntities === "function") {
        await re.upsertEntities([entity]);
      }
    }
  } catch (err) {
    runtime.logger.warn?.(
      {
        src: "trigger-runtime",
        error: err instanceof Error ? err.message : String(err),
      },
      "ensureTriggerEntity failed — trigger memory insert will likely fail",
    );
  }

  // Persist the instruction so it's visible in the autonomy room and
  // returned by the "memories in window" diagnostic on the trigger
  // detail UI.
  await runtime.createMemory(instructionMemory, "messages");

  // Define a callback that persists EVERY content the agent pipeline
  // emits during this trigger run. Two distinct kinds of content arrive:
  //
  //   1. Action results — when the planner calls e.g. WEB_SEARCH, the
  //      action's handler invokes callback(content) with content.action
  //      set to the action name and content.text holding the action's
  //      output text (Tavily results, FETCH_URL body, etc.).
  //
  //   2. Final response — the LLM's natural-language reply to the user.
  //      content.action is typically the planner's chosen primary action
  //      or null; text is the human-facing message.
  //
  // We persist both with a `runStage` discriminator so the UI can
  // surface the action output separately from the LLM summary — that
  // way the user sees the raw Tavily results even if the LLM paraphrases
  // them poorly. Server-side logs also breadcrumb each callback so we
  // can trace exactly what the pipeline delivered.
  let callbackCount = 0;
  const callback: HandlerCallback = async (
    content: Content,
  ): Promise<Memory[]> => {
    callbackCount += 1;
    const actionName =
      typeof content.action === "string" ? content.action : null;
    const source = typeof content.source === "string" ? content.source : null;
    const textLen =
      typeof content.text === "string" ? content.text.trim().length : 0;
    runtime.logger.info?.(
      {
        src: "trigger-runtime",
        triggerId: trigger.triggerId,
        callbackCount,
        actionName,
        source,
        textLen,
        textPreview:
          typeof content.text === "string" ? content.text.slice(0, 200) : null,
      },
      `Trigger callback #${callbackCount} (action=${actionName ?? "none"} source=${source ?? "none"} textLen=${textLen})`,
    );
    if (textLen === 0) return [];

    const runStage = actionName && actionName !== "NONE"
      ? "action-result"
      : "final-response";
    const responseMemory: Memory = {
      id: stringToUuid(crypto.randomUUID()) as UUID,
      entityId: runtime.agentId,
      agentId: runtime.agentId,
      roomId,
      createdAt: Date.now(),
      content: {
        text: content.text as string,
        source: "trigger-runtime",
        metadata: {
          type: "trigger-response",
          runStage,
          actionName: actionName ?? undefined,
          actionSource: source ?? undefined,
          triggerId: trigger.triggerId,
          triggerTaskId: taskId,
          inReplyTo: instructionMemoryId,
          callbackIndex: callbackCount,
        },
      },
    };
    try {
      await runtime.createMemory(responseMemory, "memories");
    } catch (err) {
      runtime.logger.warn?.(
        {
          src: "trigger-runtime",
          error: err instanceof Error ? err.message : String(err),
        },
        "Failed to persist trigger response memory",
      );
    }
    return [];
  };

  // Run the full agent pipeline (providers gather context → planner →
  // actions → response → evaluators) for this instruction. The autonomy
  // service uses the same path; we mirror it so triggers don't depend on
  // the autonomy loop being enabled — that dependency silently swallowed
  // every trigger when autonomy was off (the default).
  //
  // Primary path: runtime.messageService.handleMessage(...). Fallback:
  // emit MESSAGE_RECEIVED for older cores that don't expose the service.
  type MessageServiceLike = {
    handleMessage: (
      runtime: IAgentRuntime,
      message: Memory,
      callback?: HandlerCallback,
    ) => Promise<{ didRespond?: boolean; mode?: string } & Record<string, unknown>>;
  };
  const runtimeWithMessageService = runtime as IAgentRuntime & {
    messageService?: MessageServiceLike;
  };
  try {
    if (runtimeWithMessageService.messageService) {
      const result = await runtimeWithMessageService.messageService.handleMessage(
        runtime,
        instructionMemory,
        callback,
      );
      runtime.logger.info?.(
        {
          src: "trigger-runtime",
          agentId: runtime.agentId,
          triggerId: trigger.triggerId,
          didRespond: result?.didRespond,
        },
        `Trigger pipeline complete (didRespond=${result?.didRespond ?? "?"})`,
      );
    } else {
      runtime.logger.warn?.(
        {
          src: "trigger-runtime",
          agentId: runtime.agentId,
          triggerId: trigger.triggerId,
        },
        "messageService unavailable — falling back to MESSAGE_RECEIVED event",
      );
      await runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
        runtime,
        message: instructionMemory,
        callback,
        source: "trigger-runtime",
      });
    }
  } catch (err) {
    runtime.logger.error?.(
      {
        src: "trigger-runtime",
        agentId: runtime.agentId,
        triggerId: trigger.triggerId,
        error: err instanceof Error ? err.message : String(err),
      },
      "Trigger pipeline dispatch failed",
    );
    throw err;
  }
}

interface N8nDispatchServiceLike {
  execute(
    workflowId: string,
    payload?: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string; executionId?: string }>;
}

async function dispatchWorkflow(
  runtime: IAgentRuntime,
  trigger: TriggerConfig,
  event?: TriggerExecutionOptions["event"],
): Promise<{ ok: true; executionId?: string } | { ok: false; error: string }> {
  if (!trigger.workflowId) {
    return { ok: false, error: "workflow trigger missing workflowId" };
  }
  const svc = runtime.getService<Service & N8nDispatchServiceLike>(
    "N8N_DISPATCH",
  ) as (Service & N8nDispatchServiceLike) | null;
  if (!svc) {
    runtime.logger.warn?.(
      {
        src: "trigger-runtime",
        triggerId: trigger.triggerId,
        workflowId: trigger.workflowId,
      },
      "[triggers] workflow dispatch requested but N8N_DISPATCH service not registered",
    );
    return { ok: false, error: "N8N_DISPATCH service not registered" };
  }
  const result = event
    ? await svc.execute(trigger.workflowId, {
        eventKind: event.kind,
        eventPayload: event.payload ?? {},
      })
    : await svc.execute(trigger.workflowId);
  return result.ok
    ? { ok: true, executionId: result.executionId }
    : { ok: false, error: result.error ?? "workflow execution failed" };
}

export async function executeTriggerTask(
  runtime: IAgentRuntime,
  task: Task,
  options: TriggerExecutionOptions,
): Promise<TriggerExecutionResult> {
  if (!task.id) {
    return { status: "skipped", taskDeleted: false };
  }

  const trigger = readTriggerConfig(task);
  if (!trigger) {
    recordExecutionMetric(runtime.agentId, "skipped", Date.now());
    return { status: "skipped", taskDeleted: false };
  }

  if (!trigger.enabled && !options.force) {
    recordExecutionMetric(runtime.agentId, "skipped", Date.now());
    return { status: "skipped", taskDeleted: false };
  }

  if (
    options.source === "event" &&
    trigger.triggerType !== "event" &&
    !options.force
  ) {
    recordExecutionMetric(runtime.agentId, "skipped", Date.now());
    return { status: "skipped", taskDeleted: false };
  }

  if (
    options.source === "event" &&
    trigger.triggerType === "event" &&
    trigger.eventKind !== options.event?.kind &&
    !options.force
  ) {
    recordExecutionMetric(runtime.agentId, "skipped", Date.now());
    return { status: "skipped", taskDeleted: false };
  }

  if (
    typeof trigger.maxRuns === "number" &&
    trigger.maxRuns > 0 &&
    trigger.runCount >= trigger.maxRuns
  ) {
    await runtime.deleteTask(task.id);
    recordExecutionMetric(runtime.agentId, "skipped", Date.now());
    return {
      status: "skipped",
      taskDeleted: true,
      trigger: taskToTriggerSummary(task),
    };
  }

  const isWorkflowKind = trigger.kind === "workflow";

  // Workflow-kind triggers dispatch to an external service; they don't
  // require the autonomy room to be ready.
  if (
    !isWorkflowKind &&
    !(await isAutonomyServiceAvailable(runtime)) &&
    options.source !== "manual"
  ) {
    runtime.logger.warn?.(
      {
        src: "trigger-runtime",
        taskId: task.id,
        triggerId: trigger.triggerId,
      },
      "Autonomy service unavailable — skipping trigger (will retry next cycle)",
    );
    recordExecutionMetric(runtime.agentId, "skipped", Date.now());
    return { status: "skipped", taskDeleted: false };
  }

  const startedAt = Date.now();
  let status: TriggerExecutionResult["status"] = "success";
  let errorMessage = "";
  let workflowExecutionId: string | undefined;

  if (isWorkflowKind) {
    const result = await dispatchWorkflow(runtime, trigger, options.event);
    if (result.ok === true) {
      workflowExecutionId = result.executionId;
    } else {
      status = "error";
      errorMessage = result.error;
      runtime.logger.error(
        {
          src: "trigger-runtime",
          agentId: runtime.agentId,
          taskId: task.id,
          triggerId: trigger.triggerId,
          workflowId: trigger.workflowId,
          error: errorMessage,
        },
        "Workflow trigger dispatch failed",
      );
    }
  } else {
    try {
      await dispatchInstruction(runtime, task.id, trigger, options.event);
    } catch (error) {
      status = "error";
      errorMessage = String(error);
      runtime.logger.error(
        {
          src: "trigger-runtime",
          agentId: runtime.agentId,
          taskId: task.id,
          triggerId: trigger.triggerId,
          error: errorMessage,
        },
        "Trigger execution failed",
      );
    }
  }

  if (status === "success") {
    runtime.logger.info(
      {
        src: "trigger-runtime",
        triggerId: trigger.triggerId,
        triggerName: trigger.displayName,
        triggerType: trigger.triggerType,
        source: options.source,
        latencyMs: Date.now() - startedAt,
      },
      `Trigger "${trigger.displayName}" executed successfully`,
    );
  }

  const finishedAt = Date.now();
  const runRecord: TriggerRunRecord = {
    triggerRunId: stringToUuid(crypto.randomUUID()),
    triggerId: trigger.triggerId,
    taskId: task.id,
    startedAt,
    finishedAt,
    status,
    error: errorMessage || undefined,
    latencyMs: finishedAt - startedAt,
    source: options.source,
    eventKind: options.event?.kind,
  };

  const updatedTrigger: TriggerConfig = {
    ...trigger,
    runCount: trigger.runCount + 1,
    lastRunAtIso: new Date(finishedAt).toISOString(),
    lastStatus: status,
    lastError: errorMessage || undefined,
  };

  const shouldDeleteTask =
    updatedTrigger.triggerType === "once" ||
    (typeof updatedTrigger.maxRuns === "number" &&
      updatedTrigger.maxRuns > 0 &&
      updatedTrigger.runCount >= updatedTrigger.maxRuns);

  const existingMetadata = taskMetadata(task);
  const nextMetadata = buildTriggerMetadata({
    existingMetadata,
    trigger: updatedTrigger,
    nowMs: finishedAt,
  });

  let metadataToPersist: TriggerTaskMetadata;
  if (!nextMetadata) {
    metadataToPersist = {
      ...existingMetadata,
      updatedAt: finishedAt,
      updateInterval: DISABLED_TRIGGER_INTERVAL_MS,
      trigger: {
        ...updatedTrigger,
        enabled: false,
        nextRunAtMs: finishedAt + DISABLED_TRIGGER_INTERVAL_MS,
        lastError:
          updatedTrigger.lastError ?? "Failed to compute next trigger schedule",
      },
      triggerRuns: appendRunRecord(existingMetadata.triggerRuns, runRecord),
    };
  } else {
    metadataToPersist = {
      ...nextMetadata,
      triggerRuns: appendRunRecord(existingMetadata.triggerRuns, runRecord),
    };
  }

  await runtime.updateTask(task.id, {
    description: metadataToPersist.trigger?.displayName ?? task.description,
    metadata: metadataToPersist,
  });

  const updatedTask: Task = {
    ...task,
    description: metadataToPersist.trigger?.displayName ?? task.description,
    metadata: metadataToPersist,
  };
  const triggerSummary = taskToTriggerSummary(updatedTask);

  if (shouldDeleteTask) {
    await runtime.deleteTask(task.id);
    recordExecutionMetric(runtime.agentId, status, finishedAt);
    return {
      status,
      error: errorMessage || undefined,
      runRecord,
      taskDeleted: true,
      trigger: triggerSummary,
      executionId: workflowExecutionId,
    };
  }

  recordExecutionMetric(runtime.agentId, status, finishedAt);
  return {
    status,
    error: errorMessage || undefined,
    runRecord,
    taskDeleted: false,
    trigger: triggerSummary,
    executionId: workflowExecutionId,
  };
}

export function registerTriggerTaskWorker(runtime: IAgentRuntime): void {
  if (runtime.getTaskWorker(TRIGGER_TASK_NAME)) return;

  runtime.registerTaskWorker({
    name: TRIGGER_TASK_NAME,
    shouldRun: async () => true,
    execute: async (rt, options, task) => {
      // Return the full result so callers (tests, dashboards) can inspect
      // trigger-specific fields like taskDeleted and runRecord.
      // TaskWorker.execute is typed as returning only scheduling metadata; trigger
      // workers return TriggerExecutionResult for tests and dashboards.
      return (await executeTriggerTask(rt, task, {
        source: options.source === "manual" ? "manual" : "scheduler",
        force: options.force === true,
      })) as unknown as undefined | { nextInterval?: number };
    },
  });
}

export async function listTriggerTasks(
  runtime: IAgentRuntime,
): Promise<Task[]> {
  if (!triggersFeatureEnabled(runtime)) return [];
  const agentIds = [runtime.agentId];
  const [triggerTasks, heartbeatTasks] = await Promise.all([
    runtime.getTasks({
      agentIds,
      tags: ["repeat", "trigger"],
    }),
    runtime.getTasks({
      agentIds,
      tags: ["repeat", "heartbeat"],
    }),
  ]);

  const merged = new Map<string, Task>();
  for (const task of [...triggerTasks, ...heartbeatTasks]) {
    const key =
      task.id ??
      `${task.name ?? ""}:${task.description ?? ""}:${(task.tags ?? []).join(",")}`;
    if (!merged.has(key)) {
      merged.set(key, task);
    }
  }
  return [...merged.values()];
}

function isExplicitHeartbeatTask(task: Task): boolean {
  const tags = task.tags ?? [];
  return HEARTBEAT_TASK_TAGS.every((tag) => tags.includes(tag));
}

/**
 * Derive a friendly display name for a plugin-owned repeat task that
 * doesn't carry explicit trigger metadata. Prefers the task's own
 * `name` (e.g. "IMESSAGE_HEARTBEAT") humanized, then falls back to the
 * first non-generic tag ("imessage", "telegram", etc.), then to a
 * generic "System Heartbeat" label.
 */
function deriveSystemHeartbeatName(task: Task): string {
  if (task.name && task.name.length > 0) {
    return task.name
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const tag = (task.tags ?? []).find(
    (t) => t !== "queue" && t !== "repeat" && t !== "trigger",
  );
  if (tag) {
    return `${tag.charAt(0).toUpperCase()}${tag.slice(1)} Heartbeat`;
  }
  return "System Heartbeat";
}

/**
 * Synthesize a read-only TriggerSummary for an explicit heartbeat task
 * that Eliza's trigger schema doesn't fully own. This is narrower than
 * "any repeat task": internal queue drains and runtime schedulers should
 * stay out of the Heartbeats UI even though they also use repeat tasks.
 */
function synthesizeSystemHeartbeatSummary(task: Task): TriggerSummary | null {
  if (!task.id) return null;
  const metadata = taskMetadata(task);
  const intervalMs =
    typeof metadata.updateInterval === "number"
      ? metadata.updateInterval
      : undefined;
  const tags = task.tags ?? [];
  // Identify the owning plugin from the third tag (first two are "queue"
  // and "repeat"). This becomes createdBy so the UI can group by source.
  const createdBy =
    tags.find((t) => t !== "queue" && t !== "repeat" && t !== "trigger") ??
    "system";
  return {
    id: task.id,
    taskId: task.id,
    displayName: deriveSystemHeartbeatName(task),
    instructions: task.description ?? "",
    triggerType: "interval",
    enabled: true,
    wakeMode: "next_autonomy_cycle",
    createdBy,
    intervalMs,
    runCount: 0,
    updatedAt:
      typeof metadata.updatedAt === "number" ? metadata.updatedAt : undefined,
    updateInterval: intervalMs,
  };
}

export function taskToTriggerSummary(task: Task): TriggerSummary | null {
  const trigger = readTriggerConfig(task);
  if (trigger && task.id) {
    const metadata = taskMetadata(task);
    return {
      id: trigger.triggerId,
      taskId: task.id,
      displayName: trigger.displayName,
      instructions: trigger.instructions,
      triggerType: trigger.triggerType,
      enabled: trigger.enabled,
      wakeMode: trigger.wakeMode,
      createdBy: trigger.createdBy,
      timezone: trigger.timezone,
      intervalMs: trigger.intervalMs,
      scheduledAtIso: trigger.scheduledAtIso,
      cronExpression: trigger.cronExpression,
      eventKind: trigger.eventKind,
      maxRuns: trigger.maxRuns,
      runCount: trigger.runCount,
      nextRunAtMs: trigger.nextRunAtMs,
      lastRunAtIso: trigger.lastRunAtIso,
      lastStatus: trigger.lastStatus,
      lastError: trigger.lastError,
      updatedAt: metadata.updatedAt,
      updateInterval: metadata.updateInterval,
      kind: trigger.kind,
      workflowId: trigger.workflowId,
      workflowName: trigger.workflowName,
    };
  }

  if (isExplicitHeartbeatTask(task)) {
    return synthesizeSystemHeartbeatSummary(task);
  }

  return null;
}

export async function getTriggerHealthSnapshot(
  runtime: IAgentRuntime,
): Promise<TriggerHealthSnapshot> {
  const tasks = await listTriggerTasks(runtime);
  let activeTriggers = 0;
  let disabledTriggers = 0;

  let durableExecutions = 0;
  let durableFailures = 0;
  let durableLastExecAt: number | undefined;

  for (const task of tasks) {
    const trigger = readTriggerConfig(task);
    if (!trigger) continue;
    if (trigger.enabled) {
      activeTriggers += 1;
    } else {
      disabledTriggers += 1;
    }

    const runs = readTriggerRuns(task);
    for (const run of runs) {
      durableExecutions += 1;
      if (run.status === "error") durableFailures += 1;
      if (!durableLastExecAt || run.finishedAt > durableLastExecAt) {
        durableLastExecAt = run.finishedAt;
      }
    }
  }

  const inMemory = getMetrics(runtime.agentId);
  return {
    triggersEnabled: triggersFeatureEnabled(runtime),
    activeTriggers,
    disabledTriggers,
    totalExecutions: Math.max(inMemory.totalExecutions, durableExecutions),
    totalFailures: Math.max(inMemory.totalFailures, durableFailures),
    totalSkipped: inMemory.totalSkipped,
    lastExecutionAt: inMemory.lastExecutionAt ?? durableLastExecAt,
  };
}
