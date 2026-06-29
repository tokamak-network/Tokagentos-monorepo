/**
 * Operator Settings page — runtime config (.env mirror) + channel/behavior toggles.
 * Ported from handoff_app/prototype/components/Pages.jsx (SettingsPage).
 *
 * Live: the Environment (.env mirror) card is backed by the real agent server —
 * `fetchSecrets()` (GET /api/secrets) supplies every env-backed secret with
 * its set-status and a server-masked value (the same source SecretsView renders),
 * and `fetchConfig()` (GET /api/config) supplies the config-style env rows
 * (execution mode, gateway url, vault address). The three behavior toggles seed
 * their on/off state from matching real config flags and write back via
 * `updateConfig(patch)` (PUT /api/config) with an optimistic flip. Falls
 * back to the mock {@link ENV_ROWS}/{@link SETTING_TOGGLES} when the agent runtime
 * is unavailable or the caller is unauthenticated. id/name/desc copy on the
 * toggles is presentational and stays static.
 */
import { useCallback, useEffect, useState } from "react";
import { useLive } from "../client-billing";
import {
  fetchConfig,
  fetchSecrets,
  type GwQuickConfigChain,
  type GwQuickConfigSaveResponse,
  type GwSecret,
  saveQuickConfig,
  updateConfig,
} from "../client-gateway";
import {
  ENV_ROWS,
  type EnvRow,
  SETTING_TOGGLES,
  type SettingToggle,
} from "../mock";

/** Combined live source for the Environment card: secrets + raw config tree. */
interface SettingsLive {
  secrets: GwSecret[];
  config: Record<string, unknown>;
}

async function fetchSettingsLive(): Promise<SettingsLive> {
  // fetchSecrets is the canonical env-mirror source; fetchConfig backs the
  // config-style env rows + toggle flags. fetchConfig is best-effort: if it
  // throws we still surface the (live) secrets with an empty config tree.
  const { secrets } = await fetchSecrets();
  let config: Record<string, unknown> = {};
  try {
    config = await fetchConfig();
  } catch {
    /* config unavailable — render secrets-only env rows */
  }
  return { secrets, config };
}

/** Map a real secret to the operator `EnvRow` display shape (mirror of apiKeyRowToEntry). */
function secretToEnvRow(s: GwSecret): EnvRow {
  return { k: s.key, v: s.maskedValue ?? "not set", ok: s.isSet };
}

/** Safely read a string-ish config value by trying a few candidate keys. */
function readConfigString(
  config: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const v = config[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

/** Safely read a boolean config flag by trying a few candidate keys. */
function readConfigBool(
  config: Record<string, unknown>,
  keys: string[],
): boolean | null {
  for (const key of keys) {
    const v = config[key];
    if (typeof v === "boolean") return v;
  }
  return null;
}

/**
 * Build the config-derived env rows (execution mode, gateway url, vault address)
 * from the live config tree. Rows whose value is absent from the real config are
 * omitted entirely — no fabricated rows.
 */
function configEnvRows(config: Record<string, unknown>): EnvRow[] {
  const rows: EnvRow[] = [];
  const mode = readConfigString(config, ["executionMode", "execution_mode"]);
  if (mode) rows.push({ k: "TOKAGENT_EXECUTION_MODE", v: mode, ok: true });
  const gateway = readConfigString(config, [
    "gatewayUrl",
    "gateway_url",
    "billingGatewayUrl",
  ]);
  if (gateway) rows.push({ k: "TOKAGENT_GATEWAY_URL", v: gateway, ok: true });
  const vault = readConfigString(config, ["vaultAddress", "vault_address"]);
  if (vault) rows.push({ k: "TOKAGENT_VAULT_ADDRESS", v: vault, ok: true });
  return rows;
}

/**
 * Candidate config keys backing each behavior toggle. The toggle copy (a/b/c) is
 * presentational; only the on-state + write are wired. When none of a toggle's
 * candidate keys is present in the live config, the toggle stays local-only
 * (same behavior as the mock) and writes are no-ops.
 */
const TOGGLE_CONFIG_KEYS: Record<SettingToggle["id"], string[]> = {
  a: ["requireApproval", "require_approval", "approvalRequired"],
  b: ["allowA2aPayments", "allow_a2a_payments", "a2aPayments"],
  c: ["exposeAsService", "expose_as_service", "paidService"],
};

/* ── Quick setup (wallet) — migrated from the standalone SettingsView page ─────
 * Paste the operator private key + one RPC URL per chain → POST to the local
 * agent (saveQuickConfig), which writes config.env and restarts the runtime. */
const QUICK_PK_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const QUICK_CHAINS: { value: GwQuickConfigChain; label: string }[] = [
  { value: "ethereum", label: "Ethereum mainnet" },
  { value: "polygon", label: "Polygon" },
  { value: "base", label: "Base" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "optimism", label: "Optimism" },
  { value: "bsc", label: "BNB Chain" },
];

interface QuickRpcRow {
  rowId: string;
  chain: GwQuickConfigChain;
  url: string;
}

function newQuickRowId(): string {
  return `rpc-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultQuickRows(): QuickRpcRow[] {
  return [{ rowId: newQuickRowId(), chain: "ethereum", url: "" }];
}

function isQuickHttpUrl(value: string): boolean {
  if (value.length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function SettingsPage({
  env = ENV_ROWS,
  settings = SETTING_TOGGLES,
}: {
  env?: EnvRow[];
  settings?: SettingToggle[];
} = {}) {
  const fetcher = useCallback(() => fetchSettingsLive(), []);
  const { data, live: isLive } = useLive(fetcher);

  // Environment card: real secrets + config-derived rows, else the mock fallback.
  // If the live source loads but yields zero rows, keep the example rows so the
  // card is never blank.
  const liveRows: EnvRow[] = data
    ? [...data.secrets.map(secretToEnvRow), ...configEnvRows(data.config)]
    : [];
  const envRows: EnvRow[] = liveRows.length > 0 ? liveRows : env;

  // Toggles keep their static copy; only on-state is seeded from live config.
  const [toggles, setToggles] = useState<Record<SettingToggle["id"], boolean>>(
    () =>
      settings.reduce(
        (acc, s) => {
          acc[s.id] = s.on;
          return acc;
        },
        {} as Record<SettingToggle["id"], boolean>,
      ),
  );

  // Re-seed from real config flags whenever live data identity changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed only when the underlying data changes.
  useEffect(() => {
    if (!data) return;
    setToggles((prev) => {
      const next = { ...prev };
      for (const s of settings) {
        const live = readConfigBool(data.config, TOGGLE_CONFIG_KEYS[s.id]);
        if (live !== null) next[s.id] = live;
      }
      return next;
    });
  }, [data]);

  const onToggle = useCallback(
    (id: SettingToggle["id"]) => {
      // Optimistic flip first so the UI stays responsive.
      let nextVal = false;
      setToggles((t) => {
        nextVal = !t[id];
        return { ...t, [id]: nextVal };
      });
      // Only attempt a write when live AND a real config key backs this toggle.
      if (!isLive || !data) return;
      const key = TOGGLE_CONFIG_KEYS[id].find(
        (k) => typeof data.config[k] === "boolean",
      );
      if (!key) return; // no real backing — keep the local flip
      updateConfig({ [key]: nextVal }).catch(() => {
        // unauthenticated / runtime unavailable — revert the optimistic flip
        setToggles((t) => ({ ...t, [id]: !t[id] }));
      });
    },
    [isLive, data],
  );

  // ── Quick setup (wallet) state — private key + per-chain RPC URLs ──────────
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [rpcRows, setRpcRows] = useState<QuickRpcRow[]>(defaultQuickRows);
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickResult, setQuickResult] =
    useState<GwQuickConfigSaveResponse | null>(null);

  const chainsInUse = new Set(rpcRows.map((r) => r.chain));
  const pkValid = QUICK_PK_PATTERN.test(privateKey);
  const rpcsValid =
    rpcRows.length === 0 || rpcRows.every((r) => isQuickHttpUrl(r.url));
  const canQuickSubmit = pkValid && rpcsValid && !quickBusy;

  const updateRpcRow = useCallback(
    (rowId: string, patch: Partial<QuickRpcRow>) => {
      setRpcRows((prev) =>
        prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
      );
    },
    [],
  );
  const removeRpcRow = useCallback((rowId: string) => {
    setRpcRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }, []);
  const addRpcRow = useCallback(() => {
    setRpcRows((prev) => {
      const used = new Set(prev.map((r) => r.chain));
      const next =
        QUICK_CHAINS.find((o) => !used.has(o.value))?.value ?? "ethereum";
      return [...prev, { rowId: newQuickRowId(), chain: next, url: "" }];
    });
  }, []);
  const onQuickSave = useCallback(async () => {
    if (!canQuickSubmit) return;
    setQuickBusy(true);
    setQuickError(null);
    setQuickResult(null);
    try {
      const result = await saveQuickConfig({
        privateKey,
        rpcs: rpcRows.map((r) => ({ chain: r.chain, url: r.url.trim() })),
      });
      setQuickResult(result);
    } catch (err) {
      setQuickError(
        err instanceof Error ? err.message : "Failed to save settings.",
      );
    } finally {
      setQuickBusy(false);
    }
  }, [canQuickSubmit, privateKey, rpcRows]);

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">configuration</div>
            <h1 className="page-title">Settings</h1>
            <p className="page-sub">
              Runtime config, LLM providers, and messaging channels. Mirrors
              your{" "}
              <span className="mono" style={{ color: "var(--gold-hi)" }}>
                .env
              </span>
              .
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isLive ? (
              <span className="chip ok">live</span>
            ) : (
              <span className="chip mute">⟩ example values</span>
            )}
          </div>
        </div>

        <div className="sec-head" style={{ marginTop: 0 }}>
          <div className="sec-title">
            <span className="num">ENV</span> Environment
          </div>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {envRows.map((e) => (
            <div key={e.k} className="env-row">
              <span className="env-key">{e.k}</span>
              <span className="env-eq">=</span>
              <span className="env-val">{e.v}</span>
              <span
                className="env-status"
                style={{ color: e.ok ? "var(--ok-bright)" : "var(--muted)" }}
              >
                {e.ok ? "✓" : "—"}
              </span>
            </div>
          ))}
        </div>

        <div className="sec-head">
          <div className="sec-title">
            <span className="num">CH</span> Channels &amp; behavior
          </div>
        </div>
        <div className="card">
          {settings.map((s) => (
            <div key={s.id} className="setting-row">
              <div>
                <div className="setting-name">{s.name}</div>
                <div className="setting-desc">{s.desc}</div>
              </div>
              <button
                type="button"
                className={`toggle ${toggles[s.id] ? "on" : ""}`}
                onClick={() => onToggle(s.id)}
              />
            </div>
          ))}
        </div>

        <div className="sec-head">
          <div className="sec-title">
            <span className="num">KEY</span> Quick setup · wallet
          </div>
        </div>
        <div className="card">
          <p className="page-sub" style={{ marginTop: 0 }}>
            Paste the operator private key and one RPC URL per chain, then save.
            Written to{" "}
            <span className="mono" style={{ color: "var(--gold-hi)" }}>
              config.env
            </span>{" "}
            on the local agent; the runtime restarts to apply them. Never sent to
            any remote service.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginBottom: 16,
            }}
          >
            <div className="setting-name">Operator private key</div>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="amount-field" style={{ flex: 1 }}>
                <input
                  type={showKey ? "text" : "password"}
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value.trim())}
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Operator private key"
                  aria-invalid={privateKey.length > 0 && !pkValid}
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            {privateKey.length > 0 && !pkValid && (
              <span style={{ color: "#ff8f8f", fontSize: 12 }}>
                Must be 0x followed by exactly 64 hex characters.
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div className="setting-name">RPC endpoints</div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={addRpcRow}
              disabled={rpcRows.length >= QUICK_CHAINS.length}
            >
              + Add chain
            </button>
          </div>

          {rpcRows.length === 0 ? (
            <p className="page-sub" style={{ marginTop: 0 }}>
              No RPC endpoints — only the private key will be written.
            </p>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {rpcRows.map((row) => {
                const urlInvalid =
                  row.url.length > 0 && !isQuickHttpUrl(row.url);
                return (
                  <div
                    key={row.rowId}
                    style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
                  >
                    <select
                      value={row.chain}
                      onChange={(e) =>
                        updateRpcRow(row.rowId, {
                          chain: e.target.value as GwQuickConfigChain,
                        })
                      }
                      aria-label="Chain"
                      style={{
                        width: 168,
                        flexShrink: 0,
                        background: "var(--bg)",
                        color: "inherit",
                        border: "1px solid rgba(240,185,11,0.25)",
                        borderRadius: 8,
                        padding: "9px 10px",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 13,
                      }}
                    >
                      {QUICK_CHAINS.map((opt) => (
                        <option
                          key={opt.value}
                          value={opt.value}
                          disabled={
                            opt.value !== row.chain &&
                            chainsInUse.has(opt.value)
                          }
                        >
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <div className="amount-field">
                        <input
                          value={row.url}
                          onChange={(e) =>
                            updateRpcRow(row.rowId, { url: e.target.value })
                          }
                          placeholder="https://eth.llamarpc.com"
                          aria-label="RPC URL"
                          aria-invalid={urlInvalid}
                        />
                      </div>
                      {urlInvalid && (
                        <span style={{ color: "#ff8f8f", fontSize: 12 }}>
                          Must be an http(s) URL.
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeRpcRow(row.rowId)}
                      aria-label="Remove RPC row"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 16,
            }}
          >
            <span className="page-sub" style={{ margin: 0 }}>
              Saving writes config.env and restarts the local agent.
            </span>
            <button
              type="button"
              className="btn btn-gold btn-sm"
              onClick={() => void onQuickSave()}
              disabled={!canQuickSubmit}
            >
              {quickBusy ? "Saving…" : "Save & Restart"}
            </button>
          </div>

          {quickError && (
            <p style={{ color: "#ff8f8f", fontSize: 12, marginTop: 8 }}>
              {quickError}
            </p>
          )}
          {quickResult && (
            <p className="page-sub" style={{ marginTop: 8 }}>
              Wrote {quickResult.written.length} key(s):{" "}
              <span className="mono" style={{ color: "var(--gold-hi)" }}>
                {quickResult.written.join(", ")}
              </span>
              .{" "}
              {quickResult.restarting
                ? "Runtime restart triggered."
                : "Runtime restart scheduled."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
