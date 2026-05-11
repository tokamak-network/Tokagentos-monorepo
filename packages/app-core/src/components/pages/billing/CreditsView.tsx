/**
 * CreditsView — displays the authenticated wallet's credit ledger state.
 *
 * Fetches GET /v1/credits/me.
 * Auto-refreshes every 30 seconds; shows loading skeleton on first load.
 */

import { Button, PagePanel } from "@tokagentos/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatAttoPton } from "./eip712-utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreditsData {
  wallet: string;
  balance: string;
  reserved: string;
  accrued: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CreditCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <PagePanel variant="section" className="p-5">
      <div className="text-xs-tight uppercase tracking-[0.14em] text-muted/70">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-txt">
        {value} PTON
      </div>
      <div className="mt-1 text-xs-tight text-muted">{description}</div>
    </PagePanel>
  );
}

function SkeletonCard() {
  return (
    <PagePanel variant="section" className="p-5">
      <div className="h-3 w-20 rounded-full bg-border/40 animate-pulse" />
      <div className="mt-3 h-7 w-32 rounded-full bg-border/40 animate-pulse" />
      <div className="mt-2 h-2.5 w-48 rounded-full bg-border/30 animate-pulse" />
    </PagePanel>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CreditsView(): React.ReactElement {
  const [data, setData] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCredits = useCallback(async () => {
    try {
      const res = await fetch("/v1/credits/me", { credentials: "include" });
      if (res.status === 401) {
        setError("Sign in to view credits.");
        setData(null);
        return;
      }
      if (res.status === 503) {
        setError("Billing service unavailable.");
        setData(null);
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(json.error ?? `Unexpected error (${res.status}).`);
        setData(null);
        return;
      }
      const json = (await res.json()) as CreditsData;
      setData(json);
      setError(null);
    } catch {
      setError("Network error — could not reach the billing service.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCredits();
    intervalRef.current = setInterval(() => {
      void fetchCredits();
    }, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchCredits]);

  const handleRefresh = () => {
    setLoading(true);
    void fetchCredits();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 px-3 py-4 xl:px-5 xl:py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs-tight font-semibold uppercase tracking-[0.16em] text-muted/70">
            Billing
          </div>
          <div className="mt-1 text-xl font-semibold text-txt">Credits</div>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Your current PTON credit balance on the AI gateway.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
          className="h-8 rounded-full px-3.5 text-2xs font-semibold tracking-[0.12em]"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {/* Error state */}
      {error && !loading ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {/* Loading skeleton */}
      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      {/* Data */}
      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <CreditCard
              label="Available Balance"
              value={formatAttoPton(BigInt(data.balance))}
              description="Spendable credits for LLM calls"
            />
            <CreditCard
              label="Reserved"
              value={formatAttoPton(BigInt(data.reserved))}
              description="Held for in-flight requests"
            />
            <CreditCard
              label="Accrued"
              value={formatAttoPton(BigInt(data.accrued))}
              description="Pending on-chain commit"
            />
          </div>

          <PagePanel variant="inset" className="px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="inline-block h-2 w-2 rounded-full bg-ok/70" />
              Wallet:{" "}
              <span className="font-mono text-txt">{data.wallet}</span>
            </div>
          </PagePanel>
        </>
      ) : null}
    </div>
  );
}
