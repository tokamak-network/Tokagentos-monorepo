/**
 * x402 · Bridge — INLINE OP-Stack TON bridge (no modal).
 *
 * Shown on any chain whose config carries a `bridge` descriptor (Base receives
 * bridged L2 TON from Ethereum L1). A TON amount field + "Bridge from Ethereum"
 * button runs ../topup-flow runBridge: switch wallet to L1 → approve L1 TON →
 * L1StandardBridge.depositERC20To → switch back → poll L2 balanceOf, with an
 * inline per-step status line. Shows the L1 (source) + L2 (dst) TON balances.
 * On arrival it calls onBridged() so the page can refresh / nudge "Get PTON".
 * Self-contained: ../topup-flow + ../chain-config + operator-local only.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { chainMeta, loadDashboardConfig } from "../chain-config";
import { formatAttoPtonAmount } from "../eip712";
import {
  friendlyError,
  type OnStatus,
  readWalletTon,
  runBridge,
} from "../topup-flow";

type Phase = "idle" | "running" | "done" | "error";

export function BridgeCard({
  address,
  chainId,
  onBridged,
}: {
  address: string | null;
  chainId: number;
  onBridged: () => void;
}) {
  const { signedIn } = useAuth();
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<{ msg: string; kind: string } | null>(
    null,
  );
  const [l2Ton, setL2Ton] = useState<bigint | null>(null);
  const [fromName, setFromName] = useState("Ethereum");

  // Resolve the source L1 name from the bridge descriptor (display only).
  useEffect(() => {
    let cancelled = false;
    loadDashboardConfig().then((cfg) => {
      if (cancelled) return;
      const b = chainMeta(cfg, chainId).bridge;
      if (b?.fromName) setFromName(b.fromName);
    });
    return () => {
      cancelled = true;
    };
  }, [chainId]);

  // Show the L2 (selected chain) bridged-TON balance.
  useEffect(() => {
    let cancelled = false;
    if (!address) {
      setL2Ton(null);
      return;
    }
    readWalletTon(chainId).then((r) => {
      if (!cancelled) setL2Ton(r ? r.balance : null);
    });
    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  const onStatus: OnStatus = useCallback((msg, kind = "info") => {
    setStatus({ msg, kind });
  }, []);

  const busy = phase === "running";

  const run = useCallback(async () => {
    const v = Number.parseFloat(amount);
    if (!Number.isFinite(v) || v <= 0) {
      setPhase("error");
      setStatus({ msg: "Amount must be > 0", kind: "err" });
      return;
    }
    setPhase("running");
    setStatus(null);
    try {
      const { arrived, l2Balance } = await runBridge(amount, chainId, onStatus);
      setL2Ton(l2Balance);
      setPhase(arrived ? "done" : "idle");
      if (arrived) setAmount("");
      onBridged();
    } catch (e) {
      setPhase("error");
      setStatus({ msg: friendlyError(e, chainId), kind: "err" });
    }
  }, [amount, chainId, onStatus, onBridged]);

  return (
    <div className="card">
      <div className="card-label">
        <span style={{ color: "var(--gold)" }}>◆</span> Bridge · TON from{" "}
        {fromName}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginTop: 4,
          marginBottom: 8,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          bridged TON here
        </span>
        <span
          className="mono"
          style={{ fontSize: 13, color: "var(--gold-hi)" }}
        >
          {l2Ton != null ? `${formatAttoPtonAmount(l2Ton)} TON` : "—"}
        </span>
      </div>

      <div className="amount-field">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          inputMode="decimal"
          disabled={busy}
          aria-label="Amount of TON to bridge from Ethereum"
        />
        <span className="suffix">TON</span>
      </div>

      {status && <StatusLine msg={status.msg} kind={status.kind} />}

      <button
        type="button"
        className="btn btn-ghost btn-lg"
        style={{ marginTop: 12, width: "100%" }}
        onClick={run}
        disabled={busy || !address || !signedIn}
      >
        {!address
          ? "Connect a wallet to bridge"
          : !signedIn
            ? "Sign in to the gateway"
            : busy
              ? "Bridging…"
              : `Bridge from ${fromName}`}
      </button>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--muted)",
          textAlign: "center",
          marginTop: 8,
        }}
      >
        lock on L1 · arrives on L2 in ~1-3 min · then "Get PTON"
      </div>
    </div>
  );
}

/** Shared inline status line (info / ok / err palette). */
function StatusLine({ msg, kind }: { msg: string; kind: string }) {
  const palette =
    kind === "err"
      ? { bg: "rgba(243,186,47,0.10)", fg: "var(--gold-hi)" }
      : kind === "ok"
        ? { bg: "rgba(3,166,109,0.12)", fg: "var(--ok-bright)" }
        : { bg: "rgba(96,165,250,0.10)", fg: "var(--info)" };
  return (
    <div
      className="mono"
      style={{
        marginTop: 12,
        padding: "8px 10px",
        borderRadius: 8,
        background: palette.bg,
        border: "1px solid var(--border-strong)",
        fontSize: 12,
        color: palette.fg,
      }}
    >
      {msg}
    </div>
  );
}
