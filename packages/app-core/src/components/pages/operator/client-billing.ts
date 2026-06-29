/**
 * Operator console — live billing-gateway data (real-data seam).
 *
 * Calls the billing gateway `/v1/*` routes at PROXY_BASE (the REMOTE gateway in
 * client-mode, "" same-origin in server-mode) with the SIWE bearer token —
 * exactly as the billing dashboard app.js does. Self-contained: no TokagentClient
 * / client.ts / ethers. The operator components import these helpers/hooks
 * directly and render honest empty/error states when unauthenticated (no mock).
 *
 * Wired seams (have a real backend today):
 *   - ClaudeVault balance      → GET /v1/credits/me
 *   - Usage & spend            → GET /v1/usage/summary
 *   - API keys (list/mint/revoke) → /v1/keys
 *   - Top-up (quote/settle)    → POST /v1/topup/{quote,settle}
 */
import { useCallback, useEffect, useState } from "react";
import { getToken, subscribeAuth } from "./auth";
import { proxyBase } from "./chain-config";
import type { Eip3009Authorization } from "./eip712";

// ── low-level fetch ─────────────────────────────────────────────────────────
async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  // The gateway's /v1 routes live at PROXY_BASE — the REMOTE billing gateway in
  // client-mode (e.g. Railway), NOT the operator's own origin — exactly as
  // app.js's api() prefixes every call with CONFIG.PROXY_BASE. Same-origin
  // server-mode leaves PROXY_BASE empty. Auth is the SIWE bearer; app.js sends
  // no cookies, so only fall back to credentials:"include" in same-origin mode.
  const base = await proxyBase();
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const reqInit: RequestInit = base
    ? { ...init, headers }
    : { credentials: "include", ...init, headers };
  const res = await fetch(`${base}${path}`, reqInit);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

/** Format an atto-PTON (1e18) decimal string as "1,284.07" (2 dp, grouped). */
export function formatAttoPtonString(atto: string): string {
  try {
    const v = BigInt(atto);
    const whole = v / 10n ** 18n;
    const frac = (v - whole * 10n ** 18n) / 10n ** 16n; // 0–99
    return `${whole.toLocaleString("en-US")}.${frac.toString().padStart(2, "0")}`;
  } catch {
    return atto;
  }
}

function shortDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── credits ─────────────────────────────────────────────────────────────────
export interface CreditsResponse {
  balance: string;
  reserved: string;
  accrued: string;
  backing?: string;
  chainId?: number;
}

export function fetchCredits(chainId?: number): Promise<CreditsResponse> {
  const q = chainId ? `?chainId=${chainId}` : "";
  return getJson<CreditsResponse>(`/v1/credits/me${q}`);
}

// ── top-up (EIP-3009) ─────────────────────────────────────────────────────────
export interface TopupQuote {
  topupId: string;
  chainId: number;
  amountPton: string;
  amountUsd: number;
  tonUsd: number;
  expiresAt: string;
  vaultAddress: `0x${string}`;
  ptonAddress: `0x${string}`;
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
}

/**
 * POST /v1/topup/quote for a PTON amount. Top-up deposits PTON 1:1 — 1 PTON in →
 * 1 PTON credited — so the amount is denominated in PTON; `amountUsd` in the
 * response is only an informational preview. Sends `amountPton` in atto (1e18)
 * with micro-PTON truncation, matching app.js topUp() (the server prefers
 * amountPton and settlement equality-checks the signature value against it).
 */
export function fetchTopupQuote(
  amountPton: number,
  chainId: number,
): Promise<TopupQuote> {
  const valueAtto =
    BigInt(Math.round(amountPton * 1_000_000)) * (10n ** 18n / 1_000_000n);
  return getJson<TopupQuote>("/v1/topup/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountPton: valueAtto.toString(), chainId }),
  });
}

export interface SettleOutcome {
  ok: boolean;
  status: number;
  txHash?: string;
  /** Human-readable error for the UI when ok === false. */
  error?: string;
}

/**
 * POST /v1/topup/settle. Returns a status-aware outcome (does NOT throw on
 * 402/409/429/503) so the UI can map the documented failure codes.
 */
export async function settleTopup(
  topupId: string,
  chainId: number,
  authorization: Eip3009Authorization,
  signature: { v: number; r: string; s: string },
): Promise<SettleOutcome> {
  // Settle via the x402 X-PAYMENT path so the backend verifies against the EXACT
  // bytes the client signed (incl. validBefore). The native plain-body path
  // reconstructs validBefore from Date.now() at settle time → EIP-712 hash
  // mismatch → signature recovery returns the wrong address → HTTP 402.
  const xPayment = btoa(
    JSON.stringify({ payload: { signature, authorization, quoteId: topupId } }),
  );
  // Settle is auth-gated — it cross-checks authorization.from === the authed
  // wallet and rate-limits per wallet (topup-routes returns 401 otherwise).
  // Attach the SIWE bearer alongside X-PAYMENT, exactly as app.js's api() does;
  // without it the deposit 401s AFTER the user has already signed.
  const base = await proxyBase();
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-PAYMENT": xPayment,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const reqInit: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify({ chainId }),
  };
  if (!base) reqInit.credentials = "include";
  const res = await fetch(`${base}/v1/topup/settle`, reqInit);
  const json = (await res.json().catch(() => ({}))) as {
    txHash?: string;
    error?: string;
  };
  if (res.ok) return { ok: true, status: res.status, txHash: json.txHash };
  const error =
    res.status === 401
      ? "Sign in to the gateway and try again."
      : res.status === 402
        ? "Signature verification failed — make sure you signed with the funding wallet."
        : res.status === 409
          ? `Quote already settled${json.txHash ? ` (tx ${json.txHash.slice(0, 14)}…)` : ""}. Check your balance.`
          : res.status === 429
            ? "Rate limited — wait a moment and try again."
            : res.status === 503
              ? "Settlement service unavailable — try again shortly."
              : json.error || `Settle failed (${res.status}).`;
  return { ok: false, status: res.status, txHash: json.txHash, error };
}

// ── deposit targets (vault + PTON asset, per chain) ──────────────────────────
export interface TopupInfo {
  chainId: number;
  /** ClaudeVault address (the EIP-3009 `to`). */
  vault: `0x${string}`;
  /** PTON token address (the deposit asset / `PTON.deposit` target). */
  asset: `0x${string}`;
  domain?: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
}

/**
 * GET /v1/topup/info?chainId — resolve THIS chain's vault + PTON asset. The
 * gateway exposes `vault`/`asset` aliases (older gateways ignore the query and
 * return their single configured chain). Mirrors app.js resolveDepositTargets
 * (L622-636).
 */
export function fetchTopupInfo(chainId: number): Promise<TopupInfo> {
  return getJson<TopupInfo>(`/v1/topup/info?chainId=${chainId}`);
}

// ── price (TON/USD) ───────────────────────────────────────────────────────────
export interface PriceResponse {
  /**
   * TON price in USD (FLAT field — NOT snapshot.tonUsd). Absent when the oracle
   * has no cached price ({ available: false }), so callers must null-guard.
   */
  tonUsd?: number;
  available?: boolean;
  source?: string;
  fetchedAt?: number | null;
  ageMs?: number;
}

/** GET /v1/price — the live TON/USD rate used to value PTON balances. */
export function fetchPrice(): Promise<PriceResponse> {
  return getJson<PriceResponse>("/v1/price");
}

// ── active model ──────────────────────────────────────────────────────────────
export interface ActiveModelResponse {
  /** Gateway-wide active model id, or null when none is pinned. */
  active: string | null;
  /** Catalogue of selectable models, when the gateway reports it. */
  models?: Array<{
    id: string;
    label?: string;
    inputPerM?: number;
    outputPerM?: number;
  }>;
}

/** GET /v1/model — the gateway-wide active model + (optionally) the catalogue. */
export function getActiveModel(): Promise<ActiveModelResponse> {
  return getJson<ActiveModelResponse>("/v1/model");
}

/** PUT /v1/model — pin the gateway-wide active model. */
export async function setActiveModel(model: string): Promise<void> {
  await getJson<unknown>("/v1/model", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
}

// ── usage ───────────────────────────────────────────────────────────────────
export interface UsageModelRow {
  model: string;
  calls: number;
  costPton: string;
}
export interface UsageDayRow {
  day: string;
  calls: number;
}
export interface UsageSummaryResponse {
  totalCostUsd: string;
  totalCostPton: string;
  callCount: number;
  byModel?: UsageModelRow[];
  byDay?: UsageDayRow[];
}

export function fetchUsageSummary(params?: {
  since?: string;
  until?: string;
}): Promise<UsageSummaryResponse> {
  const qs = new URLSearchParams();
  if (params?.since) qs.set("since", params.since);
  if (params?.until) qs.set("until", params.until);
  const q = qs.toString() ? `?${qs.toString()}` : "";
  return getJson<UsageSummaryResponse>(`/v1/usage/summary${q}`);
}

// ── usage: recent calls ──────────────────────────────────────────────────────
export interface UsageCall {
  id: string;
  ts: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costPton: string;
  status: string;
  apiKeyId: string | null;
}

export function fetchUsageCalls(
  limit = 20,
): Promise<{ calls: UsageCall[]; hasMore: boolean }> {
  return getJson<{ calls: UsageCall[]; hasMore: boolean }>(
    `/v1/usage/calls?limit=${limit}`,
  );
}

// ── usage: per-key rollup ────────────────────────────────────────────────────
export interface UsageKeyRow {
  apiKeyId: string | null;
  name?: string;
  callCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalCostPton: string;
}

export function fetchUsageKeys(): Promise<{ items: UsageKeyRow[] }> {
  return getJson<{ items: UsageKeyRow[] }>("/v1/usage/keys");
}

// ── api keys ────────────────────────────────────────────────────────────────
export interface ApiKeyRowResponse {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export async function fetchApiKeys(): Promise<ApiKeyRowResponse[]> {
  const { keys } = await getJson<{ keys: ApiKeyRowResponse[] }>("/v1/keys");
  return keys;
}

export function mintApiKey(
  name: string,
  chainId?: number,
): Promise<{ id: string; key: string; name: string; createdAt: string }> {
  return getJson("/v1/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, ...(chainId ? { chainId } : {}) }),
  });
}

export async function revokeApiKey(id: string): Promise<void> {
  await getJson<unknown>(`/v1/keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** DELETE /v1/keys/:id?hard=true — permanently remove a (revoked) key row. */
export async function deleteApiKey(id: string): Promise<void> {
  await getJson<unknown>(`/v1/keys/${encodeURIComponent(id)}?hard=true`, {
    method: "DELETE",
  });
}

/**
 * Same-origin POST to the LOCAL agent — NOT PROXY_BASE. The .env write + restart
 * act on the agent's own filesystem/process, which the remote billing gateway
 * cannot touch, so (exactly like app.js) these bypass the gateway prefix. Carries
 * the bearer + cookie so whichever auth the local agent uses is satisfied.
 */
async function localPost(path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(path, {
    method: "POST",
    credentials: "include",
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Syntactic check for an `sk-ai-…` key (mirrors app.js install validation). */
export function isValidChatKey(key: string): boolean {
  return /^sk-ai-[A-Za-z0-9_-]{16,}$/.test(key.trim());
}

/** POST /v1/keys/install — write BILLING_CHAT_KEY=<key> to the LOCAL agent .env. */
export async function installChatKey(key: string): Promise<void> {
  const res = await localPost("/v1/keys/install", { key: key.trim() });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      j.error || `Couldn't write the key to .env (${res.status}).`,
    );
  }
}

/** POST /api/restart — restart the LOCAL agent so the new key takes effect. */
export async function restartAgent(): Promise<void> {
  const res = await localPost("/api/restart");
  if (!res.ok) {
    throw new Error(
      `Key saved, but the agent didn't restart (${res.status}). Restart it manually.`,
    );
  }
}

/** Map a real key row to the operator `ApiKeyEntry` display shape. */
export function apiKeyRowToEntry(row: ApiKeyRowResponse): {
  id: string;
  name: string;
  val: string;
  meta: string;
  live: boolean;
} {
  const meta = `created ${shortDate(row.createdAt)} · last used ${shortDate(
    row.lastUsedAt,
  )}`;
  return {
    id: row.id,
    name: row.name,
    // The list endpoint never returns the secret (shown once on mint), so we
    // render a stable masked label derived from the key id.
    val: `sk-ai-••••${row.id.slice(-4)}`,
    meta,
    live: row.revokedAt === null,
  };
}

// ── hooks ───────────────────────────────────────────────────────────────────
/** Fetch once on mount; `live` is true only when real data loaded. */
export function useLive<T>(fetcher: () => Promise<T>): {
  data: T | null;
  live: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [nonce, setNonce] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is a manual refetch trigger (reload()); `fetcher` is expected stable (useCallback).
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      fetcher()
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {
          if (!cancelled) setData(null);
        });
    };
    run();
    // Re-fetch the moment the user signs in / out so auth-gated widgets
    // (BalanceCard / UsageChart / ApiKeys / ModelPicker) refresh immediately
    // with the bearer token now attached (or fall back to mock once removed).
    const unsub = subscribeAuth(run);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [fetcher, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, live: data !== null, reload };
}
