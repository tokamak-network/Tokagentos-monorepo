/**
 * Operator UI — mock data + types.
 *
 * Every component accepts its data as props that default to the constants here,
 * so real-data wiring can be filled in later (see the README "Real-data wiring"
 * table) without touching component markup. Replace the defaults with hooks /
 * API calls when the billing ledger, gateway settlement stream, service
 * registry, /v1/keys and plugin-evm balances are available.
 *
 * All literal values (copy, amounts, addresses, coordinates, rates) are lifted
 * verbatim from handoff_app/prototype — they are final per the design spec.
 */

// ── Brand / shared ────────────────────────────────────────────────────────
/** ClaudeVault contract — funds LLM + agent-to-agent calls. */
export const VAULT_ADDRESS = "0x091365301a461bEeFd5e2Fe1BD244befCE274F5c";
/** Display form of {@link VAULT_ADDRESS}. */
export const VAULT_ADDRESS_SHORT = "0x0913…74F5c";
/** Operator wallet address shown in the sidebar chip + wallet header. */
export const OPERATOR_ADDRESS_SHORT = "0xA9c1…3E4f";

// ── x402 · Balance + Top-up ────────────────────────────────────────────────
export interface TopUpToken {
  sym: string;
  /** Brand colour for the circular initial badge. */
  color: string;
  /** Mock wallet balance of this token. */
  bal: string;
  /** USD value per 1 unit (USDC/USDT = 1). */
  rate: number;
}

export const TOPUP_TOKENS: TopUpToken[] = [
  { sym: "USDC", color: "#2775ca", bal: "14,029.00", rate: 1 },
  { sym: "USDT", color: "#26a17b", bal: "8,400.50", rate: 1 },
  { sym: "ETH", color: "#627eea", bal: "2.81", rate: 3148.2 },
  { sym: "WBTC", color: "#f09242", bal: "0.42", rate: 67_480 },
];

export const TOPUP_PRESETS = ["50", "100", "250", "500"] as const;

/**
 * PTON out ≈ USD / TON price; TON ~$0.50 → mock 1 USD = ~2 PTON minus margin.
 * PTON = USD × {@link PTON_PER_USD}.
 */
export const PTON_PER_USD = 1.98;

export interface VaultBalance {
  /** Big mono amount, e.g. "1,284.07". */
  amount: string;
  /** Sub line, e.g. "≈ $642.04 · funds LLM + agent-to-agent calls". */
  usd: string;
  /** Progress bar fill, 0–100. */
  spentPct: number;
  /** Foot left, e.g. "spent this cycle · 462 PTON". */
  spentLabel: string;
  /** Foot right, e.g. "auto top-up at 20%". */
  autoTopUpLabel: string;
}

export const VAULT_BALANCE: VaultBalance = {
  amount: "1,284.07",
  usd: "≈ $642.04 · funds LLM + agent-to-agent calls",
  spentPct: 64,
  spentLabel: "spent this cycle · 462 PTON",
  autoTopUpLabel: "auto top-up at 20%",
};

// ── x402 · Agent-to-agent network ──────────────────────────────────────────
export interface A2ANode {
  id: string;
  label: string;
  glyph: string;
  /** % coordinate within the canvas (0–100). */
  x: number;
  y: number;
  price: string;
  self?: boolean;
}

export const A2A_NODES: A2ANode[] = [
  {
    id: "self",
    label: "treasurer",
    glyph: "🔑",
    x: 50,
    y: 50,
    price: "your agent",
    self: true,
  },
  {
    id: "research",
    label: "research-ai",
    glyph: "🔬",
    x: 20,
    y: 24,
    price: "0.012 / call",
  },
  {
    id: "oracle",
    label: "px-oracle",
    glyph: "📡",
    x: 80,
    y: 22,
    price: "0.004 / call",
  },
  {
    id: "signer",
    label: "co-signer",
    glyph: "🖊️",
    x: 84,
    y: 70,
    price: "0.020 / call",
  },
  {
    id: "risk",
    label: "risk-engine",
    glyph: "🛡️",
    x: 18,
    y: 74,
    price: "0.009 / call",
  },
  {
    id: "exec",
    label: "dex-exec",
    glyph: "⚡",
    x: 50,
    y: 86,
    price: "0.015 / call",
  },
];

/** Connected node pairs: self↔each peer, plus oracle↔exec and research↔risk. */
export const A2A_EDGES: [string, string][] = [
  ["self", "research"],
  ["self", "oracle"],
  ["self", "signer"],
  ["self", "risk"],
  ["self", "exec"],
  ["oracle", "exec"],
  ["research", "risk"],
];

export interface SettlementTemplate {
  from: string;
  to: string;
  svc: string;
  amt: string;
  dir: "in" | "out";
}

/** Cycled, newest-first, to drive the live settlement feed. */
export const SETTLEMENT_TEMPLATES: SettlementTemplate[] = [
  {
    from: "treasurer",
    to: "px-oracle",
    svc: "/quote",
    amt: "0.004",
    dir: "out",
  },
  {
    from: "treasurer",
    to: "research-ai",
    svc: "/v1/messages",
    amt: "0.012",
    dir: "out",
  },
  {
    from: "risk-engine",
    to: "treasurer",
    svc: "/positions",
    amt: "0.009",
    dir: "in",
  },
  {
    from: "treasurer",
    to: "co-signer",
    svc: "/sign",
    amt: "0.020",
    dir: "out",
  },
  { from: "treasurer", to: "dex-exec", svc: "/swap", amt: "0.015", dir: "out" },
  {
    from: "lifeops-bot",
    to: "treasurer",
    svc: "/balance",
    amt: "0.003",
    dir: "in",
  },
  {
    from: "treasurer",
    to: "research-ai",
    svc: "/summarize",
    amt: "0.012",
    dir: "out",
  },
  { from: "px-oracle", to: "treasurer", svc: "/feed", amt: "0.004", dir: "in" },
];

export interface A2AStat {
  value: string;
  /** Optional unit suffix rendered smaller/muted (e.g. "ms"). */
  unit?: string;
  label: string;
  delta: string;
  /** Tone of the big value. */
  tone?: "gold" | "ok" | "default";
  /** Tone of the delta line. */
  deltaTone?: "muted" | "default";
}

export const A2A_STATS: A2AStat[] = [
  {
    value: "2,164",
    label: "A2A calls · 24h",
    delta: "+184 vs prev",
    tone: "gold",
  },
  {
    value: "28.41",
    label: "PTON spent · 24h",
    delta: "outbound",
    deltaTone: "muted",
  },
  {
    value: "11.92",
    label: "PTON earned · 24h",
    delta: "inbound to your svc",
    tone: "ok",
  },
  {
    value: "142",
    unit: "ms",
    label: "avg settle latency",
    delta: "p50 · EIP-3009",
    deltaTone: "muted",
  },
];

// ── x402 · Service directory ───────────────────────────────────────────────
export interface ServiceEntry {
  glyph: string;
  name: string;
  sub: string;
  endpoint: string;
  price: string;
  latency: string;
  calls: string;
}

export const SERVICES: ServiceEntry[] = [
  {
    glyph: "🔬",
    name: "research-ai",
    sub: "deep research · web + RAG",
    endpoint: "research.agent.eth",
    price: "0.012",
    latency: "820ms",
    calls: "4.2K",
  },
  {
    glyph: "📡",
    name: "px-oracle",
    sub: "TWAP price feeds",
    endpoint: "oracle.tokamak.eth",
    price: "0.004",
    latency: "40ms",
    calls: "88K",
  },
  {
    glyph: "🖊️",
    name: "co-signer",
    sub: "multisig co-signing",
    endpoint: "signer.agent.eth",
    price: "0.020",
    latency: "210ms",
    calls: "1.1K",
  },
  {
    glyph: "🛡️",
    name: "risk-engine",
    sub: "position risk scoring",
    endpoint: "risk.agent.eth",
    price: "0.009",
    latency: "130ms",
    calls: "12K",
  },
  {
    glyph: "⚡",
    name: "dex-exec",
    sub: "best-route swap execution",
    endpoint: "exec.agent.eth",
    price: "0.015",
    latency: "340ms",
    calls: "6.8K",
  },
];

// ── x402 · Usage & spend ───────────────────────────────────────────────────
export interface UsageTotals {
  total: string;
  usd: string;
  avg: string;
}

export const USAGE_TOTALS: UsageTotals = {
  total: "312.40",
  usd: "≈ $156.20",
  avg: "0.144 / call avg",
};

export interface SpendModel {
  name: string;
  pct: number;
  /** CSS gradient for the model's progress bar. */
  color: string;
}

export const SPEND_MODELS: SpendModel[] = [
  {
    name: "claude-sonnet-4-5",
    pct: 52,
    color: "linear-gradient(90deg, #f0b90b, #f3ba2f)",
  },
  {
    name: "claude-opus-4-7",
    pct: 23,
    color: "linear-gradient(90deg, #d8a000, #f0b90b)",
  },
  {
    name: "gpt-5.2",
    pct: 14,
    color: "linear-gradient(90deg, #4dd2a1, #03a66d)",
  },
  {
    name: "llama-4-405b",
    pct: 11,
    color: "linear-gradient(90deg, #60a5fa, #3b82f6)",
  },
];

/**
 * 30-day spend bars. Deterministic by default (so reduced-motion renders a
 * stable chart); pass `random` to reproduce the prototype's jittered look.
 */
export function makeUsageSeries(count = 30, random = false): number[] {
  const arr: number[] = [];
  for (let i = 0; i < count; i++) {
    const jitter = random ? Math.random() * 6 : (((i * 37) % 13) / 13) * 6;
    const base = 8 + Math.sin(i / 3) * 4 + jitter;
    arr.push(Math.max(2, base));
  }
  return arr;
}

// ── x402 · API keys ────────────────────────────────────────────────────────
export interface ApiKeyEntry {
  name: string;
  val: string;
  meta: string;
  live: boolean;
}

export const API_KEYS: ApiKeyEntry[] = [
  {
    name: "treasurer · prod",
    val: "sk-ai-7f3a…d91c",
    meta: "created 14d ago · last used 2m ago",
    live: true,
  },
  {
    name: "research worker",
    val: "sk-ai-2b8e…04af",
    meta: "created 6d ago · last used 1h ago",
    live: true,
  },
  {
    name: "ci · smoke tests",
    val: "sk-ai-9c01…7e22",
    meta: "created 30d ago · last used 3d ago",
    live: false,
  },
];

// ── Wallet ─────────────────────────────────────────────────────────────────
export type WalletMode = "vault" | "direct" | "both";

export interface WalletModeInfo {
  name: string;
  tag: string;
  desc: string;
}

export const WALLET_MODES: Record<WalletMode, WalletModeInfo> = {
  vault: {
    name: "vault",
    tag: "production",
    desc: "Every on-chain call routes through ClaudeVault with per-method allowlists. A compromised agent can’t drain funds.",
  },
  direct: {
    name: "direct",
    tag: "dev",
    desc: "Operator wallet signs directly. Chat can drive arbitrary transfers. Use locally only.",
  },
  both: {
    name: "both",
    tag: "advanced",
    desc: "Both paths loaded; the LLM picks per request. Reduced safety guarantees.",
  },
};

export interface ChainBalance {
  name: string;
  short: string;
  /** CSS colour (var or literal) for the chain dot. */
  color: string;
  amt: string;
  sym: string;
  usd: string;
}

export const CHAIN_BALANCES: ChainBalance[] = [
  {
    name: "mainnet",
    short: "ETH",
    color: "var(--eth)",
    amt: "0.4218",
    sym: "ETH",
    usd: "$1,328.42",
  },
  {
    name: "base",
    short: "BASE",
    color: "var(--base)",
    amt: "14,029",
    sym: "USDC",
    usd: "$14,029.00",
  },
  {
    name: "arbitrum",
    short: "ARB",
    color: "var(--arb)",
    amt: "2.81",
    sym: "ETH",
    usd: "$8,847.10",
  },
  {
    name: "polygon",
    short: "POL",
    color: "var(--pol)",
    amt: "284,041",
    sym: "USDC",
    usd: "$284,041",
  },
  {
    name: "optimism",
    short: "OP",
    color: "var(--op)",
    amt: "0.92",
    sym: "ETH",
    usd: "$2,896.40",
  },
];

export const WALLET_TOTAL_USD = "$311,141.92";

// ── Automations ────────────────────────────────────────────────────────────
export interface AutomationEntry {
  glyph: string;
  name: string;
  trigger: string;
  last: string;
  on: boolean;
}

export const AUTOMATIONS: AutomationEntry[] = [
  {
    glyph: "🛡️",
    name: "Aave health guard",
    trigger: "WHEN polygon.aave.healthFactor < 1.6",
    last: "checked 2m ago",
    on: true,
  },
  {
    glyph: "📊",
    name: "Weekly treasury report",
    trigger: "EVERY monday 09:00 → telegram",
    last: "ran 3d ago",
    on: true,
  },
  {
    glyph: "⚡",
    name: "BTC perp rebalance",
    trigger: "WHEN drift > 0.5% → draft vault tx",
    last: "ran 1h ago",
    on: true,
  },
  {
    glyph: "🔬",
    name: "Market research digest",
    trigger: "EVERY 6h → call research-ai (0.012 PTON)",
    last: "ran 22m ago",
    on: false,
  },
];

// ── Plugins ────────────────────────────────────────────────────────────────
export interface PluginEntry {
  name: string;
  desc: string;
  kind: string;
  on: boolean;
}

export const PLUGINS: PluginEntry[] = [
  {
    name: "tokagent-billing",
    desc: "x402 LLM payment rail",
    kind: "rail",
    on: true,
  },
  {
    name: "tokagent-shared",
    desc: "Vault bindings · chain config",
    kind: "core",
    on: true,
  },
  {
    name: "tokagent-yield",
    desc: "Aave v3 on Polygon",
    kind: "defi",
    on: true,
  },
  {
    name: "tokagent-perps",
    desc: "Hyperliquid perpetuals",
    kind: "defi",
    on: true,
  },
  {
    name: "tokagent-polymarket",
    desc: "Polymarket buy/sell/redeem",
    kind: "defi",
    on: false,
  },
  {
    name: "plugin-telegram",
    desc: "Telegram bot channel",
    kind: "channel",
    on: false,
  },
];

// ── Settings ───────────────────────────────────────────────────────────────
export interface EnvRow {
  k: string;
  v: string;
  ok: boolean;
}

export const ENV_ROWS: EnvRow[] = [
  { k: "TOKAGENT_EXECUTION_MODE", v: "vault", ok: true },
  { k: "ANTHROPIC_API_KEY", v: "sk-ant-•••••••••", ok: true },
  { k: "BILLING_CHAT_KEY", v: "sk-ai-7f3a•••••", ok: true },
  { k: "TOKAGENT_GATEWAY_URL", v: "https://billing-…railway.app", ok: true },
  { k: "TOKAGENT_VAULT_ADDRESS", v: "0x0913…74F5c", ok: true },
  { k: "TELEGRAM_BOT_TOKEN", v: "not set", ok: false },
];

export interface SettingToggle {
  id: "a" | "b" | "c";
  name: string;
  desc: string;
  on: boolean;
}

export const SETTING_TOGGLES: SettingToggle[] = [
  {
    id: "a",
    name: "Require approval for on-chain actions",
    desc: "In vault mode, transactions are drafted and held for your review before signing.",
    on: true,
  },
  {
    id: "b",
    name: "Allow agent-to-agent payments",
    desc: "Let the agent call and pay other agents' services via x402 without per-call approval.",
    on: true,
  },
  {
    id: "c",
    name: "Expose treasurer as a paid service",
    desc: "Publish your agent to the directory so other agents can call it for PTON.",
    on: false,
  },
];

// ── Chat ───────────────────────────────────────────────────────────────────
export interface ChatThread {
  name: string;
  time: string;
  active?: boolean;
}

export const CHAT_THREADS: ChatThread[] = [
  { name: "Aave health monitor", time: "2m ago", active: true },
  { name: "Rebalance BTC perp", time: "1h ago" },
  { name: "Weekly treasury report", time: "4h ago" },
  { name: "Polymarket: Fed cut", time: "yesterday" },
];

/** Key/value rows in the chat action card (aave.read · getUserAccountData). */
export const CHAT_ACTION_KV: { k: string; v: string }[] = [
  { k: "health factor", v: "1.84" },
  { k: "supplied", v: "$284,041" },
  { k: "borrowed", v: "$112,309" },
];
