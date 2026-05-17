/**
 * React hook that wraps `sendX402Message` with the browser-wallet flow.
 *
 * Use when the user has NOT configured a billing API key. Each call:
 *   1. Asks the user's wallet to sign a TransferWithAuthorization,
 *   2. Drives the x402 dance against `/v1/messages`,
 *   3. Returns the parsed model response + billing headers.
 *
 * The hook surfaces UI-ready state — `signing`, `sending`, `error`, `result`
 * — so callers can render a "Sign to pay X PTON" modal without managing
 * the orchestration themselves.
 */

import { useCallback, useState } from "react";
import {
  sendX402Message,
  X402Error,
  type SendX402MessageResult,
  type SignTypedDataRequest,
  type X402MessagesRequest,
} from "./x402-send.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type X402ChatStatus =
  | { kind: "idle" }
  | { kind: "probing" }
  | { kind: "awaiting_signature"; preview: SignTypedDataRequest["preview"] }
  | { kind: "settling" }
  | { kind: "done"; result: SendX402MessageResult }
  | { kind: "error"; message: string; code?: string };

export interface UseX402ChatSendOptions {
  /** Base URL of the gateway. Same-origin = ""; remote = e.g. "http://localhost:3000". */
  proxyBase: string;
}

export interface UseX402ChatSendReturn {
  status: X402ChatStatus;
  /** Sends a message through the x402 dance. Returns the result or null on error. */
  send: (request: X402MessagesRequest) => Promise<SendX402MessageResult | null>;
  /** Reset the hook back to `idle`. Call after the user dismisses the result. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useX402ChatSend(
  opts: UseX402ChatSendOptions,
): UseX402ChatSendReturn {
  const [status, setStatus] = useState<X402ChatStatus>({ kind: "idle" });

  const send = useCallback(
    async (
      request: X402MessagesRequest,
    ): Promise<SendX402MessageResult | null> => {
      setStatus({ kind: "probing" });

      // ---- Connect wallet on-demand (mirrors TopupView pattern) ----
      let signer: import("ethers").JsonRpcSigner;
      let fromAddress: `0x${string}`;
      try {
        const { ethers } = await import("ethers");
        const ethereum = (window as unknown as {
          ethereum?: import("ethers").Eip1193Provider;
        }).ethereum;
        if (!ethereum) {
          setStatus({
            kind: "error",
            message:
              "No Web3 wallet detected. Install MetaMask (or another browser wallet) to pay with PTON.",
          });
          return null;
        }
        const provider = new ethers.BrowserProvider(ethereum);
        signer = await provider.getSigner();
        fromAddress = (await signer.getAddress()) as `0x${string}`;
      } catch (err) {
        setStatus({
          kind: "error",
          message:
            err instanceof Error
              ? `Wallet connect failed: ${err.message}`
              : "Wallet connect failed.",
        });
        return null;
      }

      // ---- Drive the dance ----
      try {
        const result = await sendX402Message({
          proxyBase: opts.proxyBase,
          request,
          fromAddress,
          signTypedData: async (req) => {
            setStatus({ kind: "awaiting_signature", preview: req.preview });
            const sig = await signer.signTypedData(
              req.domain,
              req.types,
              req.message,
            );
            setStatus({ kind: "settling" });
            return sig;
          },
        });
        setStatus({ kind: "done", result });
        return result;
      } catch (err) {
        if (err instanceof X402Error) {
          setStatus({
            kind: "error",
            message: err.message,
            code: err.code,
          });
        } else {
          setStatus({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
        return null;
      }
    },
    [opts.proxyBase],
  );

  const reset = useCallback(() => setStatus({ kind: "idle" }), []);

  return { status, send, reset };
}
