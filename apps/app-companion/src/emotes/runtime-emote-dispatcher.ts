/**
 * runtime-emote-dispatcher
 *
 * Subscribes to agent runtime WS events and plays the appropriate emote on the
 * companion VRM engine directly — bypassing the HTTP POST /api/emote round-trip
 * that the agent-initiated PLAY_EMOTE action uses.
 *
 * Mapping:
 *
 *   agent_event  actionStatus="executing"           → "thinking" (loop)
 *   agent_event  actionStatus="success"|"completed" → "success"  (one-shot)
 *   agent_event  actionStatus="error"|"failed"      → "alert"    (one-shot)
 *   system-warning                                  → "alert"    (one-shot)
 *
 * `speaking` is NOT handled here — it is driven by useChatAvatarVoiceBridge
 * which calls engine.setSpeaking() directly.
 *
 * `idle` is the natural default when no emote is active.
 *
 * `acknowledge` is NOT handled here: there is no dedicated WS signal for
 * user-message receipt that reliably reaches the client. The acknowledge emote
 * continues to be triggered via the existing emote WS event path:
 *   agent → POST /api/emote {emoteId:"acknowledge"}
 *   → WS "emote" event → dispatchAppEmoteEvent → APP_EMOTE_EVENT → VrmStage
 *
 * WS payload shape for agent_event:
 *   data.type    === "agent_event"
 *   data.payload === raw runtime event data
 *   data.payload.content?.actionStatus — "executing"|"success"|"completed"|"error"|"failed"
 *
 * Spec: docs/superpowers/specs/2026-04-24-companion-vrm-redesign-design.md §6.4
 */
import { client } from "@tokagentos/app-core";
import { useEffect, type RefObject } from "react";
import type { VrmEngine } from "../components/avatar/VrmEngine";
import { EMOTE_BY_ID } from "./catalog";

type RuntimeEmoteId = "thinking" | "alert" | "success";

function playById(engine: VrmEngine, emoteId: RuntimeEmoteId): void {
  const def = EMOTE_BY_ID.get(emoteId);
  if (!def) return;
  // catalog.duration is in milliseconds; VrmEngine.playEmote() takes seconds.
  void engine.playEmote(def.path, def.duration / 1000, def.loop);
}

/**
 * Subscribes to WS runtime events and plays emotes on the provided engine ref.
 *
 * Call this hook inside a component that owns the VrmEngine ref (e.g. VrmStage).
 * The engine may be null on first render; subscriptions fire as soon as it
 * becomes non-null because the effect re-runs when the ref value changes.
 *
 * The hook uses the module-level `client` singleton so no prop drilling is needed.
 */
export function useRuntimeEmoteDispatcher(
  engineRef: RefObject<VrmEngine | null>,
): void {
  useEffect(() => {
    // agent_event handler — maps actionStatus to thinking / success / alert
    const unsubAgentEvent = client.onWsEvent(
      "agent_event",
      (data: Record<string, unknown>) => {
        const engine = engineRef.current;
        if (!engine) return;

        // data.payload is the raw runtime event data emitted by emitEvent()
        const payload = data.payload;
        if (!payload || typeof payload !== "object") return;
        const content = (payload as Record<string, unknown>).content;
        if (!content || typeof content !== "object") return;
        const actionStatus = (content as Record<string, unknown>).actionStatus;
        if (typeof actionStatus !== "string") return;

        if (actionStatus === "executing") {
          playById(engine, "thinking");
        } else if (actionStatus === "success" || actionStatus === "completed") {
          playById(engine, "success");
        } else if (actionStatus === "error" || actionStatus === "failed") {
          playById(engine, "alert");
        }
      },
    );

    // system-warning handler — plays alert emote
    const unsubSysWarn = client.onWsEvent(
      "system-warning",
      (_data: Record<string, unknown>) => {
        const engine = engineRef.current;
        if (!engine) return;
        playById(engine, "alert");
      },
    );

    return () => {
      unsubAgentEvent();
      unsubSysWarn();
    };
    // engineRef is a stable ref object — its identity never changes, but its
    // .current changes. We deliberately omit it from deps to keep a single
    // subscription pair alive for the component lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
