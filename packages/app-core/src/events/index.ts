/**
 * Typed constants for tokagent:* custom events dispatched across the app.
 *
 * Using these constants instead of raw strings prevents typo-driven drift
 * between producers (main.tsx, bridge, components) and consumers (AppContext,
 * EmotePicker, ChatView, etc.).
 */

// ── App lifecycle ────────────────────────────────────────────────────────
export const COMMAND_PALETTE_EVENT = "tokagent:command-palette" as const;
export const EMOTE_PICKER_EVENT = "tokagent:emote-picker" as const;
export const STOP_EMOTE_EVENT = "tokagent:stop-emote" as const;

// ── Agent / bridge ───────────────────────────────────────────────────────
export const AGENT_READY_EVENT = "tokagent:agent-ready" as const;
export const BRIDGE_READY_EVENT = "tokagent:bridge-ready" as const;
export const SHARE_TARGET_EVENT = "tokagent:share-target" as const;
export const TRAY_ACTION_EVENT = "tokagent:tray-action" as const;

// ── App state ────────────────────────────────────────────────────────────
export const APP_RESUME_EVENT = "tokagent:app-resume" as const;
export const APP_PAUSE_EVENT = "tokagent:app-pause" as const;
export const CONNECT_EVENT = "tokagent:connect" as const;

// ── Voice / config ───────────────────────────────────────────────────────
export const VOICE_CONFIG_UPDATED_EVENT = "tokagent:voice-config-updated" as const;
export const CHAT_AVATAR_VOICE_EVENT = "tokagent:chat-avatar-voice" as const;
export const APP_EMOTE_EVENT = "tokagent:app-emote" as const;
/** After `/api/cloud/status` — chat voice reloads config so cloud-backed TTS mode matches the server snapshot. */
export const TOKAGENT_CLOUD_STATUS_UPDATED_EVENT =
  "tokagent:cloud-status-updated" as const;
export interface TokagentCloudStatusUpdatedDetail {
  /** Same as cloud status `connected` (auth or API key on server). */
  connected: boolean;
  /** True only when Tokagent Cloud inference is the active connection. */
  enabled: boolean;
  /** Server reports a persisted Tokagent Cloud API key. */
  hasPersistedApiKey: boolean;
  /** True only when cloud voice/chat routing should actively use the proxy. */
  cloudVoiceProxyAvailable: boolean;
}

// ── Avatar / VRM ─────────────────────────────────────────────────────────
export const VRM_TELEPORT_COMPLETE_EVENT =
  "tokagent:vrm-teleport-complete" as const;
/** IdentityStep dispatches this after queuing a post-teleport voice preview; OnboardingWizard echoes {@link VRM_TELEPORT_COMPLETE_EVENT} when VRM is off. */
export const ONBOARDING_VOICE_PREVIEW_AWAIT_TELEPORT_EVENT =
  "tokagent:onboarding-voice-preview-await-teleport" as const;

// ── Sidebar sync ─────────────────────────────────────────────────────────
export const SELF_STATUS_SYNC_EVENT = "tokagent:self-status-refresh" as const;

export interface AppEmoteEventDetail {
  emoteId: string;
  path: string;
  duration: number;
  loop: boolean;
  showOverlay?: boolean;
}

export interface ChatAvatarVoiceEventDetail {
  mouthOpen: number;
  isSpeaking: boolean;
}

export type TokagentDocumentEventName =
  | typeof COMMAND_PALETTE_EVENT
  | typeof EMOTE_PICKER_EVENT
  | typeof STOP_EMOTE_EVENT
  | typeof AGENT_READY_EVENT
  | typeof BRIDGE_READY_EVENT
  | typeof SHARE_TARGET_EVENT
  | typeof TRAY_ACTION_EVENT
  | typeof APP_RESUME_EVENT
  | typeof APP_PAUSE_EVENT
  | typeof CONNECT_EVENT;

export type TokagentWindowEventName =
  | typeof VOICE_CONFIG_UPDATED_EVENT
  | typeof CHAT_AVATAR_VOICE_EVENT
  | typeof APP_EMOTE_EVENT
  | typeof TOKAGENT_CLOUD_STATUS_UPDATED_EVENT
  | typeof VRM_TELEPORT_COMPLETE_EVENT
  | typeof ONBOARDING_VOICE_PREVIEW_AWAIT_TELEPORT_EVENT
  | typeof SELF_STATUS_SYNC_EVENT;

export type TokagentEventName = TokagentDocumentEventName | TokagentWindowEventName;

// ── Helpers ──────────────────────────────────────────────────────────────

/** Dispatch a typed custom event on `document`. */
export function dispatchAppEvent(
  name: TokagentDocumentEventName,
  detail?: unknown,
): void {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Dispatch a typed custom event on `window`. */
export function dispatchWindowEvent(
  name: TokagentWindowEventName,
  detail?: unknown,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Dispatch a normalized app-wide emote event on `window`. */
export function dispatchAppEmoteEvent(detail: AppEmoteEventDetail): void {
  dispatchWindowEvent(APP_EMOTE_EVENT, detail);
}

export function dispatchTokagentCloudStatusUpdated(
  detail: TokagentCloudStatusUpdatedDetail,
): void {
  dispatchWindowEvent(TOKAGENT_CLOUD_STATUS_UPDATED_EVENT, detail);
}

// ── Generic app aliases (preferred) ──────────────────────────────────────
export type AppDocumentEventName = TokagentDocumentEventName;
export type AppWindowEventName = TokagentWindowEventName;
export type AppEventName = TokagentEventName;
