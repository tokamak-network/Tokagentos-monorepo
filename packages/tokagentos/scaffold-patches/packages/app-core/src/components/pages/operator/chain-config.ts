/**
 * Runtime dashboard config loader for the operator x402 flows.
 *
 * SELF-CONTAINED: imports nothing. The config is injected at request time by the
 * gateway's `GET /v1/billing/dashboard/config.js` endpoint, which sets
 * `window.__DASHBOARD_CONFIG__` (a frozen object). We mirror app.js's behaviour
 * of reading that global, falling back to injecting the <script> once if it is
 * not yet present. No ethers, no @tokagentos/@tokagent, no app-core internals.
 *
 * Source of truth for the config shape: dashboard-routes.ts `buildConfigJs`
 * (CONFIG fields L168-181, per-chain `selectableChains` shape L107-126), read by
 * app.js L20-74.
 */

// ---------------------------------------------------------------------------
// Public types — the normalized config the rest of the operator consumes.
// ---------------------------------------------------------------------------

/** OP-Stack bridge descriptor for a chain that receives bridged L2 TON. */
export interface BridgeMeta {
  /** L1 chain the TON is locked on (e.g. 1 = Ethereum). */
  fromChainId: number;
  /** Display name of the L1 (e.g. "Ethereum"). */
  fromName?: string;
  /** Public RPC URL for the L1 (read-only reads). */
  fromRpc?: string;
  /** L1 TON token address (the deposit's `_l1Token`). */
  l1Token: string;
  /** OP-Stack L1StandardBridge address (the `depositERC20To` target). */
  l1StandardBridge: string;
  /** `_minGasLimit` for the L2 finalization. */
  minGasLimit: number;
}

/** A single selectable deposit chain. */
export interface ChainMeta {
  id: number;
  name: string;
  rpcUrl: string;
  currency: string;
  explorer: string;
  /** Underlying TON address on this chain (bridged L2 TON for Base). */
  ton: string | null;
  /** Bridge descriptor — present only on chains receiving bridged TON. */
  bridge: BridgeMeta | null;
}

/** The normalized dashboard config. */
export interface DashboardConfig {
  CHAINS: ChainMeta[];
  /** Upstream gateway base (client-mode) or "" (server/same-origin mode). */
  PROXY_BASE: string;
  /** The default selected chainId. */
  CHAIN_ID: number;
}

// ---------------------------------------------------------------------------
// Raw global shape (what config.js writes to window.__DASHBOARD_CONFIG__).
// ---------------------------------------------------------------------------

interface RawChain {
  id?: number | string;
  name?: string;
  rpcUrl?: string;
  currency?: string;
  explorer?: string;
  ton?: string | null;
  bridge?: Partial<BridgeMeta> | null;
}

interface RawConfig {
  PROXY_BASE?: string;
  CHAIN_ID?: number | string;
  CHAIN_NAME?: string;
  CHAIN_RPC_URL?: string;
  CHAIN_CURRENCY_SYMBOL?: string;
  CHAIN_EXPLORER_URL?: string;
  CHAINS?: RawChain[];
}

/** The injected config endpoint (same-origin). (dashboard-routes.ts L329) */
const CONFIG_SCRIPT_SRC = "/v1/billing/dashboard/config.js";

// Module-level memo so we only ever inject the <script> / normalize once.
let cached: DashboardConfig | null = null;
let inflight: Promise<DashboardConfig> | null = null;

function readGlobal(): RawConfig | undefined {
  return (globalThis as { __DASHBOARD_CONFIG__?: RawConfig })
    .__DASHBOARD_CONFIG__;
}

/** Normalize a single raw chain entry, applying the same defaults as app.js L55-69. */
function normalizeChain(c: RawChain): ChainMeta {
  const id = Number(c.id) || 1;
  return {
    id,
    name: String(c.name ?? `chain-${id}`),
    rpcUrl: String(c.rpcUrl ?? ""),
    currency: String(c.currency ?? "ETH"),
    explorer: String(c.explorer ?? ""),
    ton: c.ton ?? null,
    bridge: c.bridge
      ? {
          fromChainId: Number(c.bridge.fromChainId),
          fromName: c.bridge.fromName,
          fromRpc: c.bridge.fromRpc,
          l1Token: String(c.bridge.l1Token),
          l1StandardBridge: String(c.bridge.l1StandardBridge),
          minGasLimit: Number(c.bridge.minGasLimit),
        }
      : null,
  };
}

/** Normalize the raw global into a DashboardConfig. (app.js L20-74) */
function normalize(raw: RawConfig | undefined): DashboardConfig {
  const cfg = raw ?? {};
  const proxyBase = String(cfg.PROXY_BASE ?? "").replace(/\/+$/, "");
  const chainId = Number(cfg.CHAIN_ID) || 1;
  // Multi-chain registry, falling back to the legacy single-chain CONFIG.*
  // fields so an older gateway keeps working. (app.js L44-69)
  const rawChains: RawChain[] =
    Array.isArray(cfg.CHAINS) && cfg.CHAINS.length > 0
      ? cfg.CHAINS
      : [
          {
            id: chainId,
            name: cfg.CHAIN_NAME,
            rpcUrl: cfg.CHAIN_RPC_URL,
            currency: cfg.CHAIN_CURRENCY_SYMBOL,
            explorer: cfg.CHAIN_EXPLORER_URL,
          },
        ];
  return {
    CHAINS: rawChains.map(normalizeChain),
    PROXY_BASE: proxyBase,
    CHAIN_ID: chainId,
  };
}

/** Inject the config <script> once and resolve when the global is populated. */
function injectConfigScript(): Promise<RawConfig | undefined> {
  // Non-browser (SSR/tests) — nothing to inject.
  if (typeof document === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CONFIG_SCRIPT_SRC}"]`,
    );
    if (existing) {
      // Already injected by an earlier call or by the host page.
      resolve(readGlobal());
      return;
    }
    const s = document.createElement("script");
    s.src = CONFIG_SCRIPT_SRC;
    s.onload = () => resolve(readGlobal());
    s.onerror = () => resolve(undefined); // fall back to defaults
    document.head.appendChild(s);
  });
}

/**
 * Load the dashboard config: prefer an already-present
 * `window.__DASHBOARD_CONFIG__`; otherwise inject `config.js` once and read it.
 * Memoized — repeated calls return the same resolved config. Persists nothing.
 */
export async function loadDashboardConfig(): Promise<DashboardConfig> {
  if (cached) return cached;
  // Synchronous fast path: the global is already there (host page or prior load).
  const present = readGlobal();
  if (present) {
    cached = normalize(present);
    return cached;
  }
  if (inflight) return inflight;
  inflight = injectConfigScript().then((raw) => {
    cached = normalize(raw);
    inflight = null;
    return cached;
  });
  return inflight;
}

/**
 * The gateway base URL for `/v1` calls. In client-mode this is the remote
 * billing gateway (`CONFIG.PROXY_BASE`, e.g. the Railway URL); in server-mode
 * it is "" (same-origin). Mirrors app.js `const PROXY = CONFIG.PROXY_BASE`,
 * which prefixes every `api()` call — without it the operator talks to its own
 * origin instead of where the account/vault/session actually live.
 */
export async function proxyBase(): Promise<string> {
  return (await loadDashboardConfig()).PROXY_BASE;
}

/**
 * Resolve a chain's metadata by id from an already-loaded config, defaulting to
 * the first selectable chain. (app.js L72-74, `chainMeta`.)
 */
export function chainMeta(config: DashboardConfig, chainId: number): ChainMeta {
  return (
    config.CHAINS.find((c) => c.id === Number(chainId)) ?? config.CHAINS[0]
  );
}
