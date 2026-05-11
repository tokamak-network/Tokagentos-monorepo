/**
 * TopupView — EIP-3009 sign + settle top-up flow.
 *
 * Flow (Decision Z41):
 *   1. User enters USD amount → GET /v1/topup/info + POST /v1/topup/quote
 *   2. UI builds EIP-3009 TransferWithAuthorization typed data
 *   3. User's ethers v6 signer signs via signer.signTypedData(domain, types, message)
 *   4. UI decomposes signature → POST /v1/topup/settle { topupId, signature: {v,r,s} }
 *
 * Uses ethers v6 (existing dep — Decision Z39). No wagmi / viem added.
 */

import { Button, Input, PagePanel } from "@tokagentos/ui";
import type { BrowserProvider, Eip1193Provider, JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useState } from "react";
import {
  buildTransferWithAuthMessage,
  decomposeSignature,
  formatAttoPton,
  topupIdToNonce,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
} from "./eip712-utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopupInfo {
  chainId: number;
  vaultAddress: `0x${string}`;
  ptonAddress: `0x${string}`;
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
}

interface QuoteResult {
  topupId: string;
  amountPton: string;
  amountUsd: number;
  tonUsd: number;
  expiresAt: string;
  vaultAddress: `0x${string}`;
  ptonAddress: `0x${string}`;
  domain: TopupInfo["domain"];
}

interface SettleResult {
  txHash: string;
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function secondsRemaining(expiresAt: string): number {
  return Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
}

function fmtCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Obtain an ethers v6 signer from window.ethereum.
 * Returns null with an error message if no injected wallet is available.
 */
async function getEthersSigner(): Promise<
  { signer: JsonRpcSigner; address: string } | { error: string }
> {
  const { ethers } = await import("ethers");
  const ethereum = (window as unknown as { ethereum?: Eip1193Provider })
    .ethereum;
  if (!ethereum) {
    return { error: "No Web3 wallet detected. Install MetaMask or another browser wallet." };
  }
  try {
    const provider: BrowserProvider = new ethers.BrowserProvider(ethereum);
    const signer: JsonRpcSigner = await provider.getSigner();
    const address = await signer.getAddress();
    return { signer, address };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Could not connect to wallet.",
    };
  }
}

// ---------------------------------------------------------------------------
// Countdown component
// ---------------------------------------------------------------------------

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(() => secondsRemaining(expiresAt));

  useEffect(() => {
    const id = setInterval(() => {
      setSecs(secondsRemaining(expiresAt));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (secs <= 0)
    return <span className="text-danger font-semibold">Expired</span>;
  return (
    <span
      className={secs < 60 ? "text-warning font-semibold" : "text-muted"}
    >
      {fmtCountdown(secs)} remaining
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TopupView(): React.ReactElement {
  // Quote state
  const [amountUsd, setAmountUsd] = useState("10");
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Settle state
  const [settling, setSettling] = useState(false);
  const [settleResult, setSettleResult] = useState<SettleResult | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);

  // Check if quote is expired
  const quoteExpired =
    quote !== null && secondsRemaining(quote.expiresAt) === 0;

  // ---------------------------------------------------------------------------
  // Get quote
  // ---------------------------------------------------------------------------

  const handleGetQuote = useCallback(async () => {
    const usdVal = parseFloat(amountUsd);
    if (!Number.isFinite(usdVal) || usdVal <= 0) {
      setQuoteError("Enter a positive USD amount.");
      return;
    }
    setQuoting(true);
    setQuoteError(null);
    setQuote(null);
    setSettleResult(null);
    setSettleError(null);
    try {
      const res = await fetch("/v1/topup/quote", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: usdVal }),
      });
      if (res.status === 401) {
        setQuoteError("Sign in before getting a top-up quote.");
        return;
      }
      if (res.status === 503) {
        setQuoteError(
          "Price oracle unavailable — no fresh TON/USD price. Try again shortly.",
        );
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setQuoteError(json.error ?? `Unexpected error (${res.status}).`);
        return;
      }
      const json = (await res.json()) as QuoteResult;
      setQuote(json);
    } catch {
      setQuoteError("Network error — could not fetch quote.");
    } finally {
      setQuoting(false);
    }
  }, [amountUsd]);

  // ---------------------------------------------------------------------------
  // Sign + settle
  // ---------------------------------------------------------------------------

  const handleSettle = useCallback(async () => {
    if (!quote || quoteExpired) return;

    setSettling(true);
    setSettleError(null);
    setSettleResult(null);

    try {
      // 1. Get ethers signer
      const signerResult = await getEthersSigner();
      if ("error" in signerResult) {
        setSettleError(signerResult.error);
        return;
      }
      const { signer, address } = signerResult;

      // 2. Fetch domain info (may have been loaded with quote but fetch fresh to be safe)
      const domain = quote.domain;

      // 3. Build the EIP-3009 typed data
      const nonce = topupIdToNonce(quote.topupId);
      const now = Math.floor(Date.now() / 1000);
      const validBefore = now + 3600; // 1-hour window

      const message = buildTransferWithAuthMessage({
        from: address as `0x${string}`,
        to: quote.vaultAddress,
        valueAttoPton: BigInt(quote.amountPton),
        validAfterUnix: 0,
        validBeforeUnix: validBefore,
        nonceHex: nonce,
      });

      // 4. Sign with ethers v6
      let rawSig: string;
      try {
        rawSig = await signer.signTypedData(
          domain,
          TRANSFER_WITH_AUTHORIZATION_TYPES,
          message,
        );
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message.includes("rejected") ||
            err.message.includes("denied") ||
            err.message.includes("cancelled") ||
            err.message.includes("ACTION_REJECTED"))
        ) {
          setSettleError("Signing rejected — no transaction was sent.");
        } else {
          setSettleError(
            err instanceof Error
              ? err.message
              : "Signing failed — unknown error.",
          );
        }
        return;
      }

      // 5. Decompose signature
      let sig: { v: number; r: `0x${string}`; s: `0x${string}` };
      try {
        sig = decomposeSignature(rawSig);
      } catch (err) {
        setSettleError(
          `Signature decomposition failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }

      // 6. POST /v1/topup/settle
      const res = await fetch("/v1/topup/settle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topupId: quote.topupId, signature: sig }),
      });

      if (res.status === 402) {
        setSettleError(
          "EIP-3009 signature verification failed. Ensure you signed with the correct wallet.",
        );
        return;
      }
      if (res.status === 409) {
        const json = (await res.json().catch(() => ({}))) as {
          txHash?: string;
        };
        setSettleError(
          `Quote already settled${json.txHash ? ` (tx: ${json.txHash.slice(0, 14)}…)` : ""}. Check your credit balance.`,
        );
        return;
      }
      if (res.status === 429) {
        setSettleError("Rate limit exceeded on settle path. Try again later.");
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setSettleError(json.error ?? `Unexpected error (${res.status}).`);
        return;
      }

      const result = (await res.json()) as SettleResult;
      setSettleResult(result);
      setQuote(null); // clear quote — it's consumed
    } catch {
      setSettleError("Network error during settle.");
    } finally {
      setSettling(false);
    }
  }, [quote, quoteExpired]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 px-3 py-4 xl:px-5 xl:py-6">
      {/* Header */}
      <div>
        <div className="text-xs-tight font-semibold uppercase tracking-[0.16em] text-muted/70">
          Billing
        </div>
        <div className="mt-1 text-xl font-semibold text-txt">Top Up</div>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Deposit PTON credits via an EIP-3009 signed transfer. Your browser
          wallet must hold enough PTON on the configured network.
        </p>
      </div>

      {/* Success banner */}
      {settleResult ? (
        <PagePanel variant="section" className="border-ok/30 bg-ok/5 p-5">
          <div className="text-sm font-semibold text-ok">
            Top-up submitted on-chain!
          </div>
          <div className="mt-1 text-xs text-muted break-all">
            Transaction hash:{" "}
            <span className="font-mono text-txt">{settleResult.txHash}</span>
          </div>
          <div className="mt-2 text-xs text-muted">
            Your credit balance will update once the transaction is confirmed.
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettleResult(null)}
            className="mt-3 h-7 rounded-full px-2.5 text-2xs font-semibold"
          >
            New top-up
          </Button>
        </PagePanel>
      ) : null}

      {/* Quote section */}
      {!settleResult ? (
        <PagePanel variant="section" className="p-5 space-y-4">
          <div className="text-sm font-semibold text-txt">
            Step 1 — Get a quote
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-3 flex items-center text-muted text-sm pointer-events-none">
                $
              </span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleGetQuote();
                }}
                placeholder="10.00"
                disabled={quoting}
                className="h-9 rounded-xl pl-7 pr-3 text-sm"
              />
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => void handleGetQuote()}
              disabled={quoting}
              className="h-9 rounded-xl px-4 text-sm font-semibold"
            >
              {quoting ? "Quoting…" : "Get Quote"}
            </Button>
          </div>

          {quoteError ? (
            <div className="text-xs text-danger">{quoteError}</div>
          ) : null}

          {quote ? (
            <PagePanel variant="inset" className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">Amount (PTON)</span>
                <span className="text-sm font-semibold tabular-nums text-txt">
                  {formatAttoPton(BigInt(quote.amountPton))} PTON
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">USD equivalent</span>
                <span className="text-sm font-semibold tabular-nums text-txt">
                  ${quote.amountUsd.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">TON/USD rate</span>
                <span className="text-sm tabular-nums text-txt">
                  ${quote.tonUsd.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border/30 pt-2">
                <span className="text-xs text-muted">Quote expires</span>
                <span className="text-xs">
                  <Countdown expiresAt={quote.expiresAt} />
                </span>
              </div>
            </PagePanel>
          ) : null}
        </PagePanel>
      ) : null}

      {/* Sign + settle section */}
      {!settleResult ? (
        <PagePanel variant="section" className="p-5 space-y-4">
          <div className="text-sm font-semibold text-txt">
            Step 2 — Sign & settle
          </div>
          <p className="text-xs text-muted">
            Clicking &ldquo;Top Up&rdquo; will open your browser wallet and
            ask you to sign an EIP-3009 off-chain authorization. No gas is
            required for signing — the server submits the on-chain transaction.
          </p>

          <Button
            variant="default"
            size="sm"
            onClick={() => void handleSettle()}
            disabled={settling || !quote || quoteExpired}
            className="h-9 rounded-xl px-5 text-sm font-semibold"
          >
            {settling
              ? "Signing & settling…"
              : !quote
                ? "Get a quote first"
                : quoteExpired
                  ? "Quote expired — re-quote"
                  : "Top Up"}
          </Button>

          {settleError ? (
            <div className="text-xs text-danger">{settleError}</div>
          ) : null}

          {quoteExpired && quote ? (
            <div className="text-xs text-warning">
              Quote expired.{" "}
              <button
                type="button"
                className="underline text-accent"
                onClick={() => {
                  setQuote(null);
                  setSettleError(null);
                }}
              >
                Get a new quote
              </button>
            </div>
          ) : null}
        </PagePanel>
      ) : null}

      {/* Info panel */}
      <PagePanel variant="inset" className="px-4 py-3">
        <div className="text-xs text-muted space-y-1">
          <div className="font-semibold text-txt text-xs-tight">
            How it works
          </div>
          <div>
            1. The server computes how many PTON tokens equal your USD amount
            at the current TWAP rate.
          </div>
          <div>
            2. You sign an EIP-3009 <code>TransferWithAuthorization</code> typed
            message — no ETH gas required.
          </div>
          <div>
            3. The server calls <code>ClaudeVault.depositX402()</code> with your
            signed authorization, crediting your account.
          </div>
        </div>
      </PagePanel>
    </div>
  );
}
