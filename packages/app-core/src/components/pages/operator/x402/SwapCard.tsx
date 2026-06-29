/**
 * x402 · Swap → PTON — INLINE Ethereum-mainnet DEX funding card (no modal).
 *
 * Shown ONLY when chainId === 1 (the DEX route + WTON wrap live on Ethereum).
 * A token menu (USDC/USDT/ETH/WBTC) + amount + Max + slippage chips + a
 * "Swap → PTON" button run ../topup-flow runSwapToPton — the full
 * quote → swap → unwrap → wrap → EIP-3009 credit pipeline — with a per-step
 * status line ('Quoting…/Approving…/Swapping…/Unwrapping…/Wrapping…/Crediting…').
 * The route preview mirrors app.js (input → WETH → WTON → TON → PTON; ETH skips
 * the WETH hop). On a settled credit it calls onCredited(). Self-contained:
 * ../topup-flow + operator-local only (window.ethereum, no ethers).
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import {
  friendlyError,
  type OnStatus,
  readSwapTokenBalance,
  runSwapToPton,
  SWAP_TOKENS,
  type SwapToken,
} from "../topup-flow";

/** Slippage presets in basis points (0.1% / 0.5% / 1%). */
const SLIPPAGE_PRESETS: { bps: number; label: string }[] = [
  { bps: 10, label: "0.1%" },
  { bps: 50, label: "0.5%" },
  { bps: 100, label: "1%" },
];

type Phase = "idle" | "running" | "done" | "error";

/** Route nodes per token (app.js: ERC-20 → WETH → WTON → TON → PTON; ETH skips WETH). */
function routeNodes(token: SwapToken): string[] {
  return token === "ETH"
    ? ["ETH", "WTON", "TON", "PTON"]
    : [token, "WETH", "WTON", "TON", "PTON"];
}

export function SwapCard({
  address,
  chainId,
  onCredited,
}: {
  address: string | null;
  chainId: number;
  onCredited: () => void;
}) {
  const { signedIn } = useAuth();
  const [token, setToken] = useState<SwapToken>("USDC");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<{ msg: string; kind: string } | null>(
    null,
  );
  const [balance, setBalance] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Refresh the selected token's wallet balance (drives "Max" + the hint).
  useEffect(() => {
    let cancelled = false;
    if (!address || chainId !== 1) {
      setBalance(null);
      return;
    }
    readSwapTokenBalance(token).then((b) => {
      if (!cancelled) setBalance(b);
    });
    return () => {
      cancelled = true;
    };
  }, [address, chainId, token]);

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
    setTxHash(null);
    try {
      const hash = await runSwapToPton(
        { inputToken: token, amountFloat: v, slippageBps, chainId },
        onStatus,
      );
      setTxHash(hash);
      setPhase("done");
      setAmount("");
      onCredited();
    } catch (e) {
      setPhase("error");
      setStatus({ msg: friendlyError(e, chainId), kind: "err" });
    }
  }, [amount, token, slippageBps, chainId, onStatus, onCredited]);

  const nodes = routeNodes(token);

  return (
    <div className="card">
      <div className="card-label">
        <span style={{ color: "var(--gold)" }}>◆</span> Swap → PTON · Ethereum
      </div>

      {/* Token menu */}
      <div
        style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 4 }}
        role="group"
        aria-label="Swap input token"
      >
        {SWAP_TOKENS.map((t) => (
          <button
            key={t}
            type="button"
            className={`token-btn ${token === t ? "is-active" : ""}`}
            onClick={() => setToken(t)}
            aria-pressed={token === t}
            disabled={busy}
            style={{ flexDirection: "row", padding: "8px 14px", minWidth: 0 }}
          >
            <span className="token-sym">{t}</span>
          </button>
        ))}
      </div>

      {/* Amount + Max */}
      <div className="amount-field" style={{ marginTop: 12 }}>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          inputMode="decimal"
          disabled={busy}
          aria-label={`Amount of ${token} to swap`}
        />
        <button
          type="button"
          className="preset"
          style={{ marginRight: 6 }}
          disabled={busy || balance == null || balance <= 0}
          onClick={() => {
            if (balance != null && balance > 0) setAmount(String(balance));
          }}
        >
          Max
        </button>
        <span className="suffix">{token}</span>
      </div>
      <div
        className="mono"
        style={{ marginTop: 6, fontSize: 10, color: "var(--muted)" }}
      >
        balance:{" "}
        {balance != null
          ? `${balance.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${token}`
          : "—"}
      </div>

      {/* Slippage */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}
      >
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          slippage
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {SLIPPAGE_PRESETS.map((s) => (
            <button
              key={s.bps}
              type="button"
              className="preset"
              style={
                slippageBps === s.bps
                  ? {
                      borderColor: "rgba(240,185,11,0.5)",
                      color: "var(--gold-hi)",
                    }
                  : undefined
              }
              aria-pressed={slippageBps === s.bps}
              disabled={busy}
              onClick={() => setSlippageBps(s.bps)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Route preview */}
      <div className="swap-route" style={{ marginTop: 14 }}>
        {nodes.map((n, i) => (
          <span
            key={n}
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <span
              className={`swap-node ${i === nodes.length - 1 ? "final" : ""}`}
            >
              {n}
            </span>
            {i < nodes.length - 1 && <span className="swap-arrow">→</span>}
          </span>
        ))}
      </div>

      {status && <StatusLine msg={status.msg} kind={status.kind} />}

      {phase === "done" && txHash && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
          <a
            href={`https://etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            view credit transaction ↗
          </a>
        </div>
      )}

      <button
        type="button"
        className="btn btn-gold btn-lg"
        style={{ marginTop: 14, width: "100%" }}
        onClick={run}
        disabled={busy || !address || !signedIn}
      >
        {!address
          ? "Connect a wallet to swap"
          : !signedIn
            ? "Sign in to the gateway"
            : busy
              ? "Swapping…"
              : "Swap → PTON"}
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
        Uniswap V3 · unwrap WTON · wrap PTON · gasless credit
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
