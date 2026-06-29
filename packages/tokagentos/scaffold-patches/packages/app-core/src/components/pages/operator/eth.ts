/**
 * Minimal EIP-1193 transport for the operator x402 on-chain flows.
 *
 * SELF-CONTAINED: imports nothing. window.ethereum (injected wallet) + a plain
 * same-origin / public-RPC `fetch` are the only transports. No ethers, no
 * @tokagentos/@tokagent, no app-core internals.
 *
 * Behaviour is a verbatim port of the mainnet-proven dashboard `app.js` RPC
 * plumbing (`rpc` L389-392, `ensureChain` L405-445, `publicEthCall` L1269-1278,
 * `_sendAndWait` L1009-1024, `chainNowSec` L649-660). Line citations below
 * point at that source of truth.
 */

// ---------------------------------------------------------------------------
// EIP-1193 provider access.
// ---------------------------------------------------------------------------

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

/** The injected wallet, or throw a friendly error. (app.js L385-387, L471-472) */
function provider(): Eip1193Provider {
  const eth = (globalThis as { ethereum?: Eip1193Provider }).ethereum;
  if (!eth) {
    throw new Error("No browser wallet detected (window.ethereum is missing).");
  }
  return eth;
}

/** Raw EIP-1193 request to the injected wallet. (app.js L389-392, `rpc`) */
async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  return provider().request({ method, params });
}

// ---------------------------------------------------------------------------
// Account + chain.
// ---------------------------------------------------------------------------

/**
 * Prompt the wallet for accounts and return the lowercased authorized list.
 * (app.js connect flow L470-499 — simplified to eth_requestAccounts.)
 */
export async function requestAccounts(): Promise<string[]> {
  const accounts = (await rpc("eth_requestAccounts")) as string[] | null;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("Wallet returned no accounts.");
  }
  return accounts;
}

/** Current wallet chainId as a number (parsed from the `0x…` hex). (app.js L407) */
export async function getChainId(): Promise<number> {
  const hex = (await rpc("eth_chainId")) as string;
  return Number.parseInt(hex, 16);
}

/** Metadata used to register an unknown chain (EIP-3085 add payload). */
export interface ChainAddMeta {
  name: string;
  rpcUrl: string;
  /** Native currency symbol; defaults to "ETH". */
  currency?: string;
  /** Optional block explorer URL (omitted from the add call when blank). */
  explorer?: string;
}

/**
 * Ensure the wallet is on `chainId`, switching (and adding via EIP-3085 on the
 * 4902 "unrecognized chain" error) when needed. Returns nothing; throws with a
 * clearer message on user rejection. (app.js L405-445, `ensureChain`.)
 */
export async function ensureChain(
  chainId: number,
  meta?: ChainAddMeta,
): Promise<void> {
  const wantHex = `0x${chainId.toString(16)}`;
  const current = (await rpc("eth_chainId")) as string;
  if (
    typeof current === "string" &&
    current.toLowerCase() === wantHex.toLowerCase()
  ) {
    return;
  }
  try {
    await rpc("wallet_switchEthereumChain", [{ chainId: wantHex }]);
  } catch (err) {
    // 4902 = chain unknown to wallet. Some wallets surface it as -32603 with a
    // nested code. Detect both before falling through to "add then switch".
    // (app.js L416-417)
    const e = err as {
      code?: number;
      message?: string;
      data?: { originalError?: { code?: number } };
    } | null;
    const code = e?.code ?? e?.data?.originalError?.code;
    const isUnknownChain =
      code === 4902 ||
      (code === -32603 &&
        /unrecognized|not added|unknown/i.test(e?.message ?? ""));
    if (!isUnknownChain) {
      // 4001 = user rejected. (app.js L421)
      if (code === 4001) throw new Error("Network switch was rejected.");
      throw err;
    }
    if (!meta) throw err; // no add payload available — cannot register the chain
    // blockExplorerUrls is sensitive — omit when blank or wallets reject the
    // call. (app.js L424-433)
    const addParams: {
      chainId: string;
      chainName: string;
      rpcUrls: string[];
      nativeCurrency: { name: string; symbol: string; decimals: number };
      blockExplorerUrls?: string[];
    } = {
      chainId: wantHex,
      chainName: meta.name,
      rpcUrls: [meta.rpcUrl],
      nativeCurrency: {
        name: meta.currency ?? "ETH",
        symbol: meta.currency ?? "ETH",
        decimals: 18,
      },
    };
    if (meta.explorer) addParams.blockExplorerUrls = [meta.explorer];
    await rpc("wallet_addEthereumChain", [addParams]);
    // MetaMask normally switches after add; some wallets don't, so re-issue and
    // ignore "already on" (-32602). (app.js L437-441)
    try {
      await rpc("wallet_switchEthereumChain", [{ chainId: wantHex }]);
    } catch (err2) {
      if ((err2 as { code?: number } | null)?.code !== -32602) throw err2;
    }
  }
}

// ---------------------------------------------------------------------------
// eth_call (two transports: wallet vs public RPC fetch).
// ---------------------------------------------------------------------------

/**
 * `eth_call` via the injected wallet. Returns the raw `0x…` hex result. Pass
 * `from` when simulating a state-changing call (e.g. transferFrom-backed
 * deposits) so msg.sender-dependent checks (allowance/balance) evaluate against
 * the real caller instead of the zero address.
 */
export async function ethCall(tx: {
  to: string;
  data: string;
  from?: string;
}): Promise<string> {
  const call: { to: string; data: string; from?: string } = {
    to: tx.to,
    data: tx.data,
  };
  if (tx.from) call.from = tx.from;
  const hex = (await rpc("eth_call", [call, "latest"])) as string;
  return hex;
}

/**
 * Best-effort decode of a revert reason from a wallet/RPC error: the standard
 * `Error(string)` payload (selector 0x08c379a0) across the various provider
 * error shapes, else the trimmed `execution reverted: …` message.
 */
export function decodeRevertReason(err: unknown): string {
  const e = err as {
    message?: string;
    data?: unknown;
    error?: { data?: unknown; message?: string };
  } | null;
  const nestedData = (e?.data as { data?: string } | undefined)?.data;
  const dataHex =
    (typeof e?.data === "string" && e.data) ||
    (typeof nestedData === "string" && nestedData) ||
    (typeof e?.error?.data === "string" && e.error.data) ||
    "";
  if (dataHex.startsWith("0x08c379a0") && dataHex.length >= 138) {
    try {
      const len = Number.parseInt(dataHex.slice(74, 138), 16);
      const strHex = dataHex.slice(138, 138 + len * 2);
      let s = "";
      for (let i = 0; i < strHex.length; i += 2) {
        s += String.fromCharCode(Number.parseInt(strHex.slice(i, i + 2), 16));
      }
      if (s) return s;
    } catch {
      /* fall through to message parsing */
    }
  }
  const msg = e?.message || e?.error?.message || "";
  const m = /execution reverted:?\s*(.*)/i.exec(msg);
  return (m?.[1] || msg || "reverted").trim();
}

/**
 * `eth_call` against an arbitrary public RPC URL via a same-origin/CORS fetch
 * (no wallet, no chain switch). Used to read balances/credits on a chain the
 * wallet is NOT currently on. (app.js L1269-1278, `publicEthCall`.)
 */
export async function publicEthCall(
  rpcUrl: string,
  to: string,
  data: string,
): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const j = (await res.json()) as {
    result?: string;
    error?: { message?: string };
  };
  if (j.error) throw new Error(j.error.message || "eth_call failed");
  return j.result as string;
}

/**
 * Native balance of `addr` as a bigint (wei). Uses the public RPC when `rpcUrl`
 * is supplied (off-chain read), else the injected wallet. (app.js L1312.)
 */
export async function ethGetBalance(
  addr: string,
  rpcUrl?: string,
): Promise<bigint> {
  if (rpcUrl) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [addr, "latest"],
      }),
    });
    const j = (await res.json()) as {
      result?: string;
      error?: { message?: string };
    };
    if (j.error) throw new Error(j.error.message || "eth_getBalance failed");
    return BigInt(j.result ?? "0x0");
  }
  const hex = (await rpc("eth_getBalance", [addr, "latest"])) as string;
  return BigInt(hex);
}

// ---------------------------------------------------------------------------
// Transactions.
// ---------------------------------------------------------------------------

interface TxReceipt {
  status?: string;
  transactionHash?: string;
  [k: string]: unknown;
}

/**
 * Submit a tx from the active wallet account and poll for its receipt. Throws
 * if the receipt reports failure (status !== "0x1") or the 90s timeout elapses.
 * (app.js L1009-1024, `_sendAndWait`.)
 *
 * @returns the mined transaction receipt
 */
export async function sendTxAndWait(tx: {
  to: string;
  data: string;
  value?: bigint;
}): Promise<TxReceipt> {
  const accounts = (await rpc("eth_accounts")) as string[] | null;
  const from = accounts?.[0];
  if (!from) throw new Error("No active wallet account.");
  const txParams: { from: string; to: string; data: string; value?: string } = {
    from,
    to: tx.to,
    data: tx.data,
  };
  // Only attach value when > 0. (app.js L1012)
  if (tx.value !== undefined && tx.value > 0n) {
    txParams.value = "0x" + tx.value.toString(16);
  }
  const txHash = (await rpc("eth_sendTransaction", [txParams])) as string;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const rcpt = (await rpc("eth_getTransactionReceipt", [
      txHash,
    ])) as TxReceipt | null;
    if (rcpt) {
      if (rcpt.status === "0x1") return rcpt;
      throw new Error(`tx ${txHash} reverted on-chain`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`tx ${txHash} receipt timeout after 90s`);
}

// ---------------------------------------------------------------------------
// Chain time.
// ---------------------------------------------------------------------------

/**
 * Best-effort current chain time in epoch seconds. Reads the latest block's
 * timestamp via the wallet; falls back to wall-clock seconds if that fails.
 * (app.js L649-660, `chainNowSec`.)
 */
export async function chainNowSec(): Promise<bigint> {
  try {
    const block = (await rpc("eth_getBlockByNumber", ["latest", false])) as {
      timestamp?: string;
    } | null;
    if (block?.timestamp) return BigInt(block.timestamp);
  } catch {
    // Fall through to wall-clock.
  }
  return BigInt(Math.floor(Date.now() / 1000));
}
