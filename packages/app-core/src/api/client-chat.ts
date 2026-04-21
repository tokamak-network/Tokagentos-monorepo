/**
 * Chat domain methods — chat, conversations, knowledge, memory, MCP,
 * share ingest, workbench, trajectories, database.
 */

import type { DatabaseProviderType } from "@tokagentos/agent/contracts/config";
import { TokagentClient } from "./client-base";
import type {
  ApiError,
  ChatTokenUsage,
  ConnectionTestResult,
  ContentBlock,
  Conversation,
  ConversationMetadata,
  ConversationChannelType,
  ConversationGreeting,
  ConversationMessage,
  ConversationMode,
  CreateConversationOptions,
  DatabaseConfigResponse,
  DatabaseStatus,
  ImageAttachment,
  KnowledgeBulkUploadResult,
  KnowledgeDocumentDetail,
  KnowledgeDocumentsResponse,
  KnowledgeFragmentsResponse,
  KnowledgeSearchResponse,
  KnowledgeStats,
  KnowledgeUploadResult,
  McpMarketplaceResult,
  McpRegistryServerDetail,
  McpServerConfig,
  McpServerStatus,
  MemoryBrowseQuery,
  MemoryBrowseResponse,
  MemoryFeedQuery,
  MemoryFeedResponse,
  MemoryRememberResponse,
  MemorySearchResponse,
  MemoryStatsResponse,
  QueryResult,
  QuickContextResponse,
  ShareIngestItem,
  ShareIngestPayload,
  TableInfo,
  TableRowsResponse,
  TrajectoryConfig,
  TrajectoryDetailResult,
  TrajectoryExportOptions,
  TrajectoryListOptions,
  TrajectoryListResult,
  TrajectoryStats,
  WorkbenchOverview,
  WorkbenchTask,
  WorkbenchTodo,
} from "./client-types";

// ---------------------------------------------------------------------------
// Declaration merging
// ---------------------------------------------------------------------------

declare module "./client-base" {
  interface TokagentClient {
    sendChatRest(
      text: string,
      channelType?: ConversationChannelType,
      conversationMode?: ConversationMode,
    ): Promise<{
      text: string;
      agentName: string;
      noResponseReason?: "ignored";
    }>;
    sendChatStream(
      text: string,
      onToken: (token: string, accumulatedText?: string) => void,
      channelType?: ConversationChannelType,
      signal?: AbortSignal,
      conversationMode?: ConversationMode,
    ): Promise<{
      text: string;
      agentName: string;
      completed: boolean;
      noResponseReason?: "ignored";
      usage?: ChatTokenUsage;
    }>;
    listConversations(): Promise<{ conversations: Conversation[] }>;
    createConversation(
      title?: string,
      options?: CreateConversationOptions,
    ): Promise<{
      conversation: Conversation;
      greeting?: ConversationGreeting;
    }>;
    getConversationMessages(
      id: string,
    ): Promise<{ messages: ConversationMessage[] }>;
    /**
     * Fetch the unified cross-channel inbox. Returns the most recent
     * messages across every connector room the agent participates in,
     * time-ordered newest first. Each message carries its `source`
     * tag (imessage / telegram / discord / etc.) so the UI can render
     * per-source styling without a second lookup.
     *
     * When `roomId` is provided the server scopes the query to that
     * single connector room — use this when the unified messages view
     * has a specific chat selected. When `roomId` is omitted the feed
     * merges every room's recent messages.
     */
    getInboxMessages(options?: {
      limit?: number;
      sources?: string[];
      roomId?: string;
      roomSource?: string;
    }): Promise<{
      messages: Array<ConversationMessage & { roomId: string; source: string }>;
      count: number;
    }>;
    /**
     * List the distinct connector source tags the agent currently has
     * inbox messages for. Used by the unified inbox UI to build the
     * source filter chip list dynamically.
     */
    getInboxSources(): Promise<{ sources: string[] }>;
    /**
     * List every connector chat thread the agent participates in as
     * one sidebar-friendly row per external chat room. Each row carries
     * the room id (for selection), source tag, display title,
     * last-message preview, last-message timestamp, and a total message
     * count. Used by the unified messages sidebar to render connector
     * chats alongside dashboard conversations.
     */
    getInboxChats(options?: { sources?: string[] }): Promise<{
      chats: Array<{
        canSend?: boolean;
        id: string;
        source: string;
        transportSource?: string;
        /** Owning server/world id when the connector exposes one. */
        worldId?: string;
        /** User-facing server/world label for selectors and section headers. */
        worldLabel: string;
        title: string;
        avatarUrl?: string;
        lastMessageText: string;
        lastMessageAt: number;
        messageCount: number;
      }>;
      count: number;
    }>;
    sendInboxMessage(data: {
      roomId: string;
      source: string;
      text: string;
      replyToMessageId?: string;
    }): Promise<{
      ok: boolean;
      message?: ConversationMessage & { roomId: string; source: string };
    }>;
    truncateConversationMessages(
      id: string,
      messageId: string,
      options?: { inclusive?: boolean },
    ): Promise<{ ok: boolean; deletedCount: number }>;
    sendConversationMessage(
      id: string,
      text: string,
      channelType?: ConversationChannelType,
      images?: ImageAttachment[],
      conversationMode?: ConversationMode,
      metadata?: Record<string, unknown>,
    ): Promise<{
      text: string;
      agentName: string;
      blocks?: ContentBlock[];
      noResponseReason?: "ignored";
    }>;
    sendConversationMessageStream(
      id: string,
      text: string,
      onToken: (token: string, accumulatedText?: string) => void,
      channelType?: ConversationChannelType,
      signal?: AbortSignal,
      images?: ImageAttachment[],
      conversationMode?: ConversationMode,
      metadata?: Record<string, unknown>,
    ): Promise<{
      text: string;
      agentName: string;
      completed: boolean;
      noResponseReason?: "ignored";
      usage?: ChatTokenUsage;
    }>;
    requestGreeting(
      id: string,
      lang?: string,
    ): Promise<{
      text: string;
      agentName: string;
      generated: boolean;
      persisted?: boolean;
    }>;
    renameConversation(
      id: string,
      title: string,
      options?: { generate?: boolean },
    ): Promise<{ conversation: Conversation }>;
    updateConversation(
      id: string,
      data: {
        title?: string;
        generate?: boolean;
        metadata?: ConversationMetadata | null;
      },
    ): Promise<{ conversation: Conversation }>;
    deleteConversation(id: string): Promise<{ ok: boolean }>;
    getKnowledgeStats(): Promise<KnowledgeStats>;
    listKnowledgeDocuments(options?: {
      limit?: number;
      offset?: number;
    }): Promise<KnowledgeDocumentsResponse>;
    getKnowledgeDocument(
      documentId: string,
    ): Promise<{ document: KnowledgeDocumentDetail }>;
    deleteKnowledgeDocument(
      documentId: string,
    ): Promise<{ ok: boolean; deletedFragments: number }>;
    uploadKnowledgeDocument(data: {
      content: string;
      filename: string;
      contentType?: string;
      metadata?: Record<string, unknown>;
    }): Promise<KnowledgeUploadResult>;
    uploadKnowledgeDocumentsBulk(data: {
      documents: Array<{
        content: string;
        filename: string;
        contentType?: string;
        metadata?: Record<string, unknown>;
      }>;
    }): Promise<KnowledgeBulkUploadResult>;
    uploadKnowledgeFromUrl(
      url: string,
      metadata?: Record<string, unknown>,
    ): Promise<KnowledgeUploadResult>;
    searchKnowledge(
      query: string,
      options?: { threshold?: number; limit?: number },
    ): Promise<KnowledgeSearchResponse>;
    getKnowledgeFragments(
      documentId: string,
    ): Promise<KnowledgeFragmentsResponse>;
    rememberMemory(text: string): Promise<MemoryRememberResponse>;
    searchMemory(
      query: string,
      options?: { limit?: number },
    ): Promise<MemorySearchResponse>;
    quickContext(
      query: string,
      options?: { limit?: number },
    ): Promise<QuickContextResponse>;
    getMemoryFeed(query?: MemoryFeedQuery): Promise<MemoryFeedResponse>;
    browseMemories(query?: MemoryBrowseQuery): Promise<MemoryBrowseResponse>;
    getMemoriesByEntity(
      entityId: string,
      query?: MemoryBrowseQuery,
    ): Promise<MemoryBrowseResponse>;
    getMemoryStats(): Promise<MemoryStatsResponse>;
    getMcpConfig(): Promise<{ servers: Record<string, McpServerConfig> }>;
    getMcpStatus(): Promise<{ servers: McpServerStatus[] }>;
    searchMcpMarketplace(
      query: string,
      limit: number,
    ): Promise<{ results: McpMarketplaceResult[] }>;
    getMcpServerDetails(
      name: string,
    ): Promise<{ server: McpRegistryServerDetail }>;
    addMcpServer(name: string, config: McpServerConfig): Promise<void>;
    removeMcpServer(name: string): Promise<void>;
    ingestShare(
      payload: ShareIngestPayload,
    ): Promise<{ item: ShareIngestItem }>;
    consumeShareIngest(): Promise<{ items: ShareIngestItem[] }>;
    getWorkbenchOverview(): Promise<
      WorkbenchOverview & {
        tasksAvailable?: boolean;
        triggersAvailable?: boolean;
        todosAvailable?: boolean;
      }
    >;
    listWorkbenchTasks(): Promise<{ tasks: WorkbenchTask[] }>;
    getWorkbenchTask(taskId: string): Promise<{ task: WorkbenchTask }>;
    createWorkbenchTask(data: {
      name: string;
      description?: string;
      tags?: string[];
      isCompleted?: boolean;
    }): Promise<{ task: WorkbenchTask }>;
    updateWorkbenchTask(
      taskId: string,
      data: {
        name?: string;
        description?: string;
        tags?: string[];
        isCompleted?: boolean;
      },
    ): Promise<{ task: WorkbenchTask }>;
    deleteWorkbenchTask(taskId: string): Promise<{ ok: boolean }>;
    listWorkbenchTodos(): Promise<{ todos: WorkbenchTodo[] }>;
    getWorkbenchTodo(todoId: string): Promise<{ todo: WorkbenchTodo }>;
    createWorkbenchTodo(data: {
      name: string;
      description?: string;
      priority?: number;
      isUrgent?: boolean;
      type?: string;
      isCompleted?: boolean;
    }): Promise<{ todo: WorkbenchTodo }>;
    updateWorkbenchTodo(
      todoId: string,
      data: {
        name?: string;
        description?: string;
        priority?: number;
        isUrgent?: boolean;
        type?: string;
        isCompleted?: boolean;
      },
    ): Promise<{ todo: WorkbenchTodo }>;
    setWorkbenchTodoCompleted(
      todoId: string,
      isCompleted: boolean,
    ): Promise<void>;
    deleteWorkbenchTodo(todoId: string): Promise<{ ok: boolean }>;
    refreshRegistry(): Promise<void>;
    getTrajectories(
      options?: TrajectoryListOptions,
    ): Promise<TrajectoryListResult>;
    getTrajectoryDetail(trajectoryId: string): Promise<TrajectoryDetailResult>;
    getTrajectoryStats(): Promise<TrajectoryStats>;
    getTrajectoryConfig(): Promise<TrajectoryConfig>;
    updateTrajectoryConfig(
      config: Partial<TrajectoryConfig>,
    ): Promise<TrajectoryConfig>;
    exportTrajectories(options: TrajectoryExportOptions): Promise<Blob>;
    deleteTrajectories(trajectoryIds: string[]): Promise<{ deleted: number }>;
    clearAllTrajectories(): Promise<{ deleted: number }>;
    getDatabaseStatus(): Promise<DatabaseStatus>;
    getDatabaseConfig(): Promise<DatabaseConfigResponse>;
    saveDatabaseConfig(config: {
      provider?: DatabaseProviderType;
      pglite?: { dataDir?: string };
      postgres?: {
        connectionString?: string;
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
        ssl?: boolean;
      };
    }): Promise<{ saved: boolean; needsRestart: boolean }>;
    testDatabaseConnection(creds: {
      connectionString?: string;
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      ssl?: boolean;
    }): Promise<ConnectionTestResult>;
    getDatabaseTables(): Promise<{ tables: TableInfo[] }>;
    getDatabaseRows(
      table: string,
      opts?: {
        offset?: number;
        limit?: number;
        sort?: string;
        order?: "asc" | "desc";
        search?: string;
      },
    ): Promise<TableRowsResponse>;
    insertDatabaseRow(
      table: string,
      data: Record<string, unknown>,
    ): Promise<{
      inserted: boolean;
      row: Record<string, unknown> | null;
    }>;
    updateDatabaseRow(
      table: string,
      where: Record<string, unknown>,
      data: Record<string, unknown>,
    ): Promise<{ updated: boolean; row: Record<string, unknown> }>;
    deleteDatabaseRow(
      table: string,
      where: Record<string, unknown>,
    ): Promise<{ deleted: boolean; row: Record<string, unknown> }>;
    executeDatabaseQuery(sql: string, readOnly?: boolean): Promise<QueryResult>;
  }
}

// ---------------------------------------------------------------------------
// Prototype augmentation
// ---------------------------------------------------------------------------

const LEGACY_CHAT_COMPAT_TITLE = "Quick Chat";
const LEGACY_CHAT_CONVERSATION_STORAGE_PREFIX = "legacy_chat_conversation";

function getLegacyChatConversationStorageKey(client: TokagentClient): string {
  const base =
    client.getBaseUrl() ||
    (typeof window !== "undefined" ? window.location.origin : "same-origin");
  return `${LEGACY_CHAT_CONVERSATION_STORAGE_PREFIX}:${encodeURIComponent(base)}`;
}

function readLegacyChatConversationId(client: TokagentClient): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.sessionStorage.getItem(
    getLegacyChatConversationStorageKey(client),
  );
  return stored?.trim() ? stored.trim() : null;
}

function writeLegacyChatConversationId(
  client: TokagentClient,
  conversationId: string | null,
): void {
  if (typeof window === "undefined") {
    return;
  }
  const key = getLegacyChatConversationStorageKey(client);
  if (conversationId?.trim()) {
    window.sessionStorage.setItem(key, conversationId.trim());
    return;
  }
  window.sessionStorage.removeItem(key);
}

async function ensureLegacyChatConversationId(
  client: TokagentClient,
): Promise<string> {
  const cached = readLegacyChatConversationId(client);
  if (cached) {
    return cached;
  }

  const { conversation } = await client.createConversation(
    LEGACY_CHAT_COMPAT_TITLE,
  );
  writeLegacyChatConversationId(client, conversation.id);
  return conversation.id;
}

TokagentClient.prototype.sendChatRest = async function (
  this: TokagentClient,
  text,
  channelType = "DM",
  conversationMode?,
) {
  const sendToConversation = async (conversationId: string) =>
    this.sendConversationMessage(
      conversationId,
      text,
      channelType,
      undefined,
      conversationMode,
    );

  const conversationId = await ensureLegacyChatConversationId(this);
  try {
    return await sendToConversation(conversationId);
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ApiError" &&
      (error as ApiError).status === 404
    ) {
      writeLegacyChatConversationId(this, null);
      return sendToConversation(await ensureLegacyChatConversationId(this));
    }
    throw error;
  }
};

TokagentClient.prototype.sendChatStream = async function (
  this: TokagentClient,
  text,
  onToken,
  channelType = "DM",
  signal?,
  conversationMode?,
) {
  const streamConversation = async (conversationId: string) =>
    this.sendConversationMessageStream(
      conversationId,
      text,
      onToken,
      channelType,
      signal,
      undefined,
      conversationMode,
    );

  const conversationId = await ensureLegacyChatConversationId(this);
  try {
    return await streamConversation(conversationId);
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ApiError" &&
      (error as ApiError).status === 404
    ) {
      writeLegacyChatConversationId(this, null);
      return streamConversation(await ensureLegacyChatConversationId(this));
    }
    throw error;
  }
};

TokagentClient.prototype.listConversations = async function (this: TokagentClient) {
  return this.fetch("/api/conversations");
};

TokagentClient.prototype.createConversation = async function (
  this: TokagentClient,
  title?,
  options?,
) {
  const response = await this.fetch<{
    conversation: Conversation;
    greeting?: ConversationGreeting;
  }>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      title,
      ...(options?.includeGreeting === true ||
      options?.bootstrapGreeting === true
        ? { includeGreeting: true }
        : {}),
      ...(typeof options?.lang === "string" && options.lang.trim()
        ? { lang: options.lang.trim() }
        : {}),
      ...(options?.metadata ? { metadata: options.metadata } : {}),
    }),
  });
  if (!response.greeting) {
    return response;
  }
  return {
    ...response,
    greeting: {
      ...response.greeting,
      text: this.normalizeGreetingText(response.greeting.text),
    },
  };
};

TokagentClient.prototype.getConversationMessages = async function (
  this: TokagentClient,
  id,
) {
  const response = await this.fetch<{ messages: ConversationMessage[] }>(
    `/api/conversations/${encodeURIComponent(id)}/messages`,
  );
  return {
    messages: response.messages.map((message) => {
      if (message.role !== "assistant") return message;
      const text = this.normalizeAssistantText(message.text);
      return text === message.text ? message : { ...message, text };
    }),
  };
};

TokagentClient.prototype.getInboxMessages = async function (
  this: TokagentClient,
  options,
) {
  const params = new URLSearchParams();
  if (typeof options?.limit === "number" && options.limit > 0) {
    params.set("limit", String(options.limit));
  }
  if (options?.sources && options.sources.length > 0) {
    params.set("sources", options.sources.join(","));
  }
  if (typeof options?.roomId === "string" && options.roomId.length > 0) {
    params.set("roomId", options.roomId);
  }
  if (
    typeof options?.roomSource === "string" &&
    options.roomSource.length > 0
  ) {
    params.set("roomSource", options.roomSource);
  }
  const query = params.toString();
  const path = query ? `/api/inbox/messages?${query}` : "/api/inbox/messages";
  return this.fetch<{
    messages: Array<ConversationMessage & { roomId: string; source: string }>;
    count: number;
  }>(path);
};

TokagentClient.prototype.getInboxSources = async function (this: TokagentClient) {
  return this.fetch<{ sources: string[] }>("/api/inbox/sources");
};

TokagentClient.prototype.getInboxChats = async function (
  this: TokagentClient,
  options,
) {
  const params = new URLSearchParams();
  if (options?.sources && options.sources.length > 0) {
    params.set("sources", options.sources.join(","));
  }
  const query = params.toString();
  const path = query ? `/api/inbox/chats?${query}` : "/api/inbox/chats";
  return this.fetch<{
    chats: Array<{
      canSend?: boolean;
      id: string;
      source: string;
      transportSource?: string;
      /** Owning server/world id when the connector exposes one. */
      worldId?: string;
      /** User-facing server/world label for selectors and section headers. */
      worldLabel: string;
      title: string;
      avatarUrl?: string;
      lastMessageText: string;
      lastMessageAt: number;
      messageCount: number;
    }>;
    count: number;
  }>(path);
};

TokagentClient.prototype.sendInboxMessage = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch<{
    ok: boolean;
    message?: ConversationMessage & { roomId: string; source: string };
  }>("/api/inbox/messages", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.truncateConversationMessages = async function (
  this: TokagentClient,
  id,
  messageId,
  options?,
) {
  return this.fetch(
    `/api/conversations/${encodeURIComponent(id)}/messages/truncate`,
    {
      method: "POST",
      body: JSON.stringify({
        messageId,
        inclusive: options?.inclusive === true,
      }),
    },
  );
};

TokagentClient.prototype.sendConversationMessage = async function (
  this: TokagentClient,
  id,
  text,
  channelType = "DM",
  images?,
  conversationMode?,
  metadata?,
) {
  const response = await this.fetch<{
    text: string;
    agentName: string;
    blocks?: ContentBlock[];
    noResponseReason?: "ignored";
  }>(`/api/conversations/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      text,
      channelType,
      ...(images?.length ? { images } : {}),
      ...(conversationMode ? { conversationMode } : {}),
      ...(metadata ? { metadata } : {}),
    }),
  });
  return {
    ...response,
    text:
      response.noResponseReason === "ignored"
        ? ""
        : this.normalizeAssistantText(response.text),
  };
};

TokagentClient.prototype.sendConversationMessageStream = async function (
  this: TokagentClient,
  id,
  text,
  onToken,
  channelType = "DM",
  signal?,
  images?,
  conversationMode?,
  metadata?,
) {
  return this.streamChatEndpoint(
    `/api/conversations/${encodeURIComponent(id)}/messages/stream`,
    text,
    onToken,
    channelType,
    signal,
    images,
    conversationMode,
    metadata,
  );
};

TokagentClient.prototype.requestGreeting = async function (
  this: TokagentClient,
  id,
  lang?,
) {
  const qs = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  const response = await this.fetch<{
    text: string;
    agentName: string;
    generated: boolean;
    persisted?: boolean;
  }>(`/api/conversations/${encodeURIComponent(id)}/greeting${qs}`, {
    method: "POST",
  });
  return {
    ...response,
    text: this.normalizeGreetingText(response.text),
  };
};

TokagentClient.prototype.renameConversation = async function (
  this: TokagentClient,
  id,
  title,
  options?,
) {
  return this.updateConversation(id, {
    title,
    generate: options?.generate,
  });
};

TokagentClient.prototype.updateConversation = async function (
  this: TokagentClient,
  id,
  data,
) {
  return this.fetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(typeof data?.title === "string" ? { title: data.title } : {}),
      ...(typeof data?.generate === "boolean"
        ? { generate: data.generate }
        : {}),
      ...(data && "metadata" in data ? { metadata: data.metadata } : {}),
    }),
  });
};

TokagentClient.prototype.deleteConversation = async function (
  this: TokagentClient,
  id,
) {
  return this.fetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

TokagentClient.prototype.getKnowledgeStats = async function (this: TokagentClient) {
  return this.fetch("/api/knowledge/stats");
};

TokagentClient.prototype.listKnowledgeDocuments = async function (
  this: TokagentClient,
  options?,
) {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const query = params.toString();
  return this.fetch(`/api/knowledge/documents${query ? `?${query}` : ""}`);
};

TokagentClient.prototype.getKnowledgeDocument = async function (
  this: TokagentClient,
  documentId,
) {
  return this.fetch(
    `/api/knowledge/documents/${encodeURIComponent(documentId)}`,
  );
};

TokagentClient.prototype.deleteKnowledgeDocument = async function (
  this: TokagentClient,
  documentId,
) {
  return this.fetch(
    `/api/knowledge/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
  );
};

TokagentClient.prototype.uploadKnowledgeDocument = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/knowledge/documents", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.uploadKnowledgeDocumentsBulk = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/knowledge/documents/bulk", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.uploadKnowledgeFromUrl = async function (
  this: TokagentClient,
  url,
  metadata?,
) {
  return this.fetch("/api/knowledge/documents/url", {
    method: "POST",
    body: JSON.stringify({ url, metadata }),
  });
};

TokagentClient.prototype.searchKnowledge = async function (
  this: TokagentClient,
  query,
  options?,
) {
  const params = new URLSearchParams({ q: query });
  if (options?.threshold !== undefined)
    params.set("threshold", String(options.threshold));
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  return this.fetch(`/api/knowledge/search?${params}`);
};

TokagentClient.prototype.getKnowledgeFragments = async function (
  this: TokagentClient,
  documentId,
) {
  return this.fetch(
    `/api/knowledge/fragments/${encodeURIComponent(documentId)}`,
  );
};

TokagentClient.prototype.rememberMemory = async function (
  this: TokagentClient,
  text,
) {
  return this.fetch("/api/memory/remember", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
};

TokagentClient.prototype.searchMemory = async function (
  this: TokagentClient,
  query,
  options?,
) {
  const params = new URLSearchParams({ q: query });
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  return this.fetch(`/api/memory/search?${params}`);
};

TokagentClient.prototype.quickContext = async function (
  this: TokagentClient,
  query,
  options?,
) {
  const params = new URLSearchParams({ q: query });
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  return this.fetch(`/api/context/quick?${params}`);
};

TokagentClient.prototype.getMemoryFeed = async function (
  this: TokagentClient,
  query?,
) {
  const params = new URLSearchParams();
  if (query?.type) params.set("type", query.type);
  if (typeof query?.limit === "number")
    params.set("limit", String(query.limit));
  if (typeof query?.before === "number")
    params.set("before", String(query.before));
  const qs = params.toString();
  return this.fetch(`/api/memories/feed${qs ? `?${qs}` : ""}`);
};

TokagentClient.prototype.browseMemories = async function (
  this: TokagentClient,
  query?,
) {
  const params = new URLSearchParams();
  if (query?.type) params.set("type", query.type);
  if (query?.entityId) params.set("entityId", query.entityId);
  if (query?.roomId) params.set("roomId", query.roomId);
  if (query?.q) params.set("q", query.q);
  if (typeof query?.limit === "number")
    params.set("limit", String(query.limit));
  if (typeof query?.offset === "number")
    params.set("offset", String(query.offset));
  const qs = params.toString();
  return this.fetch(`/api/memories/browse${qs ? `?${qs}` : ""}`);
};

TokagentClient.prototype.getMemoriesByEntity = async function (
  this: TokagentClient,
  entityId,
  query?,
) {
  const params = new URLSearchParams();
  if (query?.type) params.set("type", query.type);
  if (typeof query?.limit === "number")
    params.set("limit", String(query.limit));
  if (typeof query?.offset === "number")
    params.set("offset", String(query.offset));
  if (query?.entityIds && query.entityIds.length > 0)
    params.set("entityIds", query.entityIds.join(","));
  const qs = params.toString();
  return this.fetch(
    `/api/memories/by-entity/${encodeURIComponent(entityId)}${qs ? `?${qs}` : ""}`,
  );
};

TokagentClient.prototype.getMemoryStats = async function (this: TokagentClient) {
  return this.fetch("/api/memories/stats");
};

TokagentClient.prototype.getMcpConfig = async function (this: TokagentClient) {
  return this.fetch("/api/mcp/config");
};

TokagentClient.prototype.getMcpStatus = async function (this: TokagentClient) {
  return this.fetch("/api/mcp/status");
};

TokagentClient.prototype.searchMcpMarketplace = async function (
  this: TokagentClient,
  query,
  limit,
) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return this.fetch(`/api/mcp/marketplace/search?${params}`);
};

TokagentClient.prototype.getMcpServerDetails = async function (
  this: TokagentClient,
  name,
) {
  return this.fetch(`/api/mcp/marketplace/${encodeURIComponent(name)}`);
};

TokagentClient.prototype.addMcpServer = async function (
  this: TokagentClient,
  name,
  config,
) {
  await this.fetch("/api/mcp/servers", {
    method: "POST",
    body: JSON.stringify({ name, config }),
  });
};

TokagentClient.prototype.removeMcpServer = async function (
  this: TokagentClient,
  name,
) {
  await this.fetch(`/api/mcp/servers/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
};

TokagentClient.prototype.ingestShare = async function (
  this: TokagentClient,
  payload,
) {
  return this.fetch("/api/ingest/share", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

TokagentClient.prototype.consumeShareIngest = async function (this: TokagentClient) {
  return this.fetch("/api/share/consume", { method: "POST" });
};

TokagentClient.prototype.getWorkbenchOverview = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/workbench/overview");
};

TokagentClient.prototype.listWorkbenchTasks = async function (this: TokagentClient) {
  return this.fetch("/api/workbench/tasks");
};

TokagentClient.prototype.getWorkbenchTask = async function (
  this: TokagentClient,
  taskId,
) {
  return this.fetch(`/api/workbench/tasks/${encodeURIComponent(taskId)}`);
};

TokagentClient.prototype.createWorkbenchTask = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/workbench/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.updateWorkbenchTask = async function (
  this: TokagentClient,
  taskId,
  data,
) {
  return this.fetch(`/api/workbench/tasks/${encodeURIComponent(taskId)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.deleteWorkbenchTask = async function (
  this: TokagentClient,
  taskId,
) {
  return this.fetch(`/api/workbench/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
};

TokagentClient.prototype.listWorkbenchTodos = async function (this: TokagentClient) {
  return this.fetch("/api/workbench/todos");
};

TokagentClient.prototype.getWorkbenchTodo = async function (
  this: TokagentClient,
  todoId,
) {
  return this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}`);
};

TokagentClient.prototype.createWorkbenchTodo = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/workbench/todos", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.updateWorkbenchTodo = async function (
  this: TokagentClient,
  todoId,
  data,
) {
  return this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.setWorkbenchTodoCompleted = async function (
  this: TokagentClient,
  todoId,
  isCompleted,
) {
  await this.fetch(
    `/api/workbench/todos/${encodeURIComponent(todoId)}/complete`,
    {
      method: "POST",
      body: JSON.stringify({ isCompleted }),
    },
  );
};

TokagentClient.prototype.deleteWorkbenchTodo = async function (
  this: TokagentClient,
  todoId,
) {
  return this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}`, {
    method: "DELETE",
  });
};

TokagentClient.prototype.refreshRegistry = async function (this: TokagentClient) {
  await this.fetch("/api/apps/refresh", { method: "POST" });
};

TokagentClient.prototype.getTrajectories = async function (
  this: TokagentClient,
  options?,
) {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  if (options?.source) params.set("source", options.source);
  if (options?.scenarioId) params.set("scenarioId", options.scenarioId);
  if (options?.batchId) params.set("batchId", options.batchId);
  if (options?.status) params.set("status", options.status);
  if (options?.startDate) params.set("startDate", options.startDate);
  if (options?.endDate) params.set("endDate", options.endDate);
  if (options?.search) params.set("search", options.search);
  const query = params.toString();
  return this.fetch(`/api/trajectories${query ? `?${query}` : ""}`);
};

TokagentClient.prototype.getTrajectoryDetail = async function (
  this: TokagentClient,
  trajectoryId,
) {
  return this.fetch(`/api/trajectories/${encodeURIComponent(trajectoryId)}`);
};

TokagentClient.prototype.getTrajectoryStats = async function (this: TokagentClient) {
  return this.fetch("/api/trajectories/stats");
};

TokagentClient.prototype.getTrajectoryConfig = async function (this: TokagentClient) {
  return this.fetch("/api/trajectories/config");
};

TokagentClient.prototype.updateTrajectoryConfig = async function (
  this: TokagentClient,
  config,
) {
  return this.fetch("/api/trajectories/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
};

TokagentClient.prototype.exportTrajectories = async function (
  this: TokagentClient,
  options,
) {
  const res = await this.rawRequest("/api/trajectories/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });
  return res.blob();
};

TokagentClient.prototype.deleteTrajectories = async function (
  this: TokagentClient,
  trajectoryIds,
) {
  return this.fetch("/api/trajectories", {
    method: "DELETE",
    body: JSON.stringify({ trajectoryIds }),
  });
};

TokagentClient.prototype.clearAllTrajectories = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/trajectories", {
    method: "DELETE",
    body: JSON.stringify({ clearAll: true }),
  });
};

TokagentClient.prototype.getDatabaseStatus = async function (this: TokagentClient) {
  return this.fetch("/api/database/status");
};

TokagentClient.prototype.getDatabaseConfig = async function (this: TokagentClient) {
  return this.fetch("/api/database/config");
};

TokagentClient.prototype.saveDatabaseConfig = async function (
  this: TokagentClient,
  config,
) {
  return this.fetch("/api/database/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
};

TokagentClient.prototype.testDatabaseConnection = async function (
  this: TokagentClient,
  creds,
) {
  return this.fetch("/api/database/test", {
    method: "POST",
    body: JSON.stringify(creds),
  });
};

TokagentClient.prototype.getDatabaseTables = async function (this: TokagentClient) {
  return this.fetch("/api/database/tables");
};

TokagentClient.prototype.getDatabaseRows = async function (
  this: TokagentClient,
  table,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.sort) params.set("sort", opts.sort);
  if (opts?.order) params.set("order", opts.order);
  if (opts?.search) params.set("search", opts.search);
  const qs = params.toString();
  return this.fetch(
    `/api/database/tables/${encodeURIComponent(table)}/rows${qs ? `?${qs}` : ""}`,
  );
};

TokagentClient.prototype.insertDatabaseRow = async function (
  this: TokagentClient,
  table,
  data,
) {
  return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows`, {
    method: "POST",
    body: JSON.stringify({ data }),
  });
};

TokagentClient.prototype.updateDatabaseRow = async function (
  this: TokagentClient,
  table,
  where,
  data,
) {
  return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows`, {
    method: "PUT",
    body: JSON.stringify({ where, data }),
  });
};

TokagentClient.prototype.deleteDatabaseRow = async function (
  this: TokagentClient,
  table,
  where,
) {
  return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows`, {
    method: "DELETE",
    body: JSON.stringify({ where }),
  });
};

TokagentClient.prototype.executeDatabaseQuery = async function (
  this: TokagentClient,
  sql,
  readOnly = true,
) {
  return this.fetch("/api/database/query", {
    method: "POST",
    body: JSON.stringify({ sql, readOnly }),
  });
};
