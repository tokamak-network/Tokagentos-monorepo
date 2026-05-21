# tokagentOS — monorepo

[![typecheck-billing](https://github.com/tokamak-network/Tokagentos-monorepo/actions/workflows/typecheck-billing.yml/badge.svg)](https://github.com/tokamak-network/Tokagentos-monorepo/actions/workflows/typecheck-billing.yml)

**tokagentOS** is Tokamak's autonomous on-chain agent framework. It runs DeFi strategies (Hyperliquid perps, Aave yield, Polymarket positions, custom vault flows) behind a chat UI or as a headless daemon, billed by a Web3 credit rail (PTON / EIP-3009 / ClaudeVault) instead of a SaaS subscription.

Built on a fork of [elizaOS](https://github.com/elizaos/eliza) — see [`NOTICE.md`](./NOTICE.md) for attribution.

> **Repo provenance.** This is the standalone home of what used to live at `tokagentos/` inside [`tokamak-network/Tokamak-AI-Layer`](https://github.com/tokamak-network/Tokamak-AI-Layer). Git history is preserved — `git log` here goes back to the original commits, but every path has been rewritten to drop the `tokagentos/` prefix.

---

## Quick start

> Prereqs: macOS or Linux, [Bun ≥ 1.3.14](https://bun.sh), Node ≥ 20 (for some build scripts), Git ≥ 2.40. An EVM wallet (MetaMask / Rabby) if you want to run the billing dashboard locally.

### Option A — scaffold a new agent project (recommended)

The [`@tokagent/tokagentos`](./packages/tokagentos) CLI generates a fresh, self-contained project directory wired to the right versions of every package. Use this when you just want to run an agent, not develop the framework.

```bash
# 1. Run the CLI directly (no install needed — bunx pulls the published version)
bunx @tokagent/tokagentos@latest

# 2. Follow the prompts: pick a project name, template, plugins.
#    The CLI creates ./<your-project>/ with package.json, .env.example,
#    apps/app (Vite + React UI), and the plugin set you chose.

# 3. Configure
cd <your-project>
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY (or BILLING_CHAT_KEY + TOKAGENT_GATEWAY_URL),
#          TOKAGENT_PRIVATE_KEY, TOKAGENT_VAULT_ADDRESS, RPC URLs as needed

# 4. Run
bun install
bun run dev
# UI → http://localhost:2138
```

The dev loop launches Vite for the React UI on `:2138`, an in-process API server on `:31337` (or whatever `TOKAGENT_API_PORT` is set to), and the headless tokagent runtime that owns the agent loop. Hot-reload works for both the UI and the runtime.

### Option B — clone this monorepo (framework development)

Use this when you're editing one of the packages or plugins themselves.

```bash
git clone https://github.com/tokamak-network/Tokagentos-monorepo.git
cd Tokagentos-monorepo

bun install
bun run build                # turbo builds all workspace packages

# Smoke test: typecheck the whole tree
bun run typecheck            # ~30s, runs `tsc --noEmit` per package via turbo

# Run a sample agent against your local edits
cd packages/tokagentos
bun run dev                  # builds the CLI in watch mode, then …
# In another shell:
bunx ../packages/tokagentos  # invokes your local CLI build
```

---

## What's in here

```
Tokagentos-monorepo/
├── packages/                # workspace libraries — never run standalone
│   ├── typescript/          #  @tokagentos/core    — runtime interfaces, action/route types, logger, Service base
│   ├── shared/              #  @tokagentos/shared  — env-var resolution, port discovery, helpers used by agent+app-core
│   ├── agent/               #  @tokagentos/agent   — the headless agent runtime + API server
│   ├── app-core/            #  @tokagentos/app-core— dev-server + Vite bridge + plugin registry for white-label apps
│   ├── ui/                  #  @tokagentos/ui      — shared React primitives + design tokens
│   ├── billing/             #  @tokagentos/billing — Postgres-backed credit ledger + EIP-3009 settlement + TWAP oracle
│   ├── schemas/             #  @tokagentos/schemas — protobuf-generated types (single source of truth across services)
│   └── tokagentos/          #  @tokagent/tokagentos — the public CLI that scaffolds new projects (npm-published)
│
├── plugins/                 # elizaOS plugins — opt-in features mounted into a runtime
│   ├── plugin-tokagent-shared/        # vault bindings, chain config, wallet helpers, risk constants
│   ├── plugin-tokagent-strategy/      # strategy engine + StrategyRunnerService
│   ├── plugin-tokagent-perps/         # Hyperliquid perpetuals via vault allowlist
│   ├── plugin-tokagent-yield/         # Aave v3 deposit/withdraw on Polygon via vault allowlist
│   ├── plugin-tokagent-polymarket/    # Polymarket buy/sell/redeem via vault allowlist
│   └── plugin-tokagent-billing/       # /v1/auth, /v1/keys, /v1/topup, /v1/messages routes + middleware
│
├── apps/                    # standalone deployable applications
│   ├── billing-server/      # the LiteLLM-fronting credit gateway (Fly.io)
│   └── …                    # specialized apps (steward, lifeops, tokagentmaker, etc.)
│
├── scripts/                 # dev tooling: lockfile sync, plugin submodule bootstrap, build orchestration
└── docs/                    # design notes, ADRs, runbooks
```

### The scaffold mechanism

`@tokagent/tokagentos` (the CLI in [`packages/tokagentos/`](./packages/tokagentos)) is more than a `cp -r` — it generates a project that **references the same workspace packages this monorepo defines**, with one important twist:

- `templates/` holds project skeletons (root `package.json`, `vite.config.ts`, etc.) per template (`fullstack-app`, `headless-daemon`, …).
- `scaffold-patches/` holds **per-file overrides applied on top of the chosen template** at scaffold time. This is how the scaffolded project gets things like the `BILLING_CHAT_KEY → OPENAI_API_KEY` mirror in `core-plugins.ts` without those edits living in the upstream agent package.
- `templates-manifest.json` lists which files are scaffolded from which template + which patches apply.

The scaffolded project depends on `@tokagentos/*` and `@tokagent/plugin-*` via published npm versions (or `workspace:*` when running locally), so you can edit a plugin in this monorepo and `bun link` it into a scaffolded project for testing without re-publishing.

---

## Common commands

| Command (from repo root) | What it does |
|---|---|
| `bun install` | Install everything. Postinstall runs `scripts/patch-nested-core-dist.mjs` to fix nested core dist resolution. |
| `bun run build` | Turbo builds every package in dependency order. ~1-3 min cold, seconds cached. |
| `bun run typecheck` | Turbo runs `tsc --noEmit` per package. |
| `bun run lint:check` | Biome lint (read-only). |
| `bun run lint` | Biome lint with `--write`. |
| `bun run dev` | Launches `scripts/dev.mjs` (multi-process supervisor for ad-hoc local dev). |
| `bun run dev:core` | Watch-build just `@tokagentos/core`. Use this in a side shell when iterating on runtime types. |
| `bun run clean` | Nuclear option — wipes `dist/`, `.turbo`, `node_modules`, lockfile, then re-installs and rebuilds. |
| `bun run fix-deps:check` | Verify workspace `workspace:*` deps are pointing at packages that exist. |

### Per-package commands

Most packages also support:

```bash
cd packages/<name>
bun run build      # bun build.ts (each package owns its build script)
bun run test       # vitest run (preferred — bun test does NOT implement vi.importActual / vi.stubEnv)
```

---

## Runtime modes

Selected via `TOKAGENT_EXECUTION_MODE` in `.env`:

- **`daemon`** — headless; `StrategyRunnerService` ticks, actions sign via the operator private key. No UI served.
- **`operator`** — daemon + local React UI on `TOKAGENT_UI_PORT` (default `2138`). Chat / Automations / Wallet / Settings / Billing.
- **`vault`** — operator mode with strategies routed through a deployed `ClaudeVault` contract instead of a hot wallet.

AI providers and messaging channels are env-gated — set the relevant API key (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `DISCORD_API_TOKEN`, `TELEGRAM_BOT_TOKEN`, …) to auto-enable. If no provider key is set, the runtime falls back to `@elizaos/plugin-ollama`.

---

## Web3 billing rail

Set `BILLING_CHAT_KEY=sk-ai-...` + `TOKAGENT_GATEWAY_URL=https://billing-service-production-a8e7.up.railway.app` to route LLM calls through the credit gateway instead of an upstream provider. The gateway:

- Authenticates via SIWE (EIP-712 LoginAuth → 24-hour session JWT) or HMAC API keys (`sk-ai-*`).
- Settles spend in PTON (an EIP-3009 wrapper over Tokamak TON) deposited into `ClaudeVault` (`0x091365301a461bEeFd5e2Fe1BD244befCE274F5c` on Ethereum mainnet).
- Forwards `/v1/messages` and `/v1/chat/completions` to LiteLLM with full SSE pass-through.
- Exposes a dashboard at `/v1/billing/dashboard/` for top-ups (USDC/USDT/ETH/WBTC → TON → PTON in one flow), key management (mint + auto-install into local `.env`), and 30-day usage analytics.

See [`packages/billing/`](./packages/billing) and [`plugins/plugin-tokagent-billing/`](./plugins/plugin-tokagent-billing) for the implementation, and [`apps/billing-server/`](./apps/billing-server) for the Fly.io deployment.

---

## CI

| Workflow | Triggers | What it gates |
|---|---|---|
| [`typecheck-billing.yml`](./.github/workflows/typecheck-billing.yml) | PR / push touching `packages/billing/**`, `plugins/plugin-tokagent-billing/**`, `bun.lock` | Install → build `@tokagentos/core` + `@tokagentos/billing` → typecheck both billing packages → vitest the plugin (290 tests). Fast feedback for billing-only changes. |
| [`deploy-billing-server.yml`](./.github/workflows/deploy-billing-server.yml) | Tag push `billing-server-v*` | Run Drizzle migrations against prod Postgres, then Fly.io bluegreen deploy of [`apps/billing-server/`](./apps/billing-server), then a `--full` readiness check. |

Other workflows (`ci.yaml`, `pr.yaml`, `multi-lang-tests.yaml`, `codeql.yml`, …) come from upstream elizaOS and run when matching paths change. See [`.github/workflows/README.md`](./.github/workflows/README.md) for the full list.

---

## License + attribution

MIT — see [`LICENSE`](./LICENSE). This codebase is a fork of [elizaOS](https://github.com/elizaos/eliza); see [`NOTICE.md`](./NOTICE.md) for upstream credits and the list of files we override via `scaffold-patches/`.
