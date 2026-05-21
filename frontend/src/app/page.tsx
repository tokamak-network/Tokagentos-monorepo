import { AgentTicker } from "@/components/AgentTicker";
import { BillingSection } from "@/components/BillingSection";
import { CodeWindow } from "@/components/CodeWindow";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { MarqueeStrip } from "@/components/MarqueeStrip";
import { ModesSection } from "@/components/ModesSection";
import { Nav } from "@/components/Nav";
import { QuickStartTabs } from "@/components/QuickStartTabs";
import { SectionHeader } from "@/components/SectionHeader";
import { type Panel, TwoPathsToggle } from "@/components/TwoPathsToggle";

const quickStartTabs = [
  {
    id: "bun",
    label: "bun",
    lines: [
      "bunx @tokagent/tokagentos@latest",
      "tokagentos",
      "cd my-agent && bun install",
      "bun run dev   # UI :2138 · API :31337",
    ],
  },
  {
    id: "npm",
    label: "npm",
    lines: [
      "npm install -g @tokagent/tokagentos",
      "tokagentos",
      "cd my-agent && npm install && npm run dev",
    ],
  },
  {
    id: "pnpm",
    label: "pnpm",
    lines: [
      "pnpm dlx @tokagent/tokagentos@latest",
      "tokagentos",
      "cd my-agent && pnpm install",
      "pnpm dev",
    ],
  },
];

const walletNativeCode = `import { defineAgent } from '@tokagent/core'

export default defineAgent({
  name: 'treasurer',
  llm: { provider: 'anthropic' },
  wallet: {
    mode: 'vault',
    vault: '0x091365301a461bEeFd5e2Fe1BD244befCE274F5c',
  },
  onMessage: async ({ wallet }) => {
    const eth = await wallet.balance('mainnet')
    return \`I hold \${eth} ETH at \${wallet.address}\`
  },
})`;

const byoPanel: Panel = {
  id: "byo",
  label: "BYO API KEY",
  title: "Bring your key.",
  body: "Anthropic, OpenAI, OpenRouter, Grok, Gemini, Groq, Ollama (local), LiteLLM proxy. Set the env. The matching provider auto-loads at boot. No code changes to swap.",
  code: `// .env
ANTHROPIC_API_KEY=sk-ant-...

// agent
export default defineAgent({
  llm: {
    provider: 'anthropic',
    model: 'claude-opus-4-7',
  },
})`,
  footnote: { text: "8 PROVIDERS SUPPORTED" },
};

const x402Panel: Panel = {
  id: "x402",
  label: "x402 WALLET",
  title: "Wallet pays per call.",
  body: "No subscription. No account. No API key. Each LLM call settles in crypto via the HTTP-402 standard. EIP-3009 → PTON → ClaudeVault. Built for headless, autonomous, on-chain agents.",
  code: `// .env
BILLING_CHAT_KEY=sk-ai-...
TOKAGENT_GATEWAY_URL=https://...

// agent
export default defineAgent({
  llm: {
    provider: 'x402',
    vault: '0x091365…74F5c',
  },
})`,
  footnote: { text: "LEARN MORE AT x402.org →", href: "https://x402.org/" },
};

const ecosystemGroups = [
  {
    label: "LLM PROVIDERS",
    items: [
      "anthropic",
      "openai",
      "openrouter",
      "grok",
      "gemini",
      "groq",
      "ollama",
      "litellm",
    ],
  },
  {
    label: "CHANNELS",
    items: ["discord", "telegram", "twitter", "whatsapp", "signal", "imessage"],
  },
  {
    label: "CHAINS",
    items: ["mainnet", "base", "arbitrum", "optimism", "polygon", "titan"],
  },
];

export default function Page() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <Nav />

      <main id="main">
        <Hero />

        {/* AGENT LOG — replaces the static hero terminal */}
        <section
          aria-labelledby="agent-log-heading"
          className="border-border border-t py-12 md:py-16"
          id="agent-log"
        >
          <div className="container-page">
            <h2 id="agent-log-heading" className="sr-only">
              Live agent log
            </h2>
            <p className="mb-4 font-mono text-[11px] text-fg-dim tracking-[0.14em]">
              <span className="text-accent">⟩ </span>EXAMPLE TRACE · STEWARD
              AGENT · DAEMON MODE
            </p>
            <AgentTicker />
          </div>
        </section>

        {/* 01 / SCAFFOLD */}
        <section
          aria-labelledby="scaffold-heading"
          className="border-border border-t bg-elev py-20 md:py-28"
          id="scaffold"
        >
          <div className="container-page">
            <SectionHeader
              number="01"
              eyebrow="quick start"
              heading="One command. Then it's just TypeScript."
              sub="Pick a template, pick plugins, set .env, run. No boilerplate, no wallet plumbing."
              headingId="scaffold-heading"
            />
            <div className="mt-10 max-w-3xl">
              <QuickStartTabs tabs={quickStartTabs} defaultTab="bun" />
            </div>
          </div>
        </section>

        {/* 02 / WALLET-NATIVE */}
        <section
          aria-labelledby="wallet-heading"
          className="border-border border-t py-20 md:py-28"
          id="wallet"
        >
          <div className="container-page grid items-start gap-12 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <SectionHeader
                number="02"
                eyebrow="wallet-native"
                heading="The agent IS the wallet."
                headingId="wallet-heading"
              />
              <div className="mt-6 space-y-4 text-[16px] text-fg-muted leading-relaxed">
                <p>
                  Every agent ships with a built-in EVM wallet. Read balances
                  across chains. Sign EIP-712, EIP-3009, SIWE. Hold tokens. Send
                  transactions. No external signer to wire up.
                </p>
                <p>
                  The wallet is the agent&apos;s identity. The agent&apos;s
                  identity is on-chain.
                </p>
              </div>
              <ul className="mt-8 space-y-2 font-mono text-[13px]">
                {[
                  "Built on @elizaos/plugin-evm",
                  "Native EIP-712 / EIP-3009 / SIWE signing",
                  "Multi-chain balance reads out of the box",
                ].map((line) => (
                  <li key={line} className="flex items-baseline gap-2 text-fg">
                    <span aria-hidden="true" className="text-accent">
                      ⟩
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <CodeWindow filename="agent.ts" code={walletNativeCode} />
            </div>
          </div>
        </section>

        {/* 03 / PAY YOUR LLM */}
        <section
          aria-labelledby="llm-heading"
          className="border-border border-t bg-elev py-20 md:py-28"
          id="llm"
        >
          <div className="container-page">
            <SectionHeader
              number="03"
              eyebrow="pay your llm"
              heading="Two paths. One agent."
              sub="Bring an API key, or let the wallet pay. Switch per environment, per agent, per call."
              headingId="llm-heading"
              centered
            />
            <div className="mx-auto mt-12 max-w-5xl">
              <TwoPathsToggle panels={[byoPanel, x402Panel]} />
            </div>
          </div>
        </section>

        {/* 04 / RUNTIME MODES */}
        <section
          aria-labelledby="modes-heading"
          className="border-border border-t py-20 md:py-28"
          id="modes"
        >
          <div className="container-page">
            <SectionHeader
              number="04"
              eyebrow="runtime"
              heading="Three runtime modes. Same agent, different blast radius."
              sub="Decide once per project: how much can the LLM actually do on-chain?"
              headingId="modes-heading"
            />
            <div className="mt-12">
              <ModesSection />
            </div>
          </div>
        </section>

        {/* MARQUEE — ecosystem strip */}
        <MarqueeStrip groups={ecosystemGroups} />

        {/* 05 / BILLING */}
        <section
          aria-labelledby="billing-heading"
          className="border-border border-t bg-elev py-20 md:py-28"
          id="billing"
        >
          <div className="container-page">
            <SectionHeader
              number="05"
              eyebrow="billing rail"
              heading="Billed in PTON, not a SaaS subscription."
              sub="Route LLM calls through the credit gateway and spend settles on-chain in PTON — an EIP-3009 wrapper over Tokamak TON deposited into a ClaudeVault contract."
              headingId="billing-heading"
            />
            <div className="mt-12">
              <BillingSection />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
