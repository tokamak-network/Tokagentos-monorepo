// Dashboard SPA — vanilla JS, zero dependencies.
//
// Responsibilities:
//   1. SIWE login: connect a browser wallet, sign LoginAuth EIP-712, store
//      the proxy-issued bearer in sessionStorage.
//   2. API key management: list / mint / revoke (one-shot key reveal modal).
//   3. PTON top-up: client builds a TransferWithAuthorization EIP-712, signs
//      it via the wallet, and submits it as X-PAYMENT on a one-call dummy
//      /v1/messages POST so the proxy executes vault.depositX402.
//   4. Usage tabs (overview / day / model / key / calls) backed by the
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
  } catch (e) {
    state.walletPton = null;
    console.warn("PTON.balanceOf failed", e);
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
  const balance = c?.ledger?.balance ?? c?.onChainCredits;
  $("#kpi-balance").textContent = fmtPton(balance);
  $("#kpi-reserved").textContent = fmtPton(c?.ledger?.reserved ?? 0n) + " PTON";
  $("#kpi-accrued").textContent = fmtPton(c?.ledger?.accrued ?? 0n) + " PTON";
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
  $("#usage-retention").textContent = String(u?.retentionDays ?? "");
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
      ? ""
      : `<button class="btn btn-danger" type="button" data-revoke="${escape(k.id)}">Revoke</button>`;
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
    ctx.fillStyle = "#94a3c1";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data in window.", w / 2, h / 2);
    return;
  }
  const padL = 32, padR = 16, padT = 16, padB = 28;
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = (w - padL - padR) / data.length;

  // Axes
  ctx.strokeStyle = "#1c2742";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, h - padB);
  ctx.lineTo(w - padR, h - padB);
  ctx.stroke();

  // Y grid + labels (3 horizontal lines)
  ctx.fillStyle = "#94a3c1";
  ctx.font = "10px JetBrains Mono, monospace";
  ctx.textAlign = "right";
  for (let i = 0; i <= 3; i++) {
    const y = padT + ((h - padT - padB) * (3 - i)) / 3;
    const v = Math.round((max * i) / 3);
    ctx.fillText(String(v), padL - 4, y + 3);
    ctx.strokeStyle = "rgba(28,39,66,0.6)";
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  // Bars
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const x = padL + i * barW + 2;
    const innerW = barW - 4;
    const barH = ((h - padT - padB) * d.value) / max;
    const y = h - padB - barH;
    const grd = ctx.createLinearGradient(0, y, 0, y + barH);
    grd.addColorStop(0, "#22d3ee");
    grd.addColorStop(1, "#a78bfa");
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, innerW, barH);
  }

  // X labels (truncate to fit)
  ctx.fillStyle = "#94a3c1";
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
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".tab-pane").forEach((p) => (p.hidden = true));
      tab.classList.add("active");
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
  for (const b of document.querySelectorAll(".topup-presets button")) {
    b.addEventListener("click", () => {
      $("#topup-amount").value = b.getAttribute("data-preset");
      updateTopupUsd();
    });
  }
  $("#topup-amount").addEventListener("input", updateTopupUsd);
}

function updateTopupUsd() {
  const v = parseFloat($("#topup-amount").value);
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
      setStatus(status, `Minted ${v} PTON (tx ${fmtAddr(tx)}).`, "ok");
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
      setStatus(status, `Deposit confirmed (tx ${fmtAddr(r.txHash)}).`, "ok");
      await refreshAll();
    } catch (e) {
      setStatus(status, `Failed: ${e.message}`, "err");
    } finally {
      $("#topup-btn").disabled = false;
    }
  });
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
    } catch (e) {
      setStatus(status, `Sign-in failed: ${e.message}`, "err");
    }
  });
}

// ----------------------------- Boot -----------------------------

async function boot() {
  wireTabs();
  wireTopupPresets();
  wireKeyCreate();
  wireFaucet();
  wireTopup();
  wireCallsPager();
  wireLogout();
  wireSwitchChain();
  wireLogin();

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
  } else {
    showLoginView();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
