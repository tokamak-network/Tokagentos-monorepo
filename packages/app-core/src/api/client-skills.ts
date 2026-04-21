/**
 * Skills domain methods — skills, catalog, marketplace, apps, Babylon,
 * custom actions, WhatsApp, agent events.
 */

import type { CustomActionDef } from "@tokagentos/agent/contracts/config";
import { packageNameToAppRouteSlug } from "@tokagentos/shared/contracts/apps";
import { TokagentClient } from "./client-base";
import type {
  AppLaunchResult,
  AppRunActionResult,
  AppRunSummary,
  AppSessionActionResult,
  AppSessionControlAction,
  AppSessionState,
  AppStopResult,
  CatalogSearchResult,
  CatalogSkill,
  InstalledAppInfo,
  InstalledPlugin,
  PluginInstallResult,
  PluginMutationResult,
  RegistryAppInfo,
  RegistryPlugin,
  RegistryPluginItem,
  SkillInfo,
  SkillMarketplaceResult,
  SkillScanReportSummary,
} from "./client-types";
import type {
  BabylonActivityFeed,
  BabylonAgentGoal,
  BabylonAgentStats,
  BabylonAgentStatus,
  BabylonAgentSummary,
  BabylonChat,
  BabylonChatMessage,
  BabylonChatMessagesResponse,
  BabylonChatResponse,
  BabylonChatsResponse,
  BabylonLogEntry,
  BabylonPerpMarket,
  BabylonPerpPosition,
  BabylonPerpTradeResult,
  BabylonPostResult,
  BabylonPostsResponse,
  BabylonPredictionMarket,
  BabylonPredictionMarketsResponse,
  BabylonSendMessageResult,
  BabylonTeamChatInfo,
  BabylonTeamResponse,
  BabylonToggleResponse,
  BabylonTradeResult,
  BabylonWallet,
} from "./client-types-babylon";

export type AppRunSteeringDisposition =
  | "accepted"
  | "queued"
  | "rejected"
  | "unsupported";

export interface AppRunSteeringResult {
  success: boolean;
  message: string;
  disposition: AppRunSteeringDisposition;
  status: number;
  run?: AppRunSummary | null;
  session?: AppSessionState | null;
}

// ---------------------------------------------------------------------------
// Declaration merging
// ---------------------------------------------------------------------------

declare module "./client-base" {
  interface TokagentClient {
    getSkills(): Promise<{ skills: SkillInfo[] }>;
    refreshSkills(): Promise<{ ok: boolean; skills: SkillInfo[] }>;
    getSkillCatalog(opts?: {
      page?: number;
      perPage?: number;
      sort?: string;
    }): Promise<{
      total: number;
      page: number;
      perPage: number;
      totalPages: number;
      skills: CatalogSkill[];
    }>;
    searchSkillCatalog(
      query: string,
      limit?: number,
    ): Promise<{
      query: string;
      count: number;
      results: CatalogSearchResult[];
    }>;
    getSkillCatalogDetail(slug: string): Promise<{ skill: CatalogSkill }>;
    refreshSkillCatalog(): Promise<{ ok: boolean; count: number }>;
    installCatalogSkill(
      slug: string,
      version?: string,
    ): Promise<{
      ok: boolean;
      slug: string;
      message: string;
      alreadyInstalled?: boolean;
    }>;
    uninstallCatalogSkill(slug: string): Promise<{
      ok: boolean;
      slug: string;
      message: string;
    }>;
    getRegistryPlugins(): Promise<{
      count: number;
      plugins: RegistryPlugin[];
    }>;
    getRegistryPluginInfo(name: string): Promise<{ plugin: RegistryPlugin }>;
    getInstalledPlugins(): Promise<{
      count: number;
      plugins: InstalledPlugin[];
    }>;
    installRegistryPlugin(
      name: string,
      autoRestart?: boolean,
      options?: { stream?: "latest" | "alpha"; version?: string },
    ): Promise<PluginInstallResult>;
    updateRegistryPlugin(
      name: string,
      autoRestart?: boolean,
      options?: { stream?: "latest" | "alpha"; version?: string },
    ): Promise<PluginInstallResult>;
    uninstallRegistryPlugin(
      name: string,
      autoRestart?: boolean,
    ): Promise<PluginMutationResult & { pluginName: string }>;
    searchSkillsMarketplace(
      query: string,
      installed: boolean,
      limit: number,
    ): Promise<{ results: SkillMarketplaceResult[] }>;
    getSkillsMarketplaceConfig(): Promise<{ keySet: boolean }>;
    updateSkillsMarketplaceConfig(apiKey: string): Promise<{ keySet: boolean }>;
    installMarketplaceSkill(data: {
      slug?: string;
      githubUrl?: string;
      repository?: string;
      path?: string;
      name?: string;
      description?: string;
      source: string;
      autoRefresh?: boolean;
    }): Promise<void>;
    uninstallMarketplaceSkill(
      skillId: string,
      autoRefresh: boolean,
    ): Promise<void>;
    enableSkill(
      skillId: string,
    ): Promise<{
      ok: boolean;
      skill: SkillInfo;
      scanStatus: string | null;
    }>;
    disableSkill(
      skillId: string,
    ): Promise<{
      ok: boolean;
      skill: SkillInfo;
      scanStatus: string | null;
    }>;
    createSkill(
      name: string,
      description: string,
    ): Promise<{ ok: boolean; skill: SkillInfo; path: string }>;
    openSkill(id: string): Promise<{ ok: boolean; path: string }>;
    getSkillSource(id: string): Promise<{
      ok: boolean;
      skillId: string;
      content: string;
      path: string;
    }>;
    saveSkillSource(
      id: string,
      content: string,
    ): Promise<{ ok: boolean; skillId: string; skill: SkillInfo }>;
    deleteSkill(
      id: string,
    ): Promise<{ ok: boolean; skillId: string; source: string }>;
    getSkillScanReport(id: string): Promise<{
      ok: boolean;
      report: SkillScanReportSummary | null;
      acknowledged: boolean;
      acknowledgment: {
        acknowledgedAt: string;
        findingCount: number;
      } | null;
    }>;
    acknowledgeSkill(
      id: string,
      enable: boolean,
    ): Promise<{
      ok: boolean;
      skillId: string;
      acknowledged: boolean;
      enabled: boolean;
      findingCount: number;
    }>;
    listApps(): Promise<RegistryAppInfo[]>;
    searchApps(query: string): Promise<RegistryAppInfo[]>;
    listInstalledApps(): Promise<InstalledAppInfo[]>;
    listAppRuns(): Promise<AppRunSummary[]>;
    getAppRun(runId: string): Promise<AppRunSummary>;
    attachAppRun(runId: string): Promise<AppRunActionResult>;
    detachAppRun(runId: string): Promise<AppRunActionResult>;
    stopApp(name: string): Promise<AppStopResult>;
    stopAppRun(runId: string): Promise<AppStopResult>;
    /**
     * Cheap liveness ping for an app run. The server's stale-run sweeper
     * uses the heartbeat to decide whether to reap a run whose UI tab has
     * gone away. Returns the refreshed run summary on success, or throws
     * if the run no longer exists (e.g. the sweeper already reaped it,
     * or another window pressed Stop).
     */
    heartbeatAppRun(
      runId: string,
    ): Promise<{ ok: boolean; run: AppRunSummary }>;
    getAppInfo(name: string): Promise<RegistryAppInfo>;
    launchApp(name: string): Promise<AppLaunchResult>;
    sendAppRunMessage(
      runId: string,
      content: string,
    ): Promise<AppRunSteeringResult>;
    controlAppRun(
      runId: string,
      action: AppSessionControlAction,
    ): Promise<AppRunSteeringResult>;
    getAppSessionState(
      appName: string,
      sessionId: string,
    ): Promise<AppSessionState>;
    sendAppSessionMessage(
      appName: string,
      sessionId: string,
      content: string,
    ): Promise<AppSessionActionResult>;
    controlAppSession(
      appName: string,
      sessionId: string,
      action: AppSessionControlAction,
    ): Promise<AppSessionActionResult>;
    listRegistryPlugins(): Promise<RegistryPluginItem[]>;
    searchRegistryPlugins(query: string): Promise<RegistryPluginItem[]>;
    listCustomActions(): Promise<CustomActionDef[]>;
    createCustomAction(
      action: Omit<CustomActionDef, "id" | "createdAt" | "updatedAt">,
    ): Promise<CustomActionDef>;
    updateCustomAction(
      id: string,
      action: Partial<CustomActionDef>,
    ): Promise<CustomActionDef>;
    deleteCustomAction(id: string): Promise<void>;
    testCustomAction(
      id: string,
      params: Record<string, string>,
    ): Promise<{
      ok: boolean;
      output: string;
      error?: string;
      durationMs: number;
    }>;
    generateCustomAction(
      prompt: string,
    ): Promise<{ ok: boolean; generated: Record<string, unknown> }>;
    getWhatsAppStatus(accountId?: string): Promise<{
      accountId: string;
      status: string;
      authExists: boolean;
      serviceConnected: boolean;
      servicePhone: string | null;
    }>;
    startWhatsAppPairing(accountId?: string): Promise<{
      ok: boolean;
      accountId: string;
      status: string;
      error?: string;
    }>;
    stopWhatsAppPairing(accountId?: string): Promise<{
      ok: boolean;
      accountId: string;
      status: string;
    }>;
    disconnectWhatsApp(accountId?: string): Promise<{
      ok: boolean;
      accountId: string;
    }>;
    getSignalStatus(accountId?: string): Promise<{
      accountId: string;
      status: string;
      authExists: boolean;
      serviceConnected: boolean;
      qrDataUrl: string | null;
      phoneNumber: string | null;
      error: string | null;
    }>;
    startSignalPairing(accountId?: string): Promise<{
      ok: boolean;
      accountId: string;
      status: string;
      error?: string;
    }>;
    stopSignalPairing(accountId?: string): Promise<{
      ok: boolean;
      accountId: string;
      status: string;
    }>;
    disconnectSignal(accountId?: string): Promise<{
      ok: boolean;
      accountId: string;
    }>;
    getTelegramAccountStatus(): Promise<{
      available: boolean;
      status: string;
      configured: boolean;
      sessionExists: boolean;
      serviceConnected: boolean;
      restartRequired: boolean;
      hasAppCredentials: boolean;
      phone: string | null;
      isCodeViaApp: boolean;
      account: {
        id: string;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      } | null;
      error: string | null;
    }>;
    startTelegramAccountAuth(phone?: string): Promise<{
      available: boolean;
      status: string;
      configured: boolean;
      sessionExists: boolean;
      serviceConnected: boolean;
      restartRequired: boolean;
      hasAppCredentials: boolean;
      phone: string | null;
      isCodeViaApp: boolean;
      account: {
        id: string;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      } | null;
      error: string | null;
    }>;
    submitTelegramAccountAuth(input: {
      provisioningCode?: string;
      telegramCode?: string;
      password?: string;
    }): Promise<{
      available: boolean;
      status: string;
      configured: boolean;
      sessionExists: boolean;
      serviceConnected: boolean;
      restartRequired: boolean;
      hasAppCredentials: boolean;
      phone: string | null;
      isCodeViaApp: boolean;
      account: {
        id: string;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      } | null;
      error: string | null;
    }>;
    disconnectTelegramAccount(): Promise<{
      ok: boolean;
      available: boolean;
      status: string;
      configured: boolean;
      sessionExists: boolean;
      serviceConnected: boolean;
      restartRequired: boolean;
      hasAppCredentials: boolean;
      phone: string | null;
      isCodeViaApp: boolean;
      account: {
        id: string;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      } | null;
      error: string | null;
    }>;
    getDiscordLocalStatus(): Promise<{
      available: boolean;
      connected: boolean;
      authenticated: boolean;
      currentUser?: {
        id: string;
        username: string;
        global_name?: string | null;
        avatar?: string | null;
      } | null;
      subscribedChannelIds: string[];
      configuredChannelIds: string[];
      scopes: string[];
      lastError: string | null;
      ipcPath: string | null;
    }>;
    authorizeDiscordLocal(): Promise<{
      available: boolean;
      connected: boolean;
      authenticated: boolean;
      currentUser?: {
        id: string;
        username: string;
        global_name?: string | null;
        avatar?: string | null;
      } | null;
      subscribedChannelIds: string[];
      configuredChannelIds: string[];
      scopes: string[];
      lastError: string | null;
      ipcPath: string | null;
    }>;
    disconnectDiscordLocal(): Promise<{ ok: boolean }>;
    listDiscordLocalGuilds(): Promise<{
      guilds: Array<{ id: string; name: string }>;
      count: number;
    }>;
    listDiscordLocalChannels(guildId: string): Promise<{
      channels: Array<{
        id: string;
        guild_id?: string | null;
        type?: number;
        name?: string | null;
        recipients?: Array<{
          id: string;
          username: string;
          global_name?: string | null;
          avatar?: string | null;
        }>;
      }>;
      count: number;
    }>;
    saveDiscordLocalSubscriptions(channelIds: string[]): Promise<{
      subscribedChannelIds: string[];
    }>;
    getBlueBubblesStatus(): Promise<{
      available: boolean;
      connected: boolean;
      webhookPath: string;
      reason?: string;
    }>;

    // Babylon terminal methods
    getBabylonAgentStatus(): Promise<BabylonAgentStatus>;
    getBabylonAgentActivity(opts?: {
      limit?: number;
      type?: string;
    }): Promise<BabylonActivityFeed>;
    getBabylonAgentLogs(opts?: {
      type?: string;
      level?: string;
    }): Promise<BabylonLogEntry[]>;
    getBabylonAgentWallet(): Promise<BabylonWallet>;
    getBabylonTeam(): Promise<BabylonTeamResponse>;
    getBabylonTeamChat(): Promise<BabylonTeamChatInfo>;
    sendBabylonTeamChat(
      content: string,
      mentions?: string[],
    ): Promise<BabylonChatResponse>;
    toggleBabylonAgent(
      action: "pause" | "resume" | "toggle",
    ): Promise<BabylonToggleResponse>;
    toggleBabylonAgentAutonomy(opts: {
      trading?: boolean;
      posting?: boolean;
      commenting?: boolean;
      dms?: boolean;
    }): Promise<BabylonToggleResponse>;

    // Babylon markets
    getBabylonPredictionMarkets(opts?: {
      page?: number;
      pageSize?: number;
      status?: string;
      category?: string;
    }): Promise<BabylonPredictionMarketsResponse>;
    getBabylonPredictionMarket(
      marketId: string,
    ): Promise<BabylonPredictionMarket>;
    buyBabylonPredictionShares(
      marketId: string,
      side: "yes" | "no",
      amount: number,
    ): Promise<BabylonTradeResult>;
    sellBabylonPredictionShares(
      marketId: string,
      side: "yes" | "no",
      amount: number,
    ): Promise<BabylonTradeResult>;
    getBabylonPerpMarkets(): Promise<BabylonPerpMarket[]>;
    getBabylonOpenPerpPositions(): Promise<BabylonPerpPosition[]>;
    closeBabylonPerpPosition(
      positionId: string,
    ): Promise<BabylonPerpTradeResult>;

    // Babylon social
    getBabylonPosts(opts?: {
      page?: number;
      limit?: number;
      feed?: string;
    }): Promise<BabylonPostsResponse>;
    createBabylonPost(
      content: string,
      marketId?: string,
    ): Promise<BabylonPostResult>;
    commentOnBabylonPost(
      postId: string,
      content: string,
    ): Promise<BabylonPostResult>;
    likeBabylonPost(postId: string): Promise<{ ok: boolean }>;

    // Babylon messaging
    getBabylonChats(): Promise<BabylonChatsResponse>;
    getBabylonChatMessages(
      chatId: string,
    ): Promise<BabylonChatMessagesResponse>;
    sendBabylonChatMessage(
      chatId: string,
      content: string,
    ): Promise<BabylonSendMessageResult>;
    getBabylonDM(userId: string): Promise<BabylonChat>;

    // Babylon agent management
    getBabylonAgentGoals(): Promise<BabylonAgentGoal[]>;
    getBabylonAgentStats(): Promise<BabylonAgentStats>;
    getBabylonAgentSummary(): Promise<BabylonAgentSummary>;
    getBabylonAgentRecentTrades(): Promise<BabylonActivityFeed>;
    getBabylonAgentTradingBalance(): Promise<{ balance: number }>;
    sendBabylonAgentChat(content: string): Promise<BabylonChatResponse>;
    getBabylonAgentChat(): Promise<{ messages: BabylonChatMessage[] }>;

    // Babylon feed
    getBabylonFeedForYou(): Promise<BabylonPostsResponse>;
    getBabylonFeedHot(): Promise<BabylonPostsResponse>;
    getBabylonTrades(): Promise<BabylonActivityFeed>;

    // Babylon discover & team
    discoverBabylonAgents(): Promise<BabylonTeamResponse>;
    getBabylonTeamDashboard(): Promise<Record<string, unknown>>;
    getBabylonTeamConversations(): Promise<Record<string, unknown>>;
    pauseAllBabylonAgents(): Promise<{ ok: boolean }>;
    resumeAllBabylonAgents(): Promise<{ ok: boolean }>;
  }
}

// ---------------------------------------------------------------------------
// Prototype augmentation
// ---------------------------------------------------------------------------

TokagentClient.prototype.getSkills = async function (this: TokagentClient) {
  return this.fetch("/api/skills");
};

TokagentClient.prototype.refreshSkills = async function (this: TokagentClient) {
  return this.fetch("/api/skills/refresh", { method: "POST" });
};

TokagentClient.prototype.getSkillCatalog = async function (
  this: TokagentClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.perPage) params.set("perPage", String(opts.perPage));
  if (opts?.sort) params.set("sort", opts.sort);
  const qs = params.toString();
  return this.fetch(`/api/skills/catalog${qs ? `?${qs}` : ""}`);
};

TokagentClient.prototype.searchSkillCatalog = async function (
  this: TokagentClient,
  query,
  limit = 30,
) {
  return this.fetch(
    `/api/skills/catalog/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
};

TokagentClient.prototype.getSkillCatalogDetail = async function (
  this: TokagentClient,
  slug,
) {
  return this.fetch(`/api/skills/catalog/${encodeURIComponent(slug)}`);
};

TokagentClient.prototype.refreshSkillCatalog = async function (this: TokagentClient) {
  return this.fetch("/api/skills/catalog/refresh", { method: "POST" });
};

TokagentClient.prototype.installCatalogSkill = async function (
  this: TokagentClient,
  slug,
  version?,
) {
  return this.fetch("/api/skills/catalog/install", {
    method: "POST",
    body: JSON.stringify({ slug, version }),
  });
};

TokagentClient.prototype.uninstallCatalogSkill = async function (
  this: TokagentClient,
  slug,
) {
  return this.fetch("/api/skills/catalog/uninstall", {
    method: "POST",
    body: JSON.stringify({ slug }),
  });
};

TokagentClient.prototype.getRegistryPlugins = async function (this: TokagentClient) {
  return this.fetch("/api/registry/plugins");
};

TokagentClient.prototype.getRegistryPluginInfo = async function (
  this: TokagentClient,
  name,
) {
  return this.fetch(`/api/registry/plugins/${encodeURIComponent(name)}`);
};

TokagentClient.prototype.getInstalledPlugins = async function (this: TokagentClient) {
  return this.fetch("/api/plugins/installed");
};

TokagentClient.prototype.installRegistryPlugin = async function (
  this: TokagentClient,
  name,
  autoRestart = true,
  options = {},
) {
  return this.fetch(
    "/api/plugins/install",
    {
      method: "POST",
      body: JSON.stringify({ name, autoRestart, ...options }),
    },
    { timeoutMs: 120_000 },
  );
};

TokagentClient.prototype.updateRegistryPlugin = async function (
  this: TokagentClient,
  name,
  autoRestart = true,
  options = {},
) {
  return this.fetch(
    "/api/plugins/update",
    {
      method: "POST",
      body: JSON.stringify({ name, autoRestart, ...options }),
    },
    { timeoutMs: 120_000 },
  );
};

TokagentClient.prototype.uninstallRegistryPlugin = async function (
  this: TokagentClient,
  name,
  autoRestart = true,
) {
  return this.fetch("/api/plugins/uninstall", {
    method: "POST",
    body: JSON.stringify({ name, autoRestart }),
  });
};

TokagentClient.prototype.searchSkillsMarketplace = async function (
  this: TokagentClient,
  query,
  installed,
  limit,
) {
  const params = new URLSearchParams({
    q: query,
    installed: String(installed),
    limit: String(limit),
  });
  return this.fetch(`/api/skills/marketplace/search?${params}`);
};

TokagentClient.prototype.getSkillsMarketplaceConfig = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/skills/marketplace/config");
};

TokagentClient.prototype.updateSkillsMarketplaceConfig = async function (
  this: TokagentClient,
  apiKey,
) {
  return this.fetch("/api/skills/marketplace/config", {
    method: "PUT",
    body: JSON.stringify({ apiKey }),
  });
};

TokagentClient.prototype.installMarketplaceSkill = async function (
  this: TokagentClient,
  data,
) {
  await this.fetch("/api/skills/marketplace/install", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.uninstallMarketplaceSkill = async function (
  this: TokagentClient,
  skillId,
  autoRefresh,
) {
  await this.fetch("/api/skills/marketplace/uninstall", {
    method: "POST",
    body: JSON.stringify({ id: skillId, autoRefresh }),
  });
};

TokagentClient.prototype.enableSkill = async function (
  this: TokagentClient,
  skillId,
) {
  return this.fetch(`/api/skills/${encodeURIComponent(skillId)}/enable`, {
    method: "POST",
  });
};

TokagentClient.prototype.disableSkill = async function (
  this: TokagentClient,
  skillId,
) {
  return this.fetch(`/api/skills/${encodeURIComponent(skillId)}/disable`, {
    method: "POST",
  });
};

TokagentClient.prototype.createSkill = async function (
  this: TokagentClient,
  name,
  description,
) {
  return this.fetch("/api/skills/create", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
};

TokagentClient.prototype.openSkill = async function (this: TokagentClient, id) {
  return this.fetch(`/api/skills/${encodeURIComponent(id)}/open`, {
    method: "POST",
  });
};

TokagentClient.prototype.getSkillSource = async function (this: TokagentClient, id) {
  return this.fetch(`/api/skills/${encodeURIComponent(id)}/source`);
};

TokagentClient.prototype.saveSkillSource = async function (
  this: TokagentClient,
  id,
  content,
) {
  return this.fetch(`/api/skills/${encodeURIComponent(id)}/source`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
};

TokagentClient.prototype.deleteSkill = async function (this: TokagentClient, id) {
  return this.fetch(`/api/skills/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

TokagentClient.prototype.getSkillScanReport = async function (
  this: TokagentClient,
  id,
) {
  return this.fetch(`/api/skills/${encodeURIComponent(id)}/scan`);
};

TokagentClient.prototype.acknowledgeSkill = async function (
  this: TokagentClient,
  id,
  enable,
) {
  return this.fetch(`/api/skills/${encodeURIComponent(id)}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({ enable }),
  });
};

TokagentClient.prototype.listApps = async function (this: TokagentClient) {
  return this.fetch("/api/apps");
};

TokagentClient.prototype.searchApps = async function (this: TokagentClient, query) {
  return this.fetch(`/api/apps/search?q=${encodeURIComponent(query)}`);
};

TokagentClient.prototype.listInstalledApps = async function (this: TokagentClient) {
  return this.fetch("/api/apps/installed");
};

TokagentClient.prototype.listAppRuns = async function (this: TokagentClient) {
  return this.fetch("/api/apps/runs");
};

TokagentClient.prototype.getAppRun = async function (this: TokagentClient, runId) {
  return this.fetch(`/api/apps/runs/${encodeURIComponent(runId)}`);
};

TokagentClient.prototype.attachAppRun = async function (this: TokagentClient, runId) {
  return this.fetch(`/api/apps/runs/${encodeURIComponent(runId)}/attach`, {
    method: "POST",
  });
};

TokagentClient.prototype.detachAppRun = async function (this: TokagentClient, runId) {
  return this.fetch(`/api/apps/runs/${encodeURIComponent(runId)}/detach`, {
    method: "POST",
  });
};

TokagentClient.prototype.stopApp = async function (this: TokagentClient, name) {
  return this.fetch("/api/apps/stop", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
};

TokagentClient.prototype.stopAppRun = async function (this: TokagentClient, runId) {
  return this.fetch(`/api/apps/runs/${encodeURIComponent(runId)}/stop`, {
    method: "POST",
  });
};

TokagentClient.prototype.heartbeatAppRun = async function (
  this: TokagentClient,
  runId,
) {
  return this.fetch(
    `/api/apps/runs/${encodeURIComponent(runId)}/heartbeat`,
    { method: "POST" },
  );
};

TokagentClient.prototype.getAppInfo = async function (this: TokagentClient, name) {
  return this.fetch(`/api/apps/info/${encodeURIComponent(name)}`);
};

TokagentClient.prototype.launchApp = async function (this: TokagentClient, name) {
  return this.fetch("/api/apps/launch", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
};

TokagentClient.prototype.sendAppRunMessage = async function (
  this: TokagentClient,
  runId,
  content,
) {
  const response = await this.rawRequest(
    `/api/apps/runs/${encodeURIComponent(runId)}/message`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
    { allowNonOk: true },
  );
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return {
    success: Boolean(data.success),
    message:
      typeof data.message === "string" && data.message.trim().length > 0
        ? data.message.trim()
        : response.status === 202
          ? "Command queued."
          : response.status >= 500
            ? "Command unavailable."
            : "Command rejected.",
    disposition:
      data.disposition === "accepted" ||
      data.disposition === "queued" ||
      data.disposition === "rejected" ||
      data.disposition === "unsupported"
        ? data.disposition
        : response.status === 202
          ? "queued"
          : response.status >= 500
            ? "unsupported"
            : response.status >= 400
              ? "rejected"
              : "accepted",
    status: response.status,
    run:
      data.run && typeof data.run === "object"
        ? (data.run as AppRunSummary)
        : null,
    session:
      data.session && typeof data.session === "object"
        ? (data.session as AppSessionState)
        : null,
  };
};

TokagentClient.prototype.controlAppRun = async function (
  this: TokagentClient,
  runId,
  action,
) {
  const response = await this.rawRequest(
    `/api/apps/runs/${encodeURIComponent(runId)}/control`,
    {
      method: "POST",
      body: JSON.stringify({ action }),
    },
    { allowNonOk: true },
  );
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return {
    success: Boolean(data.success),
    message:
      typeof data.message === "string" && data.message.trim().length > 0
        ? data.message.trim()
        : response.status === 202
          ? "Command queued."
          : response.status >= 500
            ? "Command unavailable."
            : "Command rejected.",
    disposition:
      data.disposition === "accepted" ||
      data.disposition === "queued" ||
      data.disposition === "rejected" ||
      data.disposition === "unsupported"
        ? data.disposition
        : response.status === 202
          ? "queued"
          : response.status >= 500
            ? "unsupported"
            : response.status >= 400
              ? "rejected"
              : "accepted",
    status: response.status,
    run:
      data.run && typeof data.run === "object"
        ? (data.run as AppRunSummary)
        : null,
    session:
      data.session && typeof data.session === "object"
        ? (data.session as AppSessionState)
        : null,
  };
};

TokagentClient.prototype.getAppSessionState = async function (
  this: TokagentClient,
  appName,
  sessionId,
) {
  const routeSlug = packageNameToAppRouteSlug(appName) ?? appName;
  return this.fetch(
    `/api/apps/${encodeURIComponent(routeSlug)}/session/${encodeURIComponent(sessionId)}`,
  );
};

TokagentClient.prototype.sendAppSessionMessage = async function (
  this: TokagentClient,
  appName,
  sessionId,
  content,
) {
  const routeSlug = packageNameToAppRouteSlug(appName) ?? appName;
  return this.fetch(
    `/api/apps/${encodeURIComponent(routeSlug)}/session/${encodeURIComponent(sessionId)}/message`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );
};

TokagentClient.prototype.controlAppSession = async function (
  this: TokagentClient,
  appName,
  sessionId,
  action,
) {
  const routeSlug = packageNameToAppRouteSlug(appName) ?? appName;
  return this.fetch(
    `/api/apps/${encodeURIComponent(routeSlug)}/session/${encodeURIComponent(sessionId)}/control`,
    {
      method: "POST",
      body: JSON.stringify({ action }),
    },
  );
};

TokagentClient.prototype.listRegistryPlugins = async function (this: TokagentClient) {
  return this.fetch("/api/apps/plugins");
};

TokagentClient.prototype.searchRegistryPlugins = async function (
  this: TokagentClient,
  query,
) {
  return this.fetch(`/api/apps/plugins/search?q=${encodeURIComponent(query)}`);
};

TokagentClient.prototype.listCustomActions = async function (this: TokagentClient) {
  const data = await this.fetch<{ actions: CustomActionDef[] }>(
    "/api/custom-actions",
  );
  return data.actions;
};

TokagentClient.prototype.createCustomAction = async function (
  this: TokagentClient,
  action,
) {
  const data = await this.fetch<{ ok: boolean; action: CustomActionDef }>(
    "/api/custom-actions",
    { method: "POST", body: JSON.stringify(action) },
  );
  return data.action;
};

TokagentClient.prototype.updateCustomAction = async function (
  this: TokagentClient,
  id,
  action,
) {
  const data = await this.fetch<{ ok: boolean; action: CustomActionDef }>(
    `/api/custom-actions/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(action) },
  );
  return data.action;
};

TokagentClient.prototype.deleteCustomAction = async function (
  this: TokagentClient,
  id,
) {
  await this.fetch(`/api/custom-actions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

TokagentClient.prototype.testCustomAction = async function (
  this: TokagentClient,
  id,
  params,
) {
  return this.fetch(`/api/custom-actions/${encodeURIComponent(id)}/test`, {
    method: "POST",
    body: JSON.stringify({ params }),
  });
};

TokagentClient.prototype.generateCustomAction = async function (
  this: TokagentClient,
  prompt,
) {
  return this.fetch("/api/custom-actions/generate", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
};

TokagentClient.prototype.getWhatsAppStatus = async function (
  this: TokagentClient,
  accountId = "default",
) {
  return this.fetch(
    `/api/whatsapp/status?accountId=${encodeURIComponent(accountId)}`,
  );
};

TokagentClient.prototype.startWhatsAppPairing = async function (
  this: TokagentClient,
  accountId = "default",
) {
  return this.fetch("/api/whatsapp/pair", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
};

TokagentClient.prototype.stopWhatsAppPairing = async function (
  this: TokagentClient,
  accountId = "default",
) {
  return this.fetch("/api/whatsapp/pair/stop", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
};

TokagentClient.prototype.disconnectWhatsApp = async function (
  this: TokagentClient,
  accountId = "default",
) {
  return this.fetch("/api/whatsapp/disconnect", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
};

TokagentClient.prototype.getSignalStatus = async function (
  this: TokagentClient,
  accountId = "default",
) {
  return this.fetch(
    `/api/signal/status?accountId=${encodeURIComponent(accountId)}`,
  );
};

TokagentClient.prototype.startSignalPairing = async function (
  this: TokagentClient,
  accountId = "default",
): Promise<{
  ok: boolean;
  accountId: string;
  status: string;
  error?: string;
}> {
  return this.fetch<{
    ok: boolean;
    accountId: string;
    status: string;
    error?: string;
  }>("/api/signal/pair", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
};

TokagentClient.prototype.stopSignalPairing = async function (
  this: TokagentClient,
  accountId = "default",
): Promise<{
  ok: boolean;
  accountId: string;
  status: string;
}> {
  return this.fetch<{
    ok: boolean;
    accountId: string;
    status: string;
  }>("/api/signal/pair/stop", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
};

TokagentClient.prototype.disconnectSignal = async function (
  this: TokagentClient,
  accountId = "default",
) {
  return this.fetch("/api/signal/disconnect", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
};

TokagentClient.prototype.getTelegramAccountStatus = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/telegram-account/status");
};

TokagentClient.prototype.startTelegramAccountAuth = async function (
  this: TokagentClient,
  phone,
) {
  return this.fetch("/api/telegram-account/auth/start", {
    method: "POST",
    body: JSON.stringify(
      typeof phone === "string" && phone.trim().length > 0
        ? { phone: phone.trim() }
        : {},
    ),
  });
};

TokagentClient.prototype.submitTelegramAccountAuth = async function (
  this: TokagentClient,
  input,
) {
  return this.fetch("/api/telegram-account/auth/submit", {
    method: "POST",
    body: JSON.stringify(input),
  });
};

TokagentClient.prototype.disconnectTelegramAccount = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/telegram-account/disconnect", {
    method: "POST",
  });
};

TokagentClient.prototype.getDiscordLocalStatus = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/discord-local/status");
};

TokagentClient.prototype.authorizeDiscordLocal = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/discord-local/authorize", {
    method: "POST",
  });
};

TokagentClient.prototype.disconnectDiscordLocal = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/discord-local/disconnect", {
    method: "POST",
  });
};

TokagentClient.prototype.listDiscordLocalGuilds = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/discord-local/guilds");
};

TokagentClient.prototype.listDiscordLocalChannels = async function (
  this: TokagentClient,
  guildId,
) {
  return this.fetch(
    `/api/discord-local/channels?guildId=${encodeURIComponent(guildId)}`,
  );
};

TokagentClient.prototype.saveDiscordLocalSubscriptions = async function (
  this: TokagentClient,
  channelIds,
) {
  return this.fetch("/api/discord-local/subscriptions", {
    method: "POST",
    body: JSON.stringify({ channelIds }),
  });
};

TokagentClient.prototype.getBlueBubblesStatus = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/bluebubbles/status");
};

// ---------------------------------------------------------------------------
// Babylon terminal methods
// ---------------------------------------------------------------------------

TokagentClient.prototype.getBabylonAgentStatus = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon@tokagentos/agent/status");
};

TokagentClient.prototype.getBabylonAgentActivity = async function (
  this: TokagentClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.type) params.set("type", opts.type);
  const qs = params.toString();
  return this.fetch(
    `/api/apps/babylon@tokagentos/agent/activity${qs ? `?${qs}` : ""}`,
  );
};

TokagentClient.prototype.getBabylonAgentLogs = async function (
  this: TokagentClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.type) params.set("type", opts.type);
  if (opts?.level) params.set("level", opts.level);
  const qs = params.toString();
  return this.fetch(
    `/api/apps/babylon@tokagentos/agent/logs${qs ? `?${qs}` : ""}`,
  );
};

TokagentClient.prototype.getBabylonAgentWallet = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon@tokagentos/agent/wallet");
};

TokagentClient.prototype.getBabylonTeam = async function (this: TokagentClient) {
  return this.fetch("/api/apps/babylon/team");
};

TokagentClient.prototype.getBabylonTeamChat = async function (this: TokagentClient) {
  return this.fetch("/api/apps/babylon/team/info");
};

TokagentClient.prototype.sendBabylonTeamChat = async function (
  this: TokagentClient,
  content,
  mentions?,
) {
  return this.fetch("/api/apps/babylon/team/chat", {
    method: "POST",
    body: JSON.stringify({ content, mentions }),
  });
};

TokagentClient.prototype.toggleBabylonAgent = async function (
  this: TokagentClient,
  action,
) {
  return this.fetch("/api/apps/babylon@tokagentos/agent/toggle", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
};

TokagentClient.prototype.toggleBabylonAgentAutonomy = async function (
  this: TokagentClient,
  opts,
) {
  return this.fetch("/api/apps/babylon", {
    method: "POST",
    body: JSON.stringify(opts),
  });
};

// ---------------------------------------------------------------------------
// Babylon markets
// ---------------------------------------------------------------------------

TokagentClient.prototype.getBabylonPredictionMarkets = async function (
  this: TokagentClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
  if (opts?.status) params.set("status", opts.status);
  if (opts?.category) params.set("category", opts.category);
  const qs = params.toString();
  return this.fetch(
    `/api/apps/babylon/markets/predictions${qs ? `?${qs}` : ""}`,
  );
};

TokagentClient.prototype.getBabylonPredictionMarket = async function (
  this: TokagentClient,
  marketId,
) {
  return this.fetch(
    `/api/apps/babylon/markets/predictions/${encodeURIComponent(marketId)}`,
  );
};

TokagentClient.prototype.buyBabylonPredictionShares = async function (
  this: TokagentClient,
  marketId,
  side,
  amount,
) {
  return this.fetch(
    `/api/apps/babylon/markets/predictions/${encodeURIComponent(marketId)}/buy`,
    { method: "POST", body: JSON.stringify({ side, amount }) },
  );
};

TokagentClient.prototype.sellBabylonPredictionShares = async function (
  this: TokagentClient,
  marketId,
  side,
  amount,
) {
  return this.fetch(
    `/api/apps/babylon/markets/predictions/${encodeURIComponent(marketId)}/sell`,
    { method: "POST", body: JSON.stringify({ side, amount }) },
  );
};

TokagentClient.prototype.getBabylonPerpMarkets = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon/markets/perps");
};

TokagentClient.prototype.getBabylonOpenPerpPositions = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon/markets/perps/open");
};

TokagentClient.prototype.closeBabylonPerpPosition = async function (
  this: TokagentClient,
  positionId,
) {
  return this.fetch(
    `/api/apps/babylon/markets/perps/position/${encodeURIComponent(positionId)}/close`,
    { method: "POST", body: JSON.stringify({}) },
  );
};

// ---------------------------------------------------------------------------
// Babylon social
// ---------------------------------------------------------------------------

TokagentClient.prototype.getBabylonPosts = async function (
  this: TokagentClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.feed) params.set("feed", opts.feed);
  const qs = params.toString();
  return this.fetch(`/api/apps/babylon/posts${qs ? `?${qs}` : ""}`);
};

TokagentClient.prototype.createBabylonPost = async function (
  this: TokagentClient,
  content,
  marketId?,
) {
  return this.fetch("/api/apps/babylon/posts", {
    method: "POST",
    body: JSON.stringify({ content, marketId }),
  });
};

TokagentClient.prototype.commentOnBabylonPost = async function (
  this: TokagentClient,
  postId,
  content,
) {
  return this.fetch(
    `/api/apps/babylon/posts/${encodeURIComponent(postId)}/comments`,
    { method: "POST", body: JSON.stringify({ content }) },
  );
};

TokagentClient.prototype.likeBabylonPost = async function (
  this: TokagentClient,
  postId,
) {
  return this.fetch(
    `/api/apps/babylon/posts/${encodeURIComponent(postId)}/like`,
    { method: "POST" },
  );
};

// ---------------------------------------------------------------------------
// Babylon messaging
// ---------------------------------------------------------------------------

TokagentClient.prototype.getBabylonChats = async function (this: TokagentClient) {
  return this.fetch("/api/apps/babylon/chats");
};

TokagentClient.prototype.getBabylonChatMessages = async function (
  this: TokagentClient,
  chatId,
) {
  return this.fetch(
    `/api/apps/babylon/chats/${encodeURIComponent(chatId)}/messages`,
  );
};

TokagentClient.prototype.sendBabylonChatMessage = async function (
  this: TokagentClient,
  chatId,
  content,
) {
  return this.fetch(
    `/api/apps/babylon/chats/${encodeURIComponent(chatId)}/message`,
    { method: "POST", body: JSON.stringify({ content }) },
  );
};

TokagentClient.prototype.getBabylonDM = async function (
  this: TokagentClient,
  userId,
) {
  return this.fetch(
    `/api/apps/babylon/chats/dm?userId=${encodeURIComponent(userId)}`,
  );
};

// ---------------------------------------------------------------------------
// Babylon agent management
// ---------------------------------------------------------------------------

TokagentClient.prototype.getBabylonAgentGoals = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon@tokagentos/agent/goals");
};

TokagentClient.prototype.getBabylonAgentStats = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon@tokagentos/agent/stats");
};

TokagentClient.prototype.getBabylonAgentSummary = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon@tokagentos/agent/summary");
};

TokagentClient.prototype.getBabylonAgentRecentTrades = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon@tokagentos/agent/recent-trades");
};

TokagentClient.prototype.getBabylonAgentTradingBalance = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon@tokagentos/agent/trading-balance");
};

TokagentClient.prototype.sendBabylonAgentChat = async function (
  this: TokagentClient,
  content,
) {
  return this.fetch("/api/apps/babylon@tokagentos/agent/chat", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
};

TokagentClient.prototype.getBabylonAgentChat = async function (this: TokagentClient) {
  return this.fetch("/api/apps/babylon@tokagentos/agent/chat");
};

// ---------------------------------------------------------------------------
// Babylon feed
// ---------------------------------------------------------------------------

TokagentClient.prototype.getBabylonFeedForYou = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon/feed/for-you");
};

TokagentClient.prototype.getBabylonFeedHot = async function (this: TokagentClient) {
  return this.fetch("/api/apps/babylon/feed/hot");
};

TokagentClient.prototype.getBabylonTrades = async function (this: TokagentClient) {
  return this.fetch("/api/apps/babylon/trades");
};

// ---------------------------------------------------------------------------
// Babylon discover & team management
// ---------------------------------------------------------------------------

TokagentClient.prototype.discoverBabylonAgents = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon@elizaos/agents/discover");
};

TokagentClient.prototype.getBabylonTeamDashboard = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon/team/dashboard");
};

TokagentClient.prototype.getBabylonTeamConversations = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon/team/conversations");
};

TokagentClient.prototype.pauseAllBabylonAgents = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon/admin@elizaos/agents/pause-all", {
    method: "POST",
  });
};

TokagentClient.prototype.resumeAllBabylonAgents = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/apps/babylon/admin@elizaos/agents/resume-all", {
    method: "POST",
  });
};
