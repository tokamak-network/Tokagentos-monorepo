/**
 * On-chain funding ORCHESTRATORS for the operator x402 rail.
 *
 * Pure (non-React) step sequencers that drive the three "get PTON into your
 * wallet" paths, then credit the ClaudeVault via the gasless EIP-3009 top-up:
 *   - runGetPton    — wrap underlying TON → PTON (approve + PTON.deposit)
 *   - runBridge     — lock TON on Ethereum L1 → bridged L2 TON (OP-Stack)
 *   - runSwapToPton — Ethereum-only DEX pipeline USDC/USDT/ETH/WBTC → … → PTON,
 *                     then the EIP-3009 credit
 *
 * Each takes an `onStatus(msg, kind)` callback so the calling component can show
 * an inline per-step status line instead of mutating the DOM (app.js used
 * `setStatus(el, …)`; we hoist that out to the caller).
 *
 * SOURCE OF TRUTH — every calldata encoding + step sequence is a VERBATIM port
 * of the mainnet-proven billing dashboard `app.js`:
 *   packages/tokagentos/templates/fullstack-app/plugins/plugin-tokagent-billing/
 *     src/dashboard/app.js
 * Line citations (e.g. "app.js L1046-1234") point at that source. The hardcoded
 * Ethereum-mainnet swap constants are immutable and copied verbatim from
 * app.js L811-834. Do NOT invent encodings or selectors.
 *
 * SELF-CONTAINED: imports ONLY operator-local siblings (../abi-encode, ../eth,
 * ../chain-config) plus ../client-billing + ../eip712. No ethers, no
 * @tokagentos/@tokagent, no app-core internals. window.ethereum + same-origin
 * fetch only.
 *
 * UNITS — three coexist on the swap route, kept distinct in BigInt space:
 *   • atto (1e18) — TON / PTON "wei". `ATTO` below; `parseUnits(x,18)`.
 *   • ray  (1e27) — WTON's native decimals. The quoter returns WTON in ray and
 *                   the router's minOut is in ray. `WTON_RAY_PER_WEI = 1e9`
 *                   converts ray→atto (`rayWton / 1e9 = weiTon`). app.js L819-834.
 *   • token native — USDC/USDT are 6d, WBTC 8d, ETH/WETH 18d. `parseUnits` uses
 *                   each token's `decimals` from SWAP_ADDRESSES.
 */
import {
  encApprove,
  encBridgeDepositERC20To,
  encDeposit,
  encExactInput,
  encQuoteExactInput,
  encUniV3Path,
  encWtonSwapToTON,
  type UniV3Leg,
} from "./abi-encode";
import { getToken } from "./auth";
import {
  chainMeta,
  type DashboardConfig,
  loadDashboardConfig,
  proxyBase,
} from "./chain-config";
import {
  fetchTopupInfo,
  type SettleOutcome,
  settleTopup,
} from "./client-billing";
import {
  type Eip712Domain,
  randomNonce,
  signTransferWithAuthorization,
} from "./eip712";
import {
  type ChainAddMeta,
  decodeRevertReason,
  ensureChain,
  ethCall,
  ethGetBalance,
  getChainId,
  publicEthCall,
  requestAccounts,
  sendTxAndWait,
} from "./eth";

// ---------------------------------------------------------------------------
// Status callback contract — the React caller renders this inline.
// ---------------------------------------------------------------------------

export type StatusKind = "info" | "ok" | "err";
export type OnStatus = (msg: string, kind?: StatusKind) => void;

// ---------------------------------------------------------------------------
// Unit constants. (app.js L144, L834)
// ---------------------------------------------------------------------------

/** 1e18 — atto (TON/PTON "wei"). (app.js L144) */
const ATTO = 10n ** 18n;
/** WTON is 27d (ray), TON/PTON are 18d → ratio 1e9. (app.js L834) */
const WTON_RAY_PER_WEI = 10n ** 9n;

// ---------------------------------------------------------------------------
// Hardcoded Ethereum-mainnet swap constants — IMMUTABLE, copied VERBATIM from
// app.js L811-834. (Route verified on-chain 2026-05-20.)
// ---------------------------------------------------------------------------

interface SwapTokenCfg {
  address: string | null;
  decimals: number;
  /** uint24 fee of the token↔WETH pool, or null for native ETH. */
  weth_fee: number | null;
}

/** app.js L822-827 */
const SWAP_ADDRESSES: Record<string, SwapTokenCfg> = {
  USDC: {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    weth_fee: 500 /* 0.05% */,
  },
  USDT: {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    weth_fee: 500,
  },
  WBTC: {
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    decimals: 8,
    weth_fee: 3000 /* 0.3% */,
  },
  ETH: { address: null, decimals: 18, weth_fee: null /* native */ },
};
const SWAP_WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // app.js L828
const SWAP_WTON = "0xc4A11aaf6ea915Ed7Ac194161d2fC9384F15bff2"; // app.js L829
const SWAP_TON = "0x2be5e8c109e2197D077D13A82dAead6a9b3433C5"; // app.js L830
const SWAP_ROUTER02 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"; // app.js L831
const SWAP_QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"; // app.js L832
const SWAP_WTON_FEE = 3000; // WETH/WTON pool fee. app.js L833

/** The tokens the Swap card offers as inputs (mainnet-only). */
export const SWAP_TOKENS = ["USDC", "USDT", "ETH", "WBTC"] as const;
export type SwapToken = (typeof SWAP_TOKENS)[number];

// ---------------------------------------------------------------------------
// Pure unit helpers — ported from app.js parseUnits/formatUnits (L873-895).
// ---------------------------------------------------------------------------

/**
 * Float/string → BigInt of `decimals` smallest units, with no FP drift for sane
 * decimal strings. (app.js L873-881, `parseUnits`.)
 */
export function parseUnits(amount: string | number, decimals: number): bigint {
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s))
    throw new Error(`parseUnits: bad amount "${amount}"`);
  const [wholeStr, fracStr = ""] = s.split(".");
  const fracPadded = (fracStr + "0".repeat(decimals)).slice(0, decimals);
  const combined = (wholeStr === "0" ? "" : wholeStr) + fracPadded;
  const cleaned = combined.replace(/^0+/, "") || "0";
  return BigInt(cleaned);
}

/**
 * BigInt → display string with `decimals` precision, trimmed to `displayDigits`.
 * (app.js L884-895, `formatUnits`.)
 */
export function formatUnits(
  value: bigint,
  decimals: number,
  displayDigits = 6,
): string {
  const big = value;
  const neg = big < 0n;
  const abs = neg ? -big : big;
  const denom = 10n ** BigInt(decimals);
  const whole = abs / denom;
  const frac = abs % denom;
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, displayDigits);
  const trimmed = fracStr.replace(/0+$/, "");
  const body =
    trimmed.length === 0 ? whole.toString() : `${whole.toString()}.${trimmed}`;
  return neg ? "-" + body : body;
}

// ---------------------------------------------------------------------------
// friendlyError — map known revert selectors / patterns to human messages,
// else trim viem's verbose dump to its first line. (app.js L2424-2437.)
// ---------------------------------------------------------------------------

/**
 * @param msg the raw error message
 * @param chainId the selected chain (changes the no-PTON guidance, app.js L2429)
 */
export function friendlyError(msg: unknown, chainId?: number): string {
  const m = String((msg as { message?: string })?.message ?? msg ?? "");
  if (m.includes("0xe450d38c") || /ERC20InsufficientBalance/i.test(m)) {
    // app.js L2426-2432
    return chainId === 1
      ? "You have no PTON on Ethereum. Switch the network to Base to bridge TON → wrap → top up, or use the Swap card."
      : 'Insufficient PTON on this network — bridge TON from Ethereum, then use "Get PTON" to wrap TON → PTON first.';
  }
  if (/insufficient funds/i.test(m))
    return "Insufficient native gas (ETH) on this network.";
  if (/AuthorizationExpired|expired/i.test(m))
    return "Authorization expired — re-quote and try again.";
  if (/User rejected|reject|denied|cancel|ACTION_REJECTED|4001/i.test(m)) {
    return "Request rejected — no transaction was sent.";
  }
  // viem renders a contract revert across multiple lines and puts the 4-byte
  // selector on a line BELOW "…with the following signature:", so the first line
  // alone hides the cause. Pull a standalone 4-byte selector (not a 20-byte
  // address / 32-byte hash) from anywhere in the message and decode it.
  const sel = /0x[0-9a-fA-F]{8}(?![0-9a-fA-F])/.exec(m)?.[0]?.toLowerCase();
  // Known on-chain custom errors (selector → human message).
  const KNOWN_REVERTS: Record<string, string> = {
    "0xc7502d93":
      "This top-up was already processed on-chain (TopupAlreadyUsed). Re-quote and try again.",
  };
  if (sel && KNOWN_REVERTS[sel]) return KNOWN_REVERTS[sel];
  // String-reason reverts (`reverted with the following reason: <text>`).
  const reason = /reason:?\s*\n?\s*["']?([^"'\n]{3,140})/i.exec(m)?.[1]?.trim();
  if (reason) return `Deposit reverted: ${reason}`;
  if (/depositX402|reverted/i.test(m)) {
    return `On-chain deposit reverted${sel ? ` (${sel})` : ""}. Copy this code so it can be decoded.`;
  }
  const first = m.split("\n")[0].trim();
  return first.length > 160 ? `${first.slice(0, 157)}…` : first;
}

// ---------------------------------------------------------------------------
// Shared resolution helpers.
// ---------------------------------------------------------------------------

/** Resolve the active wallet account (lowercased) or throw. */
async function activeAccount(): Promise<string> {
  const accounts = await requestAccounts();
  const a = accounts[0];
  if (!a) throw new Error("No active wallet account.");
  return a;
}

/** A ChainAddMeta for `ensureChain` built from a ChainMeta (so unknown chains can be added). */
function addMeta(m: {
  name: string;
  rpcUrl: string;
  currency: string;
  explorer: string;
}): ChainAddMeta {
  return {
    name: m.name,
    rpcUrl: m.rpcUrl,
    currency: m.currency || "ETH",
    explorer: m.explorer || undefined,
  };
}

/** Resolve THIS chain's vault + PTON asset from /v1/topup/info. (app.js L622-636) */
async function resolveTargets(
  chainId: number,
): Promise<{ vault: `0x${string}`; pton: `0x${string}` }> {
  const info = await fetchTopupInfo(chainId);
  return { vault: info.vault, pton: info.asset };
}

/** Read an ERC-20 allowance(owner, spender) via wallet eth_call → bigint. (app.js L967-971) */
async function readAllowance(
  token: string,
  owner: string,
  spender: string,
): Promise<bigint> {
  // allowance(address,address) selector = dd62ed3e. (app.js L863, L968)
  const enc32 = (a: string) =>
    a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const data = "0xdd62ed3e" + enc32(owner) + enc32(spender);
  const hex = await ethCall({ to: token, data });
  return BigInt(hex || "0x0");
}

/** Read an ERC-20 balanceOf(owner) via wallet eth_call → bigint. (app.js L974-978) */
async function readBalance(token: string, owner: string): Promise<bigint> {
  // balanceOf(address) selector = 70a08231. (app.js L864, L975)
  const enc32 = (a: string) =>
    a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const data = "0x70a08231" + enc32(owner);
  const hex = await ethCall({ to: token, data });
  return BigInt(hex || "0x0");
}

/**
 * Ensure `spender` has >= `amount` allowance of `token`. Handles the USDT quirk:
 * USDT reverts approve() when current AND new allowance are both non-zero, so we
 * approve(0) first. (app.js L1031-1043, `_ensureAllowance`.)
 */
async function ensureAllowance({
  token,
  owner,
  spender,
  amount,
  symbol,
  onStatus,
}: {
  token: string;
  owner: string;
  spender: string;
  amount: bigint;
  symbol: string;
  onStatus: OnStatus;
}): Promise<void> {
  const current = await readAllowance(token, owner, spender);
  if (current >= amount) return; // already enough — skip. (app.js L1033)
  if (symbol === "USDT" && current > 0n) {
    // app.js L1035-1039 — approve(0) then approve(amount).
    onStatus("Resetting USDT allowance to 0…");
    await sendTxAndWait({ to: token, data: encApprove(spender, 0n) });
  }
  onStatus(`Approving ${symbol}…`);
  await sendTxAndWait({ to: token, data: encApprove(spender, amount) });
}

// ---------------------------------------------------------------------------
// EIP-3009 credit step — the final "deposit PTON into the vault" leg shared by
// all three flows. Mirrors app.js topUp(ptonFloat) (L711-793), but built on the
// existing client-billing + eip712 primitives so it matches the inline
// TopUpCard wire format exactly (X-PAYMENT settle path).
// ---------------------------------------------------------------------------

/**
 * Credit `ptonFloat` PTON to the vault via the gasless EIP-3009 top-up.
 * (app.js L1203-1215 — swapToPton's tail reuses topUp(); same path here.)
 *
 * @throws if the quote/sign/settle fails
 */
async function runX402Credit(
  ptonFloat: number,
  chainId: number,
  onStatus: OnStatus,
): Promise<string | null> {
  if (!Number.isFinite(ptonFloat) || ptonFloat <= 0) {
    throw new Error("Credit amount must be > 0");
  }
  onStatus("Crediting vault…");
  // We already hold PTON, so we quote by EXACT PTON amount (atto) — app.js
  // topUp() POSTs `{ amountPton, chainId }` (L728-732). The USD-seeded
  // fetchTopupQuote(amountUsd) would re-derive a different PTON figure; the
  // amount-PTON path credits exactly what we just wrapped.
  const quote = await fetchTopupQuotePton(ptonFloat, chainId);
  const addr = await activeAccount();
  // Pre-check: the gasless deposit pulls quote.amountPton from the wallet via
  // PTON.transferWithAuthorization. If the wallet holds less (e.g. the wrap
  // under-delivered), surface it clearly instead of a blind depositX402 revert.
  const ptonBal = await readBalance(quote.ptonAddress, addr);
  const need = BigInt(quote.amountPton);
  if (ptonBal < need) {
    throw new Error(
      `Insufficient PTON to credit: have ${formatUnits(ptonBal, 18, 6)}, need ${formatUnits(need, 18, 6)}. The wrap may not have completed — check your wallet PTON balance.`,
    );
  }
  const { signature, authorization } = await signTransferWithAuthorization({
    address: addr as `0x${string}`,
    domain: quote.domain as Eip712Domain,
    to: quote.vaultAddress,
    valueAttoPton: quote.amountPton,
    // Fresh random nonce (app.js parity) — a topupId-derived nonce collides on
    // the on-chain replay guard when the same quote repeats (swap stuck-flow).
    nonceHex: randomNonce(),
  });
  const outcome: SettleOutcome = await settleTopup(
    quote.topupId,
    chainId,
    authorization,
    signature,
  );
  if (!outcome.ok) throw new Error(outcome.error ?? "Settlement failed.");
  return outcome.txHash ?? null;
}

/**
 * POST /v1/topup/quote with an exact PTON amount (atto), mirroring app.js
 * topUp() (L728-732 sends `{ amountPton, chainId }`). Returns the same shape as
 * fetchTopupQuote so runX402Credit can sign against the inline domain.
 */
async function fetchTopupQuotePton(
  ptonFloat: number,
  chainId: number,
): Promise<{
  topupId: string;
  amountPton: string;
  vaultAddress: `0x${string}`;
  ptonAddress: `0x${string}`;
  domain: Eip712Domain;
}> {
  // atto-PTON with micro-truncation, matching app.js topUp() L714.
  const valueAtto =
    BigInt(Math.round(ptonFloat * 1_000_000)) * (ATTO / 1_000_000n);
  // Route through PROXY_BASE + bearer like client-billing — this quote leg is on
  // the swap→credit money path; a same-origin call in client-mode quotes against
  // the wrong backend and the (gateway-routed) settle then 402s after signing.
  const base = await proxyBase();
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const reqInit: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify({ amountPton: valueAtto.toString(), chainId }),
  };
  if (!base) reqInit.credentials = "include";
  const res = await fetch(`${base}/v1/topup/quote`, reqInit);
  if (!res.ok) throw new Error(`/v1/topup/quote → ${res.status}`);
  const q = (await res.json()) as {
    topupId: string;
    amountPton: string;
    vaultAddress: `0x${string}`;
    ptonAddress: `0x${string}`;
    domain: Eip712Domain;
  };
  return q;
}

// ===========================================================================
// FLOW 1 — runGetPton: wrap underlying TON → PTON. (app.js L2346-2386)
// ===========================================================================

/**
 * Wrap `ptonFloat` underlying TON → PTON: ensure TON balance, approve PTON to
 * pull TON (if short), then PTON.deposit. (app.js getPtonByWrapping L2346-2386.)
 *
 * @returns the wallet's PTON balance (atto) after wrapping, for the caller's UI
 * @throws on insufficient TON / rejected tx
 */
export async function runGetPton(
  ptonFloat: number,
  chainId: number,
  onStatus: OnStatus,
): Promise<bigint> {
  if (!Number.isFinite(ptonFloat) || ptonFloat <= 0) {
    throw new Error("amount must be > 0");
  }
  // atto amount with micro-truncation. (app.js L2348)
  const amount =
    BigInt(Math.round(ptonFloat * 1_000_000)) * (ATTO / 1_000_000n);

  const config = await loadDashboardConfig();
  const ch = chainMeta(config, chainId);
  await ensureChain(chainId, addMeta(ch));
  const { pton } = await resolveTargets(chainId);
  const user = await activeAccount();

  // Underlying TON address: prefer chain config `ton`, else read PTON.ton()
  // on-chain (selector cc48b947). (app.js L2356-2362)
  let ton = ch.ton;
  if (!ton) {
    const tonHex = await ethCall({ to: pton, data: "0xcc48b947" });
    ton = "0x" + String(tonHex).slice(-40);
  }

  // 1. Ensure TON balance >= amount — no faucet. (app.js L2363-2371)
  const tonBal = await readBalance(ton, user);
  if (tonBal < amount) {
    const hint = ch.bridge
      ? "Use 'Bridge from Ethereum' first."
      : "Acquire TON first, or use Swap to buy PTON.";
    throw new Error(`Insufficient TON on ${ch.name}. ${hint}`);
  }

  // 2. Approve PTON to pull TON, if allowance short. (app.js L2372-2379)
  // The spender is the PTON contract itself (PTON.deposit pulls the TON).
  const allowance = await readAllowance(ton, user, pton);
  if (allowance < amount) {
    onStatus("Approving TON…");
    await sendTxAndWait({ to: ton, data: encApprove(pton, amount) });
  }

  // 3. Pre-flight the wrap via eth_call (from the user) so a contract-level
  //    revert surfaces its reason instead of a blind on-chain failure. The
  //    common cause is the approve not having landed (the allowance read above
  //    can be stale right after a chain switch / on a lagging RPC) — if the
  //    simulation reverts on allowance, (re)approve and re-simulate once.
  onStatus("Wrapping TON → PTON…");
  try {
    await ethCall({ to: pton, data: encDeposit(amount), from: user });
  } catch (e) {
    const reason = decodeRevertReason(e);
    if (/allowance/i.test(reason)) {
      // The sim says allowance is short. Re-read the REAL allowance with a
      // reliable view call (no msg.sender dependency) — only (re)approve if it
      // is genuinely short. If it is actually sufficient, the sim revert is a
      // false negative from a wallet that ignores `from` in eth_call, so just
      // proceed to the real deposit (which carries the true sender).
      const live = await readAllowance(ton, user, pton);
      if (live < amount) {
        onStatus("Approving TON…");
        await sendTxAndWait({ to: ton, data: encApprove(pton, amount) });
      }
    } else {
      // A real, non-allowance revert (insufficient balance, paused, …) — surface
      // the decoded reason instead of sending a doomed transaction.
      throw new Error(`Wrap would revert: ${reason}`);
    }
  }

  // 4. Wrap TON → PTON (PTON.deposit pulls TON, mints PTON 1:1). (app.js L2380-2382)
  await sendTxAndWait({ to: pton, data: encDeposit(amount) });
  onStatus(`Wrapped ${ptonFloat} PTON — you can deposit now.`, "ok");

  // Return the post-wrap PTON balance so the caller can update its hint.
  return readBalance(pton, user);
}

// ===========================================================================
// FLOW 2 — runBridge: OP-Stack L1 → L2 TON bridge. (app.js wireBridge L2008-2101)
// ===========================================================================

export interface BridgeResult {
  /** True if the bridged TON was observed arriving on the dst chain within the poll window. */
  arrived: boolean;
  /** L2 (dst) TON balance after the poll (atto), for the caller's UI. */
  l2Balance: bigint;
}

/**
 * Bridge `tonAmountFloat` TON from Ethereum L1 → the selected L2 (Base) via the
 * OP-Stack L1StandardBridge.depositERC20To: switch to L1, approve, deposit,
 * switch back, poll L2 balanceOf. (app.js wireBridge L2034-2092.)
 *
 * @param srcChain the destination/selected chain id (its config carries the bridge descriptor)
 * @throws on missing bridge / rejected tx
 */
export async function runBridge(
  tonAmountFloat: string | number,
  srcChain: number,
  onStatus: OnStatus,
): Promise<BridgeResult> {
  const config: DashboardConfig = await loadDashboardConfig();
  const ch = chainMeta(config, srcChain);
  const b = ch.bridge;
  if (!b) throw new Error("Bridging not available on this network");

  let amount: bigint;
  try {
    amount = parseUnits(tonAmountFloat, 18); // TON is 18 decimals. (app.js L2023)
  } catch {
    throw new Error("Amount must be > 0");
  }
  if (amount <= 0n) throw new Error("Amount must be > 0");

  const user = await activeAccount();

  // 1. Move the wallet to Ethereum (the L1 where TON is locked). (app.js L2034-2036)
  onStatus(`Switching wallet to ${b.fromName ?? "Ethereum"}…`);
  const l1Meta: ChainAddMeta | undefined = b.fromRpc
    ? { name: b.fromName ?? "Ethereum", rpcUrl: b.fromRpc, currency: "ETH" }
    : undefined;
  await ensureChain(b.fromChainId, l1Meta);

  // 2. Approve L1 TON → L1StandardBridge. (app.js L2037-2044)
  await ensureAllowance({
    token: b.l1Token,
    owner: user,
    spender: b.l1StandardBridge,
    amount,
    symbol: "TON",
    onStatus,
  });

  // 3. depositERC20To(_l1Token, _l2Token, _to, _amount, _minGasLimit, "") — the
  //    trailing bytes arg is empty (offset 0xc0 past 6 head words, length 0).
  //    (app.js L2045-2057.)
  onStatus(
    `Locking ${formatUnits(amount, 18, 6)} TON on ${b.fromName ?? "Ethereum"}…`,
  );
  if (!ch.ton)
    throw new Error("Selected chain has no bridged TON address configured.");
  const data = encBridgeDepositERC20To(
    b.l1Token,
    ch.ton,
    user,
    amount,
    BigInt(b.minGasLimit),
    "0x",
  );
  await sendTxAndWait({ to: b.l1StandardBridge, data });
  onStatus(
    `Locked on ${b.fromName ?? "Ethereum"} — funds arrive on ${ch.name} in ~1-3 min`,
  );

  // 4. Return the wallet to the selected chain and poll for arrival. (app.js L2059-2092)
  await ensureChain(srcChain, addMeta(ch));
  const before =
    ch.rpcUrl && ch.ton
      ? BigInt(
          await publicEthCall(
            ch.rpcUrl,
            ch.ton,
            "0x70a08231" +
              user.toLowerCase().replace(/^0x/, "").padStart(64, "0"),
          ).catch(() => "0x0"),
        )
      : 0n;

  let arrived = false;
  let l2Balance = before;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    let now: bigint;
    try {
      now = BigInt(
        await publicEthCall(
          ch.rpcUrl,
          ch.ton,
          "0x70a08231" +
            user.toLowerCase().replace(/^0x/, "").padStart(64, "0"),
        ),
      );
    } catch {
      continue; // transient RPC blip — keep polling. (app.js L2071-2073)
    }
    l2Balance = now;
    if (now > before) {
      arrived = true;
      break;
    }
    onStatus(`Waiting for ${ch.name} arrival… (${i + 1}/24)`);
  }

  if (arrived) {
    onStatus(
      `Bridged! ${formatUnits(amount, 18, 6)} TON now on ${ch.name}. Use 'Get PTON' to wrap, then top up.`,
      "ok",
    );
  } else {
    onStatus(
      `Locked on ${b.fromName ?? "Ethereum"}. Funds are still in transit to ${ch.name} — they will appear shortly.`,
    );
  }
  return { arrived, l2Balance };
}

// ===========================================================================
// FLOW 3 — runSwapToPton: Ethereum-only DEX pipeline → PTON → vault credit.
// (app.js swapToPton L1046-1234.)
// ===========================================================================

/** Quote: amountIn of inputToken → WTON (in ray). (app.js _quoteSwapToWton L983-1005.) */
async function quoteSwapToWton(
  inputToken: SwapToken,
  amountIn: bigint,
): Promise<{ path: string; amountOutWtonRay: bigint }> {
  let firstToken: string;
  let legs: UniV3Leg[];
  if (inputToken === "ETH") {
    // ETH route: WETH → WTON directly (router wraps msg.value). (app.js L985-986)
    firstToken = SWAP_WETH;
    legs = [{ fee: SWAP_WTON_FEE, token: SWAP_WTON }];
  } else {
    const cfg = SWAP_ADDRESSES[inputToken];
    // ERC-20 route: input → WETH → WTON. (app.js L988-993)
    firstToken = cfg.address as string;
    legs = [
      { fee: cfg.weth_fee as number, token: SWAP_WETH },
      { fee: SWAP_WTON_FEE, token: SWAP_WTON },
    ];
  }
  const path = encUniV3Path(firstToken, legs);
  const data = encQuoteExactInput(path, amountIn);
  // QuoterV2 mutates storage with a simulated swap — MUST be eth_call (discarded
  // inside the call). (app.js L997-1000.)
  const hex = await ethCall({ to: SWAP_QUOTER_V2, data });
  if (!hex || hex === "0x") throw new Error("quoter returned empty data");
  // First 32 bytes of the return = amountOut (WTON ray). (app.js L1003.)
  const amountOutWtonRay = BigInt("0x" + hex.replace(/^0x/, "").slice(0, 64));
  return { path, amountOutWtonRay };
}

export interface SwapArgs {
  inputToken: SwapToken;
  amountFloat: number;
  slippageBps: number;
  chainId: number;
}

/**
 * Full Ethereum-only swap → wrap → vault pipeline:
 *   quote (QuoterV2 eth_call) → [stuck-flow WTON reuse] → approve (USDT zero-first)
 *   → SwapRouter02.exactInput → WTON.swapToTON (ray→wei unwrap) → TON.approve(PTON)
 *   → PTON.deposit → EIP-3009 credit.
 * (app.js swapToPton L1046-1234.)
 *
 * @returns the credit tx hash (or null) when the vault deposit settles
 * @throws on unsupported token / no liquidity / underdelivery / rejected tx
 */
export async function runSwapToPton(
  args: SwapArgs,
  onStatus: OnStatus,
): Promise<string | null> {
  const { inputToken, amountFloat, slippageBps, chainId } = args;
  // ---- 0. validate inputs / wallet / chain. (app.js L1047-1066) ----
  if (!inputToken || !SWAP_ADDRESSES[inputToken]) {
    throw new Error(`Unsupported input token: ${inputToken}`);
  }
  if (!Number.isFinite(amountFloat) || amountFloat <= 0) {
    throw new Error("Amount must be > 0");
  }
  if (
    !Number.isFinite(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 10_000
  ) {
    throw new Error("Slippage must be 0..10000 bps");
  }
  // Swap is Ethereum-mainnet-only. (app.js L1060-1064)
  const config = await loadDashboardConfig();
  if (chainId !== 1) {
    throw new Error("Swap is only supported on Ethereum mainnet (chainId=1).");
  }
  const user = await activeAccount();
  const ethMeta = chainMeta(config, 1);
  await ensureChain(1, addMeta(ethMeta)); // app.js L1066

  const cfg = SWAP_ADDRESSES[inputToken];
  const amountIn = parseUnits(amountFloat, cfg.decimals); // app.js L1069
  onStatus(`Quoting ${inputToken} → WTON…`); // app.js L1070

  // ---- 1. quote → amountOutMinimum (apply slippage). (app.js L1072-1090) ----
  const { path, amountOutWtonRay } = await quoteSwapToWton(
    inputToken,
    amountIn,
  );
  if (amountOutWtonRay === 0n) {
    throw new Error("Quote returned 0 — no liquidity on this route.");
  }
  const minOutWtonRay =
    (amountOutWtonRay * BigInt(10_000 - slippageBps)) / 10_000n; // app.js L1079-1080
  const minOutTonWei = minOutWtonRay / WTON_RAY_PER_WEI; // app.js L1087
  if (minOutTonWei === 0n) {
    throw new Error("Quote too small (rounds to 0 TON). Increase amount.");
  }

  // ---- 2. stuck-flow recovery: reuse stranded WTON if >= minOut. (app.js L1099-1113) ----
  const wtonBalanceBefore = await readBalance(SWAP_WTON, user);
  let wtonReceived: bigint;
  if (wtonBalanceBefore >= minOutWtonRay) {
    onStatus(
      `Found ${formatUnits(
        wtonBalanceBefore / WTON_RAY_PER_WEI,
        18,
        4,
      )} WTON from a previous attempt — reusing it (skipping swap).`,
    );
    wtonReceived = wtonBalanceBefore;
  } else {
    // ---- 3a. approve router (ERC-20 only). (app.js L1115-1124) ----
    if (inputToken !== "ETH") {
      await ensureAllowance({
        token: cfg.address as string,
        owner: user,
        spender: SWAP_ROUTER02,
        amount: amountIn,
        symbol: inputToken,
        onStatus,
      });
    }
    // ---- 3b. swap via SwapRouter02.exactInput → recipient = user. (app.js L1125-1144) ----
    onStatus(
      inputToken === "ETH"
        ? "Swapping ETH → WTON via Uniswap V3…"
        : `Swapping ${inputToken} → WETH → WTON via Uniswap V3…`,
    );
    const swapData = encExactInput({
      path,
      recipient: user,
      amountIn,
      amountOutMinimum: minOutWtonRay,
    });
    await sendTxAndWait({
      to: SWAP_ROUTER02,
      data: swapData,
      // ETH input: router auto-wraps msg.value when path starts with WETH.
      value: inputToken === "ETH" ? amountIn : 0n, // app.js L1143
    });
    // Realized post-swap WTON delta = canonical wrap amount. (app.js L1145-1168)
    const wtonBalanceAfter = await readBalance(SWAP_WTON, user);
    wtonReceived = wtonBalanceAfter - wtonBalanceBefore;
    if (wtonReceived < minOutWtonRay) {
      // Receipt said 0x1 but no delta (likely a stale dedup'd hash). If TOTAL
      // balance now covers minOut, use it. (app.js L1151-1167.)
      if (wtonBalanceAfter >= minOutWtonRay) {
        onStatus(
          `Swap tx returned no new WTON, but wallet has ${formatUnits(
            wtonBalanceAfter / WTON_RAY_PER_WEI,
            18,
            4,
          )} WTON — using that.`,
        );
        wtonReceived = wtonBalanceAfter;
      } else {
        throw new Error(
          `Swap underdelivered: got ${wtonReceived} WTON-ray, expected >= ${minOutWtonRay}`,
        );
      }
    }
  }

  // Convert ray→wei, then TRUNCATE to micro-TON (6 dp). Two reasons:
  //  1. The full 18-decimal value (e.g. 1670.0689854122718) decodes in MetaMask
  //     to a >15-significant-digit JS number, and its fiat preview then throws
  //     `BigNumber.times: more than 15 significant digits` on the approve/deposit.
  //  2. The vault credit is already micro-truncated (microPton below), so wrapping
  //     the same micro amount keeps wrap == credit exactly (no uncredited PTON).
  // Sub-micro-TON dust stays in the wallet as WTON. (app.js L1170-1175 wraps the
  // full amount; we truncate to keep every downstream amount MetaMask-safe.)
  const MICRO = ATTO / 1_000_000n; // 1e12 wei per micro-TON
  const tonToWrap = (wtonReceived / WTON_RAY_PER_WEI / MICRO) * MICRO;
  if (tonToWrap === 0n) {
    throw new Error("Swap produced sub-micro TON dust — increase amount.");
  }
  const wtonToBurn = tonToWrap * WTON_RAY_PER_WEI;

  // ---- 4. WTON.swapToTON(wtonToBurn) → user's TON. (app.js L1177-1182) ----
  onStatus("Unwrapping WTON → TON…");
  await sendTxAndWait({ to: SWAP_WTON, data: encWtonSwapToTON(wtonToBurn) });

  // ---- 5. TON.approve(PTON, tonToWrap). (app.js L1184-1193) ----
  const { pton } = await resolveTargets(chainId);
  await ensureAllowance({
    token: SWAP_TON,
    owner: user,
    spender: pton,
    amount: tonToWrap,
    symbol: "TON",
    onStatus,
  });

  // ---- 6. PTON.deposit(tonToWrap) → user's PTON. (app.js L1195-1201) ----
  onStatus("Wrapping TON → PTON…");
  await sendTxAndWait({ to: pton, data: encDeposit(tonToWrap) });

  // ---- 7. EIP-3009 sign + vault credit. (app.js L1203-1215) ----
  // micro-PTON truncation to match topUp()'s atto<->float path. (app.js L1208-1214)
  const microPton = tonToWrap / (ATTO / 1_000_000n);
  if (microPton === 0n) throw new Error("Deposit too small (sub-micro PTON)");
  const ptonFloat = Number(microPton) / 1_000_000;
  const txHash = await runX402Credit(ptonFloat, chainId, onStatus);

  // ---- 8. done. (app.js L1217-1233) ----
  onStatus(`Done — ${formatUnits(tonToWrap, 18, 6)} PTON credited.`, "ok");
  return txHash;
}

// ---------------------------------------------------------------------------
// Wallet-balance reads — used by the cards to show holdings / drive "Max".
// ---------------------------------------------------------------------------

/** Read the connected wallet's PTON balance (atto) on the selected chain. (app.js L1326-1329) */
export async function readWalletPton(chainId: number): Promise<bigint | null> {
  try {
    const user = await activeAccount();
    const { pton } = await resolveTargets(chainId);
    return await readBalance(pton, user);
  } catch {
    return null;
  }
}

/** Read the connected wallet's underlying-TON balance (atto) on a chain. (app.js L2365) */
export async function readWalletTon(
  chainId: number,
): Promise<{ balance: bigint; symbol: string } | null> {
  try {
    const config = await loadDashboardConfig();
    const ch = chainMeta(config, chainId);
    let ton = ch.ton;
    if (!ton) {
      const { pton } = await resolveTargets(chainId);
      const tonHex = await ethCall({ to: pton, data: "0xcc48b947" });
      ton = "0x" + String(tonHex).slice(-40);
    }
    const user = await activeAccount();
    return { balance: await readBalance(ton, user), symbol: "TON" };
  } catch {
    return null;
  }
}

/**
 * Read a Swap-card input token's wallet balance as a float (mainnet-only).
 * ETH uses the native balance; ERC-20s use balanceOf. (app.js L1312-1356.)
 */
export async function readSwapTokenBalance(
  token: SwapToken,
): Promise<number | null> {
  try {
    const user = await activeAccount();
    const cfg = SWAP_ADDRESSES[token];
    const raw =
      token === "ETH"
        ? await ethGetBalance(user) // wallet native balance. (app.js L1312)
        : await readBalance(cfg.address as string, user);
    return boundBalancePrecision(Number(raw) / 10 ** cfg.decimals);
  } catch {
    return null;
  }
}

/**
 * Bound a display/Max balance to ≤12 significant digits, truncating toward zero.
 * Number(bigint)/10**decimals on an 18-decimal balance yields full float noise
 * (e.g. 1670.0689854122718, 17 sig digits); feeding that into an amount field →
 * a tx makes MetaMask's fiat preview throw `BigNumber.times: more than 15
 * significant digits`. Truncating (never rounding up) also guarantees a "Max"
 * never exceeds the real balance.
 */
function boundBalancePrecision(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  const intDigits = Math.floor(Math.log10(v)) + 1;
  const dp = Math.max(0, Math.min(6, 12 - intDigits));
  const f = 10 ** dp;
  return Math.floor(v * f) / f;
}

/** Token decimals lookup for the Swap card's parse/preview. */
export function swapTokenDecimals(token: SwapToken): number {
  return SWAP_ADDRESSES[token].decimals;
}

/** True iff the wallet's active chain is Ethereum (1). */
export async function isOnEthereum(): Promise<boolean> {
  try {
    return (await getChainId()) === 1;
  } catch {
    return false;
  }
}
