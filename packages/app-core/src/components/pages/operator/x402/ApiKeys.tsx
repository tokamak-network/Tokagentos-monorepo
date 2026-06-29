/**
 * x402 · API keys — HMAC key list for headless agents.
 * Ported from handoff_app/prototype/components/X402Lower.jsx (ApiKeys).
 *
 * Real-data only: lists / mints / revokes real keys via /v1/keys. When the
 * gateway is unavailable or the caller is unauthenticated the list shows an
 * empty/"sign in" state — NO mock. The list endpoint never returns the secret
 * (shown once on mint), so the displayed value is a stable masked label derived
 * from the key id.
 *
 * Mint flow: the user names the key, then on mint the one-time plaintext secret
 * (sk-ai-…) is captured and shown ONCE in a reveal panel with a copy button and
 * a "store it now" warning. The secret is held only in component state (never
 * persisted) and is wiped when the panel is dismissed.
 *
 * Revoke / delete flow: a two-step inline confirm (no window.confirm). An ACTIVE
 * key shows Revoke (soft); once revoked the row shows a "revoked" pill and a
 * Delete button that hard-removes the row (?hard=true). Mirrors the billing
 * dashboard (app.js: Revoke first, then Delete the revoked row).
 *
 * Install banner: on mint, alongside the one-time secret, an "install to .env &
 * restart" action writes BILLING_CHAT_KEY to the LOCAL agent's .env (same-origin,
 * not the remote gateway) and restarts it — so a headless agent picks the key up.
 */
import { useCallback, useState } from "react";
import {
  apiKeyRowToEntry,
  deleteApiKey,
  fetchApiKeys,
  installChatKey,
  mintApiKey,
  restartAgent,
  revokeApiKey,
  useLive,
} from "../client-billing";

/** Display shape for a key row (operator `ApiKeyEntry`, ids attached). */
type KeyRow = {
  id?: string;
  name: string;
  val: string;
  meta: string;
  live: boolean;
};

/** The one-time secret returned by mint — held in state only, never persisted. */
type MintedKey = { id: string; name: string; key: string };

export function ApiKeys() {
  const keysFetcher = useCallback(() => fetchApiKeys(), []);
  const { data, live: isLive, reload } = useLive(keysFetcher);
  const shownKeys: KeyRow[] = data ? data.map(apiKeyRowToEntry) : [];

  const [name, setName] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  // The freshly-minted secret to reveal once. Cleared (wiped) on dismiss.
  const [minted, setMinted] = useState<MintedKey | null>(null);
  const [copied, setCopied] = useState(false);

  // Install-to-.env + restart (only meaningful after a mint).
  const [installPhase, setInstallPhase] = useState<
    "idle" | "installing" | "restarting" | "done" | "error"
  >("idle");
  const [installError, setInstallError] = useState<string | null>(null);

  // Row id awaiting revoke/delete confirmation (inline two-step, no window.confirm).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const onMint = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || minting) return;
    setMinting(true);
    setMintError(null);
    try {
      const res = await mintApiKey(trimmed);
      // Capture the one-time plaintext secret to reveal once. The list endpoint
      // never returns it again, so this is the only chance to show it.
      setMinted({ id: res.id, name: res.name, key: res.key });
      setCopied(false);
      setName("");
      reload();
    } catch {
      // unauthenticated / gateway unavailable — surface a hint.
      setMintError("Mint failed — sign in to the gateway to issue real keys.");
    } finally {
      setMinting(false);
    }
  }, [name, minting, reload]);

  const onCopy = useCallback(async () => {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [minted]);

  // Dismiss wipes the secret + install state — never stored anywhere else.
  const dismissReveal = useCallback(() => {
    setMinted(null);
    setCopied(false);
    setInstallPhase("idle");
    setInstallError(null);
  }, []);

  // Install the minted key into the LOCAL agent's .env, then restart it.
  const onInstall = useCallback(async () => {
    if (!minted) return;
    setInstallError(null);
    setInstallPhase("installing");
    try {
      await installChatKey(minted.key);
      setInstallPhase("restarting");
      await restartAgent();
      setInstallPhase("done");
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : "Install failed.");
      setInstallPhase("error");
    }
  }, [minted]);

  // Active key → soft revoke; already-revoked key → hard delete. Both two-step.
  const onConfirmAction = useCallback(
    async (row: KeyRow) => {
      if (!row.id) return;
      setActingId(row.id);
      try {
        if (row.live) await revokeApiKey(row.id);
        else await deleteApiKey(row.id);
        reload();
      } catch {
        /* ignore — keep current view */
      } finally {
        setActingId(null);
        setConfirmId(null);
      }
    },
    [reload],
  );

  return (
    <>
      <div className="sec-head">
        <div>
          <div className="sec-title">
            <span className="num">KEY</span> API keys
          </div>
          <div className="sec-sub">
            HMAC keys (sk-ai-*) authenticate headless agents to the gateway.
            Stateless — ideal for daemons.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isLive ? (
            <span className="chip ok">live</span>
          ) : (
            <span className="chip mute">no data</span>
          )}
          <div
            className="amount-field"
            style={{ height: 30, padding: "0 4px 0 12px", gap: 6 }}
          >
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (mintError) setMintError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onMint();
              }}
              placeholder="name this key…"
              aria-label="API key name"
              maxLength={48}
              disabled={minting}
              style={{ fontSize: 12, height: 28 }}
            />
            <button
              type="button"
              className="btn btn-gold btn-sm"
              onClick={onMint}
              disabled={minting || name.trim().length === 0}
            >
              {minting ? "Minting…" : "+ Mint key"}
            </button>
          </div>
        </div>
      </div>

      {/* One-time secret reveal — shown ONCE, never persisted. */}
      {minted && (
        <div
          className="card accent"
          style={{ marginBottom: 14, position: "relative" }}
        >
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismissReveal}
            className="btn btn-ghost btn-sm"
            style={{ position: "absolute", top: 12, right: 12 }}
          >
            ✕
          </button>
          <div className="card-label">
            <span style={{ color: "var(--gold)" }}>◆</span> Key minted ·{" "}
            {minted.name}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--gold-hi)",
              marginBottom: 12,
              paddingRight: 36,
            }}
          >
            Copy this secret now — it is shown <strong>once</strong> and never
            displayed again. Store it somewhere safe.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--jet-black)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 12px",
            }}
          >
            <code
              className="mono"
              style={{
                flex: 1,
                fontSize: 12,
                color: "var(--text-strong)",
                wordBreak: "break-all",
                lineHeight: 1.45,
              }}
            >
              {minted.key}
            </code>
            <button
              type="button"
              className={`btn btn-sm ${copied ? "btn-ghost" : "btn-gold"}`}
              onClick={onCopy}
              style={{ flexShrink: 0 }}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>

          {/* Install into the local agent's .env + restart so it uses the key. */}
          <div
            style={{
              marginTop: 14,
              borderTop: "1px solid var(--border-strong)",
              paddingTop: 12,
            }}
          >
            <div
              style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}
            >
              To use this key for headless calls, set it as{" "}
              <code className="mono" style={{ color: "var(--gold-hi)" }}>
                BILLING_CHAT_KEY
              </code>{" "}
              in the agent&rsquo;s{" "}
              <code className="mono" style={{ color: "var(--gold-hi)" }}>
                .env
              </code>{" "}
              and restart it. This writes it to the local agent and restarts for
              you:
            </div>
            {installPhase === "done" ? (
              <span className="chip ok" style={{ display: "inline-flex" }}>
                ✓ Saved to .env · agent restarting
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-gold btn-sm"
                onClick={onInstall}
                disabled={
                  installPhase === "installing" || installPhase === "restarting"
                }
              >
                {installPhase === "installing"
                  ? "Writing .env…"
                  : installPhase === "restarting"
                    ? "Restarting agent…"
                    : "Install to .env & restart agent"}
              </button>
            )}
            {installError && (
              <div
                className="mono"
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "var(--gold-hi)",
                }}
              >
                {installError}
              </div>
            )}
          </div>
        </div>
      )}

      {mintError && (
        <div
          style={{
            marginBottom: 14,
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(243,186,47,0.10)",
            border: "1px solid var(--border-strong)",
            fontSize: 12,
            color: "var(--gold-hi)",
          }}
        >
          {mintError}
        </div>
      )}

      <div className="card keys-card">
        {shownKeys.length === 0 && (
          <div className="key-row" style={{ color: "var(--muted)" }}>
            <span className="mono" style={{ fontSize: 12 }}>
              {isLive
                ? "No API keys yet — mint one above to authenticate headless agents."
                : "Sign in to the gateway to view and mint API keys."}
            </span>
          </div>
        )}
        {shownKeys.map((k) => {
          const pending = k.id != null && confirmId === k.id;
          const isActing = k.id != null && actingId === k.id;
          return (
            <div key={k.id ?? k.val} className="key-row">
              <div className="key-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              </div>
              <div className="key-main">
                <div className="key-name">
                  {k.name}{" "}
                  {k.live ? (
                    <span className="chip ok" style={{ marginLeft: 6 }}>
                      active
                    </span>
                  ) : (
                    <span className="chip mute" style={{ marginLeft: 6 }}>
                      revoked
                    </span>
                  )}
                </div>
                <div className="key-val">{k.val}</div>
              </div>
              <div className="key-meta">{k.meta}</div>
              {pending ? (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-gold btn-sm"
                    onClick={() => onConfirmAction(k)}
                    disabled={isActing}
                  >
                    {isActing
                      ? k.live
                        ? "Revoking…"
                        : "Deleting…"
                      : k.live
                        ? "Confirm revoke"
                        : "Confirm delete"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirmId(null)}
                    disabled={isActing}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => k.id != null && setConfirmId(k.id)}
                  disabled={k.id == null}
                  title={
                    k.id == null
                      ? "Sign in to the gateway to manage real keys"
                      : k.live
                        ? undefined
                        : "Permanently remove this revoked key"
                  }
                  style={{ flexShrink: 0 }}
                >
                  {k.live ? "Revoke" : "Delete"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
