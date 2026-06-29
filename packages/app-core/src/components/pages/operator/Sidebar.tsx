/**
 * Operator sidebar — brand lockup, two nav sections (Agent / System), and a
 * wallet chip foot. Ported from handoff_app/prototype/components/Shell.jsx.
 */
import { type ReactNode, useCallback, useEffect } from "react";
import { useAuth } from "./auth";
import { KeyMark } from "./brand/KeyMark";
import { fetchCredits, formatAttoPtonString, useLive } from "./client-billing";
import type { OperatorPage } from "./OperatorShell";

/** The x402 top-up chain the user last selected (persisted by X402Page). */
function sidebarChainId(): number {
  try {
    return Number(sessionStorage.getItem("op.x402.chain")) || 8453;
  } catch {
    return 8453;
  }
}

/** 0x1234…cdef short form of a wallet address. */
function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const NAV_ICONS: Record<OperatorPage, ReactNode> = {
  chat: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  wallet: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h3v-4z" />
    </svg>
  ),
  x402: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 9.5a2.5 2 0 0 1 5 0c0 1.5-2.5 1.5-2.5 2.5M14.5 14.5a2.5 2 0 0 1-5 0" />
    </svg>
  ),
  automations: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  plugins: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 3v6M6 21v-6M18 3v6M18 21v-6M3 9h6a3 3 0 0 1 0 6H3M21 9h-6a3 3 0 0 0 0 6h6" />
    </svg>
  ),
  settings: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

interface NavEntry {
  id: OperatorPage;
  label: string;
  badge?: string;
  badgeOk?: boolean;
}

const AGENT_NAV: NavEntry[] = [
  { id: "chat", label: "Chat" },
  { id: "wallet", label: "Wallet" },
  // x402 badge is injected live from the gateway credit balance (see renderNav).
  { id: "x402", label: "x402 Credits" },
  { id: "automations", label: "Automations" },
];

const SYSTEM_NAV: NavEntry[] = [
  { id: "plugins", label: "Plugins" },
  { id: "settings", label: "Settings" },
];

export function Sidebar({
  page,
  setPage,
  brand,
}: {
  page: OperatorPage;
  setPage: (page: OperatorPage) => void;
  brand: ReactNode;
}) {
  // Live gateway credit balance + signed-in wallet — no hardcoded values.
  const { wallet } = useAuth();
  const fetchSidebarCredits = useCallback(
    () => fetchCredits(sidebarChainId()),
    [],
  );
  const credits = useLive(fetchSidebarCredits);
  // Keep it fresh (reflects a top-up) without a global event bus. useLive also
  // re-fetches on sign-in/out.
  const { reload } = credits;
  useEffect(() => {
    const iv = setInterval(reload, 30_000);
    return () => clearInterval(iv);
  }, [reload]);

  // Total ClaudeVault credit = spendable balance + reserved + accrued (the
  // gateway's `balance` is already net of the latter two), so the sidebar matches
  // what was deposited rather than under-reporting by the reserved/accrued held.
  const ptonBalance = credits.data
    ? formatAttoPtonString(
        (
          BigInt(credits.data.balance) +
          BigInt(credits.data.reserved) +
          BigInt(credits.data.accrued)
        ).toString(),
      )
    : null;

  const renderNav = (entry: NavEntry) => {
    // The x402 entry shows the live credit balance (integer PTON) when available.
    const badge =
      entry.id === "x402"
        ? ptonBalance
          ? ptonBalance.split(".")[0]
          : undefined
        : entry.badge;
    return (
      <button
        type="button"
        key={entry.id}
        className={`nav-item ${page === entry.id ? "is-active" : ""}`}
        onClick={() => setPage(entry.id)}
      >
        <span className="nav-icon">{NAV_ICONS[entry.id]}</span>
        {entry.label}
        {badge && (
          <span className={`nav-badge ${entry.badgeOk ? "ok" : ""}`}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="sidebar">
      <div className="sidebar-brand">{brand}</div>

      <div className="sidebar-section-label">Agent</div>
      {AGENT_NAV.map(renderNav)}

      <div className="sidebar-section-label">System</div>
      {SYSTEM_NAV.map(renderNav)}

      <div className="sidebar-foot">
        <div className="wallet-chip">
          <div className="wallet-chip-row">
            <span className="wallet-chip-addr">
              <KeyMark size={14} />{" "}
              {wallet ? shortAddr(wallet) : "Not signed in"}
            </span>
            <span className="mode-tag">vault</span>
          </div>
          <div className="wallet-chip-bal">
            <span className="k">PTON balance</span>
            <span className="v">{ptonBalance ?? "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
