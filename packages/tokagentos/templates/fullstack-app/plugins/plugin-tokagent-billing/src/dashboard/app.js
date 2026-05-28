// Dashboard SPA — vanilla JS, zero dependencies.
//
// Responsibilities:
//   1. SIWE login: connect a browser wallet, sign LoginAuth EIP-712, store
//      the proxy-issued bearer in sessionStorage.
//   2. API key management: list / mint / revoke (one-shot key reveal modal).
//   3. PTON top-up: client builds a TransferWithAuthorization EIP-712, signs
//      it via the wallet, and submits it as X-PAYMENT on a one-call dummy
//      /v1/messages POST so the proxy executes vault.depositX402.
//   4. Swap-to-PTON (UI shell only, v2.0.21): user picks USDC/USDT/ETH/WBTC,
//      preview shows route + PTON output, CTA wires to a stub `swapToPton()`
//      that the next engineer will fill in (approve → swap → wrap → deposit).
//   5. Usage tabs (overview / day / model / key / calls) backed by the
//      /v1/usage/* endpoints.
//
// The file intentionally keeps a single shared `state` object so view-render
// helpers can read latest data without prop-drilling. Each call to load()
// refreshes the relevant slice.

const CONFIG = (typeof window !== "undefined" && window.__DASHBOARD_CONFIG__) || {
  PROXY_BASE: "http://localhost:3000",
  CHAIN_ID: 1,
  CHAIN_NAME: "Anvil (local fork)",
  CHAIN_RPC_URL: "http://127.0.0.1:8545",
  CHAIN_CURRENCY_SYMBOL: "ETH",
  CHAIN_EXPLORER_URL: "",
  PUBLIC_ORIGIN: typeof location !== "undefined" ? location.origin : "",
  APP_NAME: "Tokamak.AI — Dashboard",
};

const PROXY = CONFIG.PROXY_BASE.replace(/\/+$/, "");
const CHAIN_ID = Number(CONFIG.CHAIN_ID) || 1;
const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;
const CHAIN_NAME = String(CONFIG.CHAIN_NAME ?? "Custom chain");
const CHAIN_RPC_URL = String(CONFIG.CHAIN_RPC_URL ?? "");
const CHAIN_CURRENCY_SYMBOL = String(CONFIG.CHAIN_CURRENCY_SYMBOL ?? "ETH");
const CHAIN_EXPLORER_URL = String(CONFIG.CHAIN_EXPLORER_URL ?? "");

const SESSION_KEY = "ai-proxy-dashboard:session";
const ATTO = 10n ** 18n;

// ---- Swap UI catalog (used by Swap card; addresses are placeholders the
// engineer will replace when wiring on-chain calls). Icons come from the
// public CoinGecko CDN so we don't need a build pipeline for sprite assets.
const SWAP_TOKENS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    icon: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
  },
  {
    symbol: "USDT",
    name: "Tether",
    decimals: 6,
    icon: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
  },
  {
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    icon: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  },
  {
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
    icon: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png",
  },
];

const state = {
  /** EIP-1193 provider (window.ethereum). */
  provider: null,
  wallet: null,
  /** { token, exp, wallet } from /v1/auth/login. */
  session: null,
  /** Cached PTON / vault addresses + price snapshot. */
  vault: null,
  pton: null,
  tonUsd: null,
  priceSnap: null,
  /** Most recent /v1/credits/me response. */
  credits: null,
  /** Connected wallet's native ETH balance (wei, BigInt). */
  walletEth: null,
  /** Connected wallet's PTON token balance (atto, BigInt). */
  walletPton: null,
  /** Per-token wallet balances for the Swap card. Keyed by symbol (USDC, USDT,
   * ETH, WBTC). Engineer will populate via on-chain reads when wiring swap.
   * Format: float (display units, NOT raw atto). */
  walletBalances: {},
  /** Per-token USD prices for the Swap output preview. Placeholders until the
   * engineer wires a real price feed (Pyth / Chainlink / 1inch quote). */
  tokenPrices: { USDC: 1, USDT: 1, ETH: 3000, WBTC: 65000 },
  /** Currently-selected input token for the Swap card. */
  swapInputToken: "USDC",
  /** Slippage tolerance, basis points. 50 = 0.5%. */
  swapSlippageBps: 50,
  /** Most recent /v1/usage/summary response. */
  usage: null,
  /** Pagination cursor for the "Recent calls" tab. */
  callsCursor: null,
  callsLoaded: 0,
  activeTab: "overview",
};

// ----------------------------- DOM helpers -----------------------------

const $ = (sel) => document.querySelector(sel);

function setStatus(el, text, kind = "") {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("ok", "err");
  if (kind) el.classList.add(kind);
}

// Variant of setStatus that accepts pre-escaped HTML — used when the message
// needs to embed a fmtLink() anchor (e.g. tx-hash explorer links). Callers
// must escape() any untrusted text they interpolate.
function setStatusHtml(el, html, kind = "") {
  if (!el) return;
  el.innerHTML = html;
  el.classList.remove("ok", "err");
  if (kind) el.classList.add(kind);
}

function fmtPton(atto) {
  // atto-PTON (1e18 = 1 PTON). Render with up to 4 decimals; hide trailing zeros.
  if (atto === undefined || atto === null) return "—";
  let big;
  try {
    big = typeof atto === "bigint" ? atto : BigInt(atto);
  } catch {
    return "—";
  }
  const neg = big < 0n;
  if (neg) big = -big;
  const whole = big / ATTO;
  const frac = big % ATTO;
  const fracStr = frac.toString().padStart(18, "0").slice(0, 6);
  const trimmed = fracStr.replace(/0+$/, "");
  const out = trimmed.length === 0 ? whole.toString() : `${whole.toString()}.${trimmed}`;
  return (neg ? "-" : "") + out;
}

function fmtUsdFromAttoPton(atto, tonUsd) {
  if (atto === undefined || atto === null || !tonUsd) return "—";
  let big;
  try {
    big = typeof atto === "bigint" ? atto : BigInt(atto);
  } catch {
    return "—";
  }
  // atto / 1e18 = PTON; PTON * tonUsd = USD. Stay in float for display only.
  const ptonFloat = Number(big) / 1e18;
  const usd = ptonFloat * tonUsd;
  if (usd < 0.01) return `${usd.toFixed(4)}`;
  return usd.toFixed(2);
}

function fmtNumber(n) {
  if (n === undefined || n === null) return "—";
  return Number(n).toLocaleString();
}

function fmtAddr(a) {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// Build an etherscan-style explorer URL for an address (`tx` for hashes).
// Returns "" when no explorer is configured so the UI can choose to render
// plain text instead of a dead anchor.
function explorerUrl(value, kind /* "tx" | "address" */) {
  if (!value || !CHAIN_EXPLORER_URL) return "";
  const base = CHAIN_EXPLORER_URL.replace(/\/+$/, "");
  return `${base}/${kind}/${value}`;
}

// Format an address or tx hash as a short clickable link when an explorer is
// configured, plain text otherwise. `kind` defaults to "tx" because the
// dashboard's most common use is rendering transaction receipts.
function fmtLink(value, kind = "tx") {
  if (!value) return "—";
  const short = fmtAddr(value);
  const href = explorerUrl(value, kind);
  if (!href) return escape(short);
  return `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(short)}</a>`;
}

function fmtTimestamp(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

function fmtAge(ms) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

// ----------------------------- Session storage -----------------------------

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.token || !obj?.exp || !obj?.wallet) return null;
    if (obj.exp * 1000 < Date.now() + 5_000) return null; // expiring soon
    return obj;
  } catch {
    return null;
  }
}

function saveSession(s) {
  state.session = s;
  if (s) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

// ----------------------------- HTTP helpers -----------------------------

async function api(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (state.session?.token) {
    headers.set("authorization", `Bearer ${state.session.token}`);
  }
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${PROXY}${path}`, { ...init, headers });
  return res;
}

async function apiJson(path, init = {}) {
  const res = await api(path, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* keep body null */
  }
  if (!res.ok) {
    const msg = body?.error?.message || body?.error || body?.detail || res.statusText;
    const err = new Error(typeof msg === "string" ? msg : `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    err.headers = res.headers;
    throw err;
  }
  return body;
}

// ----------------------------- Wallet helpers -----------------------------

function detectProvider() {
  return typeof window !== "undefined" ? window.ethereum ?? null : null;
}

async function rpc(method, params = []) {
  if (!state.provider) throw new Error("no wallet provider");
  return state.provider.request({ method, params });
}

/**
 * Make sure the wallet is on the configured chain — actively switch (and add
 * the network if missing) rather than just warning. Returns the chainId the
 * wallet is on at the end (will equal CHAIN_ID_HEX on success).
 *
 * Two-step flow:
 *   1. wallet_switchEthereumChain — works if MetaMask already knows the chain
 *   2. On EIP-3326 error 4902 ("Unrecognized chain ID"), call
 *      wallet_addEthereumChain to register it; MetaMask typically auto-
 *      switches after add, but we call switch again to be defensive.
 */
async function ensureChain() {
  const current = await rpc("eth_chainId");
  if (typeof current === "string" && current.toLowerCase() === CHAIN_ID_HEX.toLowerCase()) {
    return current;
  }
  try {
    await rpc("wallet_switchEthereumChain", [{ chainId: CHAIN_ID_HEX }]);
  } catch (err) {
    // 4902 = chain unknown to wallet. Some wallets surface it as -32603 with
    // a nested code. Detect both before falling through to "add then switch".
    const code = err?.code ?? err?.data?.originalError?.code;
    const isUnknownChain = code === 4902 || (code === -32603 && /unrecognized|not added|unknown/i.test(err?.message ?? ""));
    if (!isUnknownChain) {
      // 4001 = user rejected. Re-throw with clearer text so the UI status
      // line says something useful instead of "User rejected the request".
      if (code === 4001) throw new Error("Network switch was rejected.");
      throw err;
    }
    // Build the EIP-3085 add payload. blockExplorerUrls is a sensitive field
    // — wallets reject the call if you pass an empty array, so omit it when
    // the operator left CHAIN_EXPLORER_URL blank.
    const addParams = {
      chainId: CHAIN_ID_HEX,
      chainName: CHAIN_NAME,
      rpcUrls: [CHAIN_RPC_URL],
      nativeCurrency: { name: CHAIN_CURRENCY_SYMBOL, symbol: CHAIN_CURRENCY_SYMBOL, decimals: 18 },
    };
    if (CHAIN_EXPLORER_URL) addParams.blockExplorerUrls = [CHAIN_EXPLORER_URL];
    await rpc("wallet_addEthereumChain", [addParams]);
    // MetaMask normally switches automatically after add; on some wallets it
    // doesn't, so re-issue the switch and ignore "already on" errors.
    try {
      await rpc("wallet_switchEthereumChain", [{ chainId: CHAIN_ID_HEX }]);
    } catch (err2) {
      if (err2?.code !== -32602) throw err2;
    }
  }
  // Confirm the result so the topbar pill reflects reality.
  return await rpc("eth_chainId");
}

/** Render the chain pill in the topbar — green ✓ if on the right chain. */
async function refreshChainPill() {
  const pill = document.getElementById("chain-pill");
  const idEl = document.getElementById("chain-id");
  const nameEl = document.getElementById("chain-name");
  if (!pill || !idEl || !state.provider) return;
  try {
    const current = await state.provider.request({ method: "eth_chainId" });
    const ok = typeof current === "string" && current.toLowerCase() === CHAIN_ID_HEX.toLowerCase();
    idEl.textContent = current ?? "—";
    if (nameEl) nameEl.textContent = ok ? CHAIN_NAME : "wrong network";
    pill.classList.toggle("pill-ok", ok);
    pill.classList.toggle("pill-warn", !ok);
    pill.hidden = false;
    const switchBtn = document.getElementById("switch-chain-btn");
    if (switchBtn) switchBtn.hidden = ok;
  } catch (e) {
    console.warn("[dashboard] refreshChainPill failed", e);
  }
}

async function connectWallet() {
  const provider = detectProvider();
  if (!provider) throw new Error("No browser wallet detected (window.ethereum is missing).");
  state.provider = provider;
  // Use `wallet_requestPermissions` rather than `eth_requestAccounts`. The
  // former forces MetaMask to re-establish the permission grant and clears
  // any stale "permitted-but-not-active" state that otherwise causes
  // EIP-1193 4100 ("not authorized") to fire during the next signTypedData
  // call before the signature UI ever appears (MetaMask logs this state
  // desync as: 'eth_accounts unexpectedly updated accounts').
  try {
    await provider.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch (e) {
    // Some non-MetaMask wallets (Coinbase Wallet on mobile, certain
    // WalletConnect bridges) don't implement wallet_requestPermissions.
    // Fall back to eth_requestAccounts for those — for plain MetaMask we
    // still went through the explicit grant above first.
    if (e && (e.code === -32601 || e.code === 4200)) {
      await provider.request({ method: "eth_requestAccounts" });
    } else {
      throw e;
    }
  }
  const accounts = await provider.request({ method: "eth_accounts" });
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("Wallet returned no accounts.");
  }
  // Preserve the wallet's exact casing — Rabby/OKX/some MetaMask builds
  // reject signing requests whose `from` parameter doesn't match their
  // authorized account list byte-for-byte. Lowercase is fine for internal
  // map keys and for the proxy (the server checksums on receipt).
  state.wallet = accounts[0];
  // Listen for genuine account changes — but DON'T force a reload, because
  // MetaMask emits this same event during routine permission sync after
  // wallet_requestPermissions, and reloading mid-grant created the race
  // that broke the very first sign-in attempt. Just drop the SIWE session
  // so the next user action goes back through the login screen cleanly.
  if (typeof provider.on === "function") {
    provider.on("accountsChanged", (next) => {
      const incoming = Array.isArray(next) && next.length > 0 ? next[0] : null;
      if (!incoming) {
        saveSession(null);
        showLoginView();
        return;
      }
      if (incoming.toLowerCase() !== state.wallet.toLowerCase()) {
        saveSession(null);
        state.wallet = incoming;
        showLoginView();
      }
    });
    // chainChanged ⇒ refresh the topbar pill so the user sees the new
    // network instantly. Don't force a reload: MetaMask spec mandates the
    // dapp listen and react gracefully, and we already gate signing through
    // ensureChain() anyway.
    provider.on("chainChanged", () => {
      void refreshChainPill();
    });
  }
  await ensureChain();
  await refreshChainPill();
}

/**
 * Re-fetch the wallet's active account just before signing. If MetaMask was
 * unlocked into a different account between `connectWallet()` and now, this
 * surfaces a clear error instead of letting the wallet emit the cryptic 4100.
 */
async function activeAccountOrThrow() {
  const accounts = await rpc("eth_accounts");
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("Wallet has no active account — unlock it and try again.");
  }
  if (accounts[0].toLowerCase() !== state.wallet.toLowerCase()) {
    throw new Error(
      `Active wallet account changed (${state.wallet} → ${accounts[0]}). Please reconnect.`,
    );
  }
  return accounts[0]; // returned in the wallet's preferred casing
}

// ----------------------------- SIWE login -----------------------------

async function siweLogin() {
  if (!state.wallet) {
    throw new Error("Connect a wallet first.");
  }
  const fromAddress = await activeAccountOrThrow();
  const nonceRes = await apiJson("/v1/auth/nonce", {
    method: "POST",
    body: JSON.stringify({ wallet: fromAddress }),
  });
  // Sign the LoginAuth EIP-712 struct exactly as the server returned it.
  const typedData = {
    domain: nonceRes.domain,
    primaryType: nonceRes.primaryType,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
      ],
      ...nonceRes.types,
    },
    message: {
      wallet: fromAddress,
      nonce: nonceRes.nonce,
      issuedAt: Math.floor(nonceRes.issuedAt / 1000),
      expiresAt: Math.floor(nonceRes.expiresAt / 1000),
    },
  };
  const signature = await rpc("eth_signTypedData_v4", [fromAddress, JSON.stringify(typedData)]);
  const loginRes = await apiJson("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      wallet: fromAddress,
      nonce: nonceRes.nonce,
      issuedAt: nonceRes.issuedAt,
      expiresAt: nonceRes.expiresAt,
      signature,
    }),
  });
  saveSession(loginRes);
  return loginRes;
}

// ----------------------------- Pricing (vault / pton resolution) -----------------------------

// Look up the deploy-stable vault + PTON addresses (and their EIP-712 domain)
// from a dedicated proxy endpoint. Cached for the lifetime of the SPA — these
// don't change without a redeploy.
//
// Earlier versions probed /v1/messages and parsed the 402 envelope. That
// stopped working the moment the wallet had any vault credit, because the
// proxy could then reserve the probe's cost successfully and returned 200
// instead of 402. /v1/topup/info is unconditional.
async function resolveDepositTargets() {
  if (state.vault && state.pton) return { vault: state.vault, pton: state.pton };
  const info = await apiJson("/v1/topup/info");
  state.vault = info.vault;
  state.pton = info.asset;
  return { vault: state.vault, pton: state.pton };
}

// ----------------------------- Top up (EIP-3009) -----------------------------

function randomNonce() {
  // 32-byte hex from the Web Crypto API. Avoid Date.now() alone — single-use
  // EIP-3009 nonces must collide with vanishingly low probability across
  // concurrent calls from the same wallet.
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return "0x" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function chainNowSec() {
  // Best effort — ask the wallet for the latest block. If that fails (rare),
  // fall back to wall-clock; the proxy will reject signatures whose validity
  // window is too tight against chain time.
  try {
    const blockHex = await rpc("eth_getBlockByNumber", ["latest", false]);
    if (blockHex?.timestamp) return BigInt(blockHex.timestamp);
  } catch (e) {
    console.warn("[dashboard] eth_getBlockByNumber failed", e);
  }
  return BigInt(Math.floor(Date.now() / 1000));
}

async function signTopupAuth({ pton, vault, valueAtto, nonce, validAfter, validBefore }) {
  // Same casing rule as siweLogin — pass the wallet's preferred case so
  // strict wallets do not throw EIP-1193 4100 ("not authorized").
  const fromAddress = await activeAccountOrThrow();
  const typedData = {
    domain: {
      name: "PTON",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: pton,
    },
    primaryType: "TransferWithAuthorization",
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    message: {
      from: fromAddress,
      to: vault,
      value: valueAtto.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
    },
  };
  const sig = await rpc("eth_signTypedData_v4", [fromAddress, JSON.stringify(typedData)]);
  // Split the 65-byte sig into v/r/s. EIP-1193 wallets return 0x-prefixed.
  if (typeof sig !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(sig)) {
    throw new Error("wallet returned malformed signature");
  }
  const r = "0x" + sig.slice(2, 66);
  const s = "0x" + sig.slice(66, 130);
  let v = parseInt(sig.slice(130, 132), 16);
  if (v < 27) v += 27;
  return { v, r, s, message: typedData.message, fromAddress };
}

// Test/fork-only helper: have the user's wallet call `PTON.faucet(amount)` so
// they can self-mint PTON before topping up. Reverts if the deployed PTON was
// built with `faucetEnabled=false` (production).
async function mintFaucet(ptonFloat) {
  if (!Number.isFinite(ptonFloat) || ptonFloat <= 0) throw new Error("amount must be > 0");
  const valueAtto = BigInt(Math.round(ptonFloat * 1_000_000)) * (ATTO / 1_000_000n);
  const { pton } = await resolveDepositTargets();
  const fromAddress = await activeAccountOrThrow();
  // faucet(uint256) selector = first 4 bytes of keccak256("faucet(uint256)").
  const data = "0x57915897" + valueAtto.toString(16).padStart(64, "0");
  const txHash = await rpc("eth_sendTransaction", [{ from: fromAddress, to: pton, data }]);
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    const rcpt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (rcpt) {
      if (rcpt.status === "0x1") return txHash;
      // Most common revert reason is faucetEnabled=false on a prod deploy.
      throw new Error("faucet tx reverted (PTON likely deployed with faucetEnabled=false)");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("faucet receipt timeout");
}

async function topUp(ptonFloat) {
  if (!Number.isFinite(ptonFloat) || ptonFloat <= 0) throw new Error("amount must be > 0");
  // Convert PTON -> atto-PTON in BigInt space so we don't lose precision.
  const valueAtto = BigInt(Math.round(ptonFloat * 1_000_000)) * (ATTO / 1_000_000n);
  const { vault, pton } = await resolveDepositTargets();

  // Step 1 — issue a single-use topupId via the dedicated quote endpoint.
  // Done BEFORE asking the wallet to sign, so a quote failure never burns a
  // wallet signature. Works regardless of the wallet's current credit balance
  // (the previous probe-on-/v1/messages trick broke once the wallet had any
  // vault credit and the proxy started serving the probe call instead of
  // returning 402).
  const quote = await apiJson("/v1/topup/quote", {
    method: "POST",
    body: JSON.stringify({ amountPton: valueAtto.toString() }),
  });
  const topupId = quote.topupId;

  // Step 2 — sign the EIP-3009 TransferWithAuthorization for the deposit.
  const now = await chainNowSec();
  const ONE_YEAR_SEC = 31_536_000n; // tolerate large skew between wallet RPC and proxy/chain RPC
  const validAfter = now - ONE_YEAR_SEC;
  const validBefore = now + ONE_YEAR_SEC;
  const nonce = randomNonce();
  const sig = await signTopupAuth({ pton, vault, valueAtto, nonce, validAfter, validBefore });

  // Step 3 — POST /v1/topup/settle with X-PAYMENT to drive vault.depositX402.
  // The dedicated settle endpoint never forwards to the LLM, so the deposit
  // doesn't trigger a billed inference call and a transient LLM upstream
  // outage can't mask the deposit success with a 502/[object Object] error.
  // `from` keeps the wallet's preferred casing so the proxy's signature
  // recovery (which checksums via getAddress) lines up byte-for-byte.
  const payment = {
    x402Version: 1,
    scheme: "exact",
    network: `chain-${CHAIN_ID}`,
    payload: {
      signature: { v: sig.v, r: sig.r, s: sig.s },
      authorization: {
        from: sig.fromAddress,
        to: vault,
        value: valueAtto.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
      quoteId: topupId,
    },
  };
  const xPayment = btoa(JSON.stringify(payment));

  const settled = await api("/v1/topup/settle", {
    method: "POST",
    headers: { "x-payment": xPayment },
  });
  const settledBody = await settled.json().catch(() => null);
  if (!settled.ok) {
    // apiJson() helper would do this for us, but we need access to the
    // response headers on success — so the error coercion is hand-rolled.
    // String() guards against the proxy returning a structured error object
    // (which `${obj}` would render as "[object Object]").
    const raw =
      settledBody?.error?.message ??
      settledBody?.error ??
      settledBody?.detail ??
      `HTTP ${settled.status}`;
    const msg = typeof raw === "string" ? raw : JSON.stringify(raw);
    throw new Error(`deposit failed: ${msg}`);
  }
  return {
    txHash: settled.headers.get("x-payment-tx"),
    topupId: settled.headers.get("x-topup-id"),
  };
}

// ----------------------------- Swap → PTON pipeline -----------------------------
//
// User flow: pick USDC / USDT / ETH / WBTC, click Swap, watch 3-4 wallet pops
// fire in order, end up with vault credits.
//
// Route (verified on-chain 2026-05-20):
//
//   ERC-20 path:  input ──Uniswap V3──▶ WETH ──Uniswap V3──▶ WTON
//                    (fee per token)         (0.3% pool, 0xC29271…)
//                                    └──▶ WTON.swapToTON ▶ TON  (1 WTON_ray = 1e-9 TON_wei)
//                                                          └──▶ TON.approve(PTON) ▶ PTON.deposit ▶ PTON
//                                                                                    └──▶ EIP-3009 ▶ vault.depositX402
//
//   ETH  path:    SwapRouter02 with tokenIn=WETH, msg.value=amountIn (router auto-wraps),
//                 then identical WTON→TON→PTON→vault tail.
//
// Mainnet (chainId 1) contracts:
//   SwapRouter02      0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45
//   QuoterV2          0x61fFE014bA17989E743c5F6cB21bF9697530B21e
//   WETH              0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
//   WTON   (ray=27d)  0xc4A11aaf6ea915Ed7Ac194161d2fC9384F15bff2
//   TON    (18d)      0x2be5e8c109e2197D077D13A82dAead6a9b3433C5
//   PTON   (18d)      0x00D1EDcE8E7c617891FF76224DFf501c568f1Ce0  (PTON.ton() == TON above)
//
// Decimal contract: WTON uses 27-decimal "ray". TON / PTON use 18-decimal "wei".
// WTON.swapToTON(wtonRay) burns wtonRay from caller and mints (wtonRay / 1e9) TON_wei.

const SWAP_ADDRESSES = {
  USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, weth_fee: 500 /* 0.05% */ },
  USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, weth_fee: 500 },
  WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8, weth_fee: 3000 /* 0.3% */ },
  ETH:  { address: null,                                          decimals: 18, weth_fee: null /* native */ },
};
const SWAP_WETH         = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const SWAP_WTON         = "0xc4A11aaf6ea915Ed7Ac194161d2fC9384F15bff2";
const SWAP_TON          = "0x2be5e8c109e2197D077D13A82dAead6a9b3433C5";
const SWAP_ROUTER02     = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
const SWAP_QUOTER_V2    = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
const SWAP_WTON_FEE     = 3000;     // WETH/WTON pool fee
const WTON_RAY_PER_WEI  = 10n ** 9n; // WTON is 27d, TON is 18d → ratio 1e9

// ---------------------- tiny ABI encoding helpers (no deps) ----------------------

// Strip 0x, lowercase. Returns "" for falsy.
function _stripHex(h) {
  if (!h) return "";
  return String(h).replace(/^0x/i, "").toLowerCase();
}
// Left-pad to 32 bytes (64 hex chars).
function _pad32(hex) {
  const clean = _stripHex(hex);
  if (clean.length > 64) throw new Error(`_pad32: value too large (${clean.length} hex chars)`);
  return clean.padStart(64, "0");
}
// uint256 → 32-byte hex (no 0x).
function _encUint(n) {
  const big = typeof n === "bigint" ? n : BigInt(n);
  if (big < 0n) throw new Error("_encUint: negative");
  return _pad32(big.toString(16));
}
// address → 32-byte hex (no 0x).
function _encAddr(addr) {
  return _pad32(_stripHex(addr));
}
// 4-byte selector via keccak256 over the canonical signature.
// We don't have keccak in vanilla JS — but every selector we need is
// well-known, so we hard-code them as constants (audited against 4byte.directory).
const SEL_ERC20_APPROVE     = "095ea7b3"; // approve(address,uint256)
const SEL_ERC20_ALLOWANCE   = "dd62ed3e"; // allowance(address,address)
const SEL_ERC20_BALANCE_OF  = "70a08231"; // balanceOf(address)
const SEL_PTON_DEPOSIT      = "b6b55f25"; // deposit(uint256)
const SEL_WTON_SWAP_TO_TON  = "f53fe70f"; // swapToTON(uint256)
const SEL_ROUTER_EXACT_IN   = "b858183f"; // exactInput((bytes,address,uint256,uint256))
const SEL_QUOTER_EXACT_IN   = "cdca1753"; // quoteExactInput(bytes,uint256)

// parseUnits — convert a JS Number/string to BigInt atto units of given decimals,
// without floating-point drift for sane decimal strings.
function parseUnits(amount, decimals) {
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`parseUnits: bad amount "${amount}"`);
  const [wholeStr, fracStr = ""] = s.split(".");
  const fracPadded = (fracStr + "0".repeat(decimals)).slice(0, decimals);
  const combined = (wholeStr === "0" ? "" : wholeStr) + fracPadded;
  const cleaned = combined.replace(/^0+/, "") || "0";
  return BigInt(cleaned);
}

// formatUnits — BigInt → display string with `decimals` precision, trimmed.
function formatUnits(value, decimals, displayDigits = 6) {
  const big = typeof value === "bigint" ? value : BigInt(value);
  const neg = big < 0n;
  const abs = neg ? -big : big;
  const denom = 10n ** BigInt(decimals);
  const whole = abs / denom;
  const frac = abs % denom;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, displayDigits);
  const trimmed = fracStr.replace(/0+$/, "");
  const body = trimmed.length === 0 ? whole.toString() : `${whole.toString()}.${trimmed}`;
  return neg ? "-" + body : body;
}

// Build the Uniswap V3 path bytes: addr | fee(3) | addr | fee(3) | addr...
// Returns 0x-prefixed hex string suitable as a `bytes` arg.
function _buildV3Path(hops) {
  // hops = [{ token: addr }, { fee, token }, { fee, token }, ...]
  if (!Array.isArray(hops) || hops.length < 2) throw new Error("path needs >= 2 hops");
  let out = _stripHex(hops[0].token);
  for (let i = 1; i < hops.length; i++) {
    const h = hops[i];
    if (typeof h.fee !== "number") throw new Error(`hop ${i} missing fee`);
    out += h.fee.toString(16).padStart(6, "0"); // uint24 = 3 bytes = 6 hex
    out += _stripHex(h.token);
  }
  return "0x" + out;
}

// Encode `bytes` ABI param. Returns the dynamic offset+length+padded content
// suitable for splicing into a calldata payload. The CALLER manages the
// containing header (offsets).
function _encBytes(hex) {
  const clean = _stripHex(hex);
  const lenHex = _encUint(BigInt(clean.length / 2));
  // pad to 32-byte boundary
  const padded = clean + "0".repeat((64 - (clean.length % 64)) % 64);
  return { len: lenHex, content: padded };
}

// Encode a call to QuoterV2.quoteExactInput(bytes path, uint256 amountIn).
// QuoterV2 returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList,
//                    uint32[] initializedTicksCrossedList, uint256 gasEstimate).
// We only need amountOut — the first 32 bytes of the return data.
function _encQuoteExactInput(path, amountIn) {
  // Layout (after 4-byte selector):
  //   word 0: offset to `bytes path`  = 0x40 (64 = two words ahead)
  //   word 1: amountIn
  //   word 2: bytes length
  //   word 3+: padded bytes
  const b = _encBytes(path);
  const data = SEL_QUOTER_EXACT_IN
    + _encUint(64n)
    + _encUint(amountIn)
    + b.len
    + b.content;
  return "0x" + data;
}

// Encode SwapRouter02.exactInput((bytes path, address recipient,
//                                 uint256 amountIn, uint256 amountOutMinimum)).
// The struct is dynamic because it contains `bytes`, so the outer arg is also
// passed by offset. Layout:
//   word 0: offset to struct = 0x20
//   word 1..3: head of struct (offset to bytes, recipient, amountIn, amountOutMinimum)
//   word 4+: bytes payload (length + content padded)
function _encExactInput({ path, recipient, amountIn, amountOutMinimum }) {
  const b = _encBytes(path);
  // Inside the struct: 4 words (bytes offset, recipient, amountIn, amountOutMin).
  // Bytes offset (within struct) = 0x80 (4 * 32).
  const data = SEL_ROUTER_EXACT_IN
    + _encUint(32n)                         // offset to struct
    + _encUint(128n)                        // struct.bytes offset
    + _encAddr(recipient)
    + _encUint(amountIn)
    + _encUint(amountOutMinimum)
    + b.len
    + b.content;
  return "0x" + data;
}

// ---------------------- swap pipeline plumbing ----------------------

// Read ERC-20 allowance(owner, spender). Returns BigInt.
async function _readAllowance(token, owner, spender) {
  const data = "0x" + SEL_ERC20_ALLOWANCE + _encAddr(owner) + _encAddr(spender);
  const hex = await rpc("eth_call", [{ to: token, data }, "latest"]);
  return BigInt(hex);
}

// Read ERC-20 balanceOf(owner). Returns BigInt.
async function _readErc20Balance(token, owner) {
  const data = "0x" + SEL_ERC20_BALANCE_OF + _encAddr(owner);
  const hex = await rpc("eth_call", [{ to: token, data }, "latest"]);
  return BigInt(hex);
}

// Quote: amountIn of inputToken → WTON (in ray). For ERC-20 we go
// input→WETH→WTON. For ETH we go WETH→WTON directly (since the router pulls
// the ETH wrap from msg.value when tokenIn=WETH).
async function _quoteSwapToWton(inputToken, amountIn) {
  let hops;
  if (inputToken === "ETH") {
    hops = [{ token: SWAP_WETH }, { fee: SWAP_WTON_FEE, token: SWAP_WTON }];
  } else {
    const cfg = SWAP_ADDRESSES[inputToken];
    hops = [
      { token: cfg.address },
      { fee: cfg.weth_fee, token: SWAP_WETH },
      { fee: SWAP_WTON_FEE, token: SWAP_WTON },
    ];
  }
  const path = _buildV3Path(hops);
  const data = _encQuoteExactInput(path, amountIn);
  // QuoterV2 mutates storage with simulated swaps, so it MUST be invoked via
  // eth_call — never sent as a tx. (It's safe via eth_call because state mutation
  // inside eth_call is discarded.)
  const hex = await rpc("eth_call", [{ to: SWAP_QUOTER_V2, data }, "latest"]);
  // First 32 bytes of the return = amountOut (uint256 of WTON in ray).
  if (!hex || hex === "0x") throw new Error("quoter returned empty data");
  const amountOutWtonRay = BigInt("0x" + _stripHex(hex).slice(0, 64));
  return { path, amountOutWtonRay };
}

// Submit `data` from the user's wallet to `to` (optional `value`) and poll for
// receipt. Throws if the receipt reports failure or 90s timeout elapses.
async function _sendAndWait({ to, data, value }) {
  const from = await activeAccountOrThrow();
  const txParams = { from, to, data };
  if (value !== undefined && value > 0n) txParams.value = "0x" + value.toString(16);
  const txHash = await rpc("eth_sendTransaction", [txParams]);
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const rcpt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (rcpt) {
      if (rcpt.status === "0x1") return { txHash, rcpt };
      throw new Error(`tx ${txHash} reverted on-chain`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`tx ${txHash} receipt timeout after 90s`);
}

// Ensure `spender` has at least `amount` allowance of `token` from the user.
// Handles the USDT quirk: USDT (and a handful of other tokens) revert any
// approve() call where the current allowance is non-zero and the new allowance
// is also non-zero. The fix is the standard "approve(0) then approve(amount)"
// dance. We do that unconditionally for USDT to keep the code simple.
async function _ensureAllowance({ token, owner, spender, amount, symbol }) {
  const current = await _readAllowance(token, owner, spender);
  if (current >= amount) return; // already enough — skip
  const isUsdt = symbol === "USDT";
  if (isUsdt && current > 0n) {
    setStatus($("#swap-status"), `Resetting USDT allowance to 0…`);
    const data0 = "0x" + SEL_ERC20_APPROVE + _encAddr(spender) + _encUint(0n);
    await _sendAndWait({ to: token, data: data0 });
  }
  setStatus($("#swap-status"), `Approving ${symbol}…`);
  const data = "0x" + SEL_ERC20_APPROVE + _encAddr(spender) + _encUint(amount);
  await _sendAndWait({ to: token, data });
}

// Execute the full swap → wrap → vault pipeline.
async function swapToPton({ inputToken, inputAmountFloat, slippageBps }) {
  // ---- 0. validate inputs / wallet / chain --------------------------------
  if (!inputToken || !SWAP_ADDRESSES[inputToken]) {
    throw new Error(`Unsupported input token: ${inputToken}`);
  }
  if (!Number.isFinite(inputAmountFloat) || inputAmountFloat <= 0) {
    throw new Error("Amount must be > 0");
  }
  if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new Error("Slippage must be 0..10000 bps");
  }
  if (!state.provider || !state.wallet) {
    throw new Error("Connect a wallet first.");
  }
  if (CHAIN_ID !== 1) {
    throw new Error(`Swap is only supported on Ethereum mainnet (chainId=1); current=${CHAIN_ID}.`);
  }
  const user = await activeAccountOrThrow();
  await ensureChain();

  const cfg = SWAP_ADDRESSES[inputToken];
  const amountIn = parseUnits(inputAmountFloat, cfg.decimals);
  setStatus($("#swap-status"), `Quoting ${inputToken} → WTON…`);

  // ---- 1. quote via QuoterV2 → compute amountOutMinimum -------------------
  // QuoterV2 returns the expected WTON-ray output. We apply the user's
  // slippage tolerance to derive the minOut we'll pass to the router.
  const { path, amountOutWtonRay } = await _quoteSwapToWton(inputToken, amountIn);
  if (amountOutWtonRay === 0n) {
    throw new Error("Quote returned 0 — no liquidity on this route.");
  }
  const minOutWtonRay =
    (amountOutWtonRay * BigInt(10_000 - slippageBps)) / 10_000n;

  // The minimum TON we're guaranteed to be able to wrap from the swap.
  // We use the realized WTON balance delta post-swap (see step 3) as the
  // canonical wrap amount — that's safe against unrelated WTON dust the user
  // might already hold because we snapshot the balance *before* the swap.
  // This early sanity check just rejects quotes so small they'd round to 0.
  const minOutTonWei = minOutWtonRay / WTON_RAY_PER_WEI;
  if (minOutTonWei === 0n) {
    throw new Error("Quote too small (rounds to 0 TON). Increase amount.");
  }

  // Refresh the visible preview now that we have a real quote (overrides
  // the placeholder USD-price estimate the UI showed pre-click).
  try {
    const outEl = document.getElementById("swap-output-pton");
    if (outEl) outEl.textContent = formatUnits(minOutTonWei, 18, 6);
  } catch { /* presentational only */ }

  // ---- 2. stuck-flow recovery check ---------------------------------------
  // If the user already has WTON in their wallet (>= the amount this swap
  // would deliver), reuse it instead of doing another swap. This happens
  // when a previous attempt completed step 3 (swap) but failed somewhere
  // in step 4-6 (unwrap → deposit → vault) — the WTON ended up stranded
  // in the wallet. The simplest, gas-cheapest recovery is to skip the
  // fresh swap entirely and consume the existing WTON.
  const wtonBalanceBefore = await _readErc20Balance(SWAP_WTON, user);
  let wtonReceived; // amount we consider "ours" from this flow
  if (wtonBalanceBefore >= minOutWtonRay) {
    setStatus(
      $("#swap-status"),
      `Found ${formatUnits(wtonBalanceBefore / WTON_RAY_PER_WEI, 18, 4)} WTON from a previous attempt — reusing it (skipping swap).`,
    );
    wtonReceived = wtonBalanceBefore;
  } else {
    // ---- 3a. approve router (ERC-20 only) ---------------------------------
    if (inputToken !== "ETH") {
      await _ensureAllowance({
        token: cfg.address,
        owner: user,
        spender: SWAP_ROUTER02,
        amount: amountIn,
        symbol: inputToken,
      });
    }
    // ---- 3b. swap via SwapRouter02.exactInput → recipient = user ----------
    // For ETH input the router auto-wraps msg.value when path starts with WETH.
    // For ERC-20 the router uses the allowance we just set.
    setStatus(
      $("#swap-status"),
      inputToken === "ETH"
        ? `Swapping ETH → WTON via Uniswap V3…`
        : `Swapping ${inputToken} → WETH → WTON via Uniswap V3…`,
    );
    const swapData = _encExactInput({
      path,
      recipient: user,
      amountIn,
      amountOutMinimum: minOutWtonRay,
    });
    await _sendAndWait({
      to: SWAP_ROUTER02,
      data: swapData,
      value: inputToken === "ETH" ? amountIn : 0n,
    });
    // Use the realized post-swap WTON balance delta as the canonical amount
    // for wrap → vault — this guarantees we don't over-wrap (which would
    // revert in PTON.deposit on insufficient TON balance) and forwards the
    // full swap output, not just the minimum.
    const wtonBalanceAfter = await _readErc20Balance(SWAP_WTON, user);
    wtonReceived = wtonBalanceAfter - wtonBalanceBefore;
    if (wtonReceived < minOutWtonRay) {
      // The receipt said 0x1 but no WTON delta. Most likely the wallet
      // returned a stale tx hash (e.g. dedup of an identical previous
      // calldata) and we polled the OLD receipt. If the wallet's TOTAL
      // WTON balance now exceeds minOut, treat that as the swap output
      // (it must have come from somewhere — and the user paid for it).
      if (wtonBalanceAfter >= minOutWtonRay) {
        setStatus(
          $("#swap-status"),
          `Swap tx returned no new WTON, but wallet has ${formatUnits(wtonBalanceAfter / WTON_RAY_PER_WEI, 18, 4)} WTON — using that.`,
        );
        wtonReceived = wtonBalanceAfter;
      } else {
        throw new Error(
          `Swap underdelivered: got ${wtonReceived} WTON-ray, expected >= ${minOutWtonRay}`,
        );
      }
    }
  }
  // Convert ray→wei. Truncate any sub-1e9-ray dust (will sit in wallet as WTON).
  const tonToWrap = wtonReceived / WTON_RAY_PER_WEI;
  if (tonToWrap === 0n) {
    throw new Error("Swap produced sub-wei TON dust — increase amount.");
  }
  const wtonToBurn = tonToWrap * WTON_RAY_PER_WEI;

  // ---- 4. WTON.swapToTON(wtonToBurn) → user's TON balance ----------------
  setStatus($("#swap-status"), `Unwrapping WTON → TON…`);
  {
    const data = "0x" + SEL_WTON_SWAP_TO_TON + _encUint(wtonToBurn);
    await _sendAndWait({ to: SWAP_WTON, data });
  }

  // ---- 5. TON.approve(PTON, tonToWrap) ------------------------------------
  // Tokamak TON is a plain OZ ERC-20 with no USDT-style approve quirk, so the
  // single approve + deposit pattern is safe.
  await _ensureAllowance({
    token: SWAP_TON,
    owner: user,
    spender: state.pton ?? (await resolveDepositTargets()).pton,
    amount: tonToWrap,
    symbol: "TON",
  });

  // ---- 6. PTON.deposit(tonToWrap) → user's PTON balance -------------------
  setStatus($("#swap-status"), `Wrapping TON → PTON…`);
  const ptonAddr = state.pton ?? (await resolveDepositTargets()).pton;
  {
    const data = "0x" + SEL_PTON_DEPOSIT + _encUint(tonToWrap);
    await _sendAndWait({ to: ptonAddr, data });
  }

  // ---- 7. EIP-3009 sign + vault.depositX402 -------------------------------
  // Reuse the existing topUp() pipeline: it builds the same TransferWithAuth
  // we'd need (PTON, from=user, to=vault, value=ptonAmount) and POSTs
  // /v1/topup/settle which drives the vault deposit.
  setStatus($("#swap-status"), `Crediting vault…`);
  // topUp() takes a float — convert atto-PTON back to a float. Use truncated
  // micro-PTON arithmetic to match topUp()'s own atto<->float conversion path
  // (it does `BigInt(Math.round(f * 1e6)) * (ATTO/1e6)`), so we avoid creating
  // an atto value with sub-micro precision that topUp() would silently round.
  const microPton = tonToWrap / (ATTO / 1_000_000n); // 18d → 6d truncation
  if (microPton === 0n) throw new Error("Deposit too small (sub-micro PTON)");
  const ptonFloat = Number(microPton) / 1_000_000;
  await topUp(ptonFloat);

  // ---- 8. UI refresh + reset ---------------------------------------------
  setStatus(
    $("#swap-status"),
    `Done — ${formatUnits(tonToWrap, 18, 6)} PTON credited.`,
    "ok",
  );
  try {
    const amtEl = document.getElementById("swap-amount");
    if (amtEl) amtEl.value = "";
  } catch { /* ignore */ }
  // Refresh the on-chain numbers. Each loader is allowed to fail (e.g. proxy
  // briefly unavailable) without blocking the success status above.
  await Promise.all([
    loadCredits().catch(() => {}),
    loadWalletHoldings().catch(() => {}),
  ]);
  renderKpis();
}

// ----------------------------- Loaders -----------------------------

async function loadPrice() {
  try {
    const j = await apiJson("/v1/price");
    state.tonUsd = j.tonUsd;
    state.priceSnap = j.snapshot ?? null;
  } catch (e) {
    console.warn("loadPrice failed", e);
  }
}

async function loadCredits() {
  state.credits = await apiJson("/v1/credits/me");
}

// Read the connected wallet's native ETH balance and PTON token balance via
// the wallet's own EIP-1193 provider. PTON address is resolved once via the
// proxy's 402 probe (cached in `state.pton`).
async function loadWalletHoldings() {
  if (!state.provider || !state.wallet) {
    state.walletEth = null;
    state.walletPton = null;
    return;
  }
  try {
    const ethHex = await rpc("eth_getBalance", [state.wallet, "latest"]);
    state.walletEth = BigInt(ethHex);
    // Mirror native ETH into the per-token swap balance map for the "Max"
    // button on the Swap card. ETH wallet balance is in wei (1e18).
    state.walletBalances.ETH = Number(state.walletEth) / 1e18;
  } catch (e) {
    state.walletEth = null;
    console.warn("eth_getBalance failed", e);
  }
  try {
    if (!state.pton) await resolveDepositTargets();
    // balanceOf(address) selector + 32-byte left-padded address
    const padded = state.wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    const data = "0x70a08231" + padded;
    const ptonHex = await rpc("eth_call", [{ to: state.pton, data }, "latest"]);
    state.walletPton = BigInt(ptonHex);
    // Mirror PTON into the swap-card balance map too — handy so a user who
    // already holds PTON in their wallet can see it next to USDC/etc., and
    // for forward compat if we ever add PTON as a swap input (no-op route).
    state.walletBalances.PTON = Number(state.walletPton) / 1e18;
  } catch (e) {
    state.walletPton = null;
    console.warn("PTON.balanceOf failed", e);
  }
  // Pull the Swap-card ERC-20 balances (USDC / USDT / WBTC) so the "Max"
  // button works and the balance hint isn't perpetually "— USDC". These calls
  // are mainnet-only (the token addresses are mainnet constants); on any
  // other chain we silently leave the entries undefined so the UI shows "—".
  if (CHAIN_ID === 1) {
    for (const sym of ["USDC", "USDT", "WBTC"]) {
      const cfg = SWAP_ADDRESSES[sym];
      try {
        const padded = state.wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0");
        const data = "0x70a08231" + padded;
        const hex = await rpc("eth_call", [{ to: cfg.address, data }, "latest"]);
        const raw = BigInt(hex || "0x0");
        state.walletBalances[sym] = Number(raw) / 10 ** cfg.decimals;
      } catch (e) {
        // Swallow per-token RPC errors so one flaky read can't blank the
        // whole holdings card. Leaving the entry undefined falls back to "—".
        console.warn(`${sym}.balanceOf failed`, e);
      }
    }
  }
}

async function loadUsage() {
  state.usage = await apiJson("/v1/usage/summary");
}

async function loadKeys() {
  return apiJson("/v1/keys");
}

async function loadKeyUsage() {
  return apiJson("/v1/usage/keys");
}

async function loadCalls(reset = false) {
  if (reset) {
    state.callsCursor = null;
    state.callsLoaded = 0;
  }
  const q = new URLSearchParams({ limit: "50" });
  if (state.callsCursor) q.set("cursor", String(state.callsCursor));
  const j = await apiJson(`/v1/usage/calls?${q.toString()}`);
  state.callsCursor = j.nextCursor ?? null;
  state.callsLoaded += j.items.length;
  return j;
}

// ----------------------------- Renderers -----------------------------

function renderTopBar() {
  const pill = $("#wallet-pill");
  const addr = $("#wallet-addr");
  const chain = $("#chain-pill");
  const chainId = $("#chain-id");
  const logout = $("#logout-btn");
  if (state.session?.wallet) {
    addr.textContent = fmtAddr(state.session.wallet);
    pill.hidden = false;
    chainId.textContent = CHAIN_ID;
    chain.hidden = false;
    logout.hidden = false;
  } else {
    pill.hidden = true;
    chain.hidden = true;
    logout.hidden = true;
  }
}

function renderKpis() {
  const c = state.credits;
  // Server returns BOTH nested (c.ledger.balance) and flat (c.balance).
  // Prefer nested for clients that expect the structured shape, fall back
  // to flat for forward/backward compat with the simpler API surface.
  const balance = c?.ledger?.balance ?? c?.balance ?? c?.onChainCredits;
  const reserved = c?.ledger?.reserved ?? c?.reserved ?? 0n;
  const accrued = c?.ledger?.accrued ?? c?.accrued ?? 0n;
  $("#kpi-balance").textContent = fmtPton(balance);
  $("#kpi-reserved").textContent = fmtPton(reserved);
  $("#kpi-accrued").textContent = fmtPton(accrued);
  $("#kpi-balance-usd").textContent = fmtUsdFromAttoPton(balance, state.tonUsd);
  // Wallet holdings (outside the vault). ETH and PTON share 18 decimals so
  // fmtPton works for both — only the unit label differs.
  $("#kpi-wallet-pton").textContent = fmtPton(state.walletPton);
  $("#kpi-wallet-eth").textContent = fmtPton(state.walletEth);

  $("#kpi-price").textContent = state.tonUsd ? state.tonUsd.toFixed(4) : "—";
  $("#kpi-price-source").textContent = state.priceSnap?.source ?? "—";
  $("#kpi-price-age").textContent = fmtAge(state.priceSnap?.ageMs ?? null);

  const u = state.usage;
  $("#kpi-calls").textContent = fmtNumber(u?.calls ?? 0);
  $("#kpi-calls-ok").textContent = fmtNumber(u?.successCalls ?? 0);
  $("#kpi-calls-fail").textContent = fmtNumber(u?.failedCalls ?? 0);
  $("#usage-retention").textContent = String(u?.retentionDays ?? "90");

  // Sync swap card balance hint whenever wallet balances refresh.
  renderSwapPreview();
}

function renderUsageOverview() {
  const u = state.usage;
  $("#usage-input").textContent = fmtNumber(u?.totalInputTokens ?? 0);
  $("#usage-output").textContent = fmtNumber(u?.totalOutputTokens ?? 0);
  $("#usage-spent").textContent = fmtPton(u?.totalActualPton ?? 0n);
  $("#usage-cache-read").textContent = fmtNumber(u?.totalCacheReadTokens ?? 0);
  $("#usage-cache-write").textContent = fmtNumber(u?.totalCacheWriteTokens ?? 0);
}

function renderByDay() {
  drawBarChart("chart-byday", (state.usage?.byDay ?? []).map((d) => ({ label: d.day.slice(5), value: d.calls })));
}

function renderByModel() {
  const rows = state.usage?.byModel ?? [];
  drawBarChart("chart-bymodel", rows.map((r) => ({ label: r.model, value: r.calls })));
  const tbody = $("#bymodel-rows");
  tbody.innerHTML = "";
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">No calls in the last 30 days.</td></tr>`;
    return;
  }
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escape(r.model)}</td>
      <td class="num">${fmtNumber(r.calls)}</td>
      <td class="num">${fmtNumber(r.inputTokens)}</td>
      <td class="num">${fmtNumber(r.outputTokens)}</td>
      <td class="num">${fmtPton(r.actualPton)}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function renderByKey() {
  let rows;
  try {
    rows = (await loadKeyUsage()).items;
  } catch (e) {
    console.warn("loadKeyUsage failed", e);
    rows = [];
  }
  const tbody = $("#bykey-rows");
  tbody.innerHTML = "";
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">No keyed activity in the last 30 days.</td></tr>`;
    return;
  }
  for (const r of rows) {
    const tr = document.createElement("tr");
    const idLabel = r.apiKeyId ? r.apiKeyId : "session";
    const nameLabel = r.apiKeyId ? (r.name ?? "—") : "(SIWE bearer)";
    tr.innerHTML = `
      <td><code>${escape(idLabel)}</code></td>
      <td>${escape(nameLabel)}</td>
      <td class="num">${fmtNumber(r.calls)}</td>
      <td class="num">${fmtNumber(r.inputTokens)}</td>
      <td class="num">${fmtNumber(r.outputTokens)}</td>
      <td class="num">${fmtPton(r.actualPton)}</td>
      <td>${fmtTimestamp(r.lastUsedAt)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderCallsRows(items, append) {
  const tbody = $("#calls-rows");
  if (!append) tbody.innerHTML = "";
  if (state.callsLoaded === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">No calls recorded yet — run a request through the proxy and reload.</td></tr>`;
    return;
  }
  for (const r of items) {
    const tr = document.createElement("tr");
    const outcomeClass = r.outcome.startsWith("success")
      ? "outcome-success"
      : r.outcome === "upstream_failed" || r.outcome.startsWith("upstream_")
        ? "outcome-failed"
        : "outcome-other";
    tr.innerHTML = `
      <td>${fmtTimestamp(r.ts)}</td>
      <td>${escape(r.model)}</td>
      <td><code>${escape(r.apiKeyId ?? "session")}</code></td>
      <td class="num">${fmtNumber(r.inputTokens)}</td>
      <td class="num">${fmtNumber(r.outputTokens)}</td>
      <td class="num">${fmtPton(r.actualPton)}</td>
      <td><span class="outcome-pill ${outcomeClass}">${escape(r.outcome)}</span></td>
    `;
    tbody.appendChild(tr);
  }
  $("#calls-status").textContent = state.callsCursor
    ? `Showing ${state.callsLoaded} rows (more available)`
    : `Showing ${state.callsLoaded} rows (end of log)`;
  $("#calls-load-more").disabled = state.callsCursor === null;
}

async function renderKeysTable() {
  const tbody = $("#key-rows");
  tbody.innerHTML = "";
  let keys;
  try {
    keys = (await loadKeys()).keys;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">Could not load keys: ${escape(e.message)}</td></tr>`;
    return;
  }
  if (keys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No keys yet — mint one above to start using Claude Code with this wallet.</td></tr>`;
    return;
  }
  for (const k of keys) {
    const tr = document.createElement("tr");
    const status = k.revokedAt ? `<span class="outcome-pill outcome-failed">revoked</span>` : `<span class="outcome-pill outcome-success">active</span>`;
    const action = k.revokedAt
      ? `<button class="btn btn-danger btn-small" type="button" data-delete="${escape(k.id)}" title="Permanently remove this revoked key from the database">Delete</button>`
      : `<button class="btn btn-danger btn-small" type="button" data-revoke="${escape(k.id)}">Revoke</button>`;
      // Note: Delete (hard-delete) is intentionally NOT shown next to Revoke
      // for active keys — Revoke first, then Delete the revoked row. Avoids
      // accidentally wiping an active key (which would lose all in-flight
      // billing for any process still using it).
    tr.innerHTML = `
      <td><code>${escape(k.id)}</code></td>
      <td>${escape(k.name ?? "—")}</td>
      <td>${fmtTimestamp(k.createdAt)}</td>
      <td>${k.lastUsedAt ? fmtTimestamp(k.lastUsedAt) : "—"}</td>
      <td>${status}</td>
      <td>${action}</td>
    `;
    tbody.appendChild(tr);
  }
  for (const btn of tbody.querySelectorAll("[data-revoke]")) {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-revoke");
      btn.disabled = true;
      try {
        await apiJson(`/v1/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
        await renderKeysTable();
      } catch (e) {
        setStatus($("#key-create-status"), `Revoke failed: ${e.message}`, "err");
      } finally {
        btn.disabled = false;
      }
    });
  }
  // Hard-delete (?hard=true) removes the row from the DB instead of soft-
  // revoking. Soft revoke keeps the row for audit trail but accumulates
  // unbounded over time; hard delete reclaims the row. Call-log history
  // survives because billing_call_log.api_key_id has no FK constraint.
  for (const btn of tbody.querySelectorAll("[data-delete]")) {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-delete");
      if (!window.confirm(`Permanently delete API key ${id}?\nThis cannot be undone.`)) return;
      btn.disabled = true;
      try {
        await apiJson(`/v1/keys/${encodeURIComponent(id)}?hard=true`, { method: "DELETE" });
        await renderKeysTable();
      } catch (e) {
        setStatus($("#key-create-status"), `Delete failed: ${e.message}`, "err");
      } finally {
        btn.disabled = false;
      }
    });
  }
}

// ----------------------------- Charts (zero-dep canvas) -----------------------------

function drawBarChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  // Match the canvas back-buffer to its CSS box for crisp rendering.
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width || canvas.width, 200);
  const h = Math.max(rect.height || canvas.height, 200);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (!data.length) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data in window.", w / 2, h / 2);
    return;
  }
  const padL = 36, padR = 16, padT = 16, padB = 28;
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = (w - padL - padR) / data.length;

  // Axes
  ctx.strokeStyle = "#1c1c2a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, h - padB);
  ctx.lineTo(w - padR, h - padB);
  ctx.stroke();

  // Y grid + labels (3 horizontal lines)
  ctx.fillStyle = "#6b7280";
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.textAlign = "right";
  for (let i = 0; i <= 3; i++) {
    const y = padT + ((h - padT - padB) * (3 - i)) / 3;
    const v = Math.round((max * i) / 3);
    ctx.fillText(String(v), padL - 6, y + 3);
    ctx.strokeStyle = "rgba(28,28,42,0.7)";
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  // Bars
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const x = padL + i * barW + 2;
    const innerW = Math.max(2, barW - 4);
    const barH = ((h - padT - padB) * d.value) / max;
    const y = h - padB - barH;
    // Match the parent app's lime accent. Read the computed --accent so
    // any postMessage theme push from the host re-skins charts on next
    // redraw without code changes here.
    const accent = (typeof getComputedStyle === "function"
      ? getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()
      : "") || "#c4f547";
    ctx.fillStyle = accent;
    // Subtle rounded-top bars
    const r = Math.min(3, innerW / 2);
    if (barH > r * 2) {
      ctx.beginPath();
      ctx.moveTo(x, y + barH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + innerW - r, y);
      ctx.quadraticCurveTo(x + innerW, y, x + innerW, y + r);
      ctx.lineTo(x + innerW, y + barH);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(x, y, innerW, barH);
    }
  }

  // X labels (truncate to fit)
  ctx.fillStyle = "#9ca3af";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "center";
  const everyN = Math.max(1, Math.ceil(data.length / 10));
  for (let i = 0; i < data.length; i += everyN) {
    const x = padL + i * barW + barW / 2;
    let label = data[i].label;
    if (label.length > 12) label = label.slice(0, 11) + "…";
    ctx.fillText(label, x, h - padB + 14);
  }
}

// HTML escape — prevents arbitrary model ids / outcomes from injecting markup.
function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

// ----------------------------- View switching -----------------------------

function showLoginView() {
  $("#view-login").hidden = false;
  $("#view-app").hidden = true;
  renderTopBar();
}

function showAppView() {
  $("#view-login").hidden = true;
  $("#view-app").hidden = false;
  renderTopBar();
}

async function refreshAll() {
  // Run independent fetches in parallel for snappier first paint.
  const work = [
    loadPrice().catch(() => {}),
    loadCredits().catch(() => {}),
    loadUsage().catch(() => {}),
    loadWalletHoldings().catch(() => {}),
  ];
  await Promise.all(work);
  renderKpis();
  renderUsageOverview();
  renderByDay();
  renderByModel();
  await renderKeysTable();
  await renderByKey();
  // Calls is paginated and lazy — only initial page.
  try {
    const page = await loadCalls(true);
    renderCallsRows(page.items, false);
  } catch (e) {
    console.warn("loadCalls failed", e);
  }
}

// ----------------------------- Wiring -----------------------------

function wireTabs() {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => {
        // is-active is the new class; .active is preserved for any legacy
        // CSS reader (the stylesheet keys off both).
        t.classList.remove("is-active", "active");
        t.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".tab-pane").forEach((p) => (p.hidden = true));
      tab.classList.add("is-active", "active");
      tab.setAttribute("aria-selected", "true");
      const name = tab.getAttribute("data-tab");
      state.activeTab = name;
      const pane = document.querySelector(`.tab-pane[data-pane="${name}"]`);
      if (pane) pane.hidden = false;
      // Re-render charts on display: canvas needs measured CSS box to size.
      if (name === "byday") renderByDay();
      if (name === "bymodel") renderByModel();
    });
  }
}

function wireTopupPresets() {
  for (const b of document.querySelectorAll("#topup-preset-row .chip")) {
    b.addEventListener("click", () => {
      $("#topup-amount").value = b.getAttribute("data-preset");
      updateTopupUsd();
    });
  }
  $("#topup-amount").addEventListener("input", updateTopupUsd);
}

function updateTopupUsd() {
  const v = parseFloat($("#topup-amount").value);
  const estEl = $("#topup-est-pton");
  if (estEl) estEl.textContent = Number.isFinite(v) && v > 0 ? String(v) : "0";
  if (!Number.isFinite(v) || v <= 0 || !state.tonUsd) {
    $("#topup-usd").textContent = "—";
    return;
  }
  $("#topup-usd").textContent = (v * state.tonUsd).toFixed(2);
}

function wireKeyCreate() {
  $("#key-create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#key-create-status");
    const name = $("#key-name").value.trim();
    setStatus(status, "Minting…");
    try {
      const r = await apiJson("/v1/keys", {
        method: "POST",
        body: JSON.stringify(name ? { name } : {}),
      });
      // Show the plaintext exactly once — modal blocks closing without ack.
      const modal = $("#key-modal");
      $("#key-modal-value").textContent = r.key;
      modal.hidden = false;
      $("#key-name").value = "";
      setStatus(status, `Minted key ${r.id}`, "ok");
      await renderKeysTable();
    } catch (e) {
      setStatus(status, `Mint failed: ${e.message}`, "err");
    }
  });
  $("#key-modal-close").addEventListener("click", () => ($("#key-modal").hidden = true));
  $("#key-modal-copy").addEventListener("click", async () => {
    const text = $("#key-modal-value").textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setStatus($("#key-modal-copy-status"), "Copied to clipboard.", "ok");
    } catch {
      setStatus($("#key-modal-copy-status"), "Copy failed — select the value above and copy manually.", "err");
    }
  });

  // ── "Install & Restart Agent" — open the confirm modal ────────────────
  $("#key-modal-install").addEventListener("click", () => {
    // Reset any prior status text in the confirm modal so the user starts
    // from a clean slate if they bounce in and out of the confirm dialog.
    setStatus($("#key-install-status"), "");
    $("#key-install-modal").hidden = false;
    $("#key-install-confirm").disabled = false;
    $("#key-install-cancel").disabled = false;
  });
  $("#key-install-cancel").addEventListener("click", () => {
    $("#key-install-modal").hidden = true;
  });
  $("#key-install-confirm").addEventListener("click", async () => {
    const installStatus = $("#key-install-status");
    const confirmBtn = $("#key-install-confirm");
    const cancelBtn = $("#key-install-cancel");
    const key = $("#key-modal-value").textContent?.trim() ?? "";
    if (!/^sk-ai-[A-Za-z0-9_-]{16,}$/.test(key)) {
      setStatus(installStatus, "Key text is not a valid sk-ai-... value.", "err");
      return;
    }
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    setStatus(installStatus, "Writing key to .env…");
    try {
      // Step 1: write the .env. CRITICAL: this MUST hit the local agent,
      // not the remote billing gateway — the gateway has no access to the
      // user's local filesystem. We use a same-origin fetch (no PROXY_BASE
      // prefix) so it lands on the local agent's /v1/keys/install handler.
      // (apiJson() prefixes PROXY_BASE which in client-mode = Railway URL.)
      const installRes = await fetch("/v1/keys/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!installRes.ok) {
        let body = null;
        try { body = await installRes.json(); } catch {}
        throw new Error(
          body?.error || `HTTP ${installRes.status} from /v1/keys/install`,
        );
      }
      setStatus(installStatus, "Key saved. Requesting agent restart…");
      // Step 2: trigger the restart via the existing /api/restart endpoint.
      // That endpoint handles dev (in-process runtime bounce via
      // setRestartHandler) and prod (process.exit + supervisor respawn)
      // correctly; we don't reimplement that strategy here.
      // /api/restart returns BEFORE the runtime is torn down (1s setTimeout),
      // so this request itself succeeds. The poll below catches the moment
      // the runtime is back up.
      const restartRes = await fetch("/api/restart", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!restartRes.ok) {
        throw new Error(
          `/api/restart returned HTTP ${restartRes.status} — key was saved but agent did not restart. Try restarting manually.`,
        );
      }
      setStatus(installStatus, "Agent restarting — waiting for it to come back…");
      // Poll until /v1/price answers 200 again. The restart cycle is
      // typically a few seconds; we allow up to 60s for slow rebuilds.
      const restored = await waitForServerBack({ timeoutMs: 60_000 });
      if (restored) {
        setStatus(installStatus, "Agent is back online — reloading page…", "ok");
        setTimeout(() => window.location.reload(), 800);
      } else {
        setStatus(
          installStatus,
          "Agent did not come back online within 60s. Check your terminal — you may need to relaunch it manually.",
          "err",
        );
        cancelBtn.disabled = false;
      }
    } catch (err) {
      setStatus(installStatus, `Install failed: ${err.message}`, "err");
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });
}

// Poll the agent for availability — used by the install-and-restart flow.
// We hit a fast public endpoint and treat ANY 2xx response as "back up".
// During restart the fetch first throws (TCP refused), then briefly may
// return 503 while the runtime initializes, then settles to 200.
async function waitForServerBack({ timeoutMs = 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  // Initial settle delay so we don't poll the still-alive pre-exit server.
  // The server told us restartDelayMs=1500 — add a small safety margin.
  await new Promise((r) => setTimeout(r, 2_000));
  while (Date.now() < deadline) {
    try {
      // /v1/price is a small, cache-able, unauthenticated endpoint.
      // Cache-bust with a timestamp param so the browser doesn't serve a
      // 200 from disk cache while the actual server is still down.
      const resp = await fetch(`/v1/price?_=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
      });
      if (resp.ok) return true;
    } catch {
      // TCP refused / DNS fail / fetch abort — server still down, keep waiting.
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return false;
}

function wireFaucet() {
  const btn = $("#faucet-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const status = $("#faucet-status");
    const v = parseFloat($("#faucet-amount").value);
    if (!Number.isFinite(v) || v <= 0) {
      setStatus(status, "Amount must be > 0", "err");
      return;
    }
    btn.disabled = true;
    setStatus(status, "Awaiting wallet signature…");
    try {
      const tx = await mintFaucet(v);
      setStatusHtml(status, `Minted ${escape(String(v))} PTON (tx ${fmtLink(tx, "tx")}).`, "ok");
      await refreshAll();
    } catch (e) {
      setStatus(status, `Failed: ${e.message}`, "err");
    } finally {
      btn.disabled = false;
    }
  });
}

function wireTopup() {
  $("#topup-btn").addEventListener("click", async () => {
    const status = $("#topup-status");
    const v = parseFloat($("#topup-amount").value);
    if (!Number.isFinite(v) || v <= 0) {
      setStatus(status, "Amount must be > 0", "err");
      return;
    }
    $("#topup-btn").disabled = true;
    setStatus(status, "Awaiting wallet signature…");
    try {
      const r = await topUp(v);
      setStatusHtml(status, `Deposit confirmed (tx ${fmtLink(r.txHash, "tx")}).`, "ok");
      await refreshAll();
    } catch (e) {
      setStatus(status, `Failed: ${e.message}`, "err");
    } finally {
      $("#topup-btn").disabled = false;
    }
  });
}

// ----------------------------- Swap card wiring -----------------------------

function getSelectedSwapToken() {
  return SWAP_TOKENS.find((t) => t.symbol === state.swapInputToken) ?? SWAP_TOKENS[0];
}

function renderSwapTokenDisplay() {
  const tok = getSelectedSwapToken();
  const icon = document.getElementById("swap-token-icon");
  const label = document.getElementById("swap-token-label");
  if (icon) {
    icon.src = tok.icon;
    icon.alt = `${tok.symbol} logo`;
  }
  if (label) label.textContent = tok.symbol;
}

function renderSwapTokenMenu() {
  const menu = document.getElementById("swap-token-menu");
  if (!menu) return;
  menu.innerHTML = "";
  for (const t of SWAP_TOKENS) {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "token-option";
    opt.setAttribute("role", "option");
    opt.setAttribute("data-symbol", t.symbol);
    opt.innerHTML = `
      <img class="token-icon" src="${escape(t.icon)}" alt="" />
      <span>${escape(t.symbol)}</span>
      <span class="token-option-sub">${escape(t.name)}</span>
    `;
    opt.addEventListener("click", (ev) => {
      ev.stopPropagation();
      state.swapInputToken = t.symbol;
      renderSwapTokenDisplay();
      renderSwapRoute();
      renderSwapPreview();
      closeSwapTokenMenu();
    });
    menu.appendChild(opt);
  }
}

function openSwapTokenMenu() {
  const menu = document.getElementById("swap-token-menu");
  const sel = document.getElementById("swap-token-select");
  if (!menu || !sel) return;
  menu.hidden = false;
  sel.setAttribute("aria-expanded", "true");
}

function closeSwapTokenMenu() {
  const menu = document.getElementById("swap-token-menu");
  const sel = document.getElementById("swap-token-select");
  if (!menu || !sel) return;
  menu.hidden = true;
  sel.setAttribute("aria-expanded", "false");
}

function renderSwapRoute() {
  const route = document.getElementById("swap-route");
  if (!route) return;
  const tok = getSelectedSwapToken();
  // ETH skips the first leg; non-ETH ERC-20 routes via ETH on the way to TON.
  const steps = tok.symbol === "ETH"
    ? ["ETH", "TON", "PTON"]
    : [tok.symbol, "ETH", "TON", "PTON"];
  route.innerHTML = steps
    .map((s, i) => {
      const isEnd = i === steps.length - 1;
      const stepHtml = `<span class="route-step${isEnd ? " route-step-end" : ""}">${escape(s)}</span>`;
      return i < steps.length - 1 ? `${stepHtml}<span class="route-arrow">→</span>` : stepHtml;
    })
    .join("");
}

function renderSwapPreview() {
  const tok = getSelectedSwapToken();
  const amtEl = document.getElementById("swap-amount");
  const outPton = document.getElementById("swap-output-pton");
  const outUsd = document.getElementById("swap-output-usd");
  const balEl = document.getElementById("swap-input-balance");
  const btn = document.getElementById("swap-btn");

  // Balance hint (the engineer will hydrate state.walletBalances on token
  // selection / approve; ETH is mirrored from state.walletEth in
  // loadWalletHoldings()).
  const bal = state.walletBalances[tok.symbol];
  if (balEl) {
    balEl.textContent = (typeof bal === "number" && bal >= 0)
      ? `${bal.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tok.symbol}`
      : `— ${tok.symbol}`;
  }

  const v = parseFloat(amtEl?.value ?? "");
  const tokenUsd = state.tokenPrices[tok.symbol] ?? null;
  const tonUsd = state.tonUsd ?? null;

  // Output preview: inputAmount × tokenUsd / tonUsd. Both prices are
  // placeholder until the engineer wires a real quote feed.
  let pton = 0;
  let usd = 0;
  if (Number.isFinite(v) && v > 0 && tokenUsd && tonUsd) {
    usd = v * tokenUsd;
    pton = usd / tonUsd;
  }
  if (outPton) {
    outPton.textContent = (Number.isFinite(v) && v > 0 && tokenUsd && tonUsd)
      ? pton.toLocaleString(undefined, { maximumFractionDigits: 6 })
      : "0.00";
  }
  if (outUsd) {
    outUsd.textContent = (Number.isFinite(v) && v > 0 && tokenUsd)
      ? usd.toFixed(2)
      : "—";
  }

  // CTA state machine: needs wallet, then amount, then enabled.
  if (btn) {
    if (!state.session?.wallet) {
      btn.disabled = true;
      btn.textContent = "Connect wallet";
    } else if (!Number.isFinite(v) || v <= 0) {
      btn.disabled = true;
      btn.textContent = "Enter an amount";
    } else {
      btn.disabled = false;
      btn.textContent = `Swap ${tok.symbol} to PTON`;
    }
  }
}

function wireSwap() {
  // Token dropdown
  const sel = document.getElementById("swap-token-select");
  if (sel) {
    sel.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = document.getElementById("swap-token-menu");
      if (!menu) return;
      if (menu.hidden) openSwapTokenMenu();
      else closeSwapTokenMenu();
    });
    sel.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        sel.click();
      } else if (e.key === "Escape") {
        closeSwapTokenMenu();
      }
    });
  }
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("swap-token-menu");
    if (!menu || menu.hidden) return;
    const within = e.target.closest && e.target.closest("#swap-token-select");
    if (!within) closeSwapTokenMenu();
  });

  // Amount input
  const amtEl = document.getElementById("swap-amount");
  if (amtEl) amtEl.addEventListener("input", renderSwapPreview);

  // Max button
  const maxBtn = document.getElementById("swap-max-btn");
  if (maxBtn) {
    maxBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const tok = getSelectedSwapToken();
      const bal = state.walletBalances[tok.symbol];
      if (typeof bal === "number" && bal > 0 && amtEl) {
        amtEl.value = String(bal);
        renderSwapPreview();
      } else {
        setStatus($("#swap-status"), `No ${tok.symbol} balance detected.`, "");
      }
    });
  }

  // Slippage buttons
  for (const b of document.querySelectorAll(".slippage-btn")) {
    b.addEventListener("click", () => {
      document.querySelectorAll(".slippage-btn").forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      state.swapSlippageBps = Number(b.getAttribute("data-slippage")) || 50;
    });
  }

  // CTA — drives the full Swap → wrap → vault pipeline. `swapToPton` sets a
  // detailed "Done — N PTON credited" status itself before returning, so we
  // deliberately do NOT overwrite it here on success. On failure, surface the
  // error to the same status line.
  const swapBtn = document.getElementById("swap-btn");
  if (swapBtn) {
    swapBtn.addEventListener("click", async () => {
      const status = $("#swap-status");
      const tok = getSelectedSwapToken();
      const v = parseFloat(amtEl?.value ?? "");
      if (!state.session?.wallet) {
        setStatus(status, "Connect a wallet first.", "err");
        return;
      }
      if (!Number.isFinite(v) || v <= 0) {
        setStatus(status, "Amount must be > 0", "err");
        return;
      }
      swapBtn.disabled = true;
      setStatus(status, `Preparing ${tok.symbol} → PTON swap…`);
      try {
        await swapToPton({
          inputToken: tok.symbol,
          inputAmountFloat: v,
          slippageBps: state.swapSlippageBps,
        });
        // swapToPton already set "Done — N PTON credited" + refreshed credits
        // and wallet holdings. refreshAll re-fetches usage + price + keys so
        // the dashboard's other KPIs are also in sync after a long swap flow.
        await refreshAll();
      } catch (e) {
        setStatus(status, e.message, "err");
      } finally {
        renderSwapPreview(); // re-evaluate CTA label
      }
    });
  }

  // Initial render
  renderSwapTokenMenu();
  renderSwapTokenDisplay();
  renderSwapRoute();
  renderSwapPreview();
}

function wireCallsPager() {
  $("#calls-load-more").addEventListener("click", async () => {
    if (!state.callsCursor) return;
    $("#calls-load-more").disabled = true;
    try {
      const page = await loadCalls(false);
      renderCallsRows(page.items, true);
    } catch (e) {
      $("#calls-status").textContent = `Load failed: ${e.message}`;
    }
  });
}

function wireLogout() {
  $("#logout-btn").addEventListener("click", () => {
    saveSession(null);
    location.reload();
  });
}

function wireSwitchChain() {
  const btn = document.getElementById("switch-chain-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = "Switching…";
    try {
      if (!state.provider) state.provider = detectProvider();
      if (!state.provider) throw new Error("No browser wallet detected.");
      await ensureChain();
      await refreshChainPill();
    } catch (e) {
      // Surface the failure on the topbar pill so the user knows why.
      const idEl = document.getElementById("chain-id");
      if (idEl) idEl.title = e.message;
      console.error("[dashboard] manual switch failed", e);
      alert(`Network switch failed: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
}

function wireLogin() {
  $("#connect-btn").addEventListener("click", async () => {
    const status = $("#login-status");
    setStatus(status, "Connecting wallet…");
    try {
      await connectWallet();
      setStatus(status, `Connected ${fmtAddr(state.wallet)}. Click "Sign in" to issue a session token.`, "ok");
      $("#connect-btn").hidden = true;
      $("#signin-btn").hidden = false;
    } catch (e) {
      setStatus(status, `Connect failed: ${e.message}`, "err");
    }
  });
  $("#signin-btn").addEventListener("click", async () => {
    const status = $("#login-status");
    setStatus(status, "Awaiting EIP-712 signature…");
    try {
      await siweLogin();
      setStatus(status, "Signed in.", "ok");
      showAppView();
      await refreshAll();
      startAutoRefresh();
    } catch (e) {
      setStatus(status, `Sign-in failed: ${e.message}`, "err");
    }
  });
}

// ----------------------------- Embed mode -----------------------------
//
// When the dashboard is mounted inside the parent app shell, the iframe is
// loaded with `?embed=1` (see BillingPageView.tsx). The pre-paint script in
// index.html already sets <html data-embed="1"> so the stylesheet hides
// the dashboard's own topbar — but the wallet/chain/logout chips inside
// `.topbar-right` are still load-bearing (every #wallet-pill / #chain-pill /
// #logout-btn handler in this file targets them by id). We MOVE the node
// (not clone) into a slim `.session-strip` inside #view-app so the IDs stay
// reachable. A `message` listener accepts theme-token pushes from the host.

function setupEmbedMode() {
  const embedded = document.documentElement.dataset.embed === "1";
  if (!embedded) return;

  // Relocate the topbar-right chips into #view-app as a session strip.
  const right = document.querySelector(".topbar-right");
  const viewApp = document.querySelector("#view-app");
  if (right && viewApp && !document.querySelector(".session-strip")) {
    const strip = document.createElement("div");
    strip.className = "session-strip";
    strip.appendChild(right); // move, don't clone — IDs stay intact
    viewApp.prepend(strip);
  }

  // Accept theme-token pushes from the parent. Same-origin only.
  // Tokens write directly onto :root custom properties — every visual in
  // this stylesheet keys off those, so a single push re-skins the UI.
  window.addEventListener("message", (ev) => {
    if (ev.origin !== location.origin) return;
    const data = ev.data;
    if (!data || data.source !== "tal-host" || data.type !== "theme") return;
    const tokens = data.tokens || {};
    const root = document.documentElement;
    const map = {
      bg0: "--bg-0",
      bg1: "--bg-1",
      bg2: "--bg-2",
      line: "--line",
      text: "--text",
      muted: "--muted",
      accent: "--accent",
      accent2: "--accent-2",
    };
    for (const k in map) {
      if (typeof tokens[k] === "string" && tokens[k].length > 0) {
        root.style.setProperty(map[k], tokens[k]);
      }
    }
    if (typeof data.mode === "string") root.dataset.theme = data.mode;
  });
}

// ----------------------------- Periodic refresh -----------------------------
//
// Operators expect KPI cards (balance, price, recent calls) to update without
// manual page reloads. We poll every REFRESH_INTERVAL_MS, but only when the
// tab is visible — Page Visibility avoids burning RPC quota and SQLite reads
// on backgrounded tabs. The refresh is a no-op when no SIWE session is active.
//
// A single in-flight guard prevents overlapping refreshes when a slow API
// call exceeds the interval (e.g. an unhealthy TWAP read can take several
// seconds before the cache stale-fallback kicks in).

const REFRESH_INTERVAL_MS = 30_000;
let refreshTimer = null;
let refreshInFlight = false;

async function tickRefresh() {
  if (refreshInFlight) return;
  if (!state.session) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  refreshInFlight = true;
  try {
    await refreshAll();
  } catch (e) {
    console.warn("[dashboard] periodic refresh failed", e);
  } finally {
    refreshInFlight = false;
  }
}

function startAutoRefresh() {
  if (refreshTimer !== null) return;
  refreshTimer = setInterval(tickRefresh, REFRESH_INTERVAL_MS);
  // Immediate tick when the tab regains focus — operators commonly check the
  // dashboard right after switching away to inspect a tx; waiting up to 30s
  // for the next interval would feel laggy.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void tickRefresh();
    });
  }
}

// ----------------------------- Boot -----------------------------

// ============================================================================
// x402 Outbound section — talks to the agent's main API port (/api/integrations/x402/*)
// ============================================================================

/**
 * The x402 endpoints live on the AGENT's API port (default 31337 — same
 * origin as the dashboard when served via the agent process), NOT on the
 * billing gateway. Use a relative URL so it follows whichever origin
 * loaded the dashboard.
 */
const X402_BASE = "/api/integrations/x402";

function shortAddr(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function setX402SaveStatus(msg, tone) {
  const el = document.getElementById("x402-save-status");
  if (!el) return;
  el.textContent = msg || "";
  el.className = `status-line ${tone === "ok" ? "ok" : tone === "err" ? "err" : ""}`;
}

function setX402DiscoverStatus(msg, tone) {
  const el = document.getElementById("x402-discover-status");
  if (!el) return;
  el.textContent = msg || "";
  el.className = `status-line ${tone === "ok" ? "ok" : tone === "err" ? "err" : ""}`;
}

async function loadX402Status() {
  let body;
  try {
    const r = await fetch(`${X402_BASE}/status`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    body = await r.json();
  } catch (err) {
    // Endpoint may be unavailable (older agent, embedded view without
    // the patched plugin-routes). Degrade gracefully — leave placeholders
    // and surface a hint on the wallet meta line.
    const meta = document.getElementById("x402-wallet-meta");
    if (meta) {
      meta.textContent = "Could not reach agent: " + (err && err.message ? err.message : err);
      meta.className = "x402-stat-meta muted small err";
    }
    return;
  }

  // Wallet row
  const walletEl = document.getElementById("x402-wallet");
  const walletMeta = document.getElementById("x402-wallet-meta");
  if (body.walletConfigured && body.walletAddress) {
    walletEl.textContent = shortAddr(body.walletAddress);
    walletEl.title = body.walletAddress;
    walletMeta.textContent = "Configured · signs EIP-3009 vouchers";
    walletMeta.className = "x402-stat-meta muted small ok";
  } else {
    walletEl.textContent = "—";
    walletMeta.textContent = "Not configured · observer mode (free endpoints only)";
    walletMeta.className = "x402-stat-meta muted small";
  }

  // Caps + facilitator
  document.getElementById("x402-cap-per-call").textContent = body.maxPerCallPton || "1.0";
  document.getElementById("x402-cap-total").textContent = body.maxTotalPton || "10.0";
  const facEl = document.getElementById("x402-facilitator-state");
  facEl.textContent = body.facilitatorUrl ? "set" : "trust 2xx";
  facEl.title = body.facilitatorUrl || "trust upstream 2xx as receipt";

  // Pre-fill the form
  const perCallInput = document.getElementById("x402-input-per-call");
  const totalInput = document.getElementById("x402-input-total");
  const facInput = document.getElementById("x402-input-facilitator");
  if (perCallInput && !perCallInput.value) perCallInput.value = body.maxPerCallPton || "";
  if (totalInput && !totalInput.value) totalInput.value = body.maxTotalPton || "";
  if (facInput && !facInput.value) facInput.value = body.facilitatorUrl || "";
}

function wireX402Config() {
  const form = document.getElementById("x402-config-form");
  if (!form) return;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const maxPerCall = document.getElementById("x402-input-per-call").value.trim();
    const maxTotal = document.getElementById("x402-input-total").value.trim();
    const facilitator = document.getElementById("x402-input-facilitator").value.trim();
    const payload = {};
    if (maxPerCall) payload.maxPerCallPton = maxPerCall;
    if (maxTotal) payload.maxTotalPton = maxTotal;
    payload.facilitatorUrl = facilitator;
    if (Object.keys(payload).length === 0) {
      setX402SaveStatus("Nothing to save.", "err");
      return;
    }
    setX402SaveStatus("Saving…");
    try {
      const r = await fetch(`${X402_BASE}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json();
      if (!r.ok || body.ok === false) {
        setX402SaveStatus(body.error || `Save failed (${r.status})`, "err");
        return;
      }
      setX402SaveStatus(
        body.restartScheduled
          ? `Saved (${body.updated.join(", ")}) — agent restarting…`
          : `Saved (${body.updated.join(", ")}). Restart the agent for changes to take effect.`,
        "ok"
      );
      // Wait a beat then re-read in case the restart window lets us
      // observe the new values cleanly.
      setTimeout(loadX402Status, 4000);
    } catch (err) {
      setX402SaveStatus("Network error: " + (err && err.message ? err.message : err), "err");
    }
  });

  const reset = document.getElementById("x402-reset");
  if (reset) {
    reset.addEventListener("click", () => {
      document.getElementById("x402-input-per-call").value = "1.0";
      document.getElementById("x402-input-total").value = "10.0";
      document.getElementById("x402-input-facilitator").value = "";
      setX402SaveStatus("Defaults restored. Click Save to apply.");
    });
  }
}

function renderAgentCard(payload) {
  const out = document.getElementById("x402-discover-result");
  if (!out) return;
  if (!payload.ok) {
    out.hidden = false;
    out.innerHTML = `<div class="x402-discover-err">
      <div class="muted small">Fetched: <code>${escapeHtml(payload.cardUrl)}</code></div>
      <p class="err small">${escapeHtml(payload.error || `${payload.status} ${payload.statusText || ""}`)}</p>
    </div>`;
    return;
  }
  const card = payload.card || {};
  const skills = Array.isArray(card.skills) ? card.skills : [];
  const skillsHtml = skills.length
    ? `<ul class="x402-skill-list">${skills
        .map(
          (s) => `
        <li>
          <div class="x402-skill-id"><code>${escapeHtml(s.id || "(no id)")}</code>${s.name ? ` — ${escapeHtml(s.name)}` : ""}</div>
          ${s.description ? `<div class="x402-skill-desc muted small">${escapeHtml(s.description)}</div>` : ""}
          ${
            s.tags && s.tags.length
              ? `<div class="x402-skill-tags">${s.tags
                  .map((t) => `<span class="pill">${escapeHtml(String(t))}</span>`)
                  .join("")}</div>`
              : ""
          }
        </li>`
        )
        .join("")}</ul>`
    : `<p class="muted small">No skills advertised by this AgentCard.</p>`;
  const auth = card.authentication && card.authentication.schemes ? card.authentication.schemes.join(", ") : "(unspecified)";
  out.hidden = false;
  out.innerHTML = `
    <div class="x402-card-summary">
      <div class="x402-card-head">
        <div>
          <h4>${escapeHtml(card.name || "(unnamed)")}</h4>
          <p class="muted small">${escapeHtml(card.description || "")}</p>
        </div>
        <div class="x402-card-meta">
          <div class="muted small">URL: <code>${escapeHtml(card.url || "(none)")}</code></div>
          <div class="muted small">Version: ${escapeHtml(card.version || "—")}</div>
          <div class="muted small">Auth schemes: ${escapeHtml(auth)}</div>
        </div>
      </div>
      <h5 class="x402-skill-header">Skills (${skills.length})</h5>
      ${skillsHtml}
      <div class="x402-skill-howto muted small">
        To invoke a skill from chat: <code>"Ask the agent at ${escapeHtml(card.url || "<URL>")} to use skill &lt;id&gt; with input &lt;json&gt;"</code> — the CALL_A2A_AGENT action will handle the rest.
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wireX402Discover() {
  const form = document.getElementById("x402-discover-form");
  if (!form) return;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const url = document.getElementById("x402-discover-url").value.trim();
    if (!url) return;
    setX402DiscoverStatus("Fetching AgentCard…");
    const out = document.getElementById("x402-discover-result");
    if (out) out.hidden = true;
    try {
      const r = await fetch(`${X402_BASE}/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ baseUrl: url }),
      });
      const body = await r.json();
      renderAgentCard(body);
      setX402DiscoverStatus(body.ok ? "" : "Discovery failed.", body.ok ? "ok" : "err");
    } catch (err) {
      setX402DiscoverStatus("Network error: " + (err && err.message ? err.message : err), "err");
    }
  });
}

async function boot() {
  setupEmbedMode();
  wireTabs();
  wireTopupPresets();
  wireKeyCreate();
  wireFaucet();
  wireTopup();
  wireSwap();
  wireCallsPager();
  wireLogout();
  wireSwitchChain();
  wireLogin();
  wireX402Config();
  wireX402Discover();
  // x402 state lives on the agent's main API port, not the billing
  // gateway. Load it asynchronously so the rest of the boot sequence
  // isn't blocked by a slow agent or missing endpoint.
  void loadX402Status();

  state.session = loadSession();
  if (state.session) {
    state.wallet = state.session.wallet;
    state.provider = detectProvider(); // optional; only needed for top-up + key reveal
    showAppView();
    if (state.provider) await refreshChainPill();
    try {
      await refreshAll();
    } catch (e) {
      console.warn("initial refresh failed", e);
    }
    startAutoRefresh();
  } else {
    showLoginView();
  }
  // After every render path the swap CTA should reflect connection state.
  renderSwapPreview();
  // Prime the topup USD estimate for the default value.
  updateTopupUsd();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
