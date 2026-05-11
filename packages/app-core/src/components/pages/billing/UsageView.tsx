/**
 * UsageView — paginated call history + summary cards + per-key breakdown.
 *
 * Endpoints:
 *   GET /v1/usage/summary  — aggregated totals
 *   GET /v1/usage/calls    — paginated recent calls
 *   GET /v1/usage/keys     — per-key aggregated usage
 *
 * Auto-refreshes every 60 seconds.
 */

import { Button, PagePanel } from "@tokagentos/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatAttoPton } from "./eip712-utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsageSummary {
  wallet: string;
  window: { since: string; until: string };
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: string;
  totalCostPton: string;
  callCount: number;
}

interface CallRow {
  id: string;
  ts: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheInputTokens: number;
  cacheCreationTokens: number;
  costUsd: string;
  costPton: string;
  status: string;
  apiKeyId: string | null;
}

interface KeyUsageRow {
  apiKeyId: string | null;
  name: string | null;
  createdAt: string | null;
  revokedAt: string | null;
  callCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: string;
  totalCostPton: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusColor(status: string): string {
  if (status === "ok") return "text-ok";
  if (status === "error" || status === "rate_limited")
    return "text-danger";
  return "text-muted";
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <PagePanel variant="section" className="p-4">
      <div className="text-xs-tight uppercase tracking-[0.14em] text-muted/70">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold tabular-nums text-txt">
        {value}
      </div>
    </PagePanel>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UsageView(): React.ReactElement {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [keyUsage, setKeyUsage] = useState<KeyUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, callsRes, keysRes] = await Promise.all([
        fetch("/v1/usage/summary", { credentials: "include" }),
        fetch("/v1/usage/calls?limit=50", { credentials: "include" }),
        fetch("/v1/usage/keys", { credentials: "include" }),
      ]);

      if (summaryRes.status === 401) {
        setError("Sign in to view usage.");
        return;
      }

      if (!summaryRes.ok || !callsRes.ok || !keysRes.ok) {
        const errorRes = !summaryRes.ok
          ? summaryRes
          : !callsRes.ok
            ? callsRes
            : keysRes;
        const json = (await errorRes.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(json.error ?? `Unexpected error (${errorRes.status}).`);
        return;
      }

      const [summaryJson, callsJson, keysJson] = await Promise.all([
        summaryRes.json() as Promise<UsageSummary>,
        callsRes.json() as Promise<{ wallet: string; calls: CallRow[]; hasMore: boolean }>,
        keysRes.json() as Promise<{ wallet: string; items: KeyUsageRow[] }>,
      ]);

      setSummary(summaryJson);
      setCalls(callsJson.calls);
      setKeyUsage(keysJson.items);
      setError(null);
    } catch {
      setError("Network error — could not load usage data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
    intervalRef.current = setInterval(() => {
      void fetchAll();
    }, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAll]);

  const handleRefresh = () => {
    setLoading(true);
    void fetchAll();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 px-3 py-4 xl:px-5 xl:py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs-tight font-semibold uppercase tracking-[0.16em] text-muted/70">
            Billing
          </div>
          <div className="mt-1 text-xl font-semibold text-txt">Usage</div>
          <p className="mt-1 max-w-xl text-sm text-muted">
            API call history and token consumption for the last 30 days.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
          className="h-8 rounded-full px-3.5 text-2xs font-semibold tracking-[0.12em]"
        >
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {/* Summary cards */}
      {loading && !summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <PagePanel key={i} variant="section" className="p-4">
              <div className="h-2.5 w-20 rounded-full bg-border/40 animate-pulse" />
              <div className="mt-3 h-5 w-16 rounded-full bg-border/40 animate-pulse" />
            </PagePanel>
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard label="Calls" value={String(summary.callCount)} />
          <SummaryCard
            label="Input tokens"
            value={summary.totalInputTokens.toLocaleString()}
          />
          <SummaryCard
            label="Output tokens"
            value={summary.totalOutputTokens.toLocaleString()}
          />
          <SummaryCard
            label="Cost (USD)"
            value={`$${parseFloat(summary.totalCostUsd).toFixed(4)}`}
          />
          <SummaryCard
            label="Cost (PTON)"
            value={formatAttoPton(BigInt(summary.totalCostPton))}
          />
        </div>
      ) : null}

      {/* Recent calls table */}
      <PagePanel variant="section" className="p-5">
        <div className="text-sm font-semibold text-txt mb-4">
          Recent Calls
        </div>
        {loading && calls.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-8 rounded-xl bg-border/30 animate-pulse"
              />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <div className="text-sm text-muted py-4 text-center">
            No calls in the last 30 days.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="pb-2 text-left font-semibold text-muted pr-4">
                    Time
                  </th>
                  <th className="pb-2 text-left font-semibold text-muted pr-4">
                    Model
                  </th>
                  <th className="pb-2 text-right font-semibold text-muted pr-4">
                    In
                  </th>
                  <th className="pb-2 text-right font-semibold text-muted pr-4">
                    Out
                  </th>
                  <th className="pb-2 text-right font-semibold text-muted pr-4">
                    Cost USD
                  </th>
                  <th className="pb-2 text-left font-semibold text-muted">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {calls.map((c) => (
                  <tr key={c.id} className="hover:bg-bg-hover/30">
                    <td className="py-2 pr-4 text-muted">{fmtTs(c.ts)}</td>
                    <td className="py-2 pr-4 font-mono text-txt max-w-[12rem] truncate">
                      {c.model}
                    </td>
                    <td className="py-2 pr-4 text-right text-muted">
                      {c.inputTokens.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right text-muted">
                      {c.outputTokens.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right text-txt">
                      ${parseFloat(c.costUsd).toFixed(5)}
                    </td>
                    <td className={`py-2 ${statusColor(c.status)}`}>
                      {c.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PagePanel>

      {/* Per-key breakdown */}
      {keyUsage.length > 0 ? (
        <PagePanel variant="section" className="p-5">
          <div className="text-sm font-semibold text-txt mb-4">
            Per-Key Breakdown
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="pb-2 text-left font-semibold text-muted pr-4">
                    Key Name
                  </th>
                  <th className="pb-2 text-right font-semibold text-muted pr-4">
                    Calls
                  </th>
                  <th className="pb-2 text-right font-semibold text-muted pr-4">
                    Tokens In
                  </th>
                  <th className="pb-2 text-right font-semibold text-muted">
                    Cost USD
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {keyUsage.map((k, i) => (
                  <tr key={k.apiKeyId ?? `direct-${i}`} className="hover:bg-bg-hover/30">
                    <td className="py-2 pr-4 text-txt">
                      {k.name ?? "Direct (JWT)"}
                      {k.revokedAt ? (
                        <span className="ml-1.5 text-muted/60 text-2xs">
                          revoked
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4 text-right text-muted">
                      {k.callCount.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right text-muted">
                      {k.totalInputTokens.toLocaleString()}
                    </td>
                    <td className="py-2 text-right text-txt">
                      ${parseFloat(k.totalCostUsd).toFixed(5)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PagePanel>
      ) : null}
    </div>
  );
}
