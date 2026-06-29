/**
 * Operator chat page — two-pane layout (thread rail + message stream + composer).
 *
 * Real data only, streaming like the global chat. Lists real dashboard
 * conversations + their messages via the self-contained operator gateway
 * (`fetchConversations` / `fetchMessages`), creates threads via
 * `createConversation`, and SENDS through `streamMessage` — a same-origin SSE
 * POST to the agent server that renders the assistant reply token-by-token
 * (mirrors app-core's `streamChatEndpoint` + `normalizeAssistantText`). Auth is
 * same-origin/session, identical to the production ChatView.
 *
 * No mock fallback: when not signed in / unauthenticated, the page shows an
 * honest "sign in to chat" empty state instead of a fake demo stream. The
 * composer footer's model chip uses the live gateway-wide active model
 * (`getActiveModel`), and the x402 chip uses the operator's live ClaudeVault
 * balance (`fetchCredits`), showing "—" when unavailable. The action card maps
 * to the real `actionName` + `actionCallbackHistory` lines when present.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyMark } from "../brand/KeyMark";
import {
  fetchCredits,
  formatAttoPtonString,
  getActiveModel,
  useLive,
} from "../client-billing";
import {
  createConversation,
  fetchConversations,
  fetchMessages,
  type GwConversation,
  type GwMessage,
  streamMessage,
} from "../client-gateway";

/** Neutral model-chip label when the gateway reports no active model. */
const NEUTRAL_MODEL = "default model";

/** Rendered message = gateway message + client-only flags. */
type ChatMessage = GwMessage & { interrupted?: boolean; streaming?: boolean };

/** Live thread-rail row. */
type ThreadRow = { id: string; name: string; time: string };

/** Format an ISO timestamp as a short relative string ("2m ago", "yesterday"). */
function shortRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 0) return "just now";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function conversationToRow(c: GwConversation): ThreadRow {
  return {
    id: c.id,
    name: c.title ?? "Conversation",
    time: shortRelative(
      typeof c.updatedAt === "number"
        ? new Date(c.updatedAt).toISOString()
        : c.updatedAt,
    ),
  };
}

export function ChatPage() {
  // ── Thread rail (live conversations only) ──────────────────────────────────
  const threadsFetcher = useCallback(
    () =>
      fetchConversations().then((r) => r.conversations.map(conversationToRow)),
    [],
  );
  const {
    data: liveThreads,
    live: threadsLive,
    reload,
  } = useLive(threadsFetcher);
  const shownThreads: ThreadRow[] = liveThreads ?? [];

  // Selected thread id drives the `active` highlight + the message fetch.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveSelectedId =
    selectedId && shownThreads.some((t) => t.id === selectedId)
      ? selectedId
      : (shownThreads[0]?.id ?? null);

  // ── Message stream for the selected thread ─────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  useEffect(() => {
    if (!threadsLive || !effectiveSelectedId) {
      setMessages(null);
      return;
    }
    let cancelled = false;
    fetchMessages(effectiveSelectedId)
      .then((r) => {
        if (!cancelled) setMessages(r.messages);
      })
      .catch(() => {
        if (!cancelled) setMessages(null);
      });
    return () => {
      cancelled = true;
    };
  }, [threadsLive, effectiveSelectedId]);

  const messagesLive = threadsLive && messages !== null;

  // ── Composer send (streaming, optimistic) ──────────────────────────────────
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const onSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming || !messagesLive || !effectiveSelectedId) return;
    setStreaming(true);
    setDraft("");
    const userId = `local-user-${Date.now()}`;
    const replyId = `local-reply-${Date.now()}`;
    // Append the user bubble + an empty (streaming) assistant placeholder.
    setMessages((prev) => [
      ...(prev ?? []),
      { id: userId, role: "user", text },
      { id: replyId, role: "assistant", text: "", streaming: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reply = await streamMessage(
        effectiveSelectedId,
        text,
        // Live token render — push the running fullText into the placeholder.
        (fullText) => {
          setMessages((prev) =>
            (prev ?? []).map((m) =>
              m.id === replyId ? { ...m, text: fullText } : m,
            ),
          );
        },
        controller.signal,
      );
      // Settle the placeholder with the final NORMALIZED text.
      setMessages((prev) =>
        (prev ?? []).map((m) =>
          m.id === replyId
            ? {
                ...m,
                text: reply.text,
                streaming: false,
                interrupted: !reply.text,
              }
            : m,
        ),
      );
      reload();
    } catch {
      // Keep the optimistic bubbles; mark the (still-empty) reply interrupted.
      setMessages((prev) =>
        (prev ?? []).map((m) =>
          m.id === replyId
            ? {
                ...m,
                text: m.text || "(no response)",
                streaming: false,
                interrupted: !m.text,
              }
            : m,
        ),
      );
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }, [draft, streaming, messagesLive, effectiveSelectedId, reload]);

  const onNewConversation = useCallback(async () => {
    try {
      const { conversation } = await createConversation();
      setSelectedId(conversation.id);
      reload();
    } catch {
      /* unauthenticated / gateway unavailable — nothing to do */
    }
  }, [reload]);

  // ── Composer footer chips (live active model + x402 PTON balance) ──────────
  const modelFetcher = useCallback(() => getActiveModel(), []);
  const { data: activeModel } = useLive(modelFetcher);
  const modelLabel = activeModel?.active || NEUTRAL_MODEL;

  const creditsFetcher = useCallback(() => fetchCredits(), []);
  const { data: credits } = useLive(creditsFetcher);
  const ptonLabel = credits
    ? `${formatAttoPtonString(credits.balance)} PTON`
    : "—";

  // ── Action card: surface the real action name + callback lines ─────────────
  const actionMessage = useMemo(
    () =>
      messagesLive
        ? (messages ?? []).find(
            (m) =>
              m.actionName ||
              (m.actionCallbackHistory && m.actionCallbackHistory.length > 0),
          )
        : undefined,
    [messagesLive, messages],
  );
  void actionMessage; // action lines render inline per-message below.

  const hasConversation = threadsLive && effectiveSelectedId !== null;

  return (
    <div className="page" style={{ overflow: "hidden" }}>
      <div className="chat-layout">
        <div className="chat-rail">
          <button
            className="chat-new"
            type="button"
            onClick={onNewConversation}
            disabled={!threadsLive}
          >
            ＋ New conversation
          </button>
          {shownThreads.map((t) => {
            const isActive = t.id === effectiveSelectedId;
            return (
              <div
                key={t.id}
                className={`chat-thread ${isActive ? "is-active" : ""}`}
                onClick={() => setSelectedId(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(t.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="chat-thread-name">{t.name}</div>
                <div className="chat-thread-time">{t.time}</div>
              </div>
            );
          })}
        </div>

        <div className="chat-main">
          <div className="chat-stream">
            <div className="chat-stream-inner">
              {!threadsLive ? (
                // Not signed in / unauthenticated — honest empty state.
                <div
                  className="msg-block"
                  style={{
                    textAlign: "center",
                    color: "var(--muted)",
                    padding: "48px 0",
                  }}
                >
                  <div className="msg-text">
                    Sign in to the gateway to chat.
                  </div>
                </div>
              ) : shownThreads.length === 0 ? (
                // Authenticated but no conversations yet.
                <div
                  className="msg-block"
                  style={{
                    textAlign: "center",
                    color: "var(--muted)",
                    padding: "48px 0",
                  }}
                >
                  <div className="msg-text">
                    No conversations yet — start one with{" "}
                    <strong style={{ color: "var(--text-strong)" }}>
                      ＋ New conversation
                    </strong>
                    .
                  </div>
                </div>
              ) : !messagesLive ? (
                // Selected conversation, messages still loading.
                <div
                  className="msg-block"
                  style={{
                    textAlign: "center",
                    color: "var(--muted)",
                    padding: "48px 0",
                  }}
                >
                  <div className="msg-text">Loading…</div>
                </div>
              ) : (messages ?? []).length === 0 ? (
                <div className="msg-block">
                  <div className="msg-role agent">
                    <span className="av">
                      <KeyMark size={14} />
                    </span>{" "}
                    treasurer · vault mode
                  </div>
                  <div className="msg-text" style={{ color: "var(--muted)" }}>
                    Send the first message to start this conversation.
                  </div>
                </div>
              ) : (
                (messages ?? []).map((m) => {
                  const isUser = m.role === "user";
                  const hasAction =
                    m.actionName ||
                    (m.actionCallbackHistory &&
                      m.actionCallbackHistory.length > 0);
                  const body = m.text
                    ? m.text
                    : m.streaming
                      ? "…"
                      : m.interrupted
                        ? "(no response)"
                        : "…";
                  return (
                    <div
                      className={`msg-block ${isUser ? "user" : ""}`}
                      key={m.id}
                    >
                      <div className={`msg-role ${isUser ? "" : "agent"}`}>
                        <span className="av">
                          {isUser ? "🧑" : <KeyMark size={14} />}
                        </span>{" "}
                        {isUser ? (
                          "you"
                        ) : (
                          <>
                            treasurer · vault mode{" "}
                            <span
                              style={{
                                color: "var(--gold-hi)",
                                textTransform: "none",
                              }}
                            >
                              ({modelLabel})
                            </span>
                          </>
                        )}
                      </div>
                      <div className={`msg-text ${isUser ? "user" : ""}`}>
                        {body}
                      </div>

                      {!isUser && hasAction && (
                        <div className="action-card">
                          <div className="action-head">
                            <div className="action-glyph">🛡️</div>
                            <div style={{ flex: 1 }}>
                              <div className="action-name">
                                {m.actionName ?? "action"}
                              </div>
                              <div className="action-sub">plugin action</div>
                            </div>
                            <span className="chip ok">read</span>
                          </div>
                          {m.actionCallbackHistory &&
                            m.actionCallbackHistory.length > 0 && (
                              <div className="action-body">
                                {m.actionCallbackHistory.map((line, i) => (
                                  <div
                                    key={`${m.id}-cb-${i}`}
                                    className="action-kv"
                                  >
                                    <div className="k">step</div>
                                    <div className="v">{line}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="composer">
            <div className="composer-box">
              <input
                placeholder="Message treasurer…  (⌘↵ to send)"
                value={draft}
                disabled={streaming || !hasConversation}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
              />
              <button
                className="composer-send"
                type="button"
                disabled={streaming || !messagesLive || !hasConversation}
                onClick={() => void onSend()}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
            <div className="composer-hint">
              <span>vault mode · actions need approval</span>
              <span>{modelLabel}</span>
              <span>x402 · {ptonLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* live / status indicator (operator chip pattern) */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 16,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        {threadsLive ? (
          <span className="chip ok">live · chat</span>
        ) : (
          <span className="chip mute">signed out</span>
        )}
      </div>
    </div>
  );
}
