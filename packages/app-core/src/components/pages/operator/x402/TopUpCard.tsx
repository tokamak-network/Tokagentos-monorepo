/**
 * x402 · Top-up — INLINE native EIP-3009 deposit card (no modal/portal).
 *
 * The real top-up flow, ported from the former TopupFlow modal into a normal
 * .card in the page flow: amount(PTON) + presets → debounced POST /v1/topup/quote
 * (stale quotes cancelled via a seq ref) → live "deposit N PTON (≈ $X)" + expiry
 * countdown → a single "Deposit · gasless EIP-3009" button that runs the flow in.
 * Top-up deposits PTON 1:1 (1 PTON in → 1 PTON credited); USD is only a preview.
 * place with an inline status line:
 *   connectWallet (if no address) → switch chain if needed →
 *   eth_signTypedData_v4 (EIP-3009 TransferWithAuthorization) → POST settle.
 * On success it shows "+N PTON credited" + a tx link and calls onDeposited().
 * Self-contained: ../eip712 + ../client-billing only (window.ethereum, no ethers).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import {
  fetchTopupQuote,
  type SettleOutcome,
  settleTopup,
  type TopupQuote,
} from "../client-billing";
import {
  connectWallet,
  formatAttoPtonAmount,
  hasInjectedWallet,
  randomNonce,
  SignatureRejectedError,
  signTransferWithAuthorization,
  switchWalletChain,
  walletChainId,
} from "../eip712";

const PRESETS = ["10", "25", "100", "250"];
type Phase = "idle" | "quoting" | "ready" | "depositing" | "done" | "error";

export function TopUpCard({
  address,
  chainId,
  onDeposited,
}: {
  address: string | null;
  chainId: number;
  onDeposited: () => void;
}) {
  const [amountPton, setAmountPton] = useState("25");
  const [quote, setQuote] = useState<TopupQuote | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [secsLeft, setSecsLeft] = useState(0);
  const [requoteNonce, setRequoteNonce] = useState(0);

  const { signedIn } = useAuth();
  const walletPresent = hasInjectedWallet();
  const busy = phase === "depositing";

  // Debounced quote on amount/chain change (not while depositing/done). Stale
  // responses are dropped via the seq ref so the latest input always wins.
  const quoteSeq = useRef(0);
  useEffect(() => {
    if (phase === "depositing" || phase === "done") return;
    // The quote endpoint is auth-gated behind the SIWE bearer token — connecting
    // a wallet is NOT enough. Don't fire it (and surface a raw 401) until the
    // user has signed in to the gateway; before that, sit in the idle state with
    // a "sign in" hint (rendered below) instead of an error.
    if (!signedIn) {
      setQuote(null);
      setPhase("idle");
      setError(null);
      return;
    }
    const pton = Number.parseFloat(amountPton);
    if (!Number.isFinite(pton) || pton <= 0) {
      setQuote(null);
      setPhase("idle");
      return;
    }
    const seq = ++quoteSeq.current;
    setPhase("quoting");
    setError(null);
    const t = setTimeout(() => {
      fetchTopupQuote(pton, chainId)
        .then((q) => {
          if (seq === quoteSeq.current) {
            setQuote(q);
            setPhase("ready");
          }
        })
        .catch((e) => {
          if (seq === quoteSeq.current) {
            setQuote(null);
            setPhase("error");
            const msg = e instanceof Error ? e.message : "";
            setError(
              /401|unauth/i.test(msg)
                ? "Sign in to the gateway to get a quote."
                : "Couldn't fetch a quote — try again.",
            );
          }
        });
    }, 400);
    return () => clearTimeout(t);
    // phase intentionally omitted to avoid re-quoting on every transition;
    // requoteNonce lets the expired-quote "Refresh" button force a re-quote.
    // signedIn re-runs the effect (and fires the first quote) the moment the
    // user signs in to the gateway. address is no longer read here (the guard is
    // signedIn now), so it is intentionally out of the deps.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see comment
  }, [signedIn, amountPton, chainId, requoteNonce]);

  // Quote expiry countdown.
  useEffect(() => {
    if (!quote) return;
    const tick = () =>
      setSecsLeft(
        Math.max(
          0,
          Math.floor((new Date(quote.expiresAt).getTime() - Date.now()) / 1000),
        ),
      );
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [quote]);

  const expired = quote != null && secsLeft <= 0 && phase !== "done";
  const ptonOut = quote ? formatAttoPtonAmount(BigInt(quote.amountPton)) : "—";

  const onDeposit = useCallback(async () => {
    if (!quote || expired) return;
    setPhase("depositing");
    setError(null);
    setTxHash(null);
    try {
      const addr = address ?? (await connectWallet());
      const current = await walletChainId();
      if (current !== quote.chainId) await switchWalletChain(quote.chainId);
      const { signature, authorization } = await signTransferWithAuthorization({
        address: addr as `0x${string}`,
        domain: quote.domain,
        to: quote.vaultAddress,
        valueAttoPton: quote.amountPton,
        // Fresh random nonce (app.js parity) — the on-chain replay guard rejects
        // a reused nonce, and a topupId-derived one repeats on re-quotes.
        nonceHex: randomNonce(),
      });
      const outcome: SettleOutcome = await settleTopup(
        quote.topupId,
        quote.chainId,
        authorization,
        signature,
      );
      if (outcome.ok) {
        setTxHash(outcome.txHash ?? null);
        setPhase("done");
        onDeposited();
      } else {
        setError(outcome.error ?? "Settlement failed.");
        setPhase("error");
      }
    } catch (e) {
      setError(
        e instanceof SignatureRejectedError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Deposit failed.",
      );
      setPhase("error");
    }
  }, [quote, expired, address, onDeposited]);

  const explorer =
    chainId === 1 ? "https://etherscan.io/tx/" : "https://basescan.org/tx/";

  // ── Done state: credited confirmation + tx link, then "Top up more" reset ──
  if (phase === "done") {
    return (
      <div className="card topup">
        <div className="card-label">
          <span style={{ color: "var(--gold)" }}>◆</span> Top up · gasless
          EIP-3009
        </div>
        <div style={{ padding: "8px 0" }}>
          <div
            className="chip ok"
            style={{ display: "inline-flex", marginBottom: 12 }}
          >
            ✓ credited
          </div>
          <div
            style={{
              fontSize: 22,
              color: "var(--text-strong)",
              fontWeight: 600,
            }}
          >
            +{ptonOut}{" "}
            <em style={{ fontStyle: "normal", color: "var(--muted)" }}>PTON</em>{" "}
            credited
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            {txHash ? (
              <a href={`${explorer}${txHash}`} target="_blank" rel="noreferrer">
                view transaction ↗
              </a>
            ) : (
              "settled on-chain"
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            style={{ marginTop: 16, width: "100%" }}
            onClick={() => {
              setPhase("idle");
              setQuote(null);
              setTxHash(null);
              setError(null);
              setRequoteNonce((n) => n + 1);
            }}
          >
            Top up more
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card topup">
      <div className="card-label">
        <span style={{ color: "var(--gold)" }}>◆</span> Top up · gasless
        EIP-3009
      </div>

      {/* Amount — denominated in PTON (deposit is 1:1). */}
      <div className="amount-field" style={{ marginTop: 8 }}>
        <input
          value={amountPton}
          onChange={(e) =>
            setAmountPton(e.target.value.replace(/[^0-9.]/g, ""))
          }
          placeholder="0.00"
          inputMode="decimal"
          disabled={busy}
          aria-label="Top-up amount in PTON"
        />
        <span className="suffix">PTON</span>
      </div>
      <div className="amount-presets">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className="preset"
            onClick={() => setAmountPton(p)}
            disabled={busy}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Quote: you receive + expiry countdown */}
      <div
        className="swap-meta"
        style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <div className="swap-out">
          <div className="k">you deposit (1:1)</div>
          <div className="v">{phase === "quoting" ? "…" : ptonOut} PTON</div>
          {quote && Number.isFinite(quote.amountUsd) && quote.amountUsd > 0 && (
            <div
              className="mono"
              style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}
            >
              ≈ ${quote.amountUsd.toFixed(2)}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--muted)",
              textTransform: "uppercase",
            }}
          >
            quote
          </div>
          <div
            className="mono"
            style={{
              fontSize: 13,
              color: expired ? "var(--gold-hi)" : "var(--silver)",
            }}
          >
            {quote
              ? expired
                ? "expired"
                : `${Math.floor(secsLeft / 60)}:${(secsLeft % 60)
                    .toString()
                    .padStart(2, "0")}`
              : "—"}
          </div>
        </div>
      </div>

      {/* Not signed in → muted "sign in to fund" hint (not an error). */}
      {!signedIn && !busy && (
        <div
          className="mono"
          style={{
            marginTop: 12,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border-strong)",
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          Sign in to the gateway to fund.
        </div>
      )}

      {/* Inline status / error line */}
      {busy && (
        <div
          className="mono"
          style={{
            marginTop: 12,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(96,165,250,0.10)",
            border: "1px solid var(--border-strong)",
            fontSize: 12,
            color: "var(--info)",
          }}
        >
          Signing &amp; settling on-chain…
        </div>
      )}
      {error && !busy && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(243,186,47,0.10)",
            border: "1px solid var(--border-strong)",
            fontSize: 12,
            color: "var(--gold-hi)",
          }}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        className="btn btn-gold btn-lg"
        style={{ marginTop: 14, width: "100%" }}
        onClick={expired ? () => setRequoteNonce((n) => n + 1) : onDeposit}
        disabled={busy || !signedIn || !quote || phase === "quoting"}
      >
        {!walletPresent
          ? "Connect a Web3 wallet to deposit"
          : !signedIn
            ? "Sign in to the gateway to deposit"
            : busy
              ? "Signing & settling…"
              : expired
                ? "Refresh quote"
                : `Deposit ${amountPton || "0"} PTON · gasless EIP-3009`}
      </button>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--muted)",
          textAlign: "center",
          marginTop: 10,
        }}
      >
        one signature · EIP-3009 · no gas from your wallet
      </div>
    </div>
  );
}
