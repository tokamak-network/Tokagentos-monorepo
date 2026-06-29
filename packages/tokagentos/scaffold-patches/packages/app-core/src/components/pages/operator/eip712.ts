/**
 * EIP-712 / EIP-3009 signing for the operator's NATIVE top-up.
 *
 * Self-contained: `window.ethereum` (eth_signTypedData_v4) + pure helpers, with
 * NO ethers / app-core imports, so it ships into the eliza-based scaffold (the
 * old billing TopupView uses ethers, which the scaffold lacks). Wire-format
 * matches the backend's verifyEip3009Signature (viem). The pure helpers
 * (decomposeSignature / topupIdToNonce / the type list) are ported verbatim from
 * components/pages/billing/eip712-utils.ts.
 */

import { chainNowSec } from "./eth";

export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: `0x${string}`;
}

/**
 * The exact EIP-3009 fields signed over. These MUST be sent to the backend
 * verbatim (via the X-PAYMENT header) — the native plain-body settle path
 * reconstructs validBefore server-side from Date.now(), which diverges from the
 * signed value and fails verification (402). Sending the authorization makes the
 * backend verify against the client's actual bytes.
 */
export interface Eip3009Authorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
}

type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
};
function injectedWallet(): Eip1193 | undefined {
  return (window as unknown as { ethereum?: Eip1193 }).ethereum;
}

/** Supported top-up chains (Base = default/live, Ethereum). */
export const TOPUP_CHAINS: Record<
  number,
  { name: string; hex: `0x${string}` }
> = {
  8453: { name: "Base", hex: "0x2105" },
  1: { name: "Ethereum", hex: "0x1" },
};

/**
 * Decompose a 65-byte hex signature (compact `r || s || v`) into the
 * `{ v, r, s }` shape `POST /v1/topup/settle` expects. eth_signTypedData_v4 and
 * ethers both return this compact form.
 */
export function decomposeSignature(hex: string): {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
} {
  if (!hex.startsWith("0x") || hex.length !== 132) {
    throw new Error(
      `Invalid signature: expected 0x-prefixed 65-byte hex (132 chars), got length ${hex.length}`,
    );
  }
  const r = hex.slice(0, 66) as `0x${string}`;
  const s = `0x${hex.slice(66, 130)}` as `0x${string}`;
  // Normalize the recovery id to 27/28. viem's off-chain verify accepts 0/1,
  // but the on-chain ecrecover in PTON.transferWithAuthorization needs 27/28 —
  // a raw 0/1 passes settle's signature check yet reverts depositX402. (app.js
  // signTopupAuth L707: `if (v < 27) v += 27`.)
  let v = Number.parseInt(hex.slice(130, 132), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}

/**
 * UUID topupId → 32-byte hex nonce, matching the backend's encoding:
 * `0x${topupId.replace(/-/g, "").padStart(64, "0")}`.
 *
 * NOTE: do NOT use this as the EIP-3009 deposit nonce. The backend uses the
 * authorization nonce as the on-chain replay guard (vault topupId == auth.nonce),
 * so a deterministic topupId-derived nonce collides whenever the same quote
 * topupId repeats (e.g. the swap stuck-flow re-credits the same amount) → the
 * on-chain transferWithAuthorization reverts "authorization is used" and
 * depositX402 fails. Use `randomNonce()` for deposits, exactly like app.js.
 */
export function topupIdToNonce(topupId: string): `0x${string}` {
  return `0x${topupId.replace(/-/g, "").padStart(64, "0")}` as `0x${string}`;
}

/**
 * A fresh, unique 32-byte EIP-3009 nonce (32 random bytes). Mirrors app.js
 * `randomNonce()` — every deposit MUST use a new nonce because the on-chain
 * transferWithAuthorization (and the vault's topupId guard) reject a reused one.
 */
export function randomNonce(): `0x${string}` {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  let hex = "0x";
  for (const x of b) hex += x.toString(16).padStart(2, "0");
  return hex as `0x${string}`;
}

const TRANSFER_WITH_AUTHORIZATION_TYPE = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
];
const EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

/** Format attoPTON (1e18 units) as a 4-dp PTON string. */
export function formatAttoPtonAmount(atto: bigint): string {
  const whole = atto / 1_000_000_000_000_000_000n;
  const frac =
    (atto - whole * 1_000_000_000_000_000_000n) / 100_000_000_000_000n;
  return `${whole}.${frac.toString().padStart(4, "0")}`;
}

/** True iff an injected browser wallet is present. */
export function hasInjectedWallet(): boolean {
  return injectedWallet() !== undefined;
}

/** Prompt the wallet for an account; returns the address. */
export async function connectWallet(): Promise<`0x${string}`> {
  const eth = injectedWallet();
  if (!eth) {
    throw new Error(
      "No Web3 wallet detected. Install MetaMask or another browser wallet.",
    );
  }
  const accounts = (await eth.request({
    method: "eth_requestAccounts",
  })) as string[];
  const addr = accounts?.[0];
  if (!addr) throw new Error("No wallet account authorized.");
  return addr as `0x${string}`;
}

/** Read the wallet's current chainId (numeric), or null. */
export async function walletChainId(): Promise<number | null> {
  const eth = injectedWallet();
  if (!eth) return null;
  try {
    const hex = (await eth.request({ method: "eth_chainId" })) as string;
    return Number.parseInt(hex, 16);
  } catch {
    return null;
  }
}

/** Switch the wallet to `chainId`, adding Base (8453) if the wallet lacks it. */
export async function switchWalletChain(chainId: number): Promise<void> {
  const eth = injectedWallet();
  if (!eth) throw new Error("No Web3 wallet detected.");
  const target = TOPUP_CHAINS[chainId];
  if (!target) throw new Error(`Unsupported chain ${chainId}`);
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: target.hex }],
    });
  } catch (err) {
    // 4902 = chain not added. For Base, add then retry.
    const code = (err as { code?: number } | null)?.code;
    if (code === 4902 && chainId === 8453) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: target.hex,
            chainName: "Base",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://mainnet.base.org"],
            blockExplorerUrls: ["https://basescan.org"],
          },
        ],
      });
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: target.hex }],
      });
    } else {
      throw err;
    }
  }
}

/** Raised when the user rejects the signature request. */
export class SignatureRejectedError extends Error {}

/**
 * Sign an EIP-3009 TransferWithAuthorization for `quote` via
 * eth_signTypedData_v4 and return the decomposed `{ v, r, s }`.
 * `validAfter` is 0 and `validBefore` is now + 1h (matches the old TopupView).
 */
export async function signTransferWithAuthorization(args: {
  address: `0x${string}`;
  domain: Eip712Domain;
  to: `0x${string}`;
  valueAttoPton: string;
  nonceHex: `0x${string}`;
}): Promise<{
  signature: { v: number; r: `0x${string}`; s: `0x${string}` };
  authorization: Eip3009Authorization;
}> {
  const eth = injectedWallet();
  if (!eth) throw new Error("No Web3 wallet detected.");
  // Skew-tolerant validity window anchored to ON-CHAIN block time, ±1 year —
  // ported verbatim from app.js topUp (L735-738, chainNowSec L649-660). The old
  // wall-clock now+1h window risked the on-chain EIP-3009 transferWithAuthorization
  // reverting (it enforces validAfter < block.timestamp < validBefore) under
  // client-clock / chain-time skew or multi-step swap latency.
  const ONE_YEAR_SEC = 31_536_000n;
  const now = await chainNowSec();
  const validAfter = (now - ONE_YEAR_SEC).toString();
  const validBefore = (now + ONE_YEAR_SEC).toString();
  const typedData = {
    types: {
      EIP712Domain: EIP712_DOMAIN_TYPE,
      TransferWithAuthorization: TRANSFER_WITH_AUTHORIZATION_TYPE,
    },
    domain: args.domain,
    primaryType: "TransferWithAuthorization",
    message: {
      from: args.address,
      to: args.to,
      value: args.valueAttoPton,
      validAfter,
      validBefore,
      nonce: args.nonceHex,
    },
  };
  let rawSig: string;
  try {
    rawSig = (await eth.request({
      method: "eth_signTypedData_v4",
      params: [args.address, JSON.stringify(typedData)],
    })) as string;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: number } | null)?.code;
    if (code === 4001 || /reject|denied|cancel|ACTION_REJECTED/i.test(msg)) {
      throw new SignatureRejectedError(
        "Signing rejected — no transaction was sent.",
      );
    }
    throw err instanceof Error ? err : new Error(msg);
  }
  return {
    signature: decomposeSignature(rawSig),
    authorization: {
      from: args.address,
      to: args.to,
      value: args.valueAttoPton,
      validAfter,
      validBefore,
      nonce: args.nonceHex,
    },
  };
}
