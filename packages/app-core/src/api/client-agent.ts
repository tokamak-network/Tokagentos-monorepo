/**
 * Agent domain methods — lifecycle, auth, config, connectors, triggers,
 * training, plugins, streaming/PTY, logs, character, permissions, updates.
 */

import type {
  AllPermissionsState,
  PermissionState,
  SystemPermissionId,
} from "@tokagentos/agent/contracts/permissions";
import {
  isTokagentSettingsDebugEnabled,
  sanitizeForSettingsDebug,
  settingsDebugCloudSummary,
} from "@tokagentos/shared";
import type {
  OnboardingConnectorConfig as ConnectorConfig,
  OnboardingData,
  OnboardingOptions,
  SubscriptionStatusResponse,
} from "@tokagentos/shared/contracts/onboarding";
import {
  getWebsiteBlockerPlugin,
  type WebsiteBlockerPermissionResult,
  type WebsiteBlockerStatusResult,
} from "../bridge/native-plugins";
import { TERMINAL_STATUSES } from "../chat/coding-agent-session-state";
import { TokagentClient } from "./client-base";
import type {
  AgentAutomationMode,
  AgentAutomationModeResponse,
  AgentEventsResponse,
  AgentSelfStatusSnapshot,
  AgentStatus,
  CharacterData,
  CodingAgentScratchWorkspace,
  CodingAgentStatus,
  CodingAgentTaskThread,
  CodingAgentTaskThreadDetail,
  ConfigSchemaResponse,
  CorePluginsResponse,
  CreateTriggerRequest,
  ExtensionStatus,
  LogsFilter,
  LogsResponse,
  PluginInfo,
  PluginMutationResult,
  RawPtySession,
  RelationshipsActivityResponse,
  RelationshipsGraphQuery,
  RelationshipsGraphSnapshot,
  RelationshipsGraphStats,
  RelationshipsMergeCandidate,
  RelationshipsPersonDetail,
  RelationshipsPersonSummary,
  RuntimeDebugSnapshot,
  SecretInfo,
  SecurityAuditFilter,
  SecurityAuditResponse,
  SecurityAuditStreamEvent,
  StartTrainingOptions,
  TradePermissionMode,
  TradePermissionModeResponse,
  TrainingDatasetRecord,
  TrainingJobRecord,
  TrainingModelRecord,
  TrainingStatus,
  TrainingTrajectoryDetail,
  TrainingTrajectoryList,
  TriggerHealthSnapshot,
  TriggerLastStatus,
  TriggerRunRecord,
  TriggerSummary,
  UpdateStatus,
  UpdateTriggerRequest,
} from "./client-types";
import {
  mapPtySessionsToCodingAgentSessions,
  mapTaskThreadsToCodingAgentSessions,
} from "./client-types";

type RolodexGraphQuery = RelationshipsGraphQuery;
type RolodexGraphSnapshot = RelationshipsGraphSnapshot;
type RolodexGraphStats = RelationshipsGraphStats;
type RolodexPersonDetail = RelationshipsPersonDetail;
type RolodexPersonSummary = RelationshipsPersonSummary;

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function clientSettingsDebug(): boolean {
  let viteEnv: Record<string, unknown> | undefined;
  try {
    viteEnv = import.meta.env as Record<string, unknown>;
  } catch {
    viteEnv = undefined;
  }
  return isTokagentSettingsDebugEnabled({
    importMetaEnv: viteEnv,
    env: typeof process !== "undefined" ? process.env : undefined,
  });
}

const WEBSITE_BLOCKING_PERMISSION_ID = "website-blocking" as const;

function getNativeWebsiteBlockerPluginIfAvailable() {
  const plugin = getWebsiteBlockerPlugin();
  return typeof plugin.getStatus === "function" &&
    typeof plugin.startBlock === "function" &&
    typeof plugin.stopBlock === "function" &&
    typeof plugin.checkPermissions === "function" &&
    typeof plugin.requestPermissions === "function" &&
    typeof plugin.openSettings === "function"
    ? plugin
    : null;
}

function mapWebsiteBlockerPermissionResult(
  permission: WebsiteBlockerPermissionResult,
): PermissionState {
  return {
    id: WEBSITE_BLOCKING_PERMISSION_ID,
    status: permission.status,
    canRequest: permission.canRequest,
    reason: permission.reason,
    lastChecked: Date.now(),
  };
}

function mapWebsiteBlockerStatusToPermission(
  status: WebsiteBlockerStatusResult,
): PermissionState {
  return {
    id: WEBSITE_BLOCKING_PERMISSION_ID,
    status:
      status.permissionStatus ??
      (status.available ? "granted" : "not-determined"),
    canRequest: status.canRequestPermission ?? status.supportsElevationPrompt,
    reason: status.reason,
    lastChecked: Date.now(),
  };
}

function logSettingsClient(
  phase: string,
  detail: Record<string, unknown>,
): void {
  if (!clientSettingsDebug()) return;
  console.debug(
    `[tokagent][settings][client] ${phase}`,
    sanitizeForSettingsDebug(detail),
  );
}

const SETTINGS_MUTATION_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Declaration merging
// ---------------------------------------------------------------------------

declare module "./client-base" {
  interface TokagentClient {
    getStatus(): Promise<AgentStatus>;
    getAgentSelfStatus(): Promise<AgentSelfStatusSnapshot>;
    getRuntimeSnapshot(opts?: {
      depth?: number;
      maxArrayLength?: number;
      maxObjectEntries?: number;
      maxStringLength?: number;
    }): Promise<RuntimeDebugSnapshot>;
    setAutomationMode(
      mode: "connectors-only" | "full",
    ): Promise<{ mode: string }>;
    setTradeMode(
      mode: string,
    ): Promise<{ ok: boolean; tradePermissionMode: string }>;
    playEmote(emoteId: string): Promise<{ ok: boolean }>;
    runTerminalCommand(command: string): Promise<{ ok: boolean }>;
    getOnboardingStatus(): Promise<{
      complete: boolean;
      cloudProvisioned?: boolean;
    }>;
    getWalletKeys(): Promise<{
      evmPrivateKey: string;
      evmAddress: string;
      solanaPrivateKey: string;
      solanaAddress: string;
    }>;
    getWalletOsStoreStatus(): Promise<{
      backend: string;
      available: boolean;
      readEnabled: boolean;
      vaultId: string;
    }>;
    postWalletOsStoreAction(action: "migrate" | "delete"): Promise<{
      ok: boolean;
      migrated?: string[];
      failed?: string[];
      error?: string;
    }>;
    getAuthStatus(): Promise<{
      required: boolean;
      pairingEnabled: boolean;
      expiresAt: number | null;
    }>;
    pair(code: string): Promise<{ token: string }>;
    getOnboardingOptions(): Promise<OnboardingOptions>;
    submitOnboarding(data: OnboardingData): Promise<void>;
    startAnthropicLogin(): Promise<{ authUrl: string }>;
    exchangeAnthropicCode(code: string): Promise<{
      success: boolean;
      expiresAt?: string;
      error?: string;
    }>;
    submitAnthropicSetupToken(token: string): Promise<{ success: boolean }>;
    getSubscriptionStatus(): Promise<SubscriptionStatusResponse>;
    deleteSubscription(provider: string): Promise<{ success: boolean }>;
    switchProvider(
      provider: string,
      apiKey?: string,
      primaryModel?: string,
    ): Promise<{ success: boolean; provider: string; restarting: boolean }>;
    startOpenAILogin(): Promise<{
      authUrl: string;
      state: string;
      instructions: string;
    }>;
    exchangeOpenAICode(code: string): Promise<{
      success: boolean;
      expiresAt?: string;
      accountId?: string;
      error?: string;
    }>;
    startAgent(): Promise<AgentStatus>;
    startAndWait(maxWaitMs?: number): Promise<AgentStatus>;
    stopAgent(): Promise<AgentStatus>;
    pauseAgent(): Promise<AgentStatus>;
    resumeAgent(): Promise<AgentStatus>;
    restartAgent(): Promise<AgentStatus>;
    restartAndWait(maxWaitMs?: number): Promise<AgentStatus>;
    resetAgent(): Promise<void>;
    restart(): Promise<{ ok: boolean }>;
    getConfig(): Promise<Record<string, unknown>>;
    getConfigSchema(): Promise<ConfigSchemaResponse>;
    updateConfig(
      patch: Record<string, unknown>,
    ): Promise<Record<string, unknown>>;
    uploadCustomVrm(file: File): Promise<void>;
    hasCustomVrm(): Promise<boolean>;
    uploadCustomBackground(file: File): Promise<void>;
    hasCustomBackground(): Promise<boolean>;
    getConnectors(): Promise<{
      connectors: Record<string, ConnectorConfig>;
    }>;
    saveConnector(
      name: string,
      config: ConnectorConfig,
    ): Promise<{ connectors: Record<string, ConnectorConfig> }>;
    deleteConnector(
      name: string,
    ): Promise<{ connectors: Record<string, ConnectorConfig> }>;
    getTriggers(): Promise<{ triggers: TriggerSummary[] }>;
    getTrigger(id: string): Promise<{ trigger: TriggerSummary }>;
    createTrigger(
      request: CreateTriggerRequest,
    ): Promise<{ trigger: TriggerSummary }>;
    updateTrigger(
      id: string,
      request: UpdateTriggerRequest,
    ): Promise<{ trigger: TriggerSummary }>;
    deleteTrigger(id: string): Promise<{ ok: boolean }>;
    runTriggerNow(id: string): Promise<{
      ok: boolean;
      result: {
        status: TriggerLastStatus;
        error?: string;
        taskDeleted: boolean;
      };
      trigger?: TriggerSummary;
    }>;
    getTriggerRuns(id: string): Promise<{ runs: TriggerRunRecord[] }>;
    getTriggerHealth(): Promise<TriggerHealthSnapshot>;
    getTrainingStatus(): Promise<TrainingStatus>;
    listTrainingTrajectories(opts?: {
      limit?: number;
      offset?: number;
    }): Promise<TrainingTrajectoryList>;
    getTrainingTrajectory(
      trajectoryId: string,
    ): Promise<{ trajectory: TrainingTrajectoryDetail }>;
    listTrainingDatasets(): Promise<{ datasets: TrainingDatasetRecord[] }>;
    buildTrainingDataset(options?: {
      limit?: number;
      minLlmCallsPerTrajectory?: number;
    }): Promise<{ dataset: TrainingDatasetRecord }>;
    listTrainingJobs(): Promise<{ jobs: TrainingJobRecord[] }>;
    startTrainingJob(
      options?: StartTrainingOptions,
    ): Promise<{ job: TrainingJobRecord }>;
    getTrainingJob(jobId: string): Promise<{ job: TrainingJobRecord }>;
    cancelTrainingJob(jobId: string): Promise<{ job: TrainingJobRecord }>;
    listTrainingModels(): Promise<{ models: TrainingModelRecord[] }>;
    importTrainingModelToOllama(
      modelId: string,
      options?: {
        modelName?: string;
        baseModel?: string;
        ollamaUrl?: string;
      },
    ): Promise<{ model: TrainingModelRecord }>;
    activateTrainingModel(
      modelId: string,
      providerModel?: string,
    ): Promise<{
      modelId: string;
      providerModel: string;
      needsRestart: boolean;
    }>;
    benchmarkTrainingModel(modelId: string): Promise<{
      status: "passed" | "failed";
      output: string;
    }>;
    getPlugins(): Promise<{ plugins: PluginInfo[] }>;
    fetchModels(
      provider: string,
      refresh?: boolean,
    ): Promise<{ provider: string; models: unknown[] }>;
    getCorePlugins(): Promise<CorePluginsResponse>;
    toggleCorePlugin(
      npmName: string,
      enabled: boolean,
    ): Promise<PluginMutationResult>;
    updatePlugin(
      id: string,
      config: Record<string, unknown>,
    ): Promise<PluginMutationResult>;
    getSecrets(): Promise<{ secrets: SecretInfo[] }>;
    updateSecrets(
      secrets: Record<string, string>,
    ): Promise<{ ok: boolean; updated: string[] }>;
    testPluginConnection(id: string): Promise<{
      success: boolean;
      pluginId: string;
      message?: string;
      error?: string;
      durationMs: number;
    }>;
    getLogs(filter?: LogsFilter): Promise<LogsResponse>;
    getSecurityAudit(
      filter?: SecurityAuditFilter,
    ): Promise<SecurityAuditResponse>;
    streamSecurityAudit(
      onEvent: (event: SecurityAuditStreamEvent) => void,
      filter?: SecurityAuditFilter,
      signal?: AbortSignal,
    ): Promise<void>;
    getAgentEvents(opts?: {
      afterEventId?: string;
      limit?: number;
      runId?: string;
      fromSeq?: number;
    }): Promise<AgentEventsResponse>;
    getExtensionStatus(): Promise<ExtensionStatus>;
    getRelationshipsGraph(
      query?: RelationshipsGraphQuery,
    ): Promise<RelationshipsGraphSnapshot>;
    getRelationshipsPeople(query?: RelationshipsGraphQuery): Promise<{
      people: RelationshipsPersonSummary[];
      stats: RelationshipsGraphStats;
    }>;
    getRelationshipsPerson(id: string): Promise<RelationshipsPersonDetail>;
    getRelationshipsActivity(
      limit?: number,
    ): Promise<RelationshipsActivityResponse>;
    getRelationshipsCandidates(): Promise<RelationshipsMergeCandidate[]>;
    acceptRelationshipsCandidate(
      candidateId: string,
    ): Promise<{ id: string; status: string }>;
    rejectRelationshipsCandidate(
      candidateId: string,
    ): Promise<{ id: string; status: string }>;
    proposeRelationshipsLink(
      sourceEntityId: string,
      targetEntityId: string,
      evidence?: Record<string, unknown>,
    ): Promise<{ id: string; status: string }>;
    getRolodexGraph(query?: RolodexGraphQuery): Promise<RolodexGraphSnapshot>;
    getRolodexPeople(query?: RolodexGraphQuery): Promise<{
      people: RolodexPersonSummary[];
      stats: RolodexGraphStats;
    }>;
    getRolodexPerson(id: string): Promise<RolodexPersonDetail>;
    getCharacter(): Promise<{
      character: CharacterData;
      agentName: string;
    }>;
    getRandomName(): Promise<{ name: string }>;
    generateCharacterField(
      field: string,
      context: {
        name?: string;
        system?: string;
        bio?: string;
        topics?: string[];
        style?: { all?: string[]; chat?: string[]; post?: string[] };
        postExamples?: string[];
      },
      mode?: "append" | "replace",
    ): Promise<{ generated: string }>;
    updateCharacter(
      character: CharacterData,
    ): Promise<{ ok: boolean; character: CharacterData; agentName: string }>;
    getUpdateStatus(force?: boolean): Promise<UpdateStatus>;
    setUpdateChannel(
      channel: "stable" | "beta" | "nightly",
    ): Promise<{ channel: string }>;
    getAgentAutomationMode(): Promise<AgentAutomationModeResponse>;
    setAgentAutomationMode(
      mode: AgentAutomationMode,
    ): Promise<AgentAutomationModeResponse>;
    getTradePermissionMode(): Promise<TradePermissionModeResponse>;
    setTradePermissionMode(
      mode: TradePermissionMode,
    ): Promise<TradePermissionModeResponse>;
    getPermissions(): Promise<AllPermissionsState>;
    getPermission(id: SystemPermissionId): Promise<PermissionState>;
    requestPermission(id: SystemPermissionId): Promise<PermissionState>;
    openPermissionSettings(id: SystemPermissionId): Promise<void>;
    refreshPermissions(): Promise<AllPermissionsState>;
    setShellEnabled(enabled: boolean): Promise<PermissionState>;
    isShellEnabled(): Promise<boolean>;
    getWebsiteBlockerStatus(): Promise<{
      available: boolean;
      active: boolean;
      hostsFilePath: string | null;
      endsAt: string | null;
      websites: string[];
      canUnblockEarly: boolean;
      requiresElevation: boolean;
      engine:
        | "hosts-file"
        | "vpn-dns"
        | "network-extension"
        | "content-blocker";
      platform: string;
      supportsElevationPrompt: boolean;
      elevationPromptMethod:
        | "osascript"
        | "pkexec"
        | "powershell-runas"
        | "vpn-consent"
        | "system-settings"
        | null;
      permissionStatus?: PermissionState["status"];
      canRequestPermission?: boolean;
      canOpenSystemSettings?: boolean;
      reason?: string;
    }>;
    startWebsiteBlock(options: {
      websites?: string[] | string;
      durationMinutes?: number | string | null;
      text?: string;
    }): Promise<
      | {
          success: true;
          endsAt: string | null;
          request: {
            websites: string[];
            durationMinutes: number | null;
          };
        }
      | {
          success: false;
          error: string;
          status?: {
            active: boolean;
            endsAt: string | null;
            websites: string[];
            requiresElevation: boolean;
          };
        }
    >;
    stopWebsiteBlock(): Promise<
      | {
          success: true;
          removed: boolean;
          status: {
            active: boolean;
            endsAt: string | null;
            websites: string[];
            canUnblockEarly: boolean;
            requiresElevation: boolean;
          };
        }
      | {
          success: false;
          error: string;
          status?: {
            active: boolean;
            endsAt: string | null;
            websites: string[];
            canUnblockEarly: boolean;
            requiresElevation: boolean;
          };
        }
    >;
    getCodingAgentStatus(): Promise<CodingAgentStatus | null>;
    listCodingAgentTaskThreads(options?: {
      includeArchived?: boolean;
      status?: string;
      search?: string;
      limit?: number;
    }): Promise<CodingAgentTaskThread[]>;
    getCodingAgentTaskThread(
      threadId: string,
    ): Promise<CodingAgentTaskThreadDetail | null>;
    archiveCodingAgentTaskThread(threadId: string): Promise<boolean>;
    reopenCodingAgentTaskThread(threadId: string): Promise<boolean>;
    stopCodingAgent(sessionId: string): Promise<boolean>;
    listCodingAgentScratchWorkspaces(): Promise<CodingAgentScratchWorkspace[]>;
    keepCodingAgentScratchWorkspace(sessionId: string): Promise<boolean>;
    deleteCodingAgentScratchWorkspace(sessionId: string): Promise<boolean>;
    promoteCodingAgentScratchWorkspace(
      sessionId: string,
      name?: string,
    ): Promise<CodingAgentScratchWorkspace | null>;
    spawnShellSession(workdir?: string): Promise<{ sessionId: string }>;
    subscribePtyOutput(sessionId: string): void;
    unsubscribePtyOutput(sessionId: string): void;
    sendPtyInput(sessionId: string, data: string): void;
    resizePty(sessionId: string, cols: number, rows: number): void;
    getPtyBufferedOutput(sessionId: string): Promise<string>;
    streamGoLive(): Promise<{
      ok: boolean;
      live: boolean;
      rtmpUrl?: string;
      inputMode?: string;
      audioSource?: string;
      message?: string;
      destination?: string;
    }>;
    streamGoOffline(): Promise<{ ok: boolean; live: boolean }>;
    streamStatus(): Promise<{
      ok: boolean;
      running: boolean;
      ffmpegAlive: boolean;
      uptime: number;
      frameCount: number;
      volume: number;
      muted: boolean;
      audioSource: string;
      inputMode: string | null;
      destination?: { id: string; name: string } | null;
    }>;
    getStreamingDestinations(): Promise<{
      ok: boolean;
      destinations: Array<{ id: string; name: string }>;
    }>;
    setActiveDestination(destinationId: string): Promise<{
      ok: boolean;
      destination?: { id: string; name: string };
    }>;
    setStreamVolume(
      volume: number,
    ): Promise<{ ok: boolean; volume: number; muted: boolean }>;
    muteStream(): Promise<{ ok: boolean; muted: boolean; volume: number }>;
    unmuteStream(): Promise<{ ok: boolean; muted: boolean; volume: number }>;
    getStreamVoice(): Promise<{
      ok: boolean;
      enabled: boolean;
      autoSpeak: boolean;
      provider: string | null;
      configuredProvider: string | null;
      hasApiKey: boolean;
      isSpeaking: boolean;
      isAttached: boolean;
    }>;
    saveStreamVoice(settings: {
      enabled?: boolean;
      autoSpeak?: boolean;
      provider?: string;
    }): Promise<{
      ok: boolean;
      voice: { enabled: boolean; autoSpeak: boolean };
    }>;
    streamVoiceSpeak(text: string): Promise<{ ok: boolean; speaking: boolean }>;
    getOverlayLayout(
      destinationId?: string | null,
    ): Promise<{ ok: boolean; layout: unknown; destinationId?: string }>;
    saveOverlayLayout(
      layout: unknown,
      destinationId?: string | null,
    ): Promise<{ ok: boolean; layout: unknown; destinationId?: string }>;
    getStreamSource(): Promise<{
      source: { type: string; url?: string };
    }>;
    setStreamSource(
      sourceType: string,
      customUrl?: string,
    ): Promise<{ ok: boolean; source: { type: string; url?: string } }>;
    getStreamSettings(): Promise<{
      ok: boolean;
      settings: { theme?: string; avatarIndex?: number };
    }>;
    saveStreamSettings(settings: {
      theme?: string;
      avatarIndex?: number;
    }): Promise<{ ok: boolean; settings: unknown }>;
  }
}

// ---------------------------------------------------------------------------
// Prototype augmentation
// ---------------------------------------------------------------------------

TokagentClient.prototype.getStatus = async function (this: TokagentClient) {
  return this.fetch("/api/status");
};

TokagentClient.prototype.getAgentSelfStatus = async function (this: TokagentClient) {
  return this.fetch("/api/agent/self-status");
};

TokagentClient.prototype.getRuntimeSnapshot = async function (
  this: TokagentClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (typeof opts?.depth === "number") params.set("depth", String(opts.depth));
  if (typeof opts?.maxArrayLength === "number") {
    params.set("maxArrayLength", String(opts.maxArrayLength));
  }
  if (typeof opts?.maxObjectEntries === "number") {
    params.set("maxObjectEntries", String(opts.maxObjectEntries));
  }
  if (typeof opts?.maxStringLength === "number") {
    params.set("maxStringLength", String(opts.maxStringLength));
  }
  const qs = params.toString();
  return this.fetch(`/api/runtime${qs ? `?${qs}` : ""}`);
};

TokagentClient.prototype.setAutomationMode = async function (
  this: TokagentClient,
  mode,
) {
  return this.fetch("/api/permissions/automation-mode", {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
};

TokagentClient.prototype.setTradeMode = async function (this: TokagentClient, mode) {
  return this.fetch("/api/permissions/trade-mode", {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
};

TokagentClient.prototype.playEmote = async function (this: TokagentClient, emoteId) {
  return this.fetch("/api/emote", {
    method: "POST",
    body: JSON.stringify({ emoteId }),
  });
};

TokagentClient.prototype.runTerminalCommand = async function (
  this: TokagentClient,
  command,
) {
  return this.fetch("/api/terminal/run", {
    method: "POST",
    body: JSON.stringify({ command }),
  });
};

TokagentClient.prototype.getOnboardingStatus = async function (this: TokagentClient) {
  return this.fetch("/api/onboarding/status");
};

TokagentClient.prototype.getWalletKeys = async function (this: TokagentClient) {
  return this.fetch("/api/wallet/keys");
};

TokagentClient.prototype.getWalletOsStoreStatus = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/wallet/os-store");
};

TokagentClient.prototype.postWalletOsStoreAction = async function (
  this: TokagentClient,
  action,
) {
  return this.fetch("/api/wallet/os-store", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
};

TokagentClient.prototype.getAuthStatus = async function (this: TokagentClient) {
  const maxRetries = 3;
  const baseBackoffMs = 1000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await this.fetch("/api/auth/status");
    } catch (err: unknown) {
      const status = (err as Error & { status?: number })?.status;
      if (status === 401) {
        return { required: true, pairingEnabled: false, expiresAt: null };
      }
      if (status === 404) {
        return { required: false, pairingEnabled: false, expiresAt: null };
      }
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseBackoffMs * 2 ** attempt));
      }
    }
  }
  throw lastErr;
};

TokagentClient.prototype.pair = async function (this: TokagentClient, code) {
  const res = await this.fetch<{ token: string }>("/api/auth/pair", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return res;
};

TokagentClient.prototype.getOnboardingOptions = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/onboarding/options");
};

TokagentClient.prototype.submitOnboarding = async function (
  this: TokagentClient,
  data,
) {
  await this.fetch("/api/onboarding", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.startAnthropicLogin = async function (this: TokagentClient) {
  return this.fetch("/api/subscription/anthropic/start", { method: "POST" });
};

TokagentClient.prototype.exchangeAnthropicCode = async function (
  this: TokagentClient,
  code,
) {
  return this.fetch("/api/subscription/anthropic/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
};

TokagentClient.prototype.submitAnthropicSetupToken = async function (
  this: TokagentClient,
  token,
) {
  return this.fetch("/api/subscription/anthropic/setup-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
};

TokagentClient.prototype.getSubscriptionStatus = async function (
  this: TokagentClient,
) {
  return this.fetch<SubscriptionStatusResponse>("/api/subscription/status");
};

TokagentClient.prototype.deleteSubscription = async function (
  this: TokagentClient,
  provider,
) {
  return this.fetch(`/api/subscription/${encodeURIComponent(provider)}`, {
    method: "DELETE",
  });
};

TokagentClient.prototype.switchProvider = async function (
  this: TokagentClient,
  provider,
  apiKey?,
  primaryModel?,
) {
  logSettingsClient("POST /api/provider/switch → start", {
    baseUrl: this.getBaseUrl(),
    provider,
    hasApiKey: Boolean(apiKey?.trim()),
    apiKey,
    hasPrimaryModel: Boolean(primaryModel?.trim()),
    primaryModel,
  });
  const result = (await this.fetch("/api/provider/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      ...(apiKey ? { apiKey } : {}),
      ...(primaryModel ? { primaryModel } : {}),
    }),
  })) as { success: boolean; provider: string; restarting: boolean };
  logSettingsClient("POST /api/provider/switch ← ok", {
    baseUrl: this.getBaseUrl(),
    result,
  });
  return result;
};

TokagentClient.prototype.startOpenAILogin = async function (this: TokagentClient) {
  return this.fetch("/api/subscription/openai/start", { method: "POST" });
};

TokagentClient.prototype.exchangeOpenAICode = async function (
  this: TokagentClient,
  code,
) {
  return this.fetch("/api/subscription/openai/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
};

TokagentClient.prototype.startAgent = async function (this: TokagentClient) {
  const res = await this.fetch<{ status: AgentStatus }>("/api/agent/start", {
    method: "POST",
  });
  return res.status;
};

TokagentClient.prototype.startAndWait = async function (
  this: TokagentClient,
  maxWaitMs = 30_000,
) {
  const t0 = Date.now();
  console.info("[tokagent][lifecycle][client] startAndWait: begin", {
    baseUrl: this.getBaseUrl(),
    maxWaitMs,
  });
  try {
    const initial = await this.getStatus();
    if (initial.state === "running") {
      return initial;
    }
  } catch (e) {
    console.info(
      "[tokagent][lifecycle][client] startAndWait: initial status check failed",
      e,
    );
  }
  try {
    const started = await this.startAgent();
    if (started.state === "running") {
      return started;
    }
    console.info("[tokagent][lifecycle][client] startAndWait: start accepted", {
      state: started.state,
    });
  } catch (e) {
    console.info(
      "[tokagent][lifecycle][client] startAndWait: initial start call failed",
      e,
    );
  }
  const start = Date.now();
  const interval = 1_000;
  let pollN = 0;
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, interval));
    pollN += 1;
    try {
      const status = await this.getStatus();
      if (status.state === "running") {
        console.info("[tokagent][lifecycle][client] startAndWait: running", {
          pollN,
          waitedMs: Date.now() - t0,
          port: status.port,
        });
        return status;
      }
      if (status.state === "error") {
        return status;
      }
      if (pollN === 1 || pollN % 5 === 0) {
        console.debug("[tokagent][lifecycle][client] startAndWait: poll", {
          pollN,
          state: status.state,
          waitedMs: Date.now() - t0,
        });
      }
    } catch (pollErr) {
      if (pollN === 1 || pollN % 5 === 0) {
        console.debug(
          "[tokagent][lifecycle][client] startAndWait: getStatus error while polling",
          { pollN, waitedMs: Date.now() - t0 },
          pollErr,
        );
      }
    }
  }
  const final = await this.getStatus();
  console.warn(
    "[tokagent][lifecycle][client] startAndWait: timed out — returning last status",
    {
      state: final.state,
      waitedMs: Date.now() - t0,
      maxWaitMs,
    },
  );
  return final;
};

TokagentClient.prototype.stopAgent = async function (this: TokagentClient) {
  const res = await this.fetch<{ status: AgentStatus }>("/api/agent/stop", {
    method: "POST",
  });
  return res.status;
};

TokagentClient.prototype.pauseAgent = async function (this: TokagentClient) {
  const res = await this.fetch<{ status: AgentStatus }>("/api/agent/pause", {
    method: "POST",
  });
  return res.status;
};

TokagentClient.prototype.resumeAgent = async function (this: TokagentClient) {
  const res = await this.fetch<{ status: AgentStatus }>("/api/agent/resume", {
    method: "POST",
  });
  return res.status;
};

TokagentClient.prototype.restartAgent = async function (this: TokagentClient) {
  const res = await this.fetch<{ status: AgentStatus }>("/api/agent/restart", {
    method: "POST",
  });
  return res.status;
};

TokagentClient.prototype.restartAndWait = async function (
  this: TokagentClient,
  maxWaitMs = 30000,
) {
  const t0 = Date.now();
  console.info("[tokagent][reset][client] restartAndWait: begin", {
    baseUrl: this.getBaseUrl(),
    maxWaitMs,
  });
  try {
    await this.restartAgent();
    console.info("[tokagent][reset][client] restartAndWait: restart accepted");
  } catch (e) {
    console.info(
      "[tokagent][reset][client] restartAndWait: initial restart call failed (often 409 while restarting)",
      e,
    );
  }
  const start = Date.now();
  const interval = 1000;
  let pollN = 0;
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, interval));
    pollN += 1;
    try {
      const status = await this.getStatus();
      if (status.state === "running") {
        console.info("[tokagent][reset][client] restartAndWait: running", {
          pollN,
          waitedMs: Date.now() - t0,
          port: status.port,
        });
        return status;
      }
      if (pollN === 1 || pollN % 5 === 0) {
        console.debug("[tokagent][reset][client] restartAndWait: poll", {
          pollN,
          state: status.state,
          waitedMs: Date.now() - t0,
        });
      }
    } catch (pollErr) {
      if (pollN === 1 || pollN % 5 === 0) {
        console.debug(
          "[tokagent][reset][client] restartAndWait: getStatus error while polling",
          { pollN, waitedMs: Date.now() - t0 },
          pollErr,
        );
      }
    }
  }
  const final = await this.getStatus();
  console.warn(
    "[tokagent][reset][client] restartAndWait: timed out — returning last status",
    {
      state: final.state,
      waitedMs: Date.now() - t0,
      maxWaitMs,
    },
  );
  return final;
};

TokagentClient.prototype.resetAgent = async function (this: TokagentClient) {
  console.info("[tokagent][reset][client] POST /api/agent/reset", {
    baseUrl: this.getBaseUrl(),
  });
  await this.fetch("/api/agent/reset", { method: "POST" });
  console.info("[tokagent][reset][client] POST /api/agent/reset OK");
};

TokagentClient.prototype.restart = async function (this: TokagentClient) {
  return this.fetch("/api/restart", { method: "POST" });
};

TokagentClient.prototype.getConfig = async function (this: TokagentClient) {
  logSettingsClient("GET /api/config → start", {
    baseUrl: this.getBaseUrl(),
  });
  const r = (await this.fetch("/api/config")) as Record<string, unknown>;
  const cloud = r.cloud as Record<string, unknown> | undefined;
  logSettingsClient("GET /api/config ← ok", {
    baseUrl: this.getBaseUrl(),
    topKeys: Object.keys(r).sort(),
    cloud: settingsDebugCloudSummary(cloud),
  });
  return r;
};

TokagentClient.prototype.getConfigSchema = async function (this: TokagentClient) {
  return this.fetch("/api/config/schema");
};

TokagentClient.prototype.updateConfig = async function (this: TokagentClient, patch) {
  logSettingsClient("PUT /api/config → start", {
    baseUrl: this.getBaseUrl(),
    patch,
  });
  const out = (await this.fetch(
    "/api/config",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
    {
      timeoutMs: SETTINGS_MUTATION_TIMEOUT_MS,
    },
  )) as Record<string, unknown>;
  const cloud = out.cloud as Record<string, unknown> | undefined;
  logSettingsClient("PUT /api/config ← ok", {
    baseUrl: this.getBaseUrl(),
    topKeys: Object.keys(out).sort(),
    cloud: settingsDebugCloudSummary(cloud),
  });
  return out;
};

TokagentClient.prototype.uploadCustomVrm = async function (
  this: TokagentClient,
  file,
) {
  const buf = await file.arrayBuffer();
  await this.fetch("/api/avatar/vrm", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: buf,
  });
};

TokagentClient.prototype.hasCustomVrm = async function (this: TokagentClient) {
  try {
    const res = await this.rawRequest(
      "/api/avatar/vrm",
      { method: "HEAD" },
      { allowNonOk: true },
    );
    return res.ok;
  } catch {
    return false;
  }
};

TokagentClient.prototype.uploadCustomBackground = async function (
  this: TokagentClient,
  file,
) {
  const buf = await file.arrayBuffer();
  await this.fetch("/api/avatar/background", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: buf,
  });
};

TokagentClient.prototype.hasCustomBackground = async function (this: TokagentClient) {
  try {
    const res = await this.rawRequest(
      "/api/avatar/background",
      { method: "HEAD" },
      { allowNonOk: true },
    );
    return res.ok;
  } catch {
    return false;
  }
};

TokagentClient.prototype.getConnectors = async function (this: TokagentClient) {
  return this.fetch("/api/connectors");
};

TokagentClient.prototype.saveConnector = async function (
  this: TokagentClient,
  name,
  config,
) {
  return this.fetch("/api/connectors", {
    method: "POST",
    body: JSON.stringify({ name, config }),
  });
};

TokagentClient.prototype.deleteConnector = async function (
  this: TokagentClient,
  name,
) {
  return this.fetch(`/api/connectors/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
};

TokagentClient.prototype.getTriggers = async function (this: TokagentClient) {
  return this.fetch("/api/triggers");
};

TokagentClient.prototype.getTrigger = async function (this: TokagentClient, id) {
  return this.fetch(`/api/triggers/${encodeURIComponent(id)}`);
};

TokagentClient.prototype.createTrigger = async function (
  this: TokagentClient,
  request,
) {
  return this.fetch("/api/triggers", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

TokagentClient.prototype.updateTrigger = async function (
  this: TokagentClient,
  id,
  request,
) {
  return this.fetch(`/api/triggers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(request),
  });
};

TokagentClient.prototype.deleteTrigger = async function (this: TokagentClient, id) {
  return this.fetch(`/api/triggers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

TokagentClient.prototype.runTriggerNow = async function (this: TokagentClient, id) {
  return this.fetch(`/api/triggers/${encodeURIComponent(id)}/execute`, {
    method: "POST",
  });
};

TokagentClient.prototype.getTriggerRuns = async function (this: TokagentClient, id) {
  return this.fetch(`/api/triggers/${encodeURIComponent(id)}/runs`);
};

TokagentClient.prototype.getTriggerHealth = async function (this: TokagentClient) {
  return this.fetch("/api/triggers/health");
};

TokagentClient.prototype.getTrainingStatus = async function (this: TokagentClient) {
  return this.fetch("/api/training/status");
};

TokagentClient.prototype.listTrainingTrajectories = async function (
  this: TokagentClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
  if (typeof opts?.offset === "number")
    params.set("offset", String(opts.offset));
  const qs = params.toString();
  return this.fetch(`/api/training/trajectories${qs ? `?${qs}` : ""}`);
};

TokagentClient.prototype.getTrainingTrajectory = async function (
  this: TokagentClient,
  trajectoryId,
) {
  return this.fetch(
    `/api/training/trajectories/${encodeURIComponent(trajectoryId)}`,
  );
};

TokagentClient.prototype.listTrainingDatasets = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/training/datasets");
};

TokagentClient.prototype.buildTrainingDataset = async function (
  this: TokagentClient,
  options?,
) {
  return this.fetch("/api/training/datasets/build", {
    method: "POST",
    body: JSON.stringify(options ?? {}),
  });
};

TokagentClient.prototype.listTrainingJobs = async function (this: TokagentClient) {
  return this.fetch("/api/training/jobs");
};

TokagentClient.prototype.startTrainingJob = async function (
  this: TokagentClient,
  options?,
) {
  return this.fetch("/api/training/jobs", {
    method: "POST",
    body: JSON.stringify(options ?? {}),
  });
};

TokagentClient.prototype.getTrainingJob = async function (
  this: TokagentClient,
  jobId,
) {
  return this.fetch(`/api/training/jobs/${encodeURIComponent(jobId)}`);
};

TokagentClient.prototype.cancelTrainingJob = async function (
  this: TokagentClient,
  jobId,
) {
  return this.fetch(`/api/training/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
};

TokagentClient.prototype.listTrainingModels = async function (this: TokagentClient) {
  return this.fetch("/api/training/models");
};

TokagentClient.prototype.importTrainingModelToOllama = async function (
  this: TokagentClient,
  modelId,
  options?,
) {
  return this.fetch(
    `/api/training/models/${encodeURIComponent(modelId)}/import-ollama`,
    {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    },
  );
};

TokagentClient.prototype.activateTrainingModel = async function (
  this: TokagentClient,
  modelId,
  providerModel?,
) {
  return this.fetch(
    `/api/training/models/${encodeURIComponent(modelId)}/activate`,
    {
      method: "POST",
      body: JSON.stringify({ providerModel }),
    },
  );
};

TokagentClient.prototype.benchmarkTrainingModel = async function (
  this: TokagentClient,
  modelId,
) {
  return this.fetch(
    `/api/training/models/${encodeURIComponent(modelId)}/benchmark`,
    { method: "POST" },
  );
};

TokagentClient.prototype.getPlugins = async function (this: TokagentClient) {
  return this.fetch("/api/plugins");
};

TokagentClient.prototype.fetchModels = async function (
  this: TokagentClient,
  provider,
  refresh = true,
) {
  const params = new URLSearchParams({ provider });
  if (refresh) params.set("refresh", "true");
  return this.fetch(`/api/models?${params.toString()}`);
};

TokagentClient.prototype.getCorePlugins = async function (this: TokagentClient) {
  return this.fetch("/api/plugins/core");
};

TokagentClient.prototype.toggleCorePlugin = async function (
  this: TokagentClient,
  npmName,
  enabled,
) {
  return this.fetch("/api/plugins/core/toggle", {
    method: "POST",
    body: JSON.stringify({ npmName, enabled }),
  });
};

TokagentClient.prototype.updatePlugin = async function (
  this: TokagentClient,
  id,
  config,
) {
  logSettingsClient(`PUT /api/plugins/${id} → start`, {
    baseUrl: this.getBaseUrl(),
    body: config,
  });
  const result = (await this.fetch(
    `/api/plugins/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(config),
    },
    {
      timeoutMs: SETTINGS_MUTATION_TIMEOUT_MS,
    },
  )) as PluginMutationResult;
  logSettingsClient(`PUT /api/plugins/${id} ← ok`, {
    baseUrl: this.getBaseUrl(),
    result,
  });
  return result;
};

TokagentClient.prototype.getSecrets = async function (this: TokagentClient) {
  return this.fetch("/api/secrets");
};

TokagentClient.prototype.updateSecrets = async function (
  this: TokagentClient,
  secrets,
) {
  logSettingsClient("PUT /api/secrets → start", {
    baseUrl: this.getBaseUrl(),
    secretMeta: Object.keys(secrets)
      .sort()
      .map((key) => ({
        key,
        hasValue: Boolean(secrets[key]),
      })),
  });
  const out = (await this.fetch("/api/secrets", {
    method: "PUT",
    body: JSON.stringify({ secrets }),
  })) as { ok: boolean; updated: string[] };
  logSettingsClient("PUT /api/secrets ← ok", {
    baseUrl: this.getBaseUrl(),
    out,
  });
  return out;
};

TokagentClient.prototype.testPluginConnection = async function (
  this: TokagentClient,
  id,
) {
  return this.fetch(`/api/plugins/${encodeURIComponent(id)}/test`, {
    method: "POST",
  });
};

TokagentClient.prototype.getLogs = async function (this: TokagentClient, filter?) {
  const params = new URLSearchParams();
  if (filter?.source) params.set("source", filter.source);
  if (filter?.level) params.set("level", filter.level);
  if (filter?.tag) params.set("tag", filter.tag);
  if (filter?.since) params.set("since", String(filter.since));
  const qs = params.toString();
  return this.fetch(`/api/logs${qs ? `?${qs}` : ""}`);
};

// buildSecurityAuditParams is a private helper used only by agent audit methods
function buildSecurityAuditParams(
  filter?: SecurityAuditFilter,
  includeStream = false,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filter?.type) params.set("type", filter.type);
  if (filter?.severity) params.set("severity", filter.severity);
  if (filter?.since !== undefined) {
    const sinceValue =
      filter.since instanceof Date
        ? filter.since.toISOString()
        : String(filter.since);
    params.set("since", sinceValue);
  }
  if (filter?.limit !== undefined) params.set("limit", String(filter.limit));
  if (includeStream) params.set("stream", "1");
  return params;
}

TokagentClient.prototype.getSecurityAudit = async function (
  this: TokagentClient,
  filter?,
) {
  const qs = buildSecurityAuditParams(filter).toString();
  return this.fetch(`/api/security/audit${qs ? `?${qs}` : ""}`);
};

TokagentClient.prototype.streamSecurityAudit = async function (
  this: TokagentClient,
  onEvent,
  filter?,
  signal?,
) {
  if (!this.apiAvailable) {
    throw new Error("API not available (no HTTP origin)");
  }

  const token = this.apiToken;
  const qs = buildSecurityAuditParams(filter, true).toString();
  const res = await fetch(
    `${this.baseUrl}/api/security/audit${qs ? `?${qs}` : ""}`,
    {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    },
  );

  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => ({ error: res.statusText }))) as Record<
      string,
      string
    > | null;
    const err = new Error(body?.error ?? `HTTP ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  if (!res.body) {
    throw new Error("Streaming not supported by this browser");
  }

  const parsePayload = (payload: string) => {
    if (!payload) return;
    try {
      const parsed = JSON.parse(payload) as SecurityAuditStreamEvent;
      if (parsed.type === "snapshot" || parsed.type === "entry") {
        onEvent(parsed);
      }
    } catch {
      // Ignore malformed payloads to keep stream consumption resilient.
    }
  };

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = "";

  const findSseEventBreak = (
    chunkBuffer: string,
  ): { index: number; length: number } | null => {
    const lfBreak = chunkBuffer.indexOf("\n\n");
    const crlfBreak = chunkBuffer.indexOf("\r\n\r\n");
    if (lfBreak === -1 && crlfBreak === -1) return null;
    if (lfBreak === -1) return { index: crlfBreak, length: 4 };
    if (crlfBreak === -1) return { index: lfBreak, length: 2 };
    return lfBreak < crlfBreak
      ? { index: lfBreak, length: 2 }
      : { index: crlfBreak, length: 4 };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let eventBreak = findSseEventBreak(buffer);
    while (eventBreak) {
      const rawEvent = buffer.slice(0, eventBreak.index);
      buffer = buffer.slice(eventBreak.index + eventBreak.length);
      for (const line of rawEvent.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        parsePayload(line.slice(5).trim());
      }
      eventBreak = findSseEventBreak(buffer);
    }
  }

  if (buffer.trim()) {
    for (const line of buffer.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      parsePayload(line.slice(5).trim());
    }
  }
};

TokagentClient.prototype.getAgentEvents = async function (
  this: TokagentClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.afterEventId) params.set("after", opts.afterEventId);
  if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
  if (opts?.runId) params.set("runId", opts.runId);
  if (typeof opts?.fromSeq === "number")
    params.set("fromSeq", String(Math.trunc(opts.fromSeq)));
  const qs = params.toString();
  return this.fetch(`/api/agent/events${qs ? `?${qs}` : ""}`);
};

TokagentClient.prototype.getExtensionStatus = async function (this: TokagentClient) {
  return this.fetch("/api/extension/status");
};

TokagentClient.prototype.getRelationshipsGraph = async function (
  this: TokagentClient,
  query,
) {
  const params = new URLSearchParams();
  if (query?.search) params.set("search", query.search);
  if (query?.platform) params.set("platform", query.platform);
  if (typeof query?.limit === "number")
    params.set("limit", String(query.limit));
  if (typeof query?.offset === "number")
    params.set("offset", String(query.offset));
  const qs = params.toString();
  const response = await this.fetch<{ data: RelationshipsGraphSnapshot }>(
    `/api/relationships/graph${qs ? `?${qs}` : ""}`,
  );
  return response.data;
};

TokagentClient.prototype.getRelationshipsPeople = async function (
  this: TokagentClient,
  query,
) {
  const params = new URLSearchParams();
  if (query?.search) params.set("search", query.search);
  if (query?.platform) params.set("platform", query.platform);
  if (typeof query?.limit === "number")
    params.set("limit", String(query.limit));
  if (typeof query?.offset === "number")
    params.set("offset", String(query.offset));
  const qs = params.toString();
  const response = await this.fetch<{
    data: RelationshipsPersonSummary[];
    stats: RelationshipsGraphStats;
  }>(`/api/relationships/people${qs ? `?${qs}` : ""}`);
  return {
    people: response.data,
    stats: response.stats,
  };
};

TokagentClient.prototype.getRelationshipsPerson = async function (
  this: TokagentClient,
  id,
) {
  const response = await this.fetch<{ data: RelationshipsPersonDetail }>(
    `/api/relationships/people/${encodeURIComponent(id)}`,
  );
  return response.data;
};

TokagentClient.prototype.getRelationshipsActivity = async function (
  this: TokagentClient,
  limit?,
) {
  const params = new URLSearchParams();
  if (typeof limit === "number") params.set("limit", String(limit));
  const qs = params.toString();
  return this.fetch(`/api/relationships/activity${qs ? `?${qs}` : ""}`);
};

TokagentClient.prototype.getRelationshipsCandidates = async function (
  this: TokagentClient,
) {
  const response = await this.fetch<{ data: RelationshipsMergeCandidate[] }>(
    "/api/relationships/candidates",
  );
  return response.data;
};

TokagentClient.prototype.acceptRelationshipsCandidate = async function (
  this: TokagentClient,
  candidateId,
) {
  const response = await this.fetch<{ data: { id: string; status: string } }>(
    `/api/relationships/candidates/${encodeURIComponent(candidateId)}/accept`,
    { method: "POST" },
  );
  return response.data;
};

TokagentClient.prototype.rejectRelationshipsCandidate = async function (
  this: TokagentClient,
  candidateId,
) {
  const response = await this.fetch<{ data: { id: string; status: string } }>(
    `/api/relationships/candidates/${encodeURIComponent(candidateId)}/reject`,
    { method: "POST" },
  );
  return response.data;
};

TokagentClient.prototype.proposeRelationshipsLink = async function (
  this: TokagentClient,
  sourceEntityId,
  targetEntityId,
  evidence,
) {
  const response = await this.fetch<{ data: { id: string; status: string } }>(
    `/api/relationships/people/${encodeURIComponent(sourceEntityId)}/link`,
    {
      method: "POST",
      body: JSON.stringify({
        targetEntityId,
        evidence: evidence ?? {},
      }),
      headers: { "Content-Type": "application/json" },
    },
  );
  return response.data;
};

TokagentClient.prototype.getRolodexGraph = async function (
  this: TokagentClient,
  query,
) {
  return this.getRelationshipsGraph(query);
};

TokagentClient.prototype.getRolodexPeople = async function (
  this: TokagentClient,
  query,
) {
  return this.getRelationshipsPeople(query);
};

TokagentClient.prototype.getRolodexPerson = async function (
  this: TokagentClient,
  id,
) {
  return this.getRelationshipsPerson(id);
};

TokagentClient.prototype.getCharacter = async function (this: TokagentClient) {
  return this.fetch("/api/character");
};

TokagentClient.prototype.getRandomName = async function (this: TokagentClient) {
  return this.fetch("/api/character/random-name");
};

TokagentClient.prototype.generateCharacterField = async function (
  this: TokagentClient,
  field,
  context,
  mode?,
) {
  return this.fetch("/api/character/generate", {
    method: "POST",
    body: JSON.stringify({ field, context, mode }),
  });
};

TokagentClient.prototype.updateCharacter = async function (
  this: TokagentClient,
  character,
) {
  return this.fetch("/api/character", {
    method: "PUT",
    body: JSON.stringify(character),
  });
};

TokagentClient.prototype.getUpdateStatus = async function (
  this: TokagentClient,
  force = false,
) {
  return this.fetch(`/api/update/status${force ? "?force=true" : ""}`);
};

TokagentClient.prototype.setUpdateChannel = async function (
  this: TokagentClient,
  channel,
) {
  return this.fetch("/api/update/channel", {
    method: "PUT",
    body: JSON.stringify({ channel }),
  });
};

TokagentClient.prototype.getAgentAutomationMode = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/permissions/automation-mode");
};

TokagentClient.prototype.setAgentAutomationMode = async function (
  this: TokagentClient,
  mode,
) {
  return this.fetch("/api/permissions/automation-mode", {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
};

TokagentClient.prototype.getTradePermissionMode = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/permissions/trade-mode");
};

TokagentClient.prototype.setTradePermissionMode = async function (
  this: TokagentClient,
  mode,
) {
  return this.fetch("/api/permissions/trade-mode", {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
};

TokagentClient.prototype.getPermissions = async function (this: TokagentClient) {
  const permissions = await this.fetch<AllPermissionsState>("/api/permissions");
  const plugin = getNativeWebsiteBlockerPluginIfAvailable();
  if (!plugin) {
    return permissions;
  }

  const permission = mapWebsiteBlockerStatusToPermission(
    await plugin.getStatus(),
  );
  return {
    ...permissions,
    [WEBSITE_BLOCKING_PERMISSION_ID]: permission,
  };
};

TokagentClient.prototype.getPermission = async function (this: TokagentClient, id) {
  if (id === WEBSITE_BLOCKING_PERMISSION_ID) {
    const plugin = getNativeWebsiteBlockerPluginIfAvailable();
    if (plugin) {
      return mapWebsiteBlockerStatusToPermission(await plugin.getStatus());
    }
  }
  return this.fetch(`/api/permissions/${id}`);
};

TokagentClient.prototype.requestPermission = async function (
  this: TokagentClient,
  id,
) {
  if (id === WEBSITE_BLOCKING_PERMISSION_ID) {
    const plugin = getNativeWebsiteBlockerPluginIfAvailable();
    if (plugin) {
      return mapWebsiteBlockerPermissionResult(
        await plugin.requestPermissions(),
      );
    }
  }
  return this.fetch(`/api/permissions/${id}/request`, { method: "POST" });
};

TokagentClient.prototype.openPermissionSettings = async function (
  this: TokagentClient,
  id,
) {
  if (id === WEBSITE_BLOCKING_PERMISSION_ID) {
    const plugin = getNativeWebsiteBlockerPluginIfAvailable();
    if (plugin) {
      await plugin.openSettings();
      return;
    }
  }
  await this.fetch(`/api/permissions/${id}/open-settings`, {
    method: "POST",
  });
};

TokagentClient.prototype.refreshPermissions = async function (this: TokagentClient) {
  const permissions = await this.fetch<AllPermissionsState>(
    "/api/permissions/refresh",
    {
      method: "POST",
    },
  );
  const plugin = getNativeWebsiteBlockerPluginIfAvailable();
  if (!plugin) {
    return permissions;
  }

  const permission = mapWebsiteBlockerStatusToPermission(
    await plugin.getStatus(),
  );
  return {
    ...permissions,
    [WEBSITE_BLOCKING_PERMISSION_ID]: permission,
  };
};

TokagentClient.prototype.setShellEnabled = async function (
  this: TokagentClient,
  enabled,
) {
  return this.fetch("/api/permissions/shell", {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
};

TokagentClient.prototype.isShellEnabled = async function (this: TokagentClient) {
  const result = await this.fetch<{ enabled: boolean }>(
    "/api/permissions/shell",
  );
  return result.enabled;
};

TokagentClient.prototype.getWebsiteBlockerStatus = async function (
  this: TokagentClient,
) {
  const plugin = getNativeWebsiteBlockerPluginIfAvailable();
  if (plugin) {
    return await plugin.getStatus();
  }
  return this.fetch("/api/website-blocker");
};

TokagentClient.prototype.startWebsiteBlock = async function (
  this: TokagentClient,
  options,
) {
  const plugin = getNativeWebsiteBlockerPluginIfAvailable();
  if (plugin) {
    return await plugin.startBlock(options);
  }
  return this.fetch("/api/website-blocker", {
    method: "PUT",
    body: JSON.stringify(options),
  });
};

TokagentClient.prototype.stopWebsiteBlock = async function (this: TokagentClient) {
  const plugin = getNativeWebsiteBlockerPluginIfAvailable();
  if (plugin) {
    return await plugin.stopBlock();
  }
  return this.fetch("/api/website-blocker", {
    method: "DELETE",
  });
};

TokagentClient.prototype.getCodingAgentStatus = async function (
  this: TokagentClient,
) {
  try {
    const status = await this.fetch<CodingAgentStatus>(
      "/api/coding-agents/coordinator/status",
    );
    if (
      status &&
      (!status.tasks || status.tasks.length === 0) &&
      Array.isArray(status.taskThreads) &&
      status.taskThreads.length > 0
    ) {
      status.tasks = mapTaskThreadsToCodingAgentSessions(
        status.taskThreads,
      ).filter((task) => !TERMINAL_STATUSES.has(task.status));
      status.taskCount = status.tasks.length;
    }
    if (status && !status.tasks) {
      // Only fall back to the raw PTY session list when the coordinator
      // didn't return a tasks array at all (null/undefined).  An empty
      // array means "no tasks" — no need to hit /api/coding-agents which
      // may not have a handler and would hang until timeout.
      try {
        const ptySessions =
          await this.fetch<RawPtySession[]>("/api/coding-agents");
        if (Array.isArray(ptySessions) && ptySessions.length > 0) {
          status.tasks = mapPtySessionsToCodingAgentSessions(ptySessions);
          status.taskCount = status.tasks.length;
        }
      } catch {
        // /api/coding-agents may not exist — ignore
      }
    }
    return status;
  } catch {
    return null;
  }
};

TokagentClient.prototype.listCodingAgentTaskThreads = function (
  this: TokagentClient,
  options,
) {
  const params = new URLSearchParams();
  if (options?.includeArchived) params.set("includeArchived", "true");
  if (options?.status) params.set("status", options.status);
  if (options?.search) params.set("search", options.search);
  if (typeof options?.limit === "number" && options.limit > 0) {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  return this.fetch<CodingAgentTaskThread[]>(
    `/api/coding-agents/coordinator/threads${query ? `?${query}` : ""}`,
  );
};

TokagentClient.prototype.getCodingAgentTaskThread = function (
  this: TokagentClient,
  threadId,
) {
  return this.fetch<CodingAgentTaskThreadDetail>(
    `/api/coding-agents/coordinator/threads/${encodeURIComponent(threadId)}`,
  );
};

TokagentClient.prototype.archiveCodingAgentTaskThread = async function (
  this: TokagentClient,
  threadId,
) {
  await this.fetch(
    `/api/coding-agents/coordinator/threads/${encodeURIComponent(threadId)}/archive`,
    { method: "POST" },
  );
  return true;
};

TokagentClient.prototype.reopenCodingAgentTaskThread = async function (
  this: TokagentClient,
  threadId,
) {
  await this.fetch(
    `/api/coding-agents/coordinator/threads/${encodeURIComponent(threadId)}/reopen`,
    { method: "POST" },
  );
  return true;
};

TokagentClient.prototype.stopCodingAgent = async function (
  this: TokagentClient,
  sessionId,
) {
  try {
    await this.fetch(
      `/api/coding-agents/${encodeURIComponent(sessionId)}/stop`,
      { method: "POST" },
    );
    return true;
  } catch {
    return false;
  }
};

TokagentClient.prototype.listCodingAgentScratchWorkspaces = async function (
  this: TokagentClient,
) {
  try {
    return await this.fetch<CodingAgentScratchWorkspace[]>(
      "/api/coding-agents/scratch",
    );
  } catch (err) {
    console.warn(
      "[api-client] Failed to list coding agent scratch workspaces:",
      err,
    );
    return [];
  }
};

TokagentClient.prototype.keepCodingAgentScratchWorkspace = async function (
  this: TokagentClient,
  sessionId,
) {
  try {
    await this.fetch(
      `/api/coding-agents/${encodeURIComponent(sessionId)}/scratch/keep`,
      { method: "POST" },
    );
    return true;
  } catch {
    return false;
  }
};

TokagentClient.prototype.deleteCodingAgentScratchWorkspace = async function (
  this: TokagentClient,
  sessionId,
) {
  try {
    await this.fetch(
      `/api/coding-agents/${encodeURIComponent(sessionId)}/scratch/delete`,
      { method: "POST" },
    );
    return true;
  } catch {
    return false;
  }
};

TokagentClient.prototype.promoteCodingAgentScratchWorkspace = async function (
  this: TokagentClient,
  sessionId,
  name?,
) {
  try {
    const response = await this.fetch<{
      success: boolean;
      scratch?: CodingAgentScratchWorkspace;
    }>(`/api/coding-agents/${encodeURIComponent(sessionId)}/scratch/promote`, {
      method: "POST",
      body: JSON.stringify(name ? { name } : {}),
    });
    return response.scratch ?? null;
  } catch {
    return null;
  }
};

TokagentClient.prototype.spawnShellSession = async function (
  this: TokagentClient,
  workdir?: string,
) {
  const res = await this.fetch<{ session: { id: string } }>(
    "/api/coding-agents/spawn",
    {
      method: "POST",
      body: JSON.stringify({
        agentType: "shell",
        ...(workdir ? { workdir } : {}),
      }),
    },
  );
  return { sessionId: res.session.id };
};

TokagentClient.prototype.subscribePtyOutput = function (
  this: TokagentClient,
  sessionId,
) {
  this.sendWsMessage({ type: "pty-subscribe", sessionId });
};

TokagentClient.prototype.unsubscribePtyOutput = function (
  this: TokagentClient,
  sessionId,
) {
  this.sendWsMessage({ type: "pty-unsubscribe", sessionId });
};

TokagentClient.prototype.sendPtyInput = function (
  this: TokagentClient,
  sessionId,
  data,
) {
  this.sendWsMessage({ type: "pty-input", sessionId, data });
};

TokagentClient.prototype.resizePty = function (
  this: TokagentClient,
  sessionId,
  cols,
  rows,
) {
  this.sendWsMessage({ type: "pty-resize", sessionId, cols, rows });
};

TokagentClient.prototype.getPtyBufferedOutput = async function (
  this: TokagentClient,
  sessionId,
) {
  try {
    const res = await this.fetch<{ output: string }>(
      `/api/coding-agents/${encodeURIComponent(sessionId)}/buffered-output`,
    );
    return res.output ?? "";
  } catch {
    return "";
  }
};

TokagentClient.prototype.streamGoLive = async function (this: TokagentClient) {
  return this.fetch("/api/stream/live", { method: "POST" });
};

TokagentClient.prototype.streamGoOffline = async function (this: TokagentClient) {
  return this.fetch("/api/stream/offline", { method: "POST" });
};

TokagentClient.prototype.streamStatus = async function (this: TokagentClient) {
  return this.fetch("/api/stream/status");
};

TokagentClient.prototype.getStreamingDestinations = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/streaming/destinations");
};

TokagentClient.prototype.setActiveDestination = async function (
  this: TokagentClient,
  destinationId,
) {
  return this.fetch("/api/streaming/destination", {
    method: "POST",
    body: JSON.stringify({ destinationId }),
  });
};

TokagentClient.prototype.setStreamVolume = async function (
  this: TokagentClient,
  volume,
) {
  return this.fetch("/api/stream/volume", {
    method: "POST",
    body: JSON.stringify({ volume }),
  });
};

TokagentClient.prototype.muteStream = async function (this: TokagentClient) {
  return this.fetch("/api/stream/mute", { method: "POST" });
};

TokagentClient.prototype.unmuteStream = async function (this: TokagentClient) {
  return this.fetch("/api/stream/unmute", { method: "POST" });
};

TokagentClient.prototype.getStreamVoice = async function (this: TokagentClient) {
  return this.fetch("/api/stream/voice");
};

TokagentClient.prototype.saveStreamVoice = async function (
  this: TokagentClient,
  settings,
) {
  return this.fetch("/api/stream/voice", {
    method: "POST",
    body: JSON.stringify(settings),
  });
};

TokagentClient.prototype.streamVoiceSpeak = async function (
  this: TokagentClient,
  text,
) {
  return this.fetch("/api/stream/voice/speak", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
};

TokagentClient.prototype.getOverlayLayout = async function (
  this: TokagentClient,
  destinationId?,
) {
  const qs = destinationId
    ? `?destination=${encodeURIComponent(destinationId)}`
    : "";
  return this.fetch(`/api/stream/overlay-layout${qs}`);
};

TokagentClient.prototype.saveOverlayLayout = async function (
  this: TokagentClient,
  layout,
  destinationId?,
) {
  const qs = destinationId
    ? `?destination=${encodeURIComponent(destinationId)}`
    : "";
  return this.fetch(`/api/stream/overlay-layout${qs}`, {
    method: "POST",
    body: JSON.stringify({ layout }),
  });
};

TokagentClient.prototype.getStreamSource = async function (this: TokagentClient) {
  return this.fetch("/api/stream/source");
};

TokagentClient.prototype.setStreamSource = async function (
  this: TokagentClient,
  sourceType,
  customUrl?,
) {
  return this.fetch("/api/stream/source", {
    method: "POST",
    body: JSON.stringify({ sourceType, customUrl }),
  });
};

TokagentClient.prototype.getStreamSettings = async function (this: TokagentClient) {
  return this.fetch("/api/stream/settings");
};

TokagentClient.prototype.saveStreamSettings = async function (
  this: TokagentClient,
  settings,
) {
  return this.fetch("/api/stream/settings", {
    method: "POST",
    body: JSON.stringify({ settings }),
  });
};
