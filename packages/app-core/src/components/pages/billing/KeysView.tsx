/**
 * KeysView — API key management (mint / list / revoke).
 *
 * Endpoints:
 *   GET    /v1/keys       — list keys
 *   POST   /v1/keys       — mint new key
 *   DELETE /v1/keys/:id   — revoke key
 *
 * The plaintext key is displayed ONCE in an inline reveal panel
 * with a "Copy" button. Subsequent list refreshes will NOT show it.
 */

import { Button, Input, PagePanel } from "@tokagentos/ui";
import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKeyRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface MintResult {
  id: string;
  key: string;
  name: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text).catch(() => {
    // Fallback: create a temporary textarea
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  });
}

// ---------------------------------------------------------------------------
// NewKeyReveal — shows plaintext key once
// ---------------------------------------------------------------------------

function NewKeyReveal({
  result,
  onDismiss,
}: {
  result: MintResult;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copyToClipboard(result.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <PagePanel
      variant="section"
      className="border-ok/30 bg-ok/5 p-5 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ok">
            Key &ldquo;{result.name}&rdquo; created
          </div>
          <div className="mt-1 text-xs-tight text-muted">
            This is the only time this key will be shown. Store it now.
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-muted hover:text-txt transition-colors"
          aria-label="Dismiss key reveal"
        >
          ✕
        </button>
      </div>

      <PagePanel
        variant="inset"
        className="flex items-center gap-3 px-3 py-2 font-mono text-sm text-txt break-all"
      >
        <span className="flex-1 min-w-0 break-all">{result.key}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="shrink-0 h-7 rounded-full px-2.5 text-2xs font-semibold"
        >
          {copied ? "Copied!" : "Copy"}
        </Button>
      </PagePanel>
    </PagePanel>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KeysView(): React.ReactElement {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mint
  const [mintName, setMintName] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<MintResult | null>(null);

  // Revoke
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch list
  // ---------------------------------------------------------------------------

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/v1/keys", { credentials: "include" });
      if (res.status === 401) {
        setError("Sign in to manage API keys.");
        setKeys([]);
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(json.error ?? `Unexpected error (${res.status}).`);
        return;
      }
      const json = (await res.json()) as { keys: ApiKeyRow[] };
      setKeys(json.keys.filter((k) => !k.revokedAt));
      setError(null);
    } catch {
      setError("Network error — could not load keys.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  // ---------------------------------------------------------------------------
  // Mint
  // ---------------------------------------------------------------------------

  const handleMint = async () => {
    if (!mintName.trim()) return;
    setMinting(true);
    setMintError(null);
    try {
      const res = await fetch("/v1/keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: mintName.trim() }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setMintError(json.error ?? `Unexpected error (${res.status}).`);
        return;
      }
      const json = (await res.json()) as MintResult;
      setNewKey(json);
      setMintName("");
      void fetchKeys();
    } catch {
      setMintError("Network error — could not mint key.");
    } finally {
      setMinting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Revoke
  // ---------------------------------------------------------------------------

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    setRevokeError(null);
    try {
      const res = await fetch(`/v1/keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setRevokeError(json.error ?? `Unexpected error (${res.status}).`);
        return;
      }
      setConfirmRevoke(null);
      void fetchKeys();
    } catch {
      setRevokeError("Network error — could not revoke key.");
    } finally {
      setRevoking(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 px-3 py-4 xl:px-5 xl:py-6">
      {/* Header */}
      <div>
        <div className="text-xs-tight font-semibold uppercase tracking-[0.16em] text-muted/70">
          Billing
        </div>
        <div className="mt-1 text-xl font-semibold text-txt">API Keys</div>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Mint <code className="font-mono text-xs">sk-ai-*</code> keys for
          programmatic access to the LLM gateway.
        </p>
      </div>

      {/* New key reveal */}
      {newKey ? (
        <NewKeyReveal result={newKey} onDismiss={() => setNewKey(null)} />
      ) : null}

      {/* Mint form */}
      <PagePanel variant="section" className="p-5 space-y-3">
        <div className="text-sm font-semibold text-txt">Mint a new key</div>
        <div className="flex gap-2">
          <Input
            value={mintName}
            onChange={(e) => setMintName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleMint();
            }}
            placeholder="Key name (e.g. my-app)"
            maxLength={64}
            className="flex-1 h-9 rounded-xl px-3 text-sm"
            disabled={minting}
          />
          <Button
            variant="default"
            size="sm"
            onClick={() => void handleMint()}
            disabled={minting || !mintName.trim()}
            className="h-9 rounded-xl px-4 text-sm font-semibold"
          >
            {minting ? "Minting…" : "Mint Key"}
          </Button>
        </div>
        {mintError ? (
          <div className="text-xs text-danger">{mintError}</div>
        ) : null}
      </PagePanel>

      {/* Error banner */}
      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {/* Keys list */}
      <PagePanel variant="section" className="p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="text-sm font-semibold text-txt">Active Keys</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchKeys()}
            disabled={loading}
            className="h-7 rounded-full px-2.5 text-2xs font-semibold"
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>

        {loading && keys.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-10 rounded-xl bg-border/30 animate-pulse"
              />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="text-sm text-muted py-4 text-center">
            No active keys — mint one above.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-txt truncate">
                    {key.name}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    Created {fmtDate(key.createdAt)} · Last used{" "}
                    {fmtDate(key.lastUsedAt)}
                  </div>
                </div>

                {confirmRevoke === key.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-warning">Revoke?</span>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => void handleRevoke(key.id)}
                      disabled={revoking === key.id}
                      className="h-7 rounded-full px-2.5 text-2xs font-semibold bg-danger hover:bg-danger/80 border-danger"
                    >
                      {revoking === key.id ? "Revoking…" : "Yes, revoke"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmRevoke(null)}
                      className="h-7 rounded-full px-2.5 text-2xs font-semibold"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmRevoke(key.id)}
                    className="shrink-0 h-7 rounded-full px-2.5 text-2xs font-semibold text-danger border-danger/30 hover:bg-danger/10"
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {revokeError ? (
          <div className="mt-3 text-xs text-danger">{revokeError}</div>
        ) : null}
      </PagePanel>
    </div>
  );
}
