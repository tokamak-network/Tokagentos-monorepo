/**
 * x402 page — the inline, real-data billing surface.
 *
 * Composition only. The page holds the funding-wallet address, the selected
 * top-up chain (persisted in sessionStorage), and a refreshKey bumped after a
 * successful deposit so the balance re-fetches. Everything is inline (no modal):
 * a wallet/network row, a 2-col balance + native EIP-3009 top-up card, the active
 * model picker, usage analytics and API keys — each a self-contained sibling
 * under ../x402, driven only by live /v1/* data.
 */
import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import {
  type ChainMeta,
  chainMeta,
  loadDashboardConfig,
} from "../chain-config";
import { ApiKeys } from "../x402/ApiKeys";
import { BalanceCard } from "../x402/BalanceCard";
import { BridgeCard } from "../x402/BridgeCard";
import { GetPtonRow } from "../x402/GetPtonRow";
import { ModelPicker } from "../x402/ModelPicker";
import { NetworkSwitcher } from "../x402/NetworkSwitcher";
import { SwapCard } from "../x402/SwapCard";
import { TopUpCard } from "../x402/TopUpCard";
import { UsageChart } from "../x402/UsageChart";
import { WalletConnectBar } from "../x402/WalletConnectBar";

/** Read the persisted top-up chain, defaulting to Base (8453). */
function initialChainId(): number {
  try {
    return Number(sessionStorage.getItem("op.x402.chain")) || 8453;
  } catch {
    return 8453;
  }
}

export function X402Page() {
  const { signedIn } = useAuth();
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number>(initialChainId);
  const [refreshKey, setRefreshKey] = useState(0);
  // The selected chain's capability flags (ton = wrappable, bridge = receives
  // bridged TON), resolved from the dashboard config on mount. Drives which
  // funding helpers render under the top-up card.
  const [meta, setMeta] = useState<ChainMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDashboardConfig().then((cfg) => {
      if (!cancelled) setMeta(chainMeta(cfg, chainId));
    });
    return () => {
      cancelled = true;
    };
  }, [chainId]);

  const bump = () => setRefreshKey((k) => k + 1);
  // Conditional-display logic mirrors app.js:
  //   • GetPtonRow  — when the chain exposes a wrappable underlying TON (Ethereum
  //                   L1 TON, or Base bridged L2 TON). app.js updateGetPton L2396.
  //   • BridgeCard  — when the chain carries a `bridge` descriptor (Base). app.js
  //                   wireBridge L2014-2018.
  //   • SwapCard    — Ethereum mainnet only (chainId === 1; the DEX route + WTON
  //                   wrap live there). app.js swapToPton L1060-1064.
  const showGetPton = !!meta?.ton;
  const showBridge = !!meta?.bridge;
  const showSwap = chainId === 1;

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">x402 · pay-per-call rail</div>
            <h1 className="page-title">Credits &amp; Billing</h1>
            <p className="page-sub">
              Fund LLM calls and agent-to-agent payments in PTON — no account,
              no subscription. Every call settles on-chain via EIP-3009 against
              your ClaudeVault balance.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              document
                .getElementById("usage-history")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            Usage history
          </button>
        </div>

        {/* Wallet + network row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <WalletConnectBar address={address} onConnect={setAddress} />
          <NetworkSwitcher
            chainId={chainId}
            onChange={setChainId}
            address={address}
          />
        </div>

        {/* Connected but not yet signed in → the gateway's /v1 routes are
            bearer-auth gated, so nudge the user to sign in before funding. */}
        {address && !signedIn && (
          <p
            className="mono"
            style={{
              margin: "0 0 18px",
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            Wallet connected. Sign in to the gateway to load your balance and
            fund credits.
          </p>
        )}

        {/* Balance + top-up */}
        <div className="x402-grid">
          <BalanceCard chainId={chainId} refreshKey={refreshKey} />
          <TopUpCard address={address} chainId={chainId} onDeposited={bump} />
        </div>

        {/* On-chain funding helpers — only the ones the selected chain supports.
            Bridge → Get PTON is the Base path; Swap is the Ethereum path. */}
        {(showBridge || showGetPton || showSwap) && (
          <div className="x402-grid" style={{ marginTop: 14 }}>
            {showBridge && (
              <BridgeCard
                address={address}
                chainId={chainId}
                onBridged={bump}
              />
            )}
            {showGetPton && (
              <GetPtonRow
                address={address}
                chainId={chainId}
                onWrapped={bump}
              />
            )}
            {showSwap && (
              <SwapCard address={address} chainId={chainId} onCredited={bump} />
            )}
          </div>
        )}

        <ModelPicker />

        <UsageChart />

        <ApiKeys />
      </div>
    </div>
  );
}
