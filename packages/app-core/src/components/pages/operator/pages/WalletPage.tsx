/**
 * Operator Wallet page — trust-boundary mode display + per-chain balances.
 * Ported from handoff_app/prototype/components/Pages.jsx (WalletPage).
 *
 * Live data flows:
 *   - GET /api/wallet/balances  → per-chain balances, total USD, chain count
 *   - GET /api/wallet/addresses → header address chip
 *   - GET /api/wallet/config    → tradePermissionMode (read-only; reflects the
 *                                  real backend config, no local setter)
 *
 * All routes are served same-origin and fetched via the self-contained
 * `client-gateway` helpers (bare fetch, no app-core imports), so the page
 * ships identically into the monorepo dev surface and the published scaffold.
 *
 * tradePermissionMode → WALLET_MODES key mapping:
 *   "user-sign-only"  → "vault"
 *   "manual-local-key" → "direct"
 *   "agent-auto"      → "both"
 *   missing/undefined → no card marked active
 *
 * Not live (no backend setter): the per-row "Send" button stays disabled
 * (the only real transfer path is steward/BSC-gated — backend coming).
 */
import { useCallback } from "react";
import { useLive } from "../client-billing";
import {
  chainMeta,
  fetchWalletAddresses,
  fetchWalletBalances,
  fetchWalletConfig,
  type GwEvmChain,
  type GwWalletBalances,
} from "../client-gateway";
import {
  type ChainBalance,
  WALLET_MODES,
  type WalletMode,
  type WalletModeInfo,
} from "../mock";

/** Parse a decimal USD string ("1,328.42" / "1328.42") to a number, 0 on NaN. */
function parseUsd(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Trim a long balance string to a compact, readable amount. */
function formatAmt(raw: string): string {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return raw;
  if (n === 0) return "0";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/**
 * Operator chain-dot colours. The operator console only loads operator.css
 * (scoped under `.op-root`), which defines `--eth/--base/--arb/--op/--pol` —
 * NOT the `--color-chain-*` vars from the main app's styles.css. So we map the
 * canonical chain key (from client-gateway `chainMeta`) to the operator's own
 * palette to preserve the gold-on-jet design. Unknown chains fall back to the
 * gold accent.
 */
const OP_CHAIN_COLORS: Record<string, string> = {
  ethereum: "var(--eth)",
  base: "var(--base)",
  arbitrum: "var(--arb)",
  optimism: "var(--op)",
  polygon: "var(--pol)",
  solana: "#9945ff",
  bsc: "#f0b90b",
};

function chainColor(key: string): string {
  return OP_CHAIN_COLORS[key] || "var(--gold)";
}

/** Sum native + token USD for one EVM chain. */
function evmChainUsd(c: GwEvmChain): number {
  return (
    parseUsd(c.nativeValueUsd) +
    c.tokens.reduce((s, t) => s + parseUsd(t.valueUsd), 0)
  );
}

interface WalletRows {
  chains: ChainBalance[];
  total: string;
  count: number;
}

/** Map the live wallet-balances response to the operator widget shapes. */
function walletBalancesToRows(resp: GwWalletBalances): WalletRows {
  const rows: ChainBalance[] = [];
  let totalUsd = 0;

  for (const c of resp.evm?.chains ?? []) {
    if (c.error !== null) continue; // skip per-chain RPC failures
    const usd = evmChainUsd(c);
    totalUsd += usd;
    const meta = chainMeta(c.chainId);
    rows.push({
      name: meta.name.toLowerCase(),
      short: c.nativeSymbol || meta.key,
      color: chainColor(meta.key),
      amt: formatAmt(c.nativeBalance),
      sym: c.nativeSymbol,
      usd: formatUsd(usd),
    });
  }

  if (resp.solana) {
    const tokens = resp.solana.tokens ?? [];
    const usd = tokens.reduce((s, t) => s + parseUsd(t.valueUsd), 0);
    totalUsd += usd;
    rows.push({
      name: "solana",
      short: "SOL",
      color: OP_CHAIN_COLORS.solana,
      amt: formatAmt(
        tokens
          .reduce((s, t) => s + (Number.parseFloat(t.balance) || 0), 0)
          .toString(),
      ),
      sym: "SOL",
      usd: formatUsd(usd),
    });
  }

  return { chains: rows, total: formatUsd(totalUsd), count: rows.length };
}

/** Shorten a full address to "0xA9c1…3E4f" form. */
function shortenAddress(addr: string | null): string | null {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Map tradePermissionMode → the WALLET_MODES key for the active card.
 *   "user-sign-only"   → "vault"
 *   "manual-local-key" → "direct"
 *   "agent-auto"       → "both"
 *   missing/undefined  → null (no card marked active)
 */
function modeFromConfig(
  tradePermissionMode: string | undefined,
): WalletMode | null {
  switch (tradePermissionMode) {
    case "user-sign-only":
      return "vault";
    case "manual-local-key":
      return "direct";
    case "agent-auto":
      return "both";
    default:
      return null;
  }
}

export function WalletPage({
  modes = WALLET_MODES,
}: {
  modes?: Record<WalletMode, WalletModeInfo>;
} = {}) {
  // Live per-chain balances + total + chain count (GET /api/wallet/balances).
  const balancesFetcher = useCallback(() => fetchWalletBalances(), []);
  const { data: balData } = useLive(balancesFetcher);
  // Only treat as live when the response actually carries chain data — the
  // route returns `{ evm: null, solana: null }` when RPC is unconfigured.
  const liveRows =
    balData && (balData.evm?.chains?.length || balData.solana)
      ? walletBalancesToRows(balData)
      : null;
  const isLive = liveRows !== null;
  const chains = liveRows ? liveRows.chains : [];
  const total = liveRows ? liveRows.total : "$0.00";
  const chainCount = liveRows ? liveRows.count : 0;

  // Live operator address (GET /api/wallet/addresses) for the header chip.
  const addressFetcher = useCallback(() => fetchWalletAddresses(), []);
  const { data: addrData } = useLive(addressFetcher);
  const operatorAddress = shortenAddress(addrData?.evmAddress ?? null) ?? "—";

  // Live trust-boundary config (GET /api/wallet/config) — read-only display.
  const configFetcher = useCallback(() => fetchWalletConfig(), []);
  const { data: configData } = useLive(configFetcher);
  const activeMode = modeFromConfig(configData?.tradePermissionMode);

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">built-in wallet</div>
            <h1 className="page-title">Wallet</h1>
            <p className="page-sub">
              The agent's wallet is part of the runtime. Set the trust boundary
              for every on-chain action.
            </p>
          </div>
          <button type="button" className="btn btn-ghost">
            <span className="mono">{operatorAddress}</span> ↗
          </button>
        </div>

        <div className="wallet-modes">
          {(Object.entries(modes) as [WalletMode, WalletModeInfo][]).map(
            ([k, v]) => (
              <div
                key={k}
                className={`wmode ${activeMode === k ? "is-active" : ""}`}
              >
                <div className="wmode-top">
                  <span className="wmode-name">{v.name}</span>
                  <span className="chip mute">{v.tag}</span>
                </div>
                <div className="wmode-desc">{v.desc}</div>
              </div>
            ),
          )}
        </div>

        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 16,
            }}
          >
            <div
              className="card-label"
              style={{
                margin: 0,
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              Balances · {chainCount} chain{chainCount === 1 ? "" : "s"}
              {isLive && <span className="chip ok">live</span>}
            </div>
            <div
              className="mono"
              style={{ fontSize: 20, color: "var(--gold-hi)" }}
            >
              {total}
            </div>
          </div>
          <div className="chain-grid">
            {isLive ? (
              chains.map((c) => (
                <div key={c.name} className="chain-row">
                  <div className="chain-id">
                    <span
                      className="chain-dot"
                      style={{
                        background: c.color,
                        boxShadow: `0 0 8px ${c.color}`,
                      }}
                    />
                    <span className="chain-name">{c.name}</span>
                    <span className="chain-short">{c.short}</span>
                  </div>
                  <span className="chain-amt">
                    {c.amt}
                    <em>{c.sym}</em>
                  </span>
                  <span className="chain-usd">{c.usd}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled
                    title="Send · preview — routed through the steward/vault flow (backend coming)"
                  >
                    Send
                  </button>
                </div>
              ))
            ) : (
              <p className="mute" style={{ fontSize: 13, margin: "8px 0 4px" }}>
                No on-chain balances — the wallet API returned no chains (RPC
                unconfigured or not signed in).
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
