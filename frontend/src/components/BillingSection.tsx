import { AddressLink } from "./AddressLink";
import { LiveBadge } from "./LiveBadge";
import { Logo } from "./Logo";

const VAULT_ADDRESS = "0x091365301a461bEeFd5e2Fe1BD244befCE274F5c";

type Step = {
  n: string;
  title: string;
  body: string;
  accent?: boolean;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Deposit",
    body: "USDC / USDT / ETH / WBTC → TON → PTON, in one signed flow.",
  },
  {
    n: "02",
    title: "Sign",
    body: "SIWE login mints a 24-hour session JWT. Optional sk-ai-* HMAC keys for daemons.",
    accent: true,
  },
  {
    n: "03",
    title: "Stream",
    body: "/v1/messages and /v1/chat/completions pass-through to LiteLLM with full SSE.",
  },
  {
    n: "04",
    title: "Settle",
    body: "Spend is metered per-tick and settled in PTON against your ClaudeVault balance.",
  },
];

function FlowArrow() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="hidden shrink-0 self-center md:block"
    >
      <line
        x1="2"
        y1="16"
        x2="26"
        y2="16"
        stroke="rgba(138,138,148,0.5)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <polygon points="22,12 28,16 22,20" fill="rgba(240,185,11,0.7)" />
    </svg>
  );
}

function FlowStep({ n, title, body, accent }: Step) {
  return (
    <div
      className={`flex-1 rounded-xl border bg-surface p-4 sm:p-5 ${
        accent ? "border-accent" : "border-border"
      }`}
    >
      <div className="flex items-baseline gap-3 sm:block">
        <div className="font-mono text-[11px] text-fg-dim tracking-[0.12em]">
          {n}
        </div>
        <div className="font-medium text-[15px] text-fg sm:mt-2 sm:text-base">
          {title}
        </div>
      </div>
      <p className="mt-2 text-[13px] text-fg-muted leading-relaxed">{body}</p>
    </div>
  );
}

function VaultReceipt() {
  return (
    <aside
      className="overflow-hidden rounded-2xl border border-accent/[0.28] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.4)] sm:p-5"
      style={{
        background:
          "radial-gradient(circle at 0% 0%, rgba(240,185,11,0.1), transparent 50%), linear-gradient(180deg, rgba(18,18,21,0.96), rgba(10,10,12,0.96))",
      }}
    >
      <header className="-mx-4 -mt-4 mb-3 flex flex-wrap items-center justify-between gap-2 p-4 sm:-mx-5 sm:-mt-5 sm:mb-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Logo size={18} showWordmark={false} />
          <span className="font-mono text-[11px] text-fg-dim uppercase tracking-[0.12em]">
            ClaudeVault
          </span>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-live/[0.32] bg-live/[0.12] px-2.5 py-1">
          <LiveBadge label="Live on mainnet" />
          <span className="font-mono text-[10px] text-live tracking-[0.08em]">
            LIVE · MAINNET
          </span>
        </span>
      </header>

      <div className="border-border border-b px-4 py-3 sm:px-5 sm:py-4">
        <div className="font-mono text-[10px] text-fg-dim uppercase tracking-[0.12em]">
          contract
        </div>
        <div className="mt-1.5 break-all font-mono text-[12px] text-fg sm:text-[13px]">
          <AddressLink address={VAULT_ADDRESS} />
        </div>
      </div>

      <div className="flex items-center justify-between border-border border-b bg-surface-2 px-4 py-2 sm:px-5">
        <span className="font-mono text-[10px] text-fg-dim uppercase tracking-[0.12em]">
          ⟩ example values · connect a wallet for real data
        </span>
      </div>

      <dl className="divide-y divide-border">
        {[
          ["Balance", "1,284.07", "PTON"],
          ["Spend (30d)", "312.40", "PTON"],
          ["Sessions", "2,164", "calls"],
          ["Avg cost", "0.144", "PTON / call"],
        ].map(([k, v, u]) => (
          <div
            key={k}
            className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5 sm:py-3"
          >
            <dt className="text-[13px] text-fg-muted">{k}</dt>
            <dd className="font-mono text-[13px] text-fg sm:text-[14px]">
              <strong className="font-medium">{v}</strong>
              <span className="ml-1.5 text-[11px] text-fg-dim">{u}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="p-4 sm:p-5">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-[72%] rounded-full bg-accent" />
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-fg-dim">
          <span>used 312 / 1,596</span>
          <span>top-up at 20%</span>
        </div>
      </div>
    </aside>
  );
}

export function BillingSection() {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
      <div>
        <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="flex w-full flex-col md:flex-row md:items-stretch"
            >
              <FlowStep {...s} />
              {i < STEPS.length - 1 && <FlowArrow />}
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-[60ch] text-[14px] text-fg-muted leading-relaxed sm:mt-8 sm:text-base">
          Route LLM calls through the credit gateway and spend settles on-chain
          in PTON — an EIP-3009 wrapper over Tokamak TON deposited into a
          ClaudeVault contract. Top up with USDC, USDT, ETH, or WBTC; mint keys;
          ship.
        </p>
      </div>
      <VaultReceipt />
    </div>
  );
}
