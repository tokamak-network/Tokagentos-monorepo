/**
 * LifeOps API methods on TokagentClient.
 *
 * Uses TypeScript declaration merging to augment the `TokagentClient` class in
 * `@tokagentos/app-core/api/client-base` with LifeOps-specific methods.
 *
 * Side-effect import — include once at startup to register the methods:
 *
 *   import "@tokagentos/app-lifeops/api/client-lifeops";
 *
 * The `@tokagentos/app-lifeops/widgets` entry point imports this transitively.
 */

import type {
  CaptureLifeOpsActivitySignalRequest,
  CompleteLifeOpsBrowserSessionRequest,
  CompleteLifeOpsOccurrenceRequest,
  ConfirmLifeOpsBrowserSessionRequest,
  CreateLifeOpsBrowserCompanionAutoPairRequest,
  CreateLifeOpsBrowserCompanionPairingRequest,
  CreateLifeOpsBrowserSessionRequest,
  CreateLifeOpsCalendarEventRequest,
  CreateLifeOpsDefinitionRequest,
  CreateLifeOpsGmailReplyDraftRequest,
  CreateLifeOpsGoalRequest,
  DisconnectLifeOpsGoogleConnectorRequest,
  DisconnectLifeOpsMessagingConnectorRequest,
  GetLifeOpsIMessageMessagesRequest,
  GetLifeOpsCalendarFeedRequest,
  GetLifeOpsGmailTriageRequest,
  LifeOpsActivitySignal,
  LifeOpsBrowserCompanionPackageStatus,
  LifeOpsBrowserCompanionAutoPairResponse,
  LifeOpsBrowserCompanionPairingResponse,
  LifeOpsBrowserCompanionStatus,
  LifeOpsBrowserKind,
  LifeOpsBrowserPackagePathTarget,
  LifeOpsBrowserPageContext,
  LifeOpsBrowserSession,
  LifeOpsBrowserSettings,
  LifeOpsBrowserTabSummary,
  LifeOpsCalendarFeed,
  LifeOpsConnectorMode,
  LifeOpsConnectorSide,
  LifeOpsDefinitionRecord,
  LifeOpsDiscordConnectorStatus,
  LifeOpsGmailReplyDraft,
  LifeOpsGmailTriageFeed,
  LifeOpsGoalRecord,
  LifeOpsGoalReview,
  LifeOpsGoogleConnectorStatus,
  LifeOpsIMessageChat,
  LifeOpsIMessageConnectorStatus,
  LifeOpsIMessageMessage,
  LifeOpsNextCalendarEventContext,
  LifeOpsOccurrenceActionResult,
  LifeOpsOccurrenceExplanation,
  LifeOpsOverview,
  OpenLifeOpsBrowserCompanionManagerResponse,
  OpenLifeOpsBrowserCompanionPackagePathResponse,
  LifeOpsReminderInspection,
  LifeOpsSignalConnectorStatus,
  LifeOpsSignalPairingStatus,
  LifeOpsTelegramConnectorStatus,
  SelectLifeOpsGoogleConnectorPreferenceRequest,
  SendLifeOpsGmailReplyRequest,
  SendLifeOpsIMessageRequest,
  SnoozeLifeOpsOccurrenceRequest,
  StartLifeOpsDiscordConnectorRequest,
  StartLifeOpsGoogleConnectorRequest,
  StartLifeOpsGoogleConnectorResponse,
  StartLifeOpsSignalPairingRequest,
  StartLifeOpsSignalPairingResponse,
  StartLifeOpsTelegramAuthRequest,
  StartLifeOpsTelegramAuthResponse,
  SubmitLifeOpsTelegramAuthRequest,
  VerifyLifeOpsTelegramConnectorRequest,
  VerifyLifeOpsTelegramConnectorResponse,
  SyncLifeOpsBrowserStateRequest,
  UpdateLifeOpsBrowserSessionProgressRequest,
  UpdateLifeOpsBrowserSettingsRequest,
  UpdateLifeOpsDefinitionRequest,
  UpdateLifeOpsGoalRequest,
} from "@tokagentos/shared/contracts/lifeops";
import { TokagentClient } from "@tokagentos/app-core/api/client-base";

declare module "@tokagentos/app-core/api/client-base" {
  interface TokagentClient {
    getLifeOpsAppState(): Promise<{ enabled: boolean }>;
    updateLifeOpsAppState(data: {
      enabled: boolean;
    }): Promise<{ enabled: boolean }>;
    getLifeOpsOverview(): Promise<LifeOpsOverview>;
    getLifeOpsBrowserSettings(): Promise<{ settings: LifeOpsBrowserSettings }>;
    updateLifeOpsBrowserSettings(
      data: UpdateLifeOpsBrowserSettingsRequest,
    ): Promise<{ settings: LifeOpsBrowserSettings }>;
    listLifeOpsBrowserCompanions(): Promise<{
      companions: LifeOpsBrowserCompanionStatus[];
    }>;
    getLifeOpsBrowserPackageStatus(): Promise<{
      status: LifeOpsBrowserCompanionPackageStatus;
    }>;
    autoPairLifeOpsBrowserCompanion(
      data: CreateLifeOpsBrowserCompanionAutoPairRequest,
    ): Promise<LifeOpsBrowserCompanionAutoPairResponse>;
    createLifeOpsBrowserCompanionPairing(
      data: CreateLifeOpsBrowserCompanionPairingRequest,
    ): Promise<LifeOpsBrowserCompanionPairingResponse>;
    buildLifeOpsBrowserCompanionPackage(browser: LifeOpsBrowserKind): Promise<{
      status: LifeOpsBrowserCompanionPackageStatus;
    }>;
    openLifeOpsBrowserCompanionPackagePath(data: {
      target: LifeOpsBrowserPackagePathTarget;
      revealOnly?: boolean;
    }): Promise<OpenLifeOpsBrowserCompanionPackagePathResponse>;
    openLifeOpsBrowserCompanionManager(
      browser: LifeOpsBrowserKind,
    ): Promise<OpenLifeOpsBrowserCompanionManagerResponse>;
    downloadLifeOpsBrowserCompanionPackage(
      browser: LifeOpsBrowserKind,
    ): Promise<{
      blob: Blob;
      filename: string;
    }>;
    listLifeOpsBrowserTabs(): Promise<{ tabs: LifeOpsBrowserTabSummary[] }>;
    getLifeOpsBrowserCurrentPage(): Promise<{
      page: LifeOpsBrowserPageContext | null;
    }>;
    syncLifeOpsBrowserState(data: SyncLifeOpsBrowserStateRequest): Promise<{
      companion: LifeOpsBrowserCompanionStatus;
      tabs: LifeOpsBrowserTabSummary[];
      currentPage: LifeOpsBrowserPageContext | null;
    }>;
    listLifeOpsBrowserSessions(): Promise<{
      sessions: LifeOpsBrowserSession[];
    }>;
    getLifeOpsBrowserSession(
      sessionId: string,
    ): Promise<{ session: LifeOpsBrowserSession }>;
    createLifeOpsBrowserSession(
      data: CreateLifeOpsBrowserSessionRequest,
    ): Promise<{ session: LifeOpsBrowserSession }>;
    confirmLifeOpsBrowserSession(
      sessionId: string,
      data: ConfirmLifeOpsBrowserSessionRequest,
    ): Promise<{ session: LifeOpsBrowserSession }>;
    updateLifeOpsBrowserSessionProgress(
      sessionId: string,
      data: UpdateLifeOpsBrowserSessionProgressRequest,
    ): Promise<{ session: LifeOpsBrowserSession }>;
    completeLifeOpsBrowserSession(
      sessionId: string,
      data: CompleteLifeOpsBrowserSessionRequest,
    ): Promise<{ session: LifeOpsBrowserSession }>;
    captureLifeOpsActivitySignal(
      data: CaptureLifeOpsActivitySignalRequest,
    ): Promise<{ signal: LifeOpsActivitySignal }>;
    getLifeOpsCalendarFeed(
      options?: GetLifeOpsCalendarFeedRequest,
    ): Promise<LifeOpsCalendarFeed>;
    getLifeOpsGmailTriage(
      options?: GetLifeOpsGmailTriageRequest,
    ): Promise<LifeOpsGmailTriageFeed>;
    getLifeOpsNextCalendarEventContext(
      options?: GetLifeOpsCalendarFeedRequest,
    ): Promise<LifeOpsNextCalendarEventContext>;
    createLifeOpsCalendarEvent(
      data: CreateLifeOpsCalendarEventRequest,
    ): Promise<{ event: LifeOpsCalendarFeed["events"][number] }>;
    createLifeOpsGmailReplyDraft(
      data: CreateLifeOpsGmailReplyDraftRequest,
    ): Promise<{ draft: LifeOpsGmailReplyDraft }>;
    sendLifeOpsGmailReply(
      data: SendLifeOpsGmailReplyRequest,
    ): Promise<{ ok: true }>;
    listLifeOpsDefinitions(): Promise<{
      definitions: LifeOpsDefinitionRecord[];
    }>;
    getLifeOpsDefinition(
      definitionId: string,
    ): Promise<LifeOpsDefinitionRecord>;
    createLifeOpsDefinition(
      data: CreateLifeOpsDefinitionRequest,
    ): Promise<LifeOpsDefinitionRecord>;
    updateLifeOpsDefinition(
      definitionId: string,
      data: UpdateLifeOpsDefinitionRequest,
    ): Promise<LifeOpsDefinitionRecord>;
    listLifeOpsGoals(): Promise<{ goals: LifeOpsGoalRecord[] }>;
    getLifeOpsGoal(goalId: string): Promise<LifeOpsGoalRecord>;
    reviewLifeOpsGoal(goalId: string): Promise<LifeOpsGoalReview>;
    createLifeOpsGoal(
      data: CreateLifeOpsGoalRequest,
    ): Promise<LifeOpsGoalRecord>;
    updateLifeOpsGoal(
      goalId: string,
      data: UpdateLifeOpsGoalRequest,
    ): Promise<LifeOpsGoalRecord>;
    completeLifeOpsOccurrence(
      occurrenceId: string,
      data?: CompleteLifeOpsOccurrenceRequest,
    ): Promise<LifeOpsOccurrenceActionResult>;
    skipLifeOpsOccurrence(
      occurrenceId: string,
    ): Promise<LifeOpsOccurrenceActionResult>;
    snoozeLifeOpsOccurrence(
      occurrenceId: string,
      data: SnoozeLifeOpsOccurrenceRequest,
    ): Promise<LifeOpsOccurrenceActionResult>;
    getLifeOpsOccurrenceExplanation(
      occurrenceId: string,
    ): Promise<LifeOpsOccurrenceExplanation>;
    inspectLifeOpsReminder(
      ownerType: "occurrence" | "calendar_event",
      ownerId: string,
    ): Promise<LifeOpsReminderInspection>;
    getGoogleLifeOpsConnectorStatus(
      mode?: LifeOpsConnectorMode,
      side?: LifeOpsConnectorSide,
    ): Promise<LifeOpsGoogleConnectorStatus>;
    selectGoogleLifeOpsConnectorMode(
      data: SelectLifeOpsGoogleConnectorPreferenceRequest,
    ): Promise<LifeOpsGoogleConnectorStatus>;
    startGoogleLifeOpsConnector(
      data?: StartLifeOpsGoogleConnectorRequest,
    ): Promise<StartLifeOpsGoogleConnectorResponse>;
    disconnectGoogleLifeOpsConnector(
      data?: DisconnectLifeOpsGoogleConnectorRequest,
    ): Promise<LifeOpsGoogleConnectorStatus>;
    getGoogleLifeOpsConnectorAccounts(
      mode?: LifeOpsConnectorMode,
      side?: LifeOpsConnectorSide,
    ): Promise<LifeOpsGoogleConnectorStatus[]>;

    // --- iMessage connector ---
    getIMessageConnectorStatus(): Promise<LifeOpsIMessageConnectorStatus>;
    listLifeOpsIMessageChats(): Promise<{
      chats: LifeOpsIMessageChat[];
      count: number;
    }>;
    getLifeOpsIMessageMessages(
      options?: GetLifeOpsIMessageMessagesRequest,
    ): Promise<{
      messages: LifeOpsIMessageMessage[];
      count: number;
    }>;
    sendLifeOpsIMessage(
      data: SendLifeOpsIMessageRequest,
    ): Promise<{ ok: true; messageId?: string }>;

    // --- Signal connector ---
    getSignalConnectorStatus(
      side?: LifeOpsConnectorSide,
    ): Promise<LifeOpsSignalConnectorStatus>;
    startLifeOpsSignalPairing(
      data?: StartLifeOpsSignalPairingRequest,
    ): Promise<StartLifeOpsSignalPairingResponse>;
    getSignalPairingStatus(
      sessionId: string,
    ): Promise<LifeOpsSignalPairingStatus>;
    stopLifeOpsSignalPairing(sessionId: string): Promise<void>;
    disconnectSignalConnector(
      data?: DisconnectLifeOpsMessagingConnectorRequest,
    ): Promise<LifeOpsSignalConnectorStatus>;

    // --- Discord connector ---
    getDiscordConnectorStatus(
      side?: LifeOpsConnectorSide,
    ): Promise<LifeOpsDiscordConnectorStatus>;
    startDiscordConnector(
      data?: StartLifeOpsDiscordConnectorRequest,
    ): Promise<LifeOpsDiscordConnectorStatus>;
    disconnectDiscordConnector(
      data?: DisconnectLifeOpsMessagingConnectorRequest,
    ): Promise<LifeOpsDiscordConnectorStatus>;

    // --- Telegram connector ---
    getTelegramConnectorStatus(
      side?: LifeOpsConnectorSide,
    ): Promise<LifeOpsTelegramConnectorStatus>;
    startTelegramAuth(
      data: StartLifeOpsTelegramAuthRequest,
    ): Promise<StartLifeOpsTelegramAuthResponse>;
    submitTelegramAuth(
      data: SubmitLifeOpsTelegramAuthRequest,
    ): Promise<StartLifeOpsTelegramAuthResponse>;
    cancelTelegramAuth(
      data?: DisconnectLifeOpsMessagingConnectorRequest,
    ): Promise<void>;
    disconnectTelegramConnector(
      data?: DisconnectLifeOpsMessagingConnectorRequest,
    ): Promise<LifeOpsTelegramConnectorStatus>;
    verifyTelegramConnector(
      data?: VerifyLifeOpsTelegramConnectorRequest,
    ): Promise<VerifyLifeOpsTelegramConnectorResponse>;
  }
}

TokagentClient.prototype.getLifeOpsAppState = async function (this: TokagentClient) {
  return this.fetch("/api/lifeops/app-state");
};

TokagentClient.prototype.updateLifeOpsAppState = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/app-state", {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.getLifeOpsOverview = async function (this: TokagentClient) {
  return this.fetch("/api/lifeops/overview");
};

TokagentClient.prototype.getLifeOpsBrowserSettings = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/lifeops/browser/settings");
};

TokagentClient.prototype.updateLifeOpsBrowserSettings = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/browser/settings", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.listLifeOpsBrowserCompanions = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/lifeops/browser/companions");
};

TokagentClient.prototype.getLifeOpsBrowserPackageStatus = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/lifeops/browser/packages");
};

TokagentClient.prototype.autoPairLifeOpsBrowserCompanion = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/browser/companions/auto-pair", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.createLifeOpsBrowserCompanionPairing = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/browser/companions/pair", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.buildLifeOpsBrowserCompanionPackage = async function (
  this: TokagentClient,
  browser,
) {
  return this.fetch(
    `/api/lifeops/browser/packages/${encodeURIComponent(browser)}/build`,
    {
      method: "POST",
    },
  );
};

TokagentClient.prototype.openLifeOpsBrowserCompanionPackagePath = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/browser/packages/open-path", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.openLifeOpsBrowserCompanionManager = async function (
  this: TokagentClient,
  browser,
) {
  return this.fetch(
    `/api/lifeops/browser/packages/${encodeURIComponent(browser)}/open-manager`,
    {
      method: "POST",
    },
  );
};

TokagentClient.prototype.downloadLifeOpsBrowserCompanionPackage = async function (
  this: TokagentClient,
  browser,
) {
  const response = await this.rawRequest(
    `/api/lifeops/browser/packages/${encodeURIComponent(browser)}/download`,
    {
      method: "GET",
    },
  );
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/i);
  return {
    blob: await response.blob(),
    filename:
      filenameMatch?.[1] ??
      `lifeops-browser-${browser === "safari" ? "safari" : "chrome"}.zip`,
  };
};

TokagentClient.prototype.listLifeOpsBrowserTabs = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/lifeops/browser/tabs");
};

TokagentClient.prototype.getLifeOpsBrowserCurrentPage = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/lifeops/browser/current-page");
};

TokagentClient.prototype.syncLifeOpsBrowserState = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/browser/sync", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.listLifeOpsBrowserSessions = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/lifeops/browser/sessions");
};

TokagentClient.prototype.getLifeOpsBrowserSession = async function (
  this: TokagentClient,
  sessionId,
) {
  return this.fetch(
    `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}`,
  );
};

TokagentClient.prototype.createLifeOpsBrowserSession = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/browser/sessions", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.confirmLifeOpsBrowserSession = async function (
  this: TokagentClient,
  sessionId,
  data,
) {
  return this.fetch(
    `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}/confirm`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
};

TokagentClient.prototype.updateLifeOpsBrowserSessionProgress = async function (
  this: TokagentClient,
  sessionId,
  data,
) {
  return this.fetch(
    `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}/progress`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
};

TokagentClient.prototype.completeLifeOpsBrowserSession = async function (
  this: TokagentClient,
  sessionId,
  data,
) {
  return this.fetch(
    `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}/complete`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
};

TokagentClient.prototype.captureLifeOpsActivitySignal = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/activity-signals", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.getLifeOpsCalendarFeed = async function (
  this: TokagentClient,
  options = {},
) {
  const params = new URLSearchParams();
  if (options.mode) {
    params.set("mode", options.mode);
  }
  if (options.side) {
    params.set("side", options.side);
  }
  if (options.calendarId) {
    params.set("calendarId", options.calendarId);
  }
  if (options.timeMin) {
    params.set("timeMin", options.timeMin);
  }
  if (options.timeMax) {
    params.set("timeMax", options.timeMax);
  }
  if (options.timeZone) {
    params.set("timeZone", options.timeZone);
  }
  if (options.forceSync !== undefined) {
    params.set("forceSync", String(options.forceSync));
  }
  const query = params.toString();
  return this.fetch(`/api/lifeops/calendar/feed${query ? `?${query}` : ""}`);
};

TokagentClient.prototype.getLifeOpsGmailTriage = async function (
  this: TokagentClient,
  options = {},
) {
  const params = new URLSearchParams();
  if (options.mode) {
    params.set("mode", options.mode);
  }
  if (options.side) {
    params.set("side", options.side);
  }
  if (options.forceSync !== undefined) {
    params.set("forceSync", String(options.forceSync));
  }
  if (options.maxResults !== undefined) {
    params.set("maxResults", String(options.maxResults));
  }
  const query = params.toString();
  return this.fetch(`/api/lifeops/gmail/triage${query ? `?${query}` : ""}`);
};

TokagentClient.prototype.getLifeOpsNextCalendarEventContext = async function (
  this: TokagentClient,
  options = {},
) {
  const params = new URLSearchParams();
  if (options.mode) {
    params.set("mode", options.mode);
  }
  if (options.side) {
    params.set("side", options.side);
  }
  if (options.calendarId) {
    params.set("calendarId", options.calendarId);
  }
  if (options.timeMin) {
    params.set("timeMin", options.timeMin);
  }
  if (options.timeMax) {
    params.set("timeMax", options.timeMax);
  }
  if (options.timeZone) {
    params.set("timeZone", options.timeZone);
  }
  const query = params.toString();
  return this.fetch(
    `/api/lifeops/calendar/next-context${query ? `?${query}` : ""}`,
  );
};

TokagentClient.prototype.createLifeOpsCalendarEvent = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/calendar/events", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.createLifeOpsGmailReplyDraft = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/gmail/reply-drafts", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.sendLifeOpsGmailReply = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/gmail/reply-send", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.listLifeOpsDefinitions = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/lifeops/definitions");
};

TokagentClient.prototype.getLifeOpsDefinition = async function (
  this: TokagentClient,
  definitionId,
) {
  return this.fetch(
    `/api/lifeops/definitions/${encodeURIComponent(definitionId)}`,
  );
};

TokagentClient.prototype.createLifeOpsDefinition = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/definitions", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.updateLifeOpsDefinition = async function (
  this: TokagentClient,
  definitionId,
  data,
) {
  return this.fetch(
    `/api/lifeops/definitions/${encodeURIComponent(definitionId)}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
};

TokagentClient.prototype.listLifeOpsGoals = async function (this: TokagentClient) {
  return this.fetch("/api/lifeops/goals");
};

TokagentClient.prototype.getLifeOpsGoal = async function (
  this: TokagentClient,
  goalId,
) {
  return this.fetch(`/api/lifeops/goals/${encodeURIComponent(goalId)}`);
};

TokagentClient.prototype.reviewLifeOpsGoal = async function (
  this: TokagentClient,
  goalId,
) {
  return this.fetch(`/api/lifeops/goals/${encodeURIComponent(goalId)}/review`);
};

TokagentClient.prototype.createLifeOpsGoal = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/goals", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.updateLifeOpsGoal = async function (
  this: TokagentClient,
  goalId,
  data,
) {
  return this.fetch(`/api/lifeops/goals/${encodeURIComponent(goalId)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.completeLifeOpsOccurrence = async function (
  this: TokagentClient,
  occurrenceId,
  data = {},
) {
  return this.fetch(
    `/api/lifeops/occurrences/${encodeURIComponent(occurrenceId)}/complete`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
};

TokagentClient.prototype.skipLifeOpsOccurrence = async function (
  this: TokagentClient,
  occurrenceId,
) {
  return this.fetch(
    `/api/lifeops/occurrences/${encodeURIComponent(occurrenceId)}/skip`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
};

TokagentClient.prototype.snoozeLifeOpsOccurrence = async function (
  this: TokagentClient,
  occurrenceId,
  data,
) {
  return this.fetch(
    `/api/lifeops/occurrences/${encodeURIComponent(occurrenceId)}/snooze`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
};

TokagentClient.prototype.getLifeOpsOccurrenceExplanation = async function (
  this: TokagentClient,
  occurrenceId,
) {
  return this.fetch(
    `/api/lifeops/occurrences/${encodeURIComponent(occurrenceId)}/explanation`,
  );
};

TokagentClient.prototype.inspectLifeOpsReminder = async function (
  this: TokagentClient,
  ownerType,
  ownerId,
) {
  const params = new URLSearchParams({
    ownerType,
    ownerId,
  });
  return this.fetch(`/api/lifeops/reminders/inspection?${params.toString()}`);
};

TokagentClient.prototype.getGoogleLifeOpsConnectorStatus = async function (
  this: TokagentClient,
  mode,
  side,
) {
  const params = new URLSearchParams();
  if (mode) {
    params.set("mode", mode);
  }
  if (side) {
    params.set("side", side);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return this.fetch(`/api/lifeops/connectors/google/status${query}`);
};

TokagentClient.prototype.selectGoogleLifeOpsConnectorMode = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/connectors/google/preference", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.startGoogleLifeOpsConnector = async function (
  this: TokagentClient,
  data = {},
) {
  return this.fetch("/api/lifeops/connectors/google/start", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.disconnectGoogleLifeOpsConnector = async function (
  this: TokagentClient,
  data = {},
) {
  return this.fetch("/api/lifeops/connectors/google/disconnect", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.getGoogleLifeOpsConnectorAccounts = async function (
  this: TokagentClient,
  mode,
  side,
) {
  const params = new URLSearchParams();
  if (mode) {
    params.set("mode", mode);
  }
  if (side) {
    params.set("side", side);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return this.fetch(`/api/lifeops/connectors/google/accounts${query}`);
};

// ---------------------------------------------------------------------------
// iMessage connector
// ---------------------------------------------------------------------------

TokagentClient.prototype.getIMessageConnectorStatus = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/lifeops/connectors/imessage/status");
};

TokagentClient.prototype.listLifeOpsIMessageChats = async function (
  this: TokagentClient,
) {
  return this.fetch("/api/lifeops/connectors/imessage/chats");
};

TokagentClient.prototype.getLifeOpsIMessageMessages = async function (
  this: TokagentClient,
  options = {},
) {
  const params = new URLSearchParams();
  if (options.chatId) {
    params.set("chatId", options.chatId);
  }
  if (options.since) {
    params.set("since", options.since);
  }
  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return this.fetch(`/api/lifeops/connectors/imessage/messages${query}`);
};

TokagentClient.prototype.sendLifeOpsIMessage = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/connectors/imessage/send", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

// ---------------------------------------------------------------------------
// Signal connector
// ---------------------------------------------------------------------------

TokagentClient.prototype.getSignalConnectorStatus = async function (
  this: TokagentClient,
  side,
) {
  const params = new URLSearchParams();
  if (side) {
    params.set("side", side);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return this.fetch(`/api/lifeops/connectors/signal/status${query}`);
};

TokagentClient.prototype.startLifeOpsSignalPairing = async function (
  this: TokagentClient,
  data = {},
): Promise<StartLifeOpsSignalPairingResponse> {
  return this.fetch<StartLifeOpsSignalPairingResponse>(
    "/api/lifeops/connectors/signal/pair",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
};

TokagentClient.prototype.getSignalPairingStatus = async function (
  this: TokagentClient,
  sessionId,
) {
  const params = new URLSearchParams({ sessionId });
  return this.fetch(
    `/api/lifeops/connectors/signal/pairing-status?${params.toString()}`,
  );
};

TokagentClient.prototype.stopLifeOpsSignalPairing = async function (
  this: TokagentClient,
  sessionId,
): Promise<void> {
  return this.fetch<void>("/api/lifeops/connectors/signal/stop", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
};

TokagentClient.prototype.disconnectSignalConnector = async function (
  this: TokagentClient,
  data = { provider: "signal" },
) {
  return this.fetch("/api/lifeops/connectors/signal/disconnect", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

// ---------------------------------------------------------------------------
// Discord connector
// ---------------------------------------------------------------------------

TokagentClient.prototype.getDiscordConnectorStatus = async function (
  this: TokagentClient,
  side,
) {
  const params = new URLSearchParams();
  if (side) {
    params.set("side", side);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return this.fetch(`/api/lifeops/connectors/discord/status${query}`);
};

TokagentClient.prototype.startDiscordConnector = async function (
  this: TokagentClient,
  data = {},
) {
  return this.fetch("/api/lifeops/connectors/discord/connect", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.disconnectDiscordConnector = async function (
  this: TokagentClient,
  data = { provider: "discord" },
) {
  return this.fetch("/api/lifeops/connectors/discord/disconnect", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

// ---------------------------------------------------------------------------
// Telegram connector
// ---------------------------------------------------------------------------

TokagentClient.prototype.getTelegramConnectorStatus = async function (
  this: TokagentClient,
  side,
) {
  const params = new URLSearchParams();
  if (side) {
    params.set("side", side);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return this.fetch(`/api/lifeops/connectors/telegram/status${query}`);
};

TokagentClient.prototype.startTelegramAuth = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/connectors/telegram/start", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.submitTelegramAuth = async function (
  this: TokagentClient,
  data,
) {
  return this.fetch("/api/lifeops/connectors/telegram/submit", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.cancelTelegramAuth = async function (
  this: TokagentClient,
  data = { provider: "telegram" },
) {
  return this.fetch("/api/lifeops/connectors/telegram/cancel", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.disconnectTelegramConnector = async function (
  this: TokagentClient,
  data = { provider: "telegram" },
) {
  return this.fetch("/api/lifeops/connectors/telegram/disconnect", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

TokagentClient.prototype.verifyTelegramConnector = async function (
  this: TokagentClient,
  data = {},
) {
  return this.fetch("/api/lifeops/connectors/telegram/verify", {
    method: "POST",
    body: JSON.stringify(data),
  });
};
