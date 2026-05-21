import { AddressLink } from "./AddressLink";
import { LiveBadge } from "./LiveBadge";

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
      className={`flex-1 rounded-xl border bg-surface p-5 ${
        accent ? "border-accent" : "border-border"
      }`}
    >
      <div className="font-mono text-[11px] text-fg-dim tracking-[0.12em]">
        {n}
      </div>
      <div className="mt-2 font-medium text-fg text-base">{title}</div>
      <p className="mt-2 text-[13px] text-fg-muted leading-relaxed">{body}</p>
    </div>
  );
}

function VaultReceipt() {
  return (
    <aside className="overflow-hidden rounded-2xl border border-border bg-surface">
      <header className="flex items-center justify-between border-border border-b p-5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-accent"
          />
          <span className="font-mono text-[11px] text-fg-dim uppercase tracking-[0.12em]">
            ClaudeVault
          </span>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-2.5 py-1">
          <LiveBadge label="Live on mainnet" />
          <span className="font-mono text-[10px] text-live tracking-[0.08em]">
            LIVE · MAINNET
          </span>
        </span>
      </header>

      <div className="border-border border-b px-5 py-4">
        <div className="font-mono text-[10px] text-fg-dim uppercase tracking-[0.12em]">
          contract
        </div>
        <div className="mt-1.5 break-all font-mono text-[13px] text-fg">
          <AddressLink address={VAULT_ADDRESS} />
        </div>
      </div>

      <div className="flex items-center justify-between border-border border-b bg-surface-2 px-5 py-2">
        <span className="font-mono text-[10px] text-fg-dim uppercase tracking-[0.12em]">
          ⟩ example values · connect a wallet to see real data
        </span>
      </div>

      <dl className="divide-y divide-border">
        {[
          ["Balance", "1,284.07", "PTON"],
          ["Spend (30d)", "312.40", "PTON"],
          ["Sessions", "2,164", "calls"],
          ["Avg cost", "0.144", "PTON / call"],
        ].map(([k, v, u]) => (
          <div key={k} className="flex items-center justify-between px-5 py-3">
            <dt className="text-[13px] text-fg-muted">{k}</dt>
            <dd className="font-mono text-[14px] text-fg">
              <strong className="font-medium">{v}</strong>
              <span className="ml-1.5 text-[11px] text-fg-dim">{u}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="p-5">
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
    <div className="grid items-start gap-12 lg:grid-cols-[1.4fr_1fr]">
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
        <p className="mt-8 max-w-[60ch] text-fg-muted leading-relaxed">
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
