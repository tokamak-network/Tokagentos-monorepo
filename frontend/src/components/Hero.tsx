import { CopyButton } from "./CopyButton";
import { InlineLink } from "./InlineLink";
import { LiveBadge } from "./LiveBadge";
import { PlasmaBackdrop, PlasmaBackdropMobile } from "./PlasmaBackdrop";

const QUICK_START_CMD = "bunx @tokagent/tokagentos@latest";
const QUICK_START_CMD_SHORT = "bunx @tokagent/tokagentos";
const VAULT_SHORT = "0x0913…74F5c";

const TRUST_TAGS: Array<[string, string]> = [
  ["license", "MIT"],
  ["runtime", "Bun ≥ 1.3.14"],
  ["engine", "Node 24.15.0"],
  ["lineage", "fork of elizaOS"],
];

export function Hero() {
  return (
    <section
      className="relative isolate overflow-hidden px-0 pt-7 pb-10 md:py-28"
      aria-labelledby="hero-heading"
    >
      <PlasmaBackdrop />
      <PlasmaBackdropMobile />

      <div className="container-page relative z-[1]">
        {/* Status pill — separator-dot pattern on mobile, more breathing room on desktop */}
        <div className="inline-flex max-w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-full border border-border-strong bg-surface/[0.5] px-2.5 py-1.5 font-mono text-[9.5px] text-fg-muted tracking-[0.02em] md:px-3 md:text-[11px]">
          <LiveBadge label="Live on mainnet" />
          <span>Live on mainnet</span>
          <span
            aria-hidden="true"
            className="h-[3px] w-[3px] shrink-0 rounded-full bg-border-strong"
          />
          <span className="text-accent">v2.0-alpha</span>
          <span
            aria-hidden="true"
            className="h-[3px] w-[3px] shrink-0 rounded-full bg-border-strong"
          />
          <span>ClaudeVault</span>
          <code className="shrink-0 rounded-[3px] bg-accent/[0.08] px-1 py-px font-mono text-[9px] text-accent md:text-[10px]">
            {VAULT_SHORT}
          </code>
        </div>

        <h1
          id="hero-heading"
          className="mt-4 max-w-[14ch] text-balance font-semibold text-[38px] text-fg leading-[1.02] tracking-[-0.035em] md:mt-6 md:text-[72px] md:leading-[1.05] md:tracking-[-0.03em]"
        >
          AI agents that <span className="gold-grad">hold their own keys.</span>
        </h1>

        <p className="mt-4 max-w-[58ch] text-[15px] text-fg-muted leading-[1.5] md:mt-7 md:text-[20px]">
          tokagentOS is Tokamak&apos;s open-source framework for autonomous
          agents with a native EVM wallet baked into every runtime. Bring your
          own LLM API key, or let the agent&apos;s wallet pay per call via{" "}
          <a
            href="https://x402.org/"
            target="_blank"
            rel="noreferrer noopener"
            className="border-accent/50 border-b border-dotted text-accent"
          >
            x402
          </a>
          .
        </p>

        {/* CLI block — short cmd on mobile, full on desktop */}
        <div className="mt-6 flex w-full items-center gap-2.5 rounded-[10px] border border-border-strong bg-elev px-3 py-3 md:mt-9 md:max-w-md md:gap-3 md:px-4">
          <span
            aria-hidden="true"
            className="font-mono text-[12.5px] text-accent md:text-sm md:text-fg-dim"
          >
            $
          </span>
          <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12.5px] text-fg md:text-[14px]">
            <span className="md:hidden">{QUICK_START_CMD_SHORT}</span>
            <span className="hidden md:inline">{QUICK_START_CMD}</span>
          </code>
          <CopyButton
            value={QUICK_START_CMD}
            label={`Copy command: ${QUICK_START_CMD}`}
          />
        </div>

        {/* CTA row — mobile gets a primary (gold filled) + secondary (steel) pair */}
        <div className="mt-3 flex gap-2 md:hidden">
          <a
            href="https://github.com/tokamak-network/Tokagentos-monorepo"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-[46px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-accent bg-accent px-4 font-medium font-mono text-[13.5px] text-page lowercase tracking-[-0.005em] active:scale-[0.98]"
          >
            view on github
            <span aria-hidden="true">→</span>
          </a>
          <a
            href="https://x402.org/"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-[46px] items-center justify-center gap-1.5 rounded-[10px] border border-border-strong bg-surface-2/[0.6] px-4 font-medium font-mono text-[13.5px] text-fg lowercase tracking-[-0.005em]"
          >
            x402 <span aria-hidden="true">↗</span>
          </a>
        </div>

        {/* Desktop CTA row */}
        <div className="mt-6 hidden flex-wrap items-center gap-x-6 gap-y-3 md:flex">
          <InlineLink href="https://github.com/tokamak-network/Tokagentos-monorepo">
            view on github
          </InlineLink>
          <InlineLink href="https://x402.org/">learn about x402</InlineLink>
        </div>

        {/* Trust strip — 4-row vertical list on mobile, 4-col grid on desktop */}
        <dl className="mt-8 flex flex-col gap-2.5 border-border border-t pt-6 md:mt-16 md:grid md:max-w-3xl md:grid-cols-4 md:gap-x-8 md:gap-y-6 md:border-t-0 md:pt-0">
          {TRUST_TAGS.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between border-border-strong border-b border-dashed pb-2.5 last:border-b-0 last:pb-0 md:block md:border-0 md:pb-0"
            >
              <dt className="font-mono text-[10px] text-fg-dim uppercase tracking-[0.1em] md:text-[11px] md:tracking-[0.08em]">
                {label}
              </dt>
              <dd className="font-medium font-mono text-[13px] text-fg tracking-tight md:mt-1.5 md:text-[18px]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
