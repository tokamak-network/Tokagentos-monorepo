import { CopyButton } from "./CopyButton";
import { InlineLink } from "./InlineLink";
import { LiveBadge } from "./LiveBadge";
import { PlasmaBackdrop } from "./PlasmaBackdrop";

const QUICK_START_CMD = "bunx @tokagent/tokagentos@latest";
const VAULT_SHORT = "0x0913…74F5c";

const TRUST_TAGS: Array<[string, string]> = [
  ["MIT", "license"],
  ["Bun ≥ 1.3.14", "runtime"],
  ["Node 24.15.0", "engine"],
  ["fork of elizaOS", "lineage"],
];

export function Hero() {
  return (
    <section
      className="relative isolate overflow-hidden py-20 md:py-28"
      aria-labelledby="hero-heading"
    >
      <PlasmaBackdrop />

      <div className="container-page relative z-[1]">
        {/* Pill badge */}
        <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-border bg-surface/70 px-3 py-1.5 backdrop-blur">
          <LiveBadge label="Live on mainnet" />
          <span className="font-mono text-[11px] text-fg-muted tracking-wide">
            v2.0-alpha · ClaudeVault settled
          </span>
          <span className="font-mono text-[11px] text-accent">
            {VAULT_SHORT}
          </span>
        </div>

        <h1 id="hero-heading" className="display-text max-w-[14ch] text-fg">
          AI agents that hold their own{" "}
          <span className="text-accent">keys</span>.
        </h1>

        <p className="mt-7 max-w-[58ch] text-[18px] text-fg-muted leading-relaxed md:text-[20px]">
          tokagentOS is Tokamak&apos;s open-source framework for autonomous
          agents with a native EVM wallet baked into every runtime. Bring your
          own LLM API key, or let the agent&apos;s wallet pay per call via{" "}
          <a
            href="https://x402.org/"
            target="_blank"
            rel="noreferrer noopener"
            className="text-fg underline-offset-4 hover:underline"
          >
            x402
          </a>
          .
        </p>

        {/* CLI block */}
        <div className="mt-9 flex max-w-md items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <span aria-hidden="true" className="font-mono text-fg-dim text-sm">
            $
          </span>
          <code className="flex-1 truncate font-mono text-[14px] text-fg">
            {QUICK_START_CMD}
          </code>
          <CopyButton
            value={QUICK_START_CMD}
            label={`Copy command: ${QUICK_START_CMD}`}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <InlineLink href="https://github.com/tokamak-network/Tokagentos-monorepo">
            view on github
          </InlineLink>
          <InlineLink href="https://x402.org/">learn about x402</InlineLink>
        </div>

        {/* Trust strip — honest tags only */}
        <dl className="mt-16 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
          {TRUST_TAGS.map(([value, label]) => (
            <div key={label}>
              <dt className="font-mono text-[11px] text-fg-dim uppercase tracking-[0.08em]">
                {label}
              </dt>
              <dd className="mt-1.5 font-mono font-medium text-[18px] text-fg tracking-tight">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
