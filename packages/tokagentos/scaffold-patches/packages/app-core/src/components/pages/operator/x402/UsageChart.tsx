/**
 * Operator x402 — usage & spend analytics: spend bar chart + spend-by-model
 * breakdown, a recent-calls table and a per-API-key rollup. Real-data only,
 * driven entirely by the /v1/usage/* seams (summary / calls / keys). When the
 * gateway returns nothing (unauthenticated / unavailable) each section shows an
 * empty/"sign in" state — NO mock. Self-contained: ../client-billing only.
 */
import { useMemo } from "react";
import {
  fetchUsageCalls,
  fetchUsageKeys,
  fetchUsageSummary,
  formatAttoPtonString,
  type UsageCall,
  type UsageKeyRow,
  useLive,
} from "../client-billing";

/** Bar-fill gradients applied to live spend-by-model rows, by position. */
const MODEL_COLORS = [
  "linear-gradient(90deg, #f0b90b, #f3ba2f)",
  "linear-gradient(90deg, #d8a000, #f0b90b)",
  "linear-gradient(90deg, #4dd2a1, #03a66d)",
  "linear-gradient(90deg, #60a5fa, #3b82f6)",
];

/** Grid template for the recent-calls table (head + body share it). */
const CALLS_COLS = "0.7fr 1.3fr 0.9fr auto 0.7fr";
/** Grid template for the by-API-key table. */
const KEYS_COLS = "1.5fr 0.6fr 1fr auto";

/** Compact relative time, e.g. "2m", "3h", "5d" — self-contained (no dayjs). */
function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Group thousands for raw token counts, e.g. 12840 → "12,840". */
function fmtTokens(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US");
}

/** Map a call status to a chip tone — ok / info / mute. */
function statusChip(status: string): "ok" | "info" | "mute" {
  const s = status.toLowerCase();
  if (s === "ok" || s === "success" || s === "200" || s === "settled")
    return "ok";
  if (s === "pending" || s === "reserved" || s === "processing") return "info";
  return "mute";
}

/** Live/empty section indicator — a small chip, never "example values". */
function liveChip(isLive: boolean) {
  return isLive ? (
    <span className="chip ok">live</span>
  ) : (
    <span className="chip mute">no data</span>
  );
}

export function UsageChart() {
  // Live usage & spend (GET /v1/usage/summary). byModel / byDay drive the
  // chart and the spend-by-model breakdown when present.
  const usage = useLive(fetchUsageSummary);
  const u = usage.data;

  // Recent calls (GET /v1/usage/calls) — small page, newest first.
  const callsLive = useLive(useMemo(() => () => fetchUsageCalls(12), []));
  const calls: UsageCall[] = callsLive.data?.calls ?? [];

  // Per-API-key rollup (GET /v1/usage/keys).
  const keysLive = useLive(fetchUsageKeys);
  const keyRows: UsageKeyRow[] = keysLive.data?.items ?? [];

  const totalPton = u ? Number(u.totalCostPton) || 1 : 1;
  const totalStr = u ? formatAttoPtonString(u.totalCostPton) : "—";
  const totalUsd = u ? `≈ $${Number(u.totalCostUsd).toFixed(2)}` : "—";
  const avgStr = u
    ? `${
        u.callCount > 0
          ? (Number(u.totalCostPton) / 1e18 / u.callCount).toFixed(3)
          : "0.000"
      } / call avg`
    : "—";

  const models =
    u?.byModel && u.byModel.length > 0
      ? u.byModel.map((m, i) => ({
          name: m.model,
          pct: Math.round((Number(m.costPton) / totalPton) * 100),
          color: MODEL_COLORS[i % MODEL_COLORS.length],
        }))
      : [];

  const bars =
    u?.byDay && u.byDay.length > 0
      ? u.byDay.map((d, i) => ({ value: Math.max(2, d.calls), id: `bar-${i}` }))
      : [];
  const max = bars.length > 0 ? Math.max(...bars.map((b) => b.value)) : 1;

  return (
    <>
      <div className="sec-head">
        <div>
          <div className="sec-title">
            <span className="num">USE</span> Usage &amp; spend
          </div>
          <div className="sec-sub">
            PTON spent per day across LLM and agent-to-agent calls.
          </div>
        </div>
        {liveChip(usage.live)}
      </div>

      <div className="usage-grid">
        <div className="card usage-chart-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                total spend
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 28,
                  color: "var(--text-strong)",
                  marginTop: 4,
                }}
              >
                {totalStr}{" "}
                <span style={{ fontSize: 14, color: "var(--gold-hi)" }}>
                  PTON
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                className="mono"
                style={{ fontSize: 11, color: "var(--muted)" }}
              >
                {totalUsd}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--ok-bright)",
                  marginTop: 4,
                }}
              >
                {avgStr}
              </div>
            </div>
          </div>

          <div className="chart-wrap">
            {bars.length > 0 ? (
              <svg
                viewBox="0 0 600 180"
                width="100%"
                height="180"
                preserveAspectRatio="none"
                style={{ overflow: "visible" }}
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="bar-g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f3ba2f" />
                    <stop offset="100%" stopColor="#d8a000" />
                  </linearGradient>
                </defs>
                {bars.map((bar, i) => {
                  const bw = 600 / bars.length;
                  const h = (bar.value / max) * 150;
                  return (
                    <rect
                      key={bar.id}
                      x={i * bw + 2}
                      y={160 - h}
                      width={bw - 4}
                      height={h}
                      rx={2}
                      fill="url(#bar-g)"
                      opacity={
                        i === bars.length - 1
                          ? 1
                          : 0.55 + (i / bars.length) * 0.3
                      }
                    />
                  );
                })}
                <line
                  x1="0"
                  y1="160"
                  x2="600"
                  y2="160"
                  stroke="var(--border)"
                  strokeWidth="1"
                />
              </svg>
            ) : (
              <div
                style={{
                  height: 180,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--muted)",
                  fontSize: 13,
                }}
              >
                {usage.live
                  ? "No usage yet — spend appears here as your agents make calls."
                  : "Sign in to the gateway to view usage."}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-label">Spend by model</div>
          {models.length > 0 ? (
            <div className="usage-models">
              {models.map((m) => (
                <div key={m.name} className="model-row">
                  <div className="model-row-top">
                    <span className="model-name">{m.name}</span>
                    <span className="model-pct">{m.pct}%</span>
                  </div>
                  <div className="model-bar">
                    <div style={{ width: `${m.pct}%`, background: m.color }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="mono"
              style={{
                marginTop: 14,
                fontSize: 12,
                color: "var(--muted)",
              }}
            >
              {usage.live ? "No model spend yet." : "Sign in to view spend."}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent calls ──────────────────────────────────────────────────
          Anchor target for the page's "Usage history" affordance. */}
      <div id="usage-history" className="sec-head" style={{ marginTop: 28 }}>
        <div>
          <div className="sec-title">
            <span className="num">LOG</span> Recent calls
          </div>
          <div className="sec-sub">
            Per-call usage history — model, tokens and PTON settled on-chain.
          </div>
        </div>
        {liveChip(callsLive.live)}
      </div>

      <div className="svc-table">
        <div
          className="svc-row head"
          style={{ gridTemplateColumns: CALLS_COLS }}
        >
          <span>Time</span>
          <span>Model</span>
          <span>Tokens (in / out)</span>
          <span>Cost</span>
          <span>Status</span>
        </div>
        {calls.length === 0 ? (
          <div
            className="svc-row"
            style={{ gridTemplateColumns: "1fr", color: "var(--muted)" }}
          >
            <span className="mono" style={{ fontSize: 12 }}>
              {callsLive.live
                ? "No calls yet — usage appears here as your agents spend."
                : "Sign in to the gateway to view usage."}
            </span>
          </div>
        ) : (
          calls.map((c) => (
            <div
              key={c.id}
              className="svc-row"
              style={{ gridTemplateColumns: CALLS_COLS }}
            >
              <span className="svc-latency" title={c.ts}>
                {relTime(c.ts)} ago
              </span>
              <span className="svc-name-main mono" style={{ fontSize: 12 }}>
                {c.model}
              </span>
              <span className="svc-endpoint">
                {fmtTokens(c.inputTokens)}{" "}
                <span style={{ color: "var(--muted)" }}>/</span>{" "}
                {fmtTokens(c.outputTokens)}
              </span>
              <span className="svc-price">
                {formatAttoPtonString(c.costPton)}{" "}
                <span style={{ color: "var(--muted)", fontSize: 10 }}>
                  PTON
                </span>
              </span>
              <span>
                <span className={`chip ${statusChip(c.status)}`}>
                  {c.status}
                </span>
              </span>
            </div>
          ))
        )}
      </div>

      {/* ── By API key ────────────────────────────────────────────────────── */}
      <div className="sec-head" style={{ marginTop: 28 }}>
        <div>
          <div className="sec-title">
            <span className="num">KEY</span> By API key
          </div>
          <div className="sec-sub">
            Usage rolled up per HMAC key — calls, tokens and total PTON spent.
          </div>
        </div>
        {liveChip(keysLive.live)}
      </div>

      <div className="svc-table">
        <div
          className="svc-row head"
          style={{ gridTemplateColumns: KEYS_COLS }}
        >
          <span>Key</span>
          <span>Calls</span>
          <span>Tokens (in / out)</span>
          <span>Total cost</span>
        </div>
        {keyRows.length === 0 ? (
          <div
            className="svc-row"
            style={{ gridTemplateColumns: "1fr", color: "var(--muted)" }}
          >
            <span className="mono" style={{ fontSize: 12 }}>
              {keysLive.live
                ? "No keyed usage yet."
                : "Sign in to the gateway to view usage."}
            </span>
          </div>
        ) : (
          keyRows.map((k, i) => (
            <div
              key={k.apiKeyId ?? `unkeyed-${i}`}
              className="svc-row"
              style={{ gridTemplateColumns: KEYS_COLS }}
            >
              <div className="svc-name">
                <div>
                  <div className="svc-name-main">{k.name ?? "unnamed key"}</div>
                  <div className="svc-name-sub">
                    {k.apiKeyId
                      ? `sk-ai-••••${k.apiKeyId.slice(-4)}`
                      : "no key (session)"}
                  </div>
                </div>
              </div>
              <span className="svc-latency">{fmtTokens(k.callCount)}</span>
              <span className="svc-endpoint">
                {fmtTokens(k.totalInputTokens)}{" "}
                <span style={{ color: "var(--muted)" }}>/</span>{" "}
                {fmtTokens(k.totalOutputTokens)}
              </span>
              <span className="svc-price">
                {formatAttoPtonString(k.totalCostPton)}{" "}
                <span style={{ color: "var(--muted)", fontSize: 10 }}>
                  PTON
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
