import crypto from "node:crypto";
import {
  type TriggerRunRecord as CoreTriggerRunRecord,
  type IAgentRuntime,
  stringToUuid,
  type Task,
  type TriggerConfig,
  type TriggerKind,
  type TriggerType,
  type TriggerWakeMode,
  type UUID,
} from "@elizaos/core";
import type {
  TriggerExecutionOptions,
  TriggerExecutionResult,
} from "../triggers/runtime.js";
import type {
  NormalizedTriggerDraft,
  TriggerHealthSnapshot,
  TriggerSummary,
  TriggerTaskMetadata,
} from "../triggers/types.js";
import type { RouteHelpers, RouteRequestContext } from "./route-helpers.js";

export type TriggerRouteHelpers = RouteHelpers;

interface TriggerDraftInput {
  displayName?: string;
  instructions?: string;
  triggerType?: TriggerType;
  wakeMode?: TriggerWakeMode;
  enabled?: boolean;
  createdBy?: string;
  timezone?: string;
  intervalMs?: number;
  scheduledAtIso?: string;
  cronExpression?: string;
  eventKind?: string;
  maxRuns?: number;
  kind?: TriggerKind;
  workflowId?: string;
  workflowName?: string;
}

interface NormalizeTriggerDraftFallback {
  displayName: string;
  instructions: string;
  triggerType: TriggerType;
  wakeMode: TriggerWakeMode;
  enabled: boolean;
  createdBy: string;
}

export interface TriggerRouteContext extends RouteRequestContext {
  runtime: IAgentRuntime | null;
  executeTriggerTask: (
    runtime: IAgentRuntime,
    task: Task,
    options: TriggerExecutionOptions,
  ) => Promise<TriggerExecutionResult>;
  getTriggerHealthSnapshot: (
    runtime: IAgentRuntime,
  ) => Promise<TriggerHealthSnapshot>;
  getTriggerLimit: (runtime: IAgentRuntime) => number;
  listTriggerTasks: (runtime: IAgentRuntime) => Promise<Task[]>;
  readTriggerConfig: (task: Task) => TriggerConfig | null;
  readTriggerRuns: (task: Task) => CoreTriggerRunRecord[];
  taskToTriggerSummary: (task: Task) => TriggerSummary | null;
  triggersFeatureEnabled: (runtime: IAgentRuntime) => boolean;
  buildTriggerConfig: (params: {
    draft: NormalizedTriggerDraft;
    triggerId: UUID;
    previous?: TriggerConfig;
  }) => TriggerConfig;
  buildTriggerMetadata: (params: {
    existingMetadata?: TriggerTaskMetadata;
    trigger: TriggerConfig;
    nowMs: number;
  }) => TriggerTaskMetadata | null;
  normalizeTriggerDraft: (params: {
    input: TriggerDraftInput;
    fallback: NormalizeTriggerDraftFallback;
  }) => { draft?: NormalizedTriggerDraft; error?: string };
  DISABLED_TRIGGER_INTERVAL_MS: number;
  TRIGGER_TASK_NAME: string;
  TRIGGER_TASK_TAGS: string[];
}

/**
 * Heuristic: does this trigger's instruction text describe a web-search job?
 * Catches phrasings like "search the web for X", "find online", "look up on
 * Google", "trends today", "latest news on Y" without being so permissive
 * that any mention of "find" triggers a false positive.
 */
function instructionLikelyNeedsWebSearch(text: string): boolean {
  if (typeof text !== "string" || !text.trim()) return false;
  const t = text.toLowerCase();
  if (/\b(search|find|look\s*up|google|crawl|scrape)\b.{0,40}\b(web|online|internet|net|google)\b/.test(t))
    return true;
  if (/\b(search\s+for|google\s+for|web\s+search|internet\s+search)\b/.test(t))
    return true;
  if (/\b(latest|today's|recent|trending|top)\b.{0,40}\b(news|trends?|articles?|stories|updates|releases?|developments?)\b/.test(t))
    return true;
  if (/\bwhat'?s\s+(new|happening|trending)\b/.test(t)) return true;
  return false;
}

function tavilyKeyConfigured(): boolean {
  const v = process.env.TAVILY_API_KEY;
  return typeof v === "string" && v.trim().length > 0;
}

function trim(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function parseTriggerKind(value: unknown): TriggerKind | undefined {
  if (value === "text" || value === "workflow") return value;
  return undefined;
}

type ParsedTriggerKind =
  | { ok: true; kind: TriggerKind }
  | { ok: false; error: string };

function parseTriggerKindStrict(value: unknown): ParsedTriggerKind | undefined {
  if (value === undefined) return undefined;
  if (value === "text" || value === "workflow")
    return { ok: true, kind: value };
  return { ok: false, error: "kind must be 'text' or 'workflow'" };
}

function parseNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseEventPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeTriggerPath(pathname: string): {
  normalizedPathname: string;
  usingHeartbeatsAlias: boolean;
} {
  if (pathname === "/api/heartbeats") {
    return {
      normalizedPathname: "/api/triggers",
      usingHeartbeatsAlias: true,
    };
  }
  if (pathname.startsWith("/api/heartbeats/")) {
    return {
      normalizedPathname: pathname.replace("/api/heartbeats", "/api/triggers"),
      usingHeartbeatsAlias: true,
    };
  }
  return {
    normalizedPathname: pathname,
    usingHeartbeatsAlias: false,
  };
}

async function findTask(
  runtime: IAgentRuntime,
  id: string,
  listTriggerTasks: (runtime: IAgentRuntime) => Promise<Task[]>,
  readTriggerConfig: (task: Task) => TriggerConfig | null,
): Promise<Task | null> {
  const tasks = await listTriggerTasks(runtime);
  return (
    tasks.find((task) => {
      const trigger = readTriggerConfig(task);
      return trigger?.triggerId === id || task.id === id;
    }) ?? null
  );
}

export async function handleTriggerRoutes(
  ctx: TriggerRouteContext,
): Promise<boolean> {
  const {
    method,
    pathname,
    req,
    res,
    runtime,
    readJsonBody,
    json,
    error,
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
    TRIGGER_TASK_TAGS,
  } = ctx;

  const { normalizedPathname, usingHeartbeatsAlias } =
    normalizeTriggerPath(pathname);
  const listResponse = (triggers: TriggerSummary[], status = 200): void => {
    json(
      res,
      usingHeartbeatsAlias ? { triggers, heartbeats: triggers } : { triggers },
      status,
    );
  };
  const itemResponse = (summary: TriggerSummary, status = 200): void => {
    json(
      res,
      usingHeartbeatsAlias
        ? { trigger: summary, heartbeat: summary }
        : { trigger: summary },
      status,
    );
  };

  if (
    !normalizedPathname.startsWith("/api/triggers") &&
    !pathname.startsWith("/api/heartbeats")
  )
    return false;
  if (!runtime) {
    error(res, "Agent is not running", 503);
    return true;
  }
  if (
    !triggersFeatureEnabled(runtime) &&
    normalizedPathname !== "/api/triggers/health"
  ) {
    error(res, "Triggers are disabled by configuration", 503);
    return true;
  }

  if (method === "GET" && normalizedPathname === "/api/triggers/health") {
    json(res, await getTriggerHealthSnapshot(runtime));
    return true;
  }

  if (method === "GET" && normalizedPathname === "/api/triggers") {
    const tasks = await listTriggerTasks(runtime);
    const triggers = tasks
      .map(taskToTriggerSummary)
      .filter((summary): summary is TriggerSummary => summary !== null)
      .sort((a, b) =>
        String(a.displayName ?? "").localeCompare(String(b.displayName ?? "")),
      );
    listResponse(triggers);
    return true;
  }

  if (method === "POST" && normalizedPathname === "/api/triggers") {
    const body = await readJsonBody<Record<string, unknown>>(req, res);
    if (!body) return true;

    // Pre-flight: refuse to schedule a web-search-shaped trigger when the
    // search backend isn't configured. Otherwise the user wouldn't discover
    // the missing key until first fire (hours/days later for a daily cron).
    if (
      typeof body.instructions === "string" &&
      instructionLikelyNeedsWebSearch(body.instructions) &&
      !tavilyKeyConfigured() &&
      process.env.TOKAGENT_ALLOW_UNCONFIGURED_WEB_SEARCH !== "1"
    ) {
      error(
        res,
        "This trigger looks like it needs to search the web, but " +
          "TAVILY_API_KEY is not configured. The agent cannot fulfill " +
          "web-search requests without it.\n\n" +
          "To fix:\n" +
          "  1. Get a free key at https://app.tavily.com/sign-in " +
          "(1,000 searches/month, no credit card).\n" +
          "  2. In the app, open Settings → Plugins → web-fetch, paste " +
          "the key, and Save. The runtime restarts automatically.\n" +
          "  3. Re-schedule this trigger.\n\n" +
          "If you intend to add the key later and want to schedule the " +
          "trigger now anyway, set TOKAGENT_ALLOW_UNCONFIGURED_WEB_SEARCH=1 " +
          "in your environment and try again.",
        400,
      );
      return true;
    }

    const creator =
      typeof body.createdBy === "string"
        ? trim(body.createdBy) || "api"
        : "api";
    const kindParsed = parseTriggerKindStrict(body.kind);
    if (kindParsed !== undefined && kindParsed.ok === false) {
      error(res, kindParsed.error, 400);
      return true;
    }
    const kind: TriggerKind | undefined = kindParsed?.ok
      ? kindParsed.kind
      : undefined;
    const workflowId = parseNonEmptyString(body.workflowId);
    const workflowName = parseNonEmptyString(body.workflowName);
    if (kind === "workflow" && !workflowId) {
      error(res, "workflowId is required when kind is 'workflow'", 400);
      return true;
    }
    const inputDraft: TriggerDraftInput = {
      displayName:
        typeof body.displayName === "string" ? body.displayName : undefined,
      instructions:
        typeof body.instructions === "string" ? body.instructions : undefined,
      triggerType:
        typeof body.triggerType === "string"
          ? (body.triggerType as TriggerType)
          : undefined,
      wakeMode:
        typeof body.wakeMode === "string"
          ? (body.wakeMode as TriggerWakeMode)
          : undefined,
      enabled: !!(body.enabled ?? true),
      createdBy: creator,
      timezone: typeof body.timezone === "string" ? body.timezone : undefined,
      intervalMs:
        typeof body.intervalMs === "number" ? body.intervalMs : undefined,
      scheduledAtIso:
        typeof body.scheduledAtIso === "string"
          ? body.scheduledAtIso
          : undefined,
      cronExpression:
        typeof body.cronExpression === "string"
          ? body.cronExpression
          : undefined,
      eventKind:
        typeof body.eventKind === "string" ? body.eventKind : undefined,
      maxRuns: typeof body.maxRuns === "number" ? body.maxRuns : undefined,
      kind,
      workflowId,
      workflowName,
    };
    const normalized = normalizeTriggerDraft({
      input: inputDraft,
      fallback: {
        displayName:
          typeof body.displayName === "string" && trim(body.displayName)
            ? trim(body.displayName)
            : "New Trigger",
        instructions:
          typeof body.instructions === "string" ? trim(body.instructions) : "",
        triggerType:
          typeof body.triggerType === "string"
            ? (body.triggerType as TriggerType)
            : "interval",
        wakeMode:
          typeof body.wakeMode === "string"
            ? (body.wakeMode as TriggerWakeMode)
            : "inject_now",
        enabled: body.enabled === undefined ? true : body.enabled === true,
        createdBy: creator,
      },
    });
    if (!normalized.draft) {
      error(res, normalized.error ?? "Invalid trigger request", 400);
      return true;
    }

    const existingTasks = await listTriggerTasks(runtime);
    const activeCount = existingTasks.filter((task) => {
      const trigger = readTriggerConfig(task);
      return trigger?.enabled && trigger.createdBy === creator;
    }).length;
    const limit = getTriggerLimit(runtime);
    if (activeCount >= limit) {
      error(res, `Active trigger limit reached (${limit})`, 429);
      return true;
    }

    const triggerId = stringToUuid(crypto.randomUUID());
    const trigger = buildTriggerConfig({ draft: normalized.draft, triggerId });

    const duplicate = existingTasks.find((task) => {
      const existingTrigger = readTriggerConfig(task);
      return (
        existingTrigger?.enabled &&
        existingTrigger.dedupeKey &&
        existingTrigger.dedupeKey === trigger.dedupeKey
      );
    });
    if (duplicate?.id) {
      error(res, "Equivalent trigger already exists", 409);
      return true;
    }

    const nowMs = Date.now();
    const metadata = trigger.enabled
      ? buildTriggerMetadata({ trigger, nowMs })
      : ({
          updatedAt: nowMs,
          updateInterval: DISABLED_TRIGGER_INTERVAL_MS,
          trigger: {
            ...trigger,
            nextRunAtMs: nowMs + DISABLED_TRIGGER_INTERVAL_MS,
          },
        } as TriggerTaskMetadata);
    if (!metadata) {
      error(res, "Unable to compute trigger schedule", 400);
      return true;
    }

    const roomId = (
      runtime.getService("AUTONOMY") as { getAutonomousRoomId?(): UUID } | null
    )?.getAutonomousRoomId?.();
    const taskId = await runtime.createTask({
      name: TRIGGER_TASK_NAME,
      description: trigger.displayName,
      roomId,
      tags: [...TRIGGER_TASK_TAGS],
      metadata: metadata as Task["metadata"],
    });
    const created = await runtime.getTask(taskId);
    const summary = created ? taskToTriggerSummary(created) : null;
    if (!summary) {
      error(res, "Trigger created but summary could not be generated", 500);
      return true;
    }
    itemResponse(summary, 201);
    return true;
  }

  const runsMatch = /^\/api\/triggers\/([^/]+)\/runs$/.exec(normalizedPathname);
  if (method === "GET" && runsMatch) {
    const task = await findTask(
      runtime,
      decodeURIComponent(runsMatch[1]),
      listTriggerTasks,
      readTriggerConfig,
    );
    if (!task) {
      error(res, "Trigger not found", 404);
      return true;
    }
    json(res, { runs: readTriggerRuns(task) });
    return true;
  }

  // GET /api/triggers/:triggerId/runs/:runId/output
  // Returns the agent's output for a specific run by cross-referencing
  // autonomy-room memories created during the run's execution window.
  // Lazy lookup so the runs list itself stays fast — the UI calls this
  // only when a row is expanded.
  const runOutputMatch = /^\/api\/triggers\/([^/]+)\/runs\/([^/]+)\/output$/.exec(
    normalizedPathname,
  );
  if (method === "GET" && runOutputMatch) {
    const triggerIdParam = decodeURIComponent(runOutputMatch[1] ?? "");
    const runIdParam = decodeURIComponent(runOutputMatch[2] ?? "");
    const task = await findTask(
      runtime,
      triggerIdParam,
      listTriggerTasks,
      readTriggerConfig,
    );
    if (!task) {
      error(res, "Trigger not found", 404);
      return true;
    }
    const runs = readTriggerRuns(task);
    const run = runs.find((r) => r.triggerRunId === runIdParam);
    if (!run) {
      error(res, "Run not found", 404);
      return true;
    }
    // Resolve the autonomy room id where instructions are dispatched.
    type AutonomyServiceLike = {
      getAutonomousRoomId?: () => UUID | undefined;
      getTargetRoomId?: () => UUID | undefined;
    };
    const autonomyService =
      runtime.getService<AutonomyServiceLike>("AUTONOMY") ??
      runtime.getService<AutonomyServiceLike>("autonomy");
    const roomId =
      autonomyService?.getAutonomousRoomId?.() ??
      autonomyService?.getTargetRoomId?.();
    if (!roomId) {
      json(res, {
        output: null,
        status: "no_autonomy_room",
        message:
          "Autonomy room is not configured — outputs from past runs cannot be resolved.",
      });
      return true;
    }
    // Window: from run start to 5 minutes after — captures the autonomy
    // loop's response even if it took a while to produce.
    const start = run.startedAt;
    const end = run.startedAt + 5 * 60 * 1000;
    type MemoryLike = {
      id?: UUID;
      entityId?: UUID;
      createdAt?: number;
      content?: {
        text?: unknown;
        source?: unknown;
        metadata?: { isAutonomousInstruction?: unknown } & Record<string, unknown>;
      };
    };
    const adapter = runtime as unknown as {
      getMemories?: (params: {
        tableName: string;
        roomId: UUID;
        start?: number;
        end?: number;
        count?: number;
      }) => Promise<MemoryLike[]>;
    };
    // Agent responses from the autonomy loop are persisted to the
    // "memories" table (see AutonomyService.processAutonomousMessage),
    // while user-facing chat replies and the dispatched trigger instruction
    // live in the "messages" table. Trigger outputs end up in BOTH
    // depending on the autonomy mode in play — query both and merge so
    // either path is captured.
    let messages: MemoryLike[] = [];
    if (typeof adapter.getMemories === "function") {
      try {
        const [fromMemories, fromMessages] = await Promise.all([
          adapter
            .getMemories({
              tableName: "memories",
              roomId,
              start,
              end,
              count: 50,
            })
            .catch(() => [] as MemoryLike[]),
          adapter
            .getMemories({
              tableName: "messages",
              roomId,
              start,
              end,
              count: 50,
            })
            .catch(() => [] as MemoryLike[]),
        ]);
        // Merge + dedupe by id (memories occasionally exist in both with
        // matching ids when a chat reply is mirrored to the memories table).
        const seen = new Set<string>();
        for (const m of [...fromMemories, ...fromMessages]) {
          const id = String(m.id ?? "");
          if (id && seen.has(id)) continue;
          if (id) seen.add(id);
          messages.push(m);
        }
      } catch (err) {
        // Fail soft — return null output rather than 500.
        json(res, {
          output: null,
          status: "lookup_failed",
          message: err instanceof Error ? err.message : String(err),
        });
        return true;
      }
    }
    // Filter to agent-authored messages produced by the trigger pipeline.
    // The trigger callback persists EVERY content with source="trigger-runtime"
    // and metadata.type="trigger-response" (with runStage="action-result" or
    // "final-response"). The original dispatched instruction has source
    // "trigger-runtime" too but `isAutonomousInstruction: true` — exclude
    // that one path.
    const isDispatchedInstruction = (m: MemoryLike): boolean => {
      const meta = m.content?.metadata as Record<string, unknown> | undefined;
      return meta?.isAutonomousInstruction === true;
    };
    const isAutonomousPrompt = (m: MemoryLike): boolean => {
      const metaType = (m.content?.metadata as Record<string, unknown> | undefined)
        ?.type;
      return metaType === "autonomous-prompt";
    };
    const candidate = messages
      .filter(
        (m) =>
          m.entityId === runtime.agentId &&
          !isDispatchedInstruction(m) &&
          !isAutonomousPrompt(m) &&
          typeof m.content?.text === "string" &&
          (m.content.text as string).trim().length > 0,
      )
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    if (candidate.length === 0) {
      // Run finished but nothing matched. Surface a peek of what WAS in
      // the window so we can see whether the agent is writing to a path
      // the filter doesn't recognize (different entityId, different
      // metadata shape, etc).
      const peek = messages.slice(0, 10).map((m) => ({
        entityIdMatches: m.entityId === runtime.agentId,
        source: typeof m.content?.source === "string" ? m.content.source : null,
        metadataType:
          (m.content?.metadata as Record<string, unknown> | undefined)?.type ??
          null,
        textPreview:
          typeof m.content?.text === "string"
            ? m.content.text.slice(0, 80)
            : null,
        createdAt: m.createdAt ?? null,
      }));
      json(res, {
        output: null,
        status:
          run.status === "skipped"
            ? "skipped"
            : Date.now() - run.startedAt < 120_000
              ? "still_processing"
              : "no_output",
        diagnostics: {
          memoriesInWindow: messages.length,
          agentId: runtime.agentId,
          roomId,
          windowStart: start,
          windowEnd: end,
          peek,
        },
      });
      return true;
    }
    // Split into action results and the final response so the UI can
    // render the actual tool outputs (Tavily JSON, fetched pages, etc.)
    // separately from the LLM's natural-language reply — vital when the
    // LLM paraphrases or refuses despite the action succeeding.
    type Segment = { stage: "action" | "final"; action?: string; text: string };
    const segments: Segment[] = candidate.map((m) => {
      const meta = m.content?.metadata as Record<string, unknown> | undefined;
      const runStage = meta?.runStage === "action-result" ? "action" : "final";
      const action =
        typeof meta?.actionName === "string"
          ? (meta.actionName as string)
          : undefined;
      return {
        stage: runStage,
        action,
        text: String(m.content?.text ?? ""),
      };
    });
    // Format a combined text view (back-compat for clients reading
    // `output.text`) — action results first, then the final summary, so
    // raw tool output stays visible above the LLM narration.
    const MAX_BYTES = 4096;
    const combinedParts: string[] = [];
    for (const s of segments) {
      if (s.stage === "action") {
        const header = s.action ? `[${s.action}]` : "[action]";
        combinedParts.push(`${header}\n${s.text}`);
      } else {
        combinedParts.push(`[agent]\n${s.text}`);
      }
    }
    const combined = combinedParts.join("\n\n---\n\n");
    const byteLength = Buffer.byteLength(combined, "utf8");
    const text =
      byteLength > MAX_BYTES
        ? `${combined.slice(0, MAX_BYTES)}\n…[truncated — original ${byteLength} bytes]`
        : combined;
    json(res, {
      output: { text, truncated: byteLength > MAX_BYTES },
      status: "ready",
      messageCount: candidate.length,
      segments,
    });
    return true;
  }

  const execMatch = /^\/api\/triggers\/([^/]+)\/execute$/.exec(
    normalizedPathname,
  );
  if (method === "POST" && execMatch) {
    const task = await findTask(
      runtime,
      decodeURIComponent(execMatch[1]),
      listTriggerTasks,
      readTriggerConfig,
    );
    if (!task) {
      error(res, "Trigger not found", 404);
      return true;
    }
    const result: TriggerExecutionResult = await executeTriggerTask(
      runtime,
      task,
      {
        source: "manual",
        force: true,
      },
    );
    const refreshed = task.id ? await runtime.getTask(task.id) : null;
    const summary = refreshed
      ? taskToTriggerSummary(refreshed)
      : (result.trigger ?? null);
    json(
      res,
      usingHeartbeatsAlias
        ? { ok: true, result, trigger: summary, heartbeat: summary }
        : { ok: true, result, trigger: summary },
    );
    return true;
  }

  const eventMatch = /^\/api\/triggers\/events\/([^/]+)$/.exec(
    normalizedPathname,
  );
  if (method === "POST" && eventMatch) {
    const eventKind = decodeURIComponent(eventMatch[1] ?? "").trim();
    if (!eventKind) {
      error(res, "event kind is required", 400);
      return true;
    }

    const body = await readJsonBody<Record<string, unknown>>(req, res);
    if (!body) return true;
    const payload = parseEventPayload(body.payload ?? body);
    const tasks = await listTriggerTasks(runtime);
    const matchingTasks = tasks.filter((task) => {
      const trigger = readTriggerConfig(task);
      return (
        trigger?.enabled === true &&
        trigger.triggerType === "event" &&
        trigger.eventKind === eventKind
      );
    });
    const results = [];
    for (const task of matchingTasks) {
      const result = await executeTriggerTask(runtime, task, {
        source: "event",
        event: { kind: eventKind, payload },
      });
      const refreshed = task.id ? await runtime.getTask(task.id) : null;
      results.push({
        taskId: task.id,
        result,
        trigger: refreshed
          ? taskToTriggerSummary(refreshed)
          : (result.trigger ?? null),
      });
    }
    json(res, {
      ok: true,
      eventKind,
      matched: matchingTasks.length,
      results,
    });
    return true;
  }

  const itemMatch = /^\/api\/triggers\/([^/]+)$/.exec(normalizedPathname);
  if (!itemMatch) return false;
  const triggerId = decodeURIComponent(itemMatch[1]);

  if (method === "GET") {
    const task = await findTask(
      runtime,
      triggerId,
      listTriggerTasks,
      readTriggerConfig,
    );
    if (!task) {
      error(res, "Trigger not found", 404);
      return true;
    }
    const summary = taskToTriggerSummary(task);
    if (!summary) {
      error(res, "Trigger metadata is invalid", 500);
      return true;
    }
    itemResponse(summary);
    return true;
  }

  if (method === "DELETE") {
    const task = await findTask(
      runtime,
      triggerId,
      listTriggerTasks,
      readTriggerConfig,
    );
    if (!task?.id) {
      error(res, "Trigger not found", 404);
      return true;
    }
    await runtime.deleteTask(task.id);
    json(res, { ok: true });
    return true;
  }

  if (method === "PUT") {
    const task = await findTask(
      runtime,
      triggerId,
      listTriggerTasks,
      readTriggerConfig,
    );
    if (!task?.id) {
      error(res, "Trigger not found", 404);
      return true;
    }
    const current = readTriggerConfig(task);
    if (!current) {
      error(res, "Trigger metadata is invalid", 500);
      return true;
    }

    const body = await readJsonBody<Record<string, unknown>>(req, res);
    if (!body) return true;

    const kindParsed = parseTriggerKindStrict(body.kind);
    if (kindParsed !== undefined && kindParsed.ok === false) {
      error(res, kindParsed.error, 400);
      return true;
    }
    const parsedKind: TriggerKind | undefined = kindParsed?.ok
      ? kindParsed.kind
      : undefined;
    const nextKind: TriggerKind | undefined =
      parsedKind ?? parseTriggerKind(current.kind);
    const nextWorkflowId =
      parseNonEmptyString(body.workflowId) ?? current.workflowId;
    const nextWorkflowName =
      parseNonEmptyString(body.workflowName) ?? current.workflowName;
    if (nextKind === "workflow" && !nextWorkflowId) {
      error(res, "workflowId is required when kind is 'workflow'", 400);
      return true;
    }

    const mergedInput: TriggerDraftInput = {
      displayName:
        typeof body.displayName === "string" ? body.displayName : undefined,
      instructions:
        typeof body.instructions === "string" ? body.instructions : undefined,
      triggerType:
        typeof body.triggerType === "string"
          ? (body.triggerType as TriggerType)
          : undefined,
      wakeMode:
        typeof body.wakeMode === "string"
          ? (body.wakeMode as TriggerWakeMode)
          : undefined,
      enabled:
        body.enabled === undefined ? current.enabled : body.enabled === true,
      createdBy: current.createdBy,
      timezone: typeof body.timezone === "string" ? body.timezone : undefined,
      intervalMs:
        typeof body.intervalMs === "number"
          ? body.intervalMs
          : current.intervalMs,
      scheduledAtIso:
        typeof body.scheduledAtIso === "string"
          ? body.scheduledAtIso
          : current.scheduledAtIso,
      cronExpression:
        typeof body.cronExpression === "string"
          ? body.cronExpression
          : current.cronExpression,
      eventKind:
        typeof body.eventKind === "string" ? body.eventKind : current.eventKind,
      maxRuns:
        typeof body.maxRuns === "number" ? body.maxRuns : current.maxRuns,
      kind: nextKind,
      workflowId: nextWorkflowId,
      workflowName: nextWorkflowName,
    };
    const normalized = normalizeTriggerDraft({
      input: mergedInput,
      fallback: {
        displayName: current.displayName,
        instructions: current.instructions,
        triggerType: current.triggerType,
        wakeMode: current.wakeMode,
        enabled:
          body.enabled === undefined ? current.enabled : body.enabled === true,
        createdBy: current.createdBy,
      },
    });
    if (!normalized.draft) {
      error(res, normalized.error ?? "Invalid update", 400);
      return true;
    }

    const nextTrigger = buildTriggerConfig({
      draft: normalized.draft,
      triggerId: current.triggerId,
      previous: current,
    });
    const existingMeta = (task.metadata ?? {}) as TriggerTaskMetadata;
    const existingRuns = readTriggerRuns(task);

    let nextMeta: TriggerTaskMetadata;
    if (!nextTrigger.enabled) {
      nextMeta = {
        ...existingMeta,
        updatedAt: Date.now(),
        updateInterval: DISABLED_TRIGGER_INTERVAL_MS,
        trigger: {
          ...nextTrigger,
          nextRunAtMs: Date.now() + DISABLED_TRIGGER_INTERVAL_MS,
        },
        triggerRuns: existingRuns,
      };
    } else {
      const built = buildTriggerMetadata({
        existingMetadata: existingMeta,
        trigger: nextTrigger,
        nowMs: Date.now(),
      });
      if (!built) {
        error(res, "Unable to compute trigger schedule", 400);
        return true;
      }
      nextMeta = built;
    }

    await runtime.updateTask(task.id, {
      description: nextTrigger.displayName,
      metadata: nextMeta as Task["metadata"],
    });
    const refreshed = await runtime.getTask(task.id);
    if (!refreshed) {
      error(res, "Trigger updated but no longer available", 500);
      return true;
    }
    const summary = taskToTriggerSummary(refreshed);
    if (!summary) {
      error(res, "Trigger metadata is invalid", 500);
      return true;
    }
    itemResponse(summary);
    return true;
  }

  return false;
}
