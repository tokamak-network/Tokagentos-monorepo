<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/logo.svg" />
    <img src="./docs/logo-light.svg" alt="tokagentOS" width="320" />
  </picture>
  <p><strong>An open-source framework for building autonomous AI agents with native crypto-wallet integration.</strong></p>

  [![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
  [![bun](https://img.shields.io/badge/bun-%E2%89%A5%201.3.14-black.svg)](https://bun.sh)
  [![node](https://img.shields.io/badge/node-24.15.0-339933.svg)](./.nvmrc)
</div>

## What is tokagentOS?

**tokagentOS** is an open-source framework for building autonomous AI agents that have a crypto wallet by default. Every agent ships with a built-in EVM wallet, so any agent can sign messages, hold tokens, top up its own LLM credits, mint NFTs, manage on-chain identity, or run trading strategies — without the developer wiring a separate wallet stack.

Two things make it different from a generic agent framework:

1. **Wallet-native runtime.** The wallet is a first-class runtime primitive, not a plugin. Agents can read balances, sign EIP-712 / EIP-3009 / SIWE payloads, and execute transactions through configurable safety boundaries (raw signing, or routed through a non-custodial `ClaudeVault` with per-method allowlists).
2. **Two paths for paying LLM providers** — bring your own API key (Anthropic, OpenAI, OpenRouter, Grok / xAI, Google Gemini, Groq, Ollama), **or** pay per call in crypto via an [x402](https://x402.org/)-compatible payment rail (EIP-3009 → PTON → `ClaudeVault`), where the agent's own wallet funds inference without any centralized account.

It is a fork of [elizaOS](https://github.com/elizaos/eliza) restyled for the Tokamak ecosystem. The runtime, plugin model, and agent loop come from upstream; wallet integration, the x402 billing rail, the project scaffolder, and the Tokamak-branded app catalog (companion avatars, productivity, commerce, multi-agent coordination, NFT drops, DeFi, …) are Tokamak-native. See [`NOTICE.md`](./NOTICE.md) for attribution.

> **Repo provenance.** This is the standalone home of what used to live at `tokagentos/` inside [`tokamak-network/Tokamak-AI-Layer`](https://github.com/tokamak-network/Tokamak-AI-Layer). Git history is preserved — `git log` here goes back to the original commits, with the `tokagentos/` prefix rewritten out of every path.

---

## Table of Contents

- [Key features](#key-features)
- [Framework, projects, and plugins](#framework-projects-and-plugins)
- [Pick your starting point](#pick-your-starting-point)
- [CLI quick start](#cli-quick-start)
- [Standalone usage (monorepo)](#standalone-usage-monorepo)
- [Runtime modes](#runtime-modes)
- [LLM access: x402 or bring-your-own-key](#llm-access-x402-or-bring-your-own-key)
- [Architecture](#architecture)
- [Environment variables](#environment-variables)
- [Common commands](#common-commands)
- [Per-package commands](#per-package-commands)
- [Testing](#testing)
- [Deployment](#deployment)
- [CI workflows](#ci-workflows)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License and attribution](#license-and-attribution)

---

## Key features

- **Wallet-native agents** — every agent has a built-in EVM wallet. Sign EIP-712 / EIP-3009 / SIWE payloads, read balances across chains, mint or hold tokens, and execute transactions — without bolting on a separate wallet stack.
- **Two paths for LLM access** — (a) **bring your own API key** for any of Anthropic, OpenAI, OpenRouter, Grok / xAI, Google Gemini, Groq, or local Ollama; or (b) **fully decentralized** pay-per-call via [x402](https://x402.org/) — the agent's wallet funds inference through EIP-3009 → PTON → `ClaudeVault` with no centralized account, no subscription, no API key.
- **Configurable execution safety** — sign raw EVM transactions directly with the operator key, or route every call through a non-custodial `ClaudeVault` contract that enforces per-method allowlists at the chain level. Pick your trust boundary per project.
- **Wide app catalog** — first-party apps under [`apps/`](./apps) span companion avatars (VRM), productivity (LifeOps), commerce (Shopify), multi-agent orchestration (Steward, Task Coordinator), NFT drops (TokagentMaker, ERC-8041), document RAG (Knowledge), Lit Protocol agent auth (Vincent), training data capture, and DeFi strategy automation. Each is a standalone workspace; mix and match.
- **Model-, channel-, and chain-agnostic** — provider keys, messaging channels (Discord, Telegram, Twitter/X, WhatsApp, Signal, iMessage), and RPC endpoints are env-gated and auto-enable when set. No code changes to swap any of them.
- **Project scaffolder** — the `@tokagent/tokagentos` CLI generates a self-contained project workspace wired to the right versions of every package, with template + per-file patch overrides.
- **White-label app shell** — `@tokagentos/app-core` is a runnable dev-server + plugin registry that hosts branded UIs without forking the runtime.
- **First-class TypeScript** — protobuf schemas (`@tokagentos/schemas`) are the single source of truth across services; every runtime surface is typed end-to-end.

> **Looking for plugins?** First-party Tokagent plugins live in [`plugins/plugin-tokagent-*`](./plugins). Upstream elizaOS plugins (`@elizaos/plugin-anthropic`, `@elizaos/plugin-evm`, `@elizaos/plugin-sql`, `@elizaos/plugin-ollama`, …) are pulled from npm. Submodule-managed upstream plugins (`plugin-signal`, `plugin-bluebubbles`) populate via `git submodule update --init`.

---

## Framework, projects, and plugins

tokagentOS is a framework plus packages built on top of it. Knowing which layer you are working with keeps projects, plugins, and app surfaces from getting mixed together.

**The framework** is the runtime: `@tokagentos/core`, the agent loop, the plugin model (actions, providers, services), the message/memory/state primitives, and the model-agnostic LLM layer. If you depend on `@tokagentos/core` from your own code, you are using the framework.

**A project** is a deployable product workspace generated by the `tokagentos` CLI. A generated project owns its branded app shell (Vite + React UI under `apps/app/`), its `.env`, and its plugin selection.

**A plugin** is a runtime extension — actions, providers, or services that mount into the agent. First-party plugins live in [`plugins/plugin-tokagent-*`](./plugins) and ship as npm packages under `@tokagent/plugin-*`. They are loaded by package name.

**An app** is a top-level workspace under [`apps/`](./apps) that contributes its own UI surface — companion avatar runtime, LifeOps routines, Shopify integration, NFT minting flows — and is consumed by `@tokagentos/app-core` at boot.

The directory tree reflects this split:

```
Tokagentos-monorepo/
├── packages/                # framework + shared libraries (workspace-only)
│   ├── typescript/          #  @tokagentos/core    — runtime interfaces, action/route types, logger, Service base
│   ├── shared/              #  @tokagentos/shared  — env resolution, port discovery, connectors
│   ├── agent/               #  @tokagentos/agent   — headless agent runtime + API server (Elysia)
│   ├── app-core/            #  @tokagentos/app-core— dev-server + Vite bridge + plugin registry for white-label apps
│   ├── ui/                  #  @tokagentos/ui      — shared React primitives + design tokens
│   ├── billing/             #  @tokagentos/billing — Postgres-backed credit ledger + EIP-3009 settlement + TWAP oracle
│   ├── schemas/             #  @tokagentos/schemas — protobuf-generated types (single source of truth)
│   └── tokagentos/          #  @tokagent/tokagentos — public CLI that scaffolds new projects (npm-published)
│
├── plugins/                 # runtime plugins — opt-in features mounted into a runtime
│   ├── plugin-tokagent-billing/       # x402 LLM payment rail: /v1/auth, /v1/keys, /v1/topup, /v1/messages
│   ├── plugin-tokagent-shared/        # (DeFi pack) vault bindings, chain config, wallet helpers, risk constants
│   ├── plugin-tokagent-strategy/      # (DeFi pack) strategy engine + StrategyRunnerService
│   ├── plugin-tokagent-perps/         # (DeFi pack) Hyperliquid perpetuals via vault allowlist
│   ├── plugin-tokagent-yield/         # (DeFi pack) Aave v3 deposit/withdraw on Polygon via vault allowlist
│   ├── plugin-tokagent-polymarket/    # (DeFi pack) Polymarket buy/sell/redeem via vault allowlist
│   ├── plugin-signal/                 # (upstream submodule) Signal messaging
│   └── plugin-bluebubbles/            # (upstream submodule) iMessage via BlueBubbles
│
├── apps/                    # top-level deployable apps — each is a standalone workspace,
│   │                        # pick the ones you want; none are required
│   ├── app-companion/       # VRM 3D avatar runtime — voice + face + body for chat-first agents
│   ├── app-lifeops/         # personal-productivity agent: routines, goals, Google Workspace,
│   │                        #   Apple Reminders, Twilio, browser companion control, hosts-file blocking
│   ├── app-shopify/         # Shopify storefront agent surfaces
│   ├── app-steward/         # multi-agent steward orchestration
│   ├── app-task-coordinator/# multi-agent task coordination
│   ├── app-tokagentmaker/   # NFT minting workflow: ERC-8041 drops, Twitter-verified Merkle whitelists, OG codes
│   ├── app-knowledge/       # RAG over user documents (scoped per agent / per owner)
│   ├── app-training/        # trajectory capture + prompt optimization
│   ├── app-vincent/         # Lit Protocol Vincent integration (agent auth + policy)
│   └── billing-server/      # the hosted x402 LLM credit gateway (Fly.io deployment)
│
├── scripts/                 # dev tooling: lockfile sync, plugin submodule bootstrap, build orchestration
├── docs/                    # design notes, ADRs, runbooks
└── packages/tokagentos/templates/   # CLI scaffolds (fullstack-app, headless-daemon, …)
```

---

## Pick your starting point

| You want to…                                                  | Start here                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| Run an agent in 5 minutes                                     | [CLI quick start](#cli-quick-start)                         |
| Hack on the framework, plugins, or apps                       | [Standalone usage (monorepo)](#standalone-usage-monorepo)   |
| Understand the wallet, runtime, and execution boundary        | [Architecture](#architecture)                               |
| Know every env var                                            | [Environment variables](#environment-variables)             |
| Ship a project to production                                  | [Deployment](#deployment)                                   |
| Pick a wallet-execution mode (raw signing vs vault allowlist) | [Runtime modes](#runtime-modes)                             |
| Pay for LLM calls with crypto instead of an API key           | [LLM access: x402 or bring-your-own-key](#llm-access-x402-or-bring-your-own-key) |

---

## CLI quick start

> **Prerequisites:** macOS or Linux, [Bun ≥ 1.3.14](https://bun.sh), [Node 24.15.0](./.nvmrc) (for build scripts), Git ≥ 2.40. An EVM wallet (MetaMask / Rabby) if you want to use the billing dashboard. Windows users: run inside [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install-manual).

The [`@tokagent/tokagentos`](./packages/tokagentos) CLI scaffolds a fresh, self-contained project wired to published versions of every package. Use this when you want to **run** an agent, not develop the framework.

```bash
# 1. Run the CLI directly — no install needed (bunx fetches the published version)
bunx @tokagent/tokagentos@latest

# 2. Follow the prompts: pick a project name, template, plugin set.
#    Output: ./<your-project>/ with package.json, .env.example,
#    apps/app/ (Vite + React UI), and the plugins you selected.

# 3. Configure
cd <your-project>
cp .env.example .env
# Fill in at minimum:
#   TOKAGENT_PRIVATE_KEY=0x...              (the agent's built-in wallet — required)
#   TOKAGENT_RPC_URL=https://...            (Ethereum mainnet RPC)
#
# Then pick ONE LLM access path:
#   ANTHROPIC_API_KEY=sk-ant-...            (bring-your-own — also works: OPENAI_API_KEY,
#                                            OPENROUTER_API_KEY, XAI_API_KEY,
#                                            GOOGLE_GENERATIVE_AI_API_KEY, GROQ_API_KEY)
# OR
#   BILLING_CHAT_KEY=sk-ai-...              (x402 decentralized — agent's wallet pays per call)
#   TOKAGENT_GATEWAY_URL=https://...
#
# Optional, only if running in vault execution mode:
#   TOKAGENT_VAULT_ADDRESS=0x...            (your deployed ClaudeVault)

# 4. Run
bun install
bun run dev
# UI         → http://localhost:2138
# API server → http://localhost:31337   (or TOKAGENT_API_PORT)
```

The dev loop launches Vite for the React UI on `:2138`, an in-process API server on `:31337` (overridable via `TOKAGENT_API_PORT`), and the headless tokagent runtime that owns the agent loop. Hot-reload works for both the UI and the runtime.

Full CLI reference: `bunx @tokagent/tokagentos --help`.

---

## Standalone usage (monorepo)

Clone this repo when you are editing one of the packages, plugins, or apps themselves.

```bash
git clone https://github.com/tokamak-network/Tokagentos-monorepo.git
cd Tokagentos-monorepo

bun install                  # workspace install; postinstall patches nested core dist
bun run build                # turbo builds all workspace packages (~1-3 min cold)

# Smoke test: typecheck the whole tree
bun run typecheck            # ~30s, runs `tsc --noEmit` per package via turbo

# Run a sample agent against your local edits
cp .env.example .env
# (edit .env — at minimum set an LLM provider key)
bun run dev                  # multi-process supervisor (scripts/dev.mjs)
```

To iterate on a single package, run its build in watch mode in a side shell:

```bash
bun run dev:core             # watch-build @tokagentos/core
# or, per package:
cd packages/agent && bun run dev
```

### The scaffold mechanism

`@tokagent/tokagentos` (in [`packages/tokagentos/`](./packages/tokagentos)) is more than `cp -r` — it generates a project that **references the same workspace packages this monorepo defines**, with one important twist:

- **`templates/`** — project skeletons per template (`fullstack-app`, `headless-daemon`, …). Each is a near-complete `package.json` + `vite.config.ts` + entry points.
- **`scaffold-patches/`** — per-file overrides applied on top of the chosen template at scaffold time. This is how scaffolded projects pick up things like the `BILLING_CHAT_KEY → OPENAI_API_KEY` mirror in `core-plugins.ts` without those edits living in the upstream agent package.
- **`templates-manifest.json`** — declarative list of which files are scaffolded from which template + which patches apply.

The scaffolded project depends on `@tokagentos/*` and `@tokagent/plugin-*` via published npm versions (or `workspace:*` when running locally), so you can edit a plugin in this monorepo and `bun link` it into a scaffolded project for testing without re-publishing.

---

## Runtime modes

Two orthogonal switches: **how the agent's wallet signs transactions** (`TOKAGENT_EXECUTION_MODE`) and **what UI it serves**.

### Wallet-execution mode (`TOKAGENT_EXECUTION_MODE`)

This is the trust boundary around the agent's wallet. It applies to every on-chain action — token transfers, contract calls, NFT mints, DeFi strategies, anything.

| Mode       | What it does                                                                                                                                                       | Use when                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vault`    | Every on-chain call routes through a deployed `ClaudeVault` contract that enforces per-method allowlists at the chain level. No raw EVM signing reachable from chat. | Production. Operator hot key cannot drain funds even if the LLM is compromised or prompt-injected. Loads the Tokagent vault plugins; **does not** load `plugin-evm`. |
| `direct`   | The operator wallet signs transactions directly. Chat can drive arbitrary swaps and transfers via `@elizaos/plugin-evm`.                                           | Development, demos, or use cases where you want full chat-driven on-chain control. Loads `plugin-evm`; **does not** load the vault plugins.                |
| `both`     | Both code paths loaded; the LLM picks per request.                                                                                                                 | Rare. Reduced safety guarantees — use only when you understand both paths.                                                                                |

### UI mode

- **`daemon`** — headless. Agent loop runs, signs autonomously. No UI served.
- **`operator`** — daemon + local React UI on `TOKAGENT_UI_PORT` (default `2138`): Chat / Automations / Wallet / Settings / Billing tabs.

### Channels (env-gated, opt-in)

Set any of these to activate the matching channel: `DISCORD_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TWITTER_API_KEY` + `TWITTER_API_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `SIGNAL_PHONE_NUMBER`. iMessage via BlueBubbles is available through the upstream submodule plugin (`git submodule update --init plugins/plugin-bluebubbles`).

LLM provider selection is its own decision tree — see the next section.

---

## LLM access: x402 or bring-your-own-key

tokagentOS gives you two paths to model inference. Pick one, or run both side by side.

### Option 1 — Bring your own API key (centralized)

Set any of the following in `.env`; the matching plugin auto-loads at boot:

| Provider           | Env var                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- |
| Anthropic Claude   | `ANTHROPIC_API_KEY`                                                                    |
| OpenAI             | `OPENAI_API_KEY`                                                                       |
| OpenRouter         | `OPENROUTER_API_KEY`                                                                   |
| Grok / xAI         | `XAI_API_KEY`                                                                          |
| Google Gemini      | `GOOGLE_GENERATIVE_AI_API_KEY`                                                         |
| Groq               | `GROQ_API_KEY`                                                                         |
| Ollama (local)     | `OLLAMA_API_ENDPOINT`                                                                  |
| LiteLLM (proxy)    | `LITELLM_BASE_URL` + `LITELLM_API_KEY` + `LITELLM_SMALL_MODEL` + `LITELLM_LARGE_MODEL` |

If no provider key is set, the runtime falls back to a local model via `@elizaos/plugin-ollama`. You pay the upstream provider directly with your own account. Same path any elizaOS agent uses.

### Option 2 — x402 decentralized pay-per-call (no API key, no account)

The agent's own wallet funds each LLM call via [x402](https://x402.org/), the HTTP-402 payment standard. No signup, no centralized billing account, no monthly subscription — every request is settled on-chain in PTON.

**How it works end-to-end:**

1. The agent makes an LLM request to the gateway (`/v1/messages` for Anthropic-shaped, `/v1/chat/completions` for OpenAI-shaped).
2. Either a SIWE login (EIP-712 → 24-hour session JWT) or an HMAC API key (`sk-ai-*`) authenticates the wallet. SIWE is interactive; API keys are stateless and good for headless agents.
3. The gateway reserves credits against the wallet's PTON balance in `ClaudeVault`, forwards to LiteLLM (which fans out to any supported model), streams the response back via SSE, then commits actual usage.
4. Periodic on-chain `consumeCredits` flushes batch the per-request charges. Wallets top up by depositing PTON via EIP-3009 (`vault.depositX402`) — gasless from the user's side, anyone can submit.
5. PTON is an EIP-3009 wrapper over Tokamak TON, 1:1. The dashboard swaps USDC / USDT / ETH / WBTC → TON → PTON in one flow.

To use the hosted Tokamak gateway:

```bash
BILLING_CHAT_KEY=sk-ai-...                                              # mint via the dashboard
TOKAGENT_GATEWAY_URL=https://billing-service-production-a8e7.up.railway.app
```

Or run your own gateway from [`apps/billing-server/`](./apps/billing-server) — same code, your own Fly.io app, your own `ClaudeVault` deployment.

The dashboard at `/v1/billing/dashboard/` provides API-key minting (with auto-install into local `.env`), swap-to-PTON top-up, 90-day usage history, and balance / quote endpoints.

**Implementation:**

- [`packages/billing/`](./packages/billing) — Postgres-backed ledger (Drizzle ORM), EIP-3009 settlement, TON/USD composite Uniswap V3 TWAP oracle, on-chain `consumeCredits` flusher.
- [`plugins/plugin-tokagent-billing/`](./plugins/plugin-tokagent-billing) — `/v1/auth`, `/v1/keys`, `/v1/topup`, `/v1/messages` routes + middleware. Drop this into any tokagentOS agent to expose x402 endpoints.
- [`apps/billing-server/`](./apps/billing-server) — the hosted gateway. See [`scripts/billing-server-DEPLOY.md`](./scripts/billing-server-DEPLOY.md) for the deploy runbook.
- [`docs/x402-e2e-test.md`](./docs/x402-e2e-test.md) — end-to-end walkthrough (scaffold → deploy contracts → fund wallet → run a metered LLM call).

`ClaudeVault` mainnet address: `0x091365301a461bEeFd5e2Fe1BD244befCE274F5c`.

---

## Architecture

### High-level data flow

```
                              ┌────────────────────────────┐
                              │   Chat UI (Vite + React)   │
                              │   :2138                    │
                              └─────────────┬──────────────┘
                                            │ HTTP / SSE
                              ┌─────────────▼──────────────┐
                              │   @tokagentos/app-core     │
                              │   - plugin registry        │
                              │   - dev server / Vite bridge│
                              └─────────────┬──────────────┘
                                            │
                              ┌─────────────▼──────────────┐
                              │   @tokagentos/agent        │
                              │   - AgentRuntime           │
                              │   - Built-in wallet        │
                              │   - API server (Elysia)    │
                              │   :31337                   │
                              └──┬──────────────┬──────────┘
                                 │              │
            ┌────────────────────┘              └────────────────────┐
            │                                                        │
┌───────────▼────────────┐                              ┌────────────▼─────────────┐
│  LLM access            │                              │   On-chain (wallet)       │
│                        │                              │                           │
│  ── Option A ──        │                              │  ── vault mode ──         │
│  Anthropic / OpenAI /  │                              │  ClaudeVault.execute()    │
│  OpenRouter / xAI /    │                              │  (per-method allowlists)  │
│  Gemini / Groq / Ollama│                              │                           │
│  (your API key)        │                              │  ── direct mode ──        │
│                        │                              │  plugin-evm raw signing   │
│  ── Option B (x402) ── │                              │                           │
│  PTON / EIP-3009 /     │                              │  Either mode → viem →     │
│  ClaudeVault           │                              │  any EVM chain + the      │
│  (wallet pays per call)│                              │  app/plugin contracts     │
└────────────────────────┘                              └───────────────────────────┘
```

### Request lifecycle (typical chat → action flow)

1. User sends a message via chat UI → POST to API server (`:31337`).
2. `AgentRuntime` builds context (memory, providers, state) and calls the configured LLM provider — either an upstream API directly, or the x402 gateway. If x402 is in use, the agent's wallet auto-funds the call.
3. If the LLM emits a structured action (send tokens, mint an NFT, post to Shopify, deposit to Aave, …), the runtime dispatches it to the appropriate plugin.
4. If the action is on-chain, the plugin builds calldata. In **direct** mode, the operator wallet signs and broadcasts directly. In **vault** mode, the plugin submits to `ClaudeVault.execute()`, which validates against per-method allowlists before forwarding to the target contract.
5. Transaction hash, receipt, and side effects flow back through the runtime → API → UI. Memory is updated; subsequent turns can reason about the result.

### Key components

**`@tokagentos/core`** (`packages/typescript/`) — runtime interfaces, `Action` / `Provider` / `Service` base types, logger, message and memory primitives. Every other package depends on this.

**`@tokagentos/agent`** (`packages/agent/`) — the headless agent runtime. Owns `AgentRuntime`, plugin loader, default plugin map, API server (Elysia), and CLI entry (`tokagent-autonomous`). The standalone `start` script lives here. The built-in wallet is wired up here via the core plugin map.

**`@tokagentos/app-core`** (`packages/app-core/`) — dev-server + Vite bridge + plugin registry that powers white-label apps. Scaffolded projects use this as their entry point.

**`@tokagentos/shared`** (`packages/shared/`) — env-var resolution (with i18n keyword generation), port discovery, message connectors, runtime env helpers used by both `agent` and `app-core`.

**`@tokagentos/billing`** (`packages/billing/`) — the x402 LLM payment rail. Postgres-backed credit ledger (Drizzle ORM), EIP-3009 settlement against `ClaudeVault`, TON/USD composite Uniswap V3 TWAP oracle, on-chain `consumeCredits` flusher. Only loaded if you opt into x402; bring-your-own-key paths never touch this.

**`@tokagentos/ui`** (`packages/ui/`) — shared React primitives + design tokens. Built on Radix UI + Tailwind.

**`@tokagentos/schemas`** (`packages/schemas/`) — protobuf schemas with Buf-generated TypeScript / Python / Rust types. The single source of truth for cross-service types.

**`@tokagent/tokagentos`** (`packages/tokagentos/`) — the public CLI that scaffolds new projects. Published to npm.

**Tokagent plugins** (`plugins/plugin-tokagent-*/`) — the optional Tokamak feature pack. `plugin-tokagent-billing` provides the x402 routes any agent can mount; `plugin-tokagent-{shared,strategy,perps,yield,polymarket}` are the DeFi automation pack that runs Hyperliquid / Aave / Polymarket through `ClaudeVault`. None of these are required for a wallet-only agent.

### Database

- **Local dev** — defaults to PGLite (file-backed, no separate process). Set `PGLITE_DATA_DIR=memory://` for in-memory.
- **Production** — set `POSTGRES_URL=postgres://...`. Migrations are managed per package (`bun run migrate` from the repo root migrates `plugin-sql`; the billing package has its own Drizzle migrations in `packages/billing/drizzle/`).

---

## Environment variables

Full reference: [`.env.example`](./.env.example). Highlights below.

### Required for any agent run

| Variable                              | Description                                                            | Notes                                                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TOKAGENT_EXECUTION_MODE`             | `vault` / `direct` / `both`                                            | See [Runtime modes](#runtime-modes). Default `vault`.                                                                                                                          |
| LLM access — **one of**:              | -                                                                      | -                                                                                                                                                                              |
| `ANTHROPIC_API_KEY` (or other)        | Bring-your-own provider key                                            | Any of `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `XAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, or `OLLAMA_API_ENDPOINT`. Falls back to local Ollama if none set. |
| `BILLING_CHAT_KEY` + `TOKAGENT_GATEWAY_URL` | x402 gateway — pay per call from the agent's wallet              | Use this for fully decentralized inference. See [LLM access](#llm-access-x402-or-bring-your-own-key).                                                                          |

### Required for on-chain actions (any wallet activity)

The agent's built-in wallet needs a signing key and at least one RPC endpoint. Even a "pure chat" agent that occasionally checks its balance or pays for an x402 LLM call needs these.

| Variable                  | Description                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `TOKAGENT_PRIVATE_KEY`    | Operator hot wallet (hex, 0x-prefixed). Auto-mirrored to `EVM_PRIVATE_KEY` at boot. Generate with `cast wallet new` for tests.         |
| `TOKAGENT_RPC_URL`        | Ethereum mainnet RPC. Auto-mirrored to `EVM_PROVIDER_URL`, `ETHEREUM_PROVIDER_MAINNET`, etc.                                           |
| `TOKAGENT_VAULT_ADDRESS`  | Deployed `ClaudeVault` address on the target chain (vault mode only).                                                                  |
| `POLYGON_RPC_URL`         | Polygon RPC (only if you run the Aave yield plugin).                                                                                   |
| `HYPERLIQUID_API_URL`     | Hyperliquid API base URL (only if you run the perps plugin). Default: `https://api.hyperliquid.xyz`.                                   |

> Alternatively, leave `TOKAGENT_PRIVATE_KEY` empty and use the `/wallet` page wizard's "Generate" or "Import" path — the key is stored in the OS keychain instead of `.env`.

### Server

| Variable              | Description                                          | Default     |
| --------------------- | ---------------------------------------------------- | ----------- |
| `SERVER_PORT`         | API server port (operator mode)                      | `3000`      |
| `SERVER_HOST`         | API server host                                      | `0.0.0.0`   |
| `NODE_ENV`            | `development` / `production`                         | -           |
| `EXPRESS_MAX_PAYLOAD` | Max request body size                                | `2mb`       |
| `TOKAGENT_UI_PORT`    | React UI dev-server port                             | `2138`      |
| `TOKAGENT_API_PORT`   | In-process API server port (scaffolded projects)     | `31337`     |

### Messaging channels (all optional, auto-enabled when set)

| Variable                                            | Channel                  |
| --------------------------------------------------- | ------------------------ |
| `TELEGRAM_BOT_TOKEN`                                | Telegram                 |
| `DISCORD_BOT_TOKEN`                                 | Discord                  |
| `TWITTER_API_KEY`, `TWITTER_API_SECRET`             | Twitter / X              |
| `WHATSAPP_ACCESS_TOKEN`                             | WhatsApp                 |
| `SIGNAL_PHONE_NUMBER`                               | Signal                   |

### Billing (all optional; required only when `BILLING_ENABLED=true`)

| Variable                          | Description                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `BILLING_ENABLED`                 | Master flag. Default `false` (passthrough).                                                                |
| `BILLING_AUTH_REQUIRED`           | Require API-key / JWT on gated paths. Default `true`.                                                      |
| `BILLING_AUTH_SECRET`             | HMAC secret for JWT signing + API-key hashing. Generate with `openssl rand -hex 32`. Per-deployment.       |
| `BILLING_AUTH_SESSION_TTL_MS`     | Session JWT lifetime. Default `86400000` (24h).                                                            |
| `BILLING_DATABASE_URL`            | Postgres URL for the credit ledger.                                                                        |
| `BILLING_CHAIN_RPC_URL`           | L2 RPC (Polygon / Base / Titan / …).                                                                       |
| `BILLING_CHAIN_ID`                | L2 chain id.                                                                                               |
| `BILLING_VAULT_ADDRESS`           | Deployed `ClaudeVault` on L2.                                                                              |
| `BILLING_PTON_ADDRESS`            | Deployed PTON token on L2.                                                                                 |
| `BILLING_OPERATOR_PRIVATE_KEY`    | Hot key controlling vault writes. Store in a secret manager, never commit.                                 |
| `BILLING_LITELLM_BASE_URL`        | LiteLLM proxy base URL (LLM calls forwarded here).                                                         |
| `BILLING_LITELLM_API_KEY`         | LiteLLM proxy bearer token.                                                                                |
| `BILLING_MAINNET_RPC_URL`         | Ethereum mainnet RPC for TON/USD TWAP oracle.                                                              |
| `BILLING_MARGIN_BPS`              | Operator margin in basis points. Default `10` (dev) / `100` (prod).                                        |
| `BILLING_TOPUP_AMOUNT_PTON`       | Default top-up amount (atto-PTON) after a successful deposit. Default `5e18` (5 PTON).                     |
| `BILLING_RATE_LIMIT_ENABLED`      | Token-bucket rate limiter. Default `true`.                                                                 |
| `BILLING_RATE_LIMIT_QUOTE_PER_MIN`| Requests/min on nonce/quote path. Default `60`.                                                            |
| `BILLING_RATE_LIMIT_SETTLE_PER_MIN`| Requests/min on settle/commit path. Default `30`.                                                          |

### Gateway client (use a hosted billing gateway)

| Variable                | Description                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `BILLING_CHAT_KEY`      | `sk-ai-...` API key minted from the dashboard. Routes chat-tier LLM calls through the gateway.               |
| `TOKAGENT_GATEWAY_URL`  | Base URL of a hosted gateway (e.g. `https://billing-service-production-a8e7.up.railway.app`).                |

---

## Common commands

All commands run from the repo root unless noted.

| Command                       | What it does                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `bun install`                 | Install everything. Postinstall runs `scripts/patch-nested-core-dist.mjs` to fix nested core dist resolution. |
| `bun run build`               | Turbo builds every package in dependency order. ~1-3 min cold, seconds cached.                               |
| `bun run build:core`          | Force-rebuild just `@tokagentos/core` (no cache).                                                            |
| `bun run build:server`        | Force-rebuild just `@tokagentos/server` (no cache).                                                          |
| `bun run typecheck`           | Turbo runs `tsc --noEmit` per package. ~30s warm.                                                            |
| `bun run lint:check`          | Biome lint, read-only.                                                                                       |
| `bun run lint`                | Biome lint with `--write` (autofix).                                                                         |
| `bun run lint:all`            | `lint:check` + `typecheck`.                                                                                  |
| `bun run format:check`        | Biome format, read-only.                                                                                     |
| `bun run format`              | Biome format with `--write`.                                                                                 |
| `bun run dev`                 | Launches `scripts/dev.mjs` — multi-process supervisor for ad-hoc local dev.                                  |
| `bun run dev:core`            | Watch-build just `@tokagentos/core`. Use in a side shell when iterating on runtime types.                    |
| `bun run dev:agent`           | Watch-mode for the agent package.                                                                            |
| `bun run start`               | Runs the agent (`bun run --cwd agent start`).                                                                |
| `bun run start:tokagent`      | Runs `packages/app-core/src/entry.ts start` — the app-core entry point used by scaffolded projects.          |
| `bun run start:debug`         | `start` with `LOG_LEVEL=debug`.                                                                              |
| `bun run test`                | Full test suite via turbo (serial: `--concurrency 1`).                                                       |
| `bun run test:core`           | Tests for `@tokagentos/core` only.                                                                           |
| `bun run test:server`         | Tests for `@tokagentos/server` only.                                                                         |
| `bun run test:client`         | Tests for `@tokagentos/client` only.                                                                         |
| `bun run test:plugins`        | Tests for all `plugins/*` packages.                                                                          |
| `bun run migrate`             | Run pending Drizzle migrations for `plugin-sql`.                                                             |
| `bun run migrate:generate`    | Generate a new Drizzle migration from schema diff.                                                           |
| `bun run generate:types`      | Regenerate protobuf types in `packages/@schemas`.                                                            |
| `bun run check:env-sync`      | Verify `.env.example` is in sync with what plugins actually read.                                            |
| `bun run fix-deps:check`      | Verify workspace `workspace:*` deps point at packages that exist.                                            |
| `bun run fix-deps`            | Rewrite workspace deps to match the lockfile.                                                                |
| `bun run clean`               | Nuclear: wipes `dist/`, `.turbo`, `node_modules`, lockfile, then re-installs and rebuilds.                   |
| `bun run clean:cache`         | Wipes only turbo + tool caches, no reinstall.                                                                |
| `bun run release`             | Lerna publishes `latest` from current package versions.                                                      |
| `bun run release:alpha`       | Lerna publishes `alpha` dist-tag.                                                                            |
| `bun run version:patch`       | Lerna bumps patch version (no push, no tag).                                                                 |
| `bun run version:alpha`       | Lerna bumps alpha prerelease.                                                                                |

---

## Per-package commands

Every package in `packages/` supports a uniform script surface (some packages add extras):

```bash
cd packages/<name>
bun run build       # bun build.ts (each package owns its build script)
bun run typecheck   # tsc --noEmit
bun run test        # vitest run (preferred — bun test does NOT implement vi.importActual / vi.stubEnv)
bun run lint        # biome check
bun run lint:fix    # biome check --write
bun run format      # biome format
bun run clean       # rm -rf dist
```

Plugin packages (`plugins/plugin-*`) follow the same convention. The billing package adds:

```bash
cd packages/billing
bun run sync-abis      # pull latest ABIs from upstream contracts repo
bun run db:generate    # generate Drizzle migration from schema
```

---

## Testing

The test runner is **Vitest** (not `bun test` — Bun does not implement `vi.importActual` or `vi.stubEnv`, which several tests depend on).

```bash
# Whole tree (serial, ~3-5 min)
bun run test

# Single package
cd packages/typescript && bun run test

# Single file
cd packages/billing && bunx vitest run src/ledger/credit-ledger.test.ts

# Watch a single file
cd packages/billing && bunx vitest src/ledger/credit-ledger.test.ts

# All plugins
bun run test:plugins
```

The CI workflow [`typecheck-billing.yml`](./.github/workflows/typecheck-billing.yml) is a fast path for billing-only changes: it installs, builds `@tokagentos/core` + `@tokagentos/billing`, typechecks both, and runs the 290-test plugin suite — under 5 minutes end-to-end.

---

## Deployment

### Hosted billing gateway (Fly.io)

[`apps/billing-server/`](./apps/billing-server) is the gateway deployed to Fly.io. It is fronted by LiteLLM, backed by a Postgres ledger, and gates on-chain settlement against the `ClaudeVault`.

```bash
# Manual deploy (CI does this automatically on `billing-server-v*` tag push)
fly deploy --config apps/billing-server/fly.toml
```

The CI workflow [`deploy-billing-server.yml`](./.github/workflows/deploy-billing-server.yml) runs Drizzle migrations against prod Postgres, then Fly.io bluegreen deploy, then a `--full` readiness check. Full runbook in [`scripts/billing-server-DEPLOY.md`](./scripts/billing-server-DEPLOY.md).

### Operator agents (Railway / Docker / VPS)

Operator agents (chat UI + headless runtime) are deployable as a single container.

```bash
# Build the container
docker build -t tokagentos .

# Run with required env
docker run -p 3000:3000 -p 2138:2138 \
  -e TOKAGENT_EXECUTION_MODE=vault \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e TOKAGENT_PRIVATE_KEY=0x... \
  -e TOKAGENT_VAULT_ADDRESS=0x... \
  -e TOKAGENT_RPC_URL=https://eth.llamarpc.com \
  -e POSTGRES_URL=postgres://... \
  tokagentos
```

The repo also ships [`railway.toml`](./railway.toml) for Railway deployments and [`docker-compose.billing.yml`](./docker-compose.billing.yml) for a local Postgres + billing-server stack.

### TEE (Trusted Execution Environment)

The [`tee-build-deploy.yml`](./.github/workflows/tee-build-deploy.yml) workflow builds and deploys hardware-attested agent images for cases where operator-key custody must be provable. See the upstream elizaOS TEE docs for the runtime contract.

---

## CI workflows

| Workflow                                                              | Triggers                                                                                          | What it gates                                                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`typecheck-billing.yml`](./.github/workflows/typecheck-billing.yml)  | PR / push touching `packages/billing/**`, `plugins/plugin-tokagent-billing/**`, `bun.lock`        | Install → build `@tokagentos/core` + `@tokagentos/billing` → typecheck both → vitest the plugin (290 tests). Fast feedback for billing-only changes (~5 min).        |
| [`deploy-billing-server.yml`](./.github/workflows/deploy-billing-server.yml) | Tag push `billing-server-v*`                                                                | Run Drizzle migrations against prod Postgres → Fly.io bluegreen deploy → `--full` readiness check.                                                                  |
| [`ci.yaml`](./.github/workflows/ci.yaml)                              | PR / push to default branches                                                                     | Workspace-wide lint + typecheck + test on upstream-affected paths.                                                                                                  |
| [`pr.yaml`](./.github/workflows/pr.yaml)                              | PR opened / synchronized                                                                          | PR-only checks (changesets, label gates).                                                                                                                           |
| [`codeql.yml`](./.github/workflows/codeql.yml)                        | Weekly + PR                                                                                       | CodeQL security scan.                                                                                                                                               |
| [`multi-lang-tests.yaml`](./.github/workflows/multi-lang-tests.yaml)  | Per-language path matching                                                                        | Python + Rust test suites (for the protobuf-generated client libraries).                                                                                            |
| [`release.yaml`](./.github/workflows/release.yaml)                    | Manual or tag push                                                                                | Lerna publish from package versions.                                                                                                                                |
| [`tee-build-deploy.yml`](./.github/workflows/tee-build-deploy.yml)   | TEE-specific tag                                                                                  | Build + deploy TEE-attested agent images.                                                                                                                           |

See [`.github/workflows/README.md`](./.github/workflows/README.md) for the full list (Electron / iOS / Android builds, JSDoc automation, supply-chain attestation, weekly maintenance, etc.).

---

## Troubleshooting

### `bun install` fails with peer dep / native build errors

The postinstall step (`scripts/patch-nested-core-dist.mjs`) rewrites a few nested `@tokagentos/core` resolutions. If it fails partway through:

```bash
bun run clean        # nuclear option: wipes dist/, node_modules, lockfile, then reinstalls
```

If native modules (`canvas`, `sharp`, `node-llama-cpp`, `secp256k1`) fail on macOS, install system deps:

```bash
brew install cairo pango libpng jpeg giflib librsvg
```

### Workspace dep version mismatch

```bash
bun run fix-deps:check     # report drift
bun run fix-deps           # rewrite workspace:* refs to match lockfile
```

### "Cannot find module '@tokagentos/core'" after editing core

Core compiles first; re-run the build or use watch mode:

```bash
bun run build:core         # one-shot rebuild
# or
bun run dev:core           # watch mode
```

### Vault transactions reverting

Symptoms: chat says "transaction executed" but no on-chain effect, or revert with `Allowlist`.

1. Confirm `TOKAGENT_EXECUTION_MODE=vault` and `TOKAGENT_VAULT_ADDRESS` points to a deployed vault on the chain you are targeting.
2. The vault enforces per-method allowlists at the contract level. Check the vault admin has whitelisted the target contract + selector your plugin is calling. Logs will show the rejected calldata.
3. For Hyperliquid, ensure `TOKAGENT_HYPERLIQUID_HELPER_ADDRESS` is set (mainnet default: `0x8350777738059f29f639e493ea96e20d2f58171c`).

### Billing gateway: "401 Unauthorized" on `/v1/messages`

1. Confirm `BILLING_CHAT_KEY` is set and starts with `sk-ai-`.
2. Confirm `TOKAGENT_GATEWAY_URL` matches a reachable gateway.
3. The dashboard has a "Test key" button — use it to verify the key resolves to a funded wallet before routing through code.

### Tests fail with "vi.importActual is not a function" or "vi.stubEnv is not a function"

You ran them with `bun test` instead of `vitest`. Use `bun run test` (which delegates to `vitest run`) or `bunx vitest run` directly. Do not use `bun test` for this repo.

### PGLite "database is locked"

Two processes are touching the same PGLite directory. Either point each process at its own `PGLITE_DATA_DIR`, or switch to in-memory for dev:

```bash
export PGLITE_DATA_DIR=memory://
```

### Postgres migrations stuck / out of order

For the main app database:

```bash
bun run migrate              # apply pending migrations (plugin-sql)
```

For the billing ledger:

```bash
cd packages/billing
bun run db:generate          # generate from schema diff
bunx drizzle-kit migrate     # apply
```

---

## Contributing

Contributions welcome. Open an issue before sending a non-trivial PR — the upstream architectural model is intentionally constrained and reviews go faster when we agree on shape first.

Before submitting:

```bash
bun run lint:all             # lint:check + typecheck
bun run test                 # full suite
```

Conventional Commits are enforced on the default branch. See [`.github/`](./.github/) for issue and PR templates.

---

## License and attribution

MIT — see [`LICENSE`](./LICENSE).

This codebase is a fork of [elizaOS](https://github.com/elizaos/eliza) (commit `4552f7b98c`, upstream version `v2.0.0-alpha.223`). See [`NOTICE.md`](./NOTICE.md) for upstream credits and the list of files we override via `scaffold-patches/`.

### Contributors

<a href="https://github.com/tokamak-network/Tokagentos-monorepo/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=tokamak-network/Tokagentos-monorepo" alt="tokagentOS project contributors" />
</a>
