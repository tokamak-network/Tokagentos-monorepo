/**
 * x402 · ClaudeVault balance — live, real-data only (NO mock).
 *
 * The gold-on-jet hero card: PTON balance + a USD estimate from the live TON/USD
 * price, plus reserved/accrued stat rows. Re-fetches whenever chainId or
 * refreshKey change (a successful deposit bumps refreshKey). When the gateway
 * returns no credits (unauthenticated / unavailable) the card shows "—" and a
 * muted sign-in hint — never example values. Self-contained: ../client-billing +
 * operator-local brand sibling only.
 */
import { useCallback } from "react";
import { KeyMark } from "../brand/KeyMark";
import {
  fetchCredits,
  fetchPrice,
  formatAttoPtonString,
  useLive,
} from "../client-billing";

/** etherscan/basescan address explorer for a vault, by chainId. */
function explorerAddr(chainId: number, addr: string): string {
  const base =
    chainId === 1
      ? "https://etherscan.io/address/"
      : "https://basescan.org/address/";
  return `${base}${addr}`;
}

/** Estimate the USD value of an atto-PTON (1e18) balance at `tonUsd`. */
function usdEstimate(atto: string, tonUsd: number): string | null {
  try {
    const pton = Number(BigInt(atto)) / 1e18;
    if (!Number.isFinite(pton) || !Number.isFinite(tonUsd)) return null;
    return `≈ $${(pton * tonUsd).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    })}`;
  } catch {
    return null;
  }
}

export function BalanceCard({
  chainId,
  refreshKey,
}: {
  chainId: number;
  refreshKey: number;
}) {
  // Re-fetch on chainId / refreshKey change: both feed the useCallback deps so
  // the fetcher identity changes → useLive re-runs.
  const creditsFetcher = useCallback(
    () => fetchCredits(chainId),
    // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a manual refetch trigger
    [chainId, refreshKey],
  );
  const credits = useLive(creditsFetcher);
  const price = useLive(fetchPrice);

  const data = credits.data;
  const tonUsd = price.data?.tonUsd ?? null;

  // The gateway's `balance` is the SPENDABLE amount — already net of reserved +
  // accrued (credits-routes: `balance = onChain - (reserved + accrued)`). The
  // hero "ClaudeVault balance" must show the TOTAL on-chain credit (what you
  // deposited = balance + reserved + accrued), else a deposit looks short by the
  // reserved/accrued amount. Spendable is shown as its own stat below.
  const totalAtto = data
    ? (
        BigInt(data.balance) +
        BigInt(data.reserved) +
        BigInt(data.accrued)
      ).toString()
    : null;
  const balanceStr = totalAtto ? formatAttoPtonString(totalAtto) : null;
  const spendableStr = data ? formatAttoPtonString(data.balance) : null;
  const usd =
    totalAtto && tonUsd != null ? usdEstimate(totalAtto, tonUsd) : null;
  const vault = data?.backing ?? null;

  return (
    <div className="card accent bal-card">
      <div className="bal-top">
        <div className="card-label">
          <KeyMark size={14} /> ClaudeVault balance
        </div>
        {credits.live ? (
          <span className="chip ok">
            <span
              className="dot-pulse"
              style={{
                background: "var(--ok-bright)",
                boxShadow: "0 0 6px var(--ok-bright)",
              }}
            />{" "}
            live
          </span>
        ) : (
          <span className="chip mute">offline</span>
        )}
      </div>

      <div className="bal-amount">
        {balanceStr ?? "—"} <em>PTON</em>
      </div>
      <div className="bal-usd">
        {data
          ? (usd ?? "funds LLM + agent-to-agent calls")
          : "Sign in to the gateway to view your balance"}
      </div>

      {/* spendable + reserved + accrued — live only (these sum to the hero) */}
      {data && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 14,
          }}
        >
          <span
            className="chip ok"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            spendable
            <span className="mono" style={{ color: "var(--ok-bright)" }}>
              {spendableStr} PTON
            </span>
          </span>
          <span
            className="chip mute"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            reserved
            <span className="mono" style={{ color: "var(--silver)" }}>
              {formatAttoPtonString(data.reserved)} PTON
            </span>
          </span>
          <span
            className="chip mute"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            accrued
            <span className="mono" style={{ color: "var(--silver)" }}>
              {formatAttoPtonString(data.accrued)} PTON
            </span>
          </span>
        </div>
      )}

      {/* vault link — only when the gateway reports a backing vault address */}
      {vault && (
        <div className="bal-vault">
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
            <span
              style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              vault
            </span>
          </div>
          <a
            href={explorerAddr(chainId, vault)}
            target="_blank"
            rel="noreferrer"
          >
            {`${vault.slice(0, 6)}…${vault.slice(-4)}`}{" "}
            <span style={{ color: "var(--muted)" }}>↗</span>
          </a>
        </div>
      )}
    </div>
  );
}
