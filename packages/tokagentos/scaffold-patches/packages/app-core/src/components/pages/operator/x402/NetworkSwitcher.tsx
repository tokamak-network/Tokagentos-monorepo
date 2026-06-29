/**
 * x402 · Network switcher — pick the top-up chain (Base / Ethereum).
 *
 * One token-btn chip per TOPUP_CHAINS entry; selecting a chain lifts it via
 * onChange AND, when a wallet is connected, asks the injected wallet to switch
 * (rejections are swallowed — the page selection still updates). The choice is
 * persisted in sessionStorage. Self-contained: ../eip712 only.
 */
import { useCallback } from "react";
import { switchWalletChain, TOPUP_CHAINS } from "../eip712";

const STORAGE_KEY = "op.x402.chain";

export function NetworkSwitcher({
  chainId,
  onChange,
  address,
}: {
  chainId: number;
  onChange: (id: number) => void;
  address: string | null;
}) {
  const select = useCallback(
    (id: number) => {
      onChange(id);
      try {
        sessionStorage.setItem(STORAGE_KEY, String(id));
      } catch {
        /* sessionStorage unavailable — selection still applies in-memory */
      }
      if (address) {
        // Best-effort: keep the wallet aligned with the page. A user rejection
        // (or unsupported chain) must not block the page-level selection.
        switchWalletChain(id).catch(() => {});
      }
    },
    [onChange, address],
  );

  return (
    <div
      style={{ display: "flex", gap: 7, flexWrap: "wrap" }}
      role="group"
      aria-label="Top-up network"
    >
      {Object.entries(TOPUP_CHAINS).map(([id, chain]) => {
        const numId = Number(id);
        const active = chainId === numId;
        return (
          <button
            key={id}
            type="button"
            className={`token-btn ${active ? "is-active" : ""}`}
            onClick={() => select(numId)}
            aria-pressed={active}
            style={{ flexDirection: "row", padding: "8px 14px", minWidth: 0 }}
          >
            <span className="token-sym">{chain.name}</span>
          </button>
        );
      })}
    </div>
  );
}
