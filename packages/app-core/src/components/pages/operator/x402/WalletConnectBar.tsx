/**
 * x402 · Wallet connect + gateway sign-in bar — inline funding-wallet status.
 *
 * Three states:
 *   (a) no wallet           → "Connect wallet" (eip712.connectWallet → onConnect)
 *   (b) connected, !signedIn → address chip + "Sign in" (SIWE → bearer session)
 *   (c) signedIn            → address chip + "signed in" ok chip + "Sign out"
 *
 * The gateway's /v1 routes are bearer-auth gated; connecting a wallet is not
 * enough — the user must also SIWE sign-in to mint the session. Self-contained:
 * window.ethereum via ../eip712 + ../auth only, no ethers / app-core imports.
 */
import { useCallback, useState } from "react";
import { signOut, siweLogin, useAuth } from "../auth";
import {
  connectWallet,
  hasInjectedWallet,
  SignatureRejectedError,
} from "../eip712";

/** Shorten an EVM address to 0x1234…cdef. */
function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function AddressChip({ address }: { address: string }) {
  return (
    <span
      className="chip ok"
      style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
      title={address}
    >
      <span
        className="dot-pulse"
        style={{
          background: "var(--ok-bright)",
          boxShadow: "0 0 6px var(--ok-bright)",
        }}
      />
      <span className="mono">{shortAddr(address)}</span>
    </span>
  );
}

export function WalletConnectBar({
  address,
  onConnect,
}: {
  address: string | null;
  onConnect: (a: string) => void;
}) {
  const { signedIn } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletPresent = hasInjectedWallet();

  const onConnectClick = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const addr = await connectWallet();
      onConnect(addr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }, [connecting, onConnect]);

  const onSignInClick = useCallback(async () => {
    if (signingIn || !address) return;
    setSigningIn(true);
    setError(null);
    try {
      // On success, useAuth() flips `signedIn` via the auth pub/sub.
      await siweLogin(address);
    } catch (e) {
      setError(
        e instanceof SignatureRejectedError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Sign-in failed.",
      );
    } finally {
      setSigningIn(false);
    }
  }, [signingIn, address]);

  const errLine = error ? (
    <span className="mono" style={{ fontSize: 11, color: "var(--gold-hi)" }}>
      {error}
    </span>
  ) : null;

  // (a) No wallet connected → Connect.
  if (!address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          className="btn btn-gold btn-sm"
          onClick={onConnectClick}
          disabled={connecting || !walletPresent}
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
        {!walletPresent && (
          <span
            className="mono"
            style={{ fontSize: 11, color: "var(--muted)" }}
          >
            No Web3 wallet detected
          </span>
        )}
        {errLine}
      </div>
    );
  }

  // (c) Connected AND signed in → address + signed-in chip + Sign out.
  if (signedIn) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <AddressChip address={address} />
        <span className="chip ok" style={{ display: "inline-flex" }}>
          ✓ signed in
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => signOut()}
        >
          Sign out
        </button>
        {errLine}
      </div>
    );
  }

  // (b) Connected but NOT signed in → address + Sign in (SIWE).
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <AddressChip address={address} />
      <button
        type="button"
        className="btn btn-gold btn-sm"
        onClick={onSignInClick}
        disabled={signingIn}
      >
        {signingIn ? "Signing in…" : "Sign in"}
      </button>
      {errLine}
    </div>
  );
}
