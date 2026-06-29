/**
 * x402 · Get PTON — INLINE wrap helper (no modal).
 *
 * Shown on any chain whose config exposes a wrappable underlying TON
 * (chainMeta.ton): Ethereum's L1 TON, or Base's bridged L2 TON. An amount field
 * + "Get PTON (wrap TON)" button runs ../topup-flow runGetPton (approve TON →
 * PTON.deposit) with an inline per-step status line, and shows the wallet's PTON
 * balance after wrapping. On success it calls onWrapped() so the page can refresh
 * downstream balances. Self-contained: ../topup-flow + operator-local only.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { formatAttoPtonAmount } from "../eip712";
import {
  friendlyError,
  type OnStatus,
  readWalletPton,
  runGetPton,
} from "../topup-flow";

type Phase = "idle" | "running" | "done" | "error";

export function GetPtonRow({
  address,
  chainId,
  onWrapped,
}: {
  address: string | null;
  chainId: number;
  onWrapped: () => void;
}) {
  const { signedIn } = useAuth();
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<{ msg: string; kind: string } | null>(
    null,
  );
  const [walletPton, setWalletPton] = useState<bigint | null>(null);

  // Surface the wallet's PTON balance on the selected chain (and refresh it on
  // address/chain change). app.js updateGetPton (L2390-2399).
  useEffect(() => {
    let cancelled = false;
    if (!address) {
      setWalletPton(null);
      return;
    }
    readWalletPton(chainId).then((b) => {
      if (!cancelled) setWalletPton(b);
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
      setStatus({ msg: "Enter an amount first.", kind: "err" });
      return;
    }
    setPhase("running");
    setStatus(null);
    try {
      const pton = await runGetPton(v, chainId, onStatus);
      setWalletPton(pton);
      setPhase("done");
      onWrapped();
    } catch (e) {
      setPhase("error");
      setStatus({ msg: friendlyError(e, chainId), kind: "err" });
    }
  }, [amount, chainId, onStatus, onWrapped]);

  return (
    <div className="card">
      <div className="card-label">
        <span style={{ color: "var(--gold)" }}>◆</span> Get PTON · wrap TON
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
          wallet PTON
        </span>
        <span
          className="mono"
          style={{ fontSize: 13, color: "var(--gold-hi)" }}
        >
          {walletPton != null
            ? `${formatAttoPtonAmount(walletPton)} PTON`
            : "—"}
        </span>
      </div>

      <div className="amount-field">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          inputMode="decimal"
          disabled={busy}
          aria-label="Amount of TON to wrap into PTON"
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
          ? "Connect a wallet to wrap"
          : !signedIn
            ? "Sign in to the gateway"
            : busy
              ? "Wrapping…"
              : "Get PTON (wrap TON)"}
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
        approve · PTON.deposit · 1:1 TON → PTON
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
