# Integration Plan — `llm-api-gateway` → `tokagentos`

> Status: Draft for review
> Date: 2026-05-11
> Source repo: `/Users/mehdiberiane/Documents/tokamak/TAL/llm-api-gateway`
> Target repo: `/Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos`
> Recon artifacts: `/tmp/recon_source_llm_gateway.md`, `/tmp/recon_target_tokagentos.md`

## Executive Summary

The source repo (`llm-api-gateway`) has been cataloged as a generic LLM gateway, but it is not. It is a **Web3 credit-billing rail** sitting in front of a single LiteLLM upstream. The LLM forwarding (`POST /v1/messages` → LiteLLM) is a thin passthrough; the load-bearing architecture is a 4-component billing system: PTON token (EIP-3009 wrapper over TON) + `ClaudeVault` Solidity contract (credit hub) + a TypeScript proxy (Hono on Node) that mediates `reserve → forward → commit` against an in-memory ledger with periodic on-chain `consumeCredits` flushes + composite Uniswap V3 TWAP for USD→PTON pricing.

The target (`tokagentos`) **already is** a multi-provider LLM gateway: `packages/agent/src/api/server.ts` (5,626 lines) exposes OpenAI- and Anthropic-compatible `/v1/*` routes against a plugin-based provider abstraction (`runtime.useModel` → `Plugin.models[modelType]`) covering 13+ providers including a LiteLLM virtual-provider variant. It does **not** have any billing, on-chain settlement, or wallet-bound API-key surface. It also **does not** have the source's Anthropic-passthrough mode — its `/v1/messages` routes through the plugin layer, not directly to an upstream.

**Net integration scope**: adopt the source's billing/auth/pricing/on-chain stack as a new `@tokagentos/billing` runtime library + a `plugin-tokagent-billing` plugin contributing routes and middleware; preserve the source's smart contracts as a coordinated artifact; **discard** the source's LLM proxying, dashboard, landing, mprocs/anvil dev orchestration, and Korean docs. The source gateway is decommissioned at the end of cutover.

**Headline risks**:
1. The source's in-memory ledger model (Maps lost on restart) is structurally incompatible with tokagentos's local-first / cloud-managed runtime; persistence must move to Postgres/PGLite/Drizzle before any production cutover.
2. The source's `plan.md` has already drifted from the implementation (x402 per-request settle was abandoned for credit-mode) — design docs cannot be trusted as source of truth; only `proxy/src/*` is authoritative.
3. The source uses native `better-sqlite3` and a hand-rolled HMAC session, which conflict with tokagentos conventions (Bun runtime, Adze logger, Bearer-token auth via `TOKAGENT_API_TOKEN`). Replacements are required, not adapters.
4. The scaffold three-mirror rule (source + `scaffold-patches/` + `templates/`) means every env / `package.json` / `core-plugins.ts` change is a triple-write. Missing any mirror produces silent scaffold drift.

---

## Target Architecture

### Component placement (post-integration)

```
tokagentos/
├── packages/
│   ├── agent/                          [existing — gains billing middleware on /v1/* routes]
│   │   └── src/api/server.ts           [+ billing.gate(), + onchain audit log writes]
│   ├── billing/                        [NEW — @tokagentos/billing]
│   │   └── src/
│   │       ├── index.ts                [public API: gate(), reserve(), commit(), release()]
│   │       ├── ledger/                 [DB-backed (Drizzle + Postgres/PGLite); replaces in-mem Map]
│   │       │   ├── schema.ts           [drizzle schema: credit_state, reservations, accruals]
│   │       │   └── ledger.ts           [reserve/commit/release/hydrate]
│   │       ├── pricing/                [from proxy/src/pricing.ts]
│   │       │   ├── rates.ts
│   │       │   ├── tokenize.ts         [estimateInputTokens — keep heuristic, mark TODO]
│   │       │   └── usage.ts            [normalizeUsage, fallbackUsageFromEstimate, computeActualCostUsd]
│   │       ├── billing/                [from proxy/src/billing.ts + streamCommit.ts]
│   │       │   ├── charge.ts
│   │       │   └── commit.ts           [commit-once latch for SSE]
│   │       ├── twap/                   [from proxy/src/twap.ts]
│   │       │   ├── oracle.ts           [composite Uniswap V3 TWAP]
│   │       │   └── cache.ts
│   │       ├── chain/                  [from proxy/src/onchain.ts + abi.ts]
│   │       │   ├── clients.ts          [viem PublicClient/WalletClient factories]
│   │       │   ├── vault.ts            [readCredits, depositX402, consumeCredits]
│   │       │   ├── pton.ts             [verifyEip3009Signature, ABI]
│   │       │   └── abi/                [PTON.json, ClaudeVault.json — generated from contracts/out]
│   │       ├── workers/                [from proxy/src/consumeWorker.ts + withdrawWatcher.ts]
│   │       │   ├── consume-worker.ts
│   │       │   └── withdraw-watcher.ts
│   │       ├── auth/                   [from proxy/src/auth.ts + apiKeys.ts]
│   │       │   ├── siwe.ts             [EIP-712 LoginAuth — keep verify, replace HMAC sessions w/ existing TOKAGENT_API_TOKEN model OR mint a new bearer scope]
│   │       │   └── api-keys.ts         [sk-ai-* keys — DB-backed, not in-mem]
│   │       └── config.ts               [zod env schema, scoped to BILLING_*]
│   ├── shared/                         [+ runtime-env additions for BILLING_* envs]
│   ├── typescript/                     [no change]
│   └── tokagentos/                     [+ scaffold-patches mirror for billing wiring]
├── plugins/
│   └── plugin-tokagent-billing/        [NEW — @tokagent/plugin-tokagent-billing]
│       └── src/
│           ├── index.ts                [Plugin: routes + services + init/dispose]
│           ├── routes/                 [from proxy/src/server.ts route registry]
│           │   ├── auth-routes.ts      [/v1/auth/nonce, /v1/auth/login]
│           │   ├── keys-routes.ts      [/v1/keys CRUD]
│           │   ├── credits-routes.ts   [/v1/credits/me]
│           │   ├── topup-routes.ts     [/v1/topup/* — quote, settle, preauth, status, revoke]
│           │   ├── usage-routes.ts     [/v1/usage/*]
│           │   └── estimate-routes.ts  [/v1/estimate, /v1/messages/count_tokens]
│           ├── middleware/
│           │   ├── billing-gate.ts     [reserve before useModel, attach commit closure to response]
│           │   ├── api-key-resolve.ts  [x-api-key → wallet identity]
│           │   └── rate-limit.ts       [carry over token-bucket; share scope w/ existing rate-limiter.ts]
│           └── services/               [Plugin.services entries — boot/shutdown lifecycle]
│               ├── consume-service.ts  [wraps consume-worker]
│               └── withdraw-service.ts [wraps withdraw-watcher]
├── apps/
│   └── app-core/                       [+ usage-history view, + topup wizard, + API key UI]
│       └── src/views/billing/          [NEW — ports the 2 useful dashboard screens]
└── (contracts are NOT moved — see decision below)
```

### Smart contracts — out of scope for this monorepo

Tokamak-AI-Layer's parent repo and `tokagent` already produce contracts via separate Foundry workspaces (TokagentVault, factories on multiple chains). The source's `contracts/PTON.sol` and `contracts/ClaudeVault.sol` should **not** move into `tokagentos/`. Two paths:

- **A (preferred)**: keep contracts in `llm-api-gateway/contracts/` after archiving the source repo, OR move them to the parent Tokamak-AI-Layer contracts tree. They are static deployment artifacts. The integration only needs the deployed addresses + ABIs.
- **B (fallback)**: create a new root `contracts/` workspace in tokagentos parent repo (sibling, not under `tokagentos/`) that imports the contracts; this only makes sense if the team wants a unified contracts deployment story.

Either way, `packages/billing/src/chain/abi/*.json` is generated from `forge build` artifacts and committed (the existing `plugin-tokagent-shared` pattern at `plugins/plugin-tokagent-shared/src/contracts/abis/` is the precedent).

### Request flow (post-integration)

```
client
  │
  │  POST /v1/chat/completions  (or /v1/messages)
  │  Authorization: Bearer <siwe-session>   OR  x-api-key: sk-ai-...
  ▼
packages/agent/src/api/server.ts  (handleRequest)
  │
  │  CORS / DNS rebinding gate (existing)
  ├─ billing.gate(req)  ◄── NEW: middleware from plugin-tokagent-billing
  │     ├─ resolveCallerIdentity → wallet
  │     ├─ rate-limit check
  │     ├─ pricing.estimateMaxCostUsd(model, prompt) → maxUsd
  │     ├─ twap.usdToPton(maxUsd) → maxPton
  │     ├─ ledger.reserve(wallet, maxPton)
  │     │     ├─ if insufficient + auto-topup batch present → pop pre-signed EIP-3009 → vault.depositX402
  │     │     └─ if insufficient + no batch → 402 with quote
  │     └─ attach commit-closure to req.locals
  │
  ▼
chat-routes.ts → runtime.useModel(TEXT_LARGE, params)  (existing, unchanged)
  │
  ▼
plugin-openai / plugin-anthropic / plugin-litellm-virtual  (unchanged)
  │
  ▼
upstream provider
  │
  ▼  (response stream OR full body)
streamCommit / unaryCommit (NEW middleware on the way out)
  │
  ├─ extract usage (via existing pricing.normalizeUsage)
  ├─ pricing.computeActualCostUsd → actualUsd
  ├─ twap.usdToPton(actualUsd) → actualPton, fee, total
  ├─ ledger.commit(wallet, reservation, totalPton)
  │     └─ accrued += totalPton  (worker batches → vault.consumeCredits)
  └─ usageStore.record(...)  (DB, not SQLite)

(periodic, out of band)
consume-worker:        every 30s → if accrued ≥ MIN or age ≥ MAX → vault.consumeCredits(batchId)
withdraw-watcher:      vault.WithdrawRequested → priority flush
twap-oracle:           every PRICE_REFRESH_INTERVAL_MS → refresh cache
```

### Module-boundary rationale

- **`@tokagentos/billing` is a library, not a plugin.** It exposes pure functions (`gate`, `reserve`, `commit`, `release`, `priceUsdToPton`, `verifyEip3009`) that any consumer can call. It does no I/O at import time and has no global state beyond its DB connection (passed in).
- **`plugin-tokagent-billing` is a thin plugin** that only does three things: (1) registers HTTP routes via `Plugin.routes`, (2) registers services for the worker lifecycle via `Plugin.services`, (3) wires middleware into `packages/agent`'s server via a contributed entry point.
- **Why split?** The library is unit-testable without the runtime. The plugin is the integration seam. This matches the project pattern (`plugin-tokagent-shared` is library-flavored, the rest are plugins).
- **Embedding the source in `packages/agent` directly is rejected.** That file is already 5,626 lines; adding the billing surface inline pushes it past any reasonable change-isolation boundary, makes the billing layer non-portable, and conflicts with the project's stated architectural direction (the unused Elysia dep at `package.json:172` signals a future server rewrite — billing should survive that).

### Auth model alignment

The source ships **two parallel auth flows**: SIWE-EIP712 + HMAC sessions, and `sk-ai-*` API keys. The target has a single bearer token (`TOKAGENT_API_TOKEN`) + OAuth subscription credentials.

**Decision**: keep both source flows, layered as **billing-scoped auth**, distinct from the existing `TOKAGENT_API_TOKEN` (which gates all protected `/api/*` routes). A request to `/v1/chat/completions` must pass *both*: (1) the existing tokagentos auth gate (bearer or unauthenticated public routes per `server.ts:2693-2707`), and (2) a billing identity (SIWE session or `sk-ai-*` key resolved to a wallet). For self-hosted / unbilled deployments, billing is **opt-in** via env (`BILLING_ENABLED=false` → middleware no-op). This preserves the local-first UX (`README.md:14-22`) while enabling SaaS billing.

Replace the source's hand-rolled `base64url(payload).hex(hmac)` session token (`proxy/src/auth.ts:92-96`) with a JWT signed via the same `AUTH_SECRET` derivation but using a real JWT library (`jose` is already a transitive dep candidate via `viem` ecosystem; verify, otherwise add). Standard tooling debt repaid for ~30 lines of code.

---

## Functional Migration

Per-feature checklist. "Source location → target location" cites the file:line in `llm-api-gateway/proxy/src/...` for source and the destination path in tokagentos. **Refactors required** lists the substantive deltas, not pure file moves.

### A. Pricing & token estimation
| # | Feature | Source | Target | Refactor | Compat |
|---|---------|--------|--------|----------|--------|
| A1 | Model rate table | `pricing.ts:27-54` | `packages/billing/src/pricing/rates.ts` | Convert to TypeScript `Record<ModelId, RateEntry>` keyed by canonical model ids; align with elizaOS `ModelType` enum (`packages/typescript/src/types/model.ts`) | Lossless |
| A2 | Allowlist | `pricing.ts:65-77` | `packages/billing/src/pricing/rates.ts` | Make per-deployment overridable via config | Lossless |
| A3 | `estimateInputTokens` | `pricing.ts:267-330, 354` | `packages/billing/src/pricing/tokenize.ts` | Carry over heuristic verbatim; mark `TODO(billing-tokenize)` to swap for `tiktoken` later | Lossless |
| A4 | `WeakMap` tool-token cache | `pricing.ts:378-398` | `packages/billing/src/pricing/tokenize.ts` | Unchanged | Lossless |
| A5 | `normalizeUsage` (Anthropic + OpenAI shapes) | `pricing.ts:190-197` | `packages/billing/src/pricing/usage.ts` | Add a code path for `runtime.useModel` result envelope (which differs from raw provider responses) | Adds branch |
| A6 | `computeActualCostUsd` cache-aware | `pricing.ts:216-240` | `packages/billing/src/pricing/usage.ts` | Unchanged | Lossless |
| A7 | `fallbackUsageFromEstimate` | `pricing.ts:252-257` | `packages/billing/src/pricing/usage.ts` | Unchanged | Lossless |
| A8 | Margin / promotion config | `config.ts:140-191` | `packages/billing/src/config.ts` | Same zod schema; rename envs `MARGIN_BPS` → `BILLING_MARGIN_BPS` (namespace) | Env rename |

### B. Billing engine
| # | Feature | Source | Target | Refactor | Compat |
|---|---------|--------|--------|----------|--------|
| B1 | `usdToPton` (atto-precision, ceil-div) | `billing.ts:11-24` | `packages/billing/src/billing/charge.ts` | Unchanged | Lossless |
| B2 | `computeCharge` | `billing.ts:42-51` | `packages/billing/src/billing/charge.ts` | Unchanged | Lossless |
| B3 | Commit-once latch | `streamCommit.ts:71-109` | `packages/billing/src/billing/commit.ts` | Adapt to SSE proxying via `runtime.useModel` (which already abstracts streaming); plug into the existing `chat-routes.ts:1574-1819` SSE pump | Substantive — see Risk R3 |
| B4 | Detect `cache_control` `ttl: "1h"` | `server.ts:291-319` | `packages/billing/src/billing/charge.ts` (new `detectCacheControl()`) | Unchanged | Lossless |

### C. Credit ledger
| # | Feature | Source | Target | Refactor | Compat |
|---|---------|--------|--------|----------|--------|
| C1 | In-memory `CreditLedger` | `credits.ts:43-208` | `packages/billing/src/ledger/ledger.ts` (Drizzle-backed) | **Replace** Map with Postgres/PGLite via `@elizaos/plugin-sql`; same `(balance, reserved, accrued)` triple as columns; serialize `BigInt` as `numeric(78, 0)` | Substantive — Risk R1 mitigation |
| C2 | Lazy on-chain hydration | `server.ts:337-359` + `credits.ts` | `packages/billing/src/ledger/ledger.ts:hydrate()` | Hydration cache moves to a `wallet_hydration` table (or in-process LRU keyed by tenant) | Substantive |
| C3 | Outside-withdraw clamp policy | `credits.ts:62-83` | Same module | Preserve operator-absorbs-diff semantics; document accepted loss surface | Lossless |
| C4 | Reserve / release / commit primitives | `credits.ts` | Same module | Wrap each in a Postgres `SERIALIZABLE` tx (or PGLite advisory lock fallback) | Substantive |

### D. Top-up flow
| # | Feature | Source | Target | Refactor | Compat |
|---|---------|--------|--------|----------|--------|
| D1 | `POST /v1/topup/quote` | `server.ts:935` | `plugins/plugin-tokagent-billing/src/routes/topup-routes.ts` | Quote store → DB table `topup_quotes`; 60s TTL via cron sweep | Substantive |
| D2 | `POST /v1/topup/settle` | `server.ts:987` + `handleTopup.ts` | Same routes file | Unchanged business logic; `verifyEip3009Signature` moves to `chain/pton.ts` | Lossless |
| D3 | `POST /v1/topup/preauth` (batch) | `server.ts:824` + `topupBatch.ts` | Routes + `ledger/preauth.ts` | DB-back the batch (`topup_preauth_slots` table) | Substantive |
| D4 | `POST /v1/topup/revoke` | `server.ts:911` | Same | Unchanged | Lossless |
| D5 | `GET /v1/topup/status` | `server.ts:900` | Same | Unchanged | Lossless |
| D6 | `GET /v1/topup/info` (EIP-712 domain) | `server.ts:920` | Same | Unchanged | Lossless |

### E. On-chain
| # | Feature | Source | Target | Refactor | Compat |
|---|---------|--------|--------|----------|--------|
| E1 | viem `PublicClient` / `WalletClient` factories | `onchain.ts:59-67` | `packages/billing/src/chain/clients.ts` | **Drop** the ES `Proxy` lazy-init (legacy); use direct factory functions; reuse `plugin-tokagent-shared/src/wallet.ts:getPublicClient/getWalletClient` if compatible | Substantive |
| E2 | `depositX402` write | `onchain.ts:122` | `chain/vault.ts` | Same | Lossless |
| E3 | `consumeCredits` write | `onchain.ts:162` | `chain/vault.ts` | Same | Lossless |
| E4 | `readCreditsOnChain` | `onchain.ts:183` | `chain/vault.ts` | Same | Lossless |
| E5 | `verifyEip3009Signature` (off-chain) | `onchain.ts:90` | `chain/pton.ts` | Same | Lossless |
| E6 | TWAP oracle (composite WTON/WETH × WETH/USDC) | `twap.ts:1-167` | `packages/billing/src/twap/oracle.ts` | Drop the `mainnetClient` Proxy export; pass client explicitly | Substantive |
| E7 | TWAP cache + stale fallback | `twap.ts:77-134` | `packages/billing/src/twap/cache.ts` | In-process; can stay a `Map` (single value) | Lossless |

### F. Workers
| # | Feature | Source | Target | Refactor | Compat |
|---|---------|--------|--------|----------|--------|
| F1 | Consume worker (size + age triggers, dead-letter) | `consumeWorker.ts:1-150` | `packages/billing/src/workers/consume-worker.ts` + `services/consume-service.ts` (Plugin.services) | Drive lifecycle via `Plugin.init` / `Plugin.dispose`; persist dead-letter to DB (table `consume_deadletter`) | Substantive |
| F2 | Deterministic `batchId` | `consumeWorker.ts:36-40` | Same | Unchanged | Lossless |
| F3 | Withdraw event watcher | `withdrawWatcher.ts:1-100` | `packages/billing/src/workers/withdraw-watcher.ts` + `services/withdraw-service.ts` | Use `viem.watchContractEvent` (same primitive); subscribe to vault address from config | Lossless |
| F4 | TWAP refresh tick | `server.ts:1106` | `services/twap-service.ts` | Move out of `main()`; expose as a `Plugin.services` entry | Substantive |
| F5 | Usage cleanup sweep (`USAGE_RETENTION_DAYS`) | `usageRecorder.ts:129` | `services/usage-cleanup-service.ts` | Run as scheduled service; unchanged retention semantics | Lossless |

### G. Auth
| # | Feature | Source | Target | Refactor | Compat |
|---|---------|--------|--------|----------|--------|
| G1 | `POST /v1/auth/nonce` (EIP-712 envelope) | `server.ts:558` + `auth.ts` | `plugin-tokagent-billing/src/routes/auth-routes.ts` | Nonce store → DB (`auth_nonces` table) with TTL sweep | Substantive |
| G2 | `POST /v1/auth/login` (EIP-712 verify) | `server.ts:587` + `auth.ts:163-180` | Same | Unchanged verify; **replace** HMAC session w/ JWT (jose) | Substantive |
| G3 | `sk-ai-*` API key mint | `server.ts:615` + `apiKeys.ts:49-69` | `routes/keys-routes.ts` + `auth/api-keys.ts` | DB-backed (`api_keys` table); HMAC at rest unchanged | Substantive |
| G4 | `x-api-key` resolution | `apiKeys.ts:77-87` | `middleware/api-key-resolve.ts` | DB lookup w/ in-process LRU; `runtime.lastUsedAt` update is async (cron, not per-request) | Substantive |
| G5 | `resolveCallerIdentity` (key > bearer precedence) | `auth.ts:242-254` | `middleware/api-key-resolve.ts` | Unchanged precedence | Lossless |
| G6 | Dev escape `DevWallet` header | `auth.ts:201-215` | Same | Keep, gated by `BILLING_AUTH_REQUIRED=false` AND `NODE_ENV=development` (defense-in-depth tighter than source) | Tightened |

### H. Routes — final inventory in tokagentos
| Method | Path | Source | Plugin route file |
|--------|------|--------|-------------------|
| GET | `/v1/auth/nonce` | `server.ts:558` | `auth-routes.ts` |
| POST | `/v1/auth/login` | `server.ts:587` | `auth-routes.ts` |
| POST | `/v1/keys` | `server.ts:615` | `keys-routes.ts` |
| GET | `/v1/keys` | `server.ts:639` | `keys-routes.ts` |
| DELETE | `/v1/keys/:id` | `server.ts:656` | `keys-routes.ts` |
| GET | `/v1/credits/me` | `server.ts:707` | `credits-routes.ts` |
| GET | `/v1/usage/summary` | `server.ts:747` | `usage-routes.ts` |
| GET | `/v1/usage/calls` | `server.ts:763` | `usage-routes.ts` |
| GET | `/v1/usage/keys` | `server.ts:787` | `usage-routes.ts` |
| GET | `/v1/topup/info` | `server.ts:920` | `topup-routes.ts` |
| POST | `/v1/topup/quote` | `server.ts:935` | `topup-routes.ts` |
| POST | `/v1/topup/settle` | `server.ts:987` | `topup-routes.ts` |
| POST | `/v1/topup/preauth` | `server.ts:824` | `topup-routes.ts` |
| GET | `/v1/topup/status` | `server.ts:900` | `topup-routes.ts` |
| POST | `/v1/topup/revoke` | `server.ts:911` | `topup-routes.ts` |
| POST | `/v1/estimate` | `server.ts:1011` | `estimate-routes.ts` |
| POST | `/v1/messages/count_tokens` | `server.ts:677` | `estimate-routes.ts` |
| GET | `/v1/price` | `server.ts:508` | `estimate-routes.ts` (debug) |
| GET | `/v1/quote/:id` | `server.ts:518` | `topup-routes.ts` (debug) |
| GET | `/v1/stats` | `server.ts:525` | `usage-routes.ts` |
| GET | `/v1/messages` | `server.ts:1067` + `handleMessages.ts:220` | **NOT MIGRATED** — target's existing `/v1/messages` (`chat-routes.ts:1821+`) is preserved; billing gate added as middleware |
| POST | `/v1/messages` | same | Same — billing middleware only |
| GET | `/v1/models` | `server.ts:668` | **NOT MIGRATED** — target's `chat-routes.ts:1530-1548` already serves this; allowlist union is config-driven |

### I. Discarded (rejected with reason)
| Feature | Source | Reject reason |
|---------|--------|---------------|
| `callLiteLLM` / `callLiteLLMStream` legacy unused fns | `llm.ts:32, 78` | Unused in source; redundant with target's plugin layer |
| `callAnthropic` / `callAnthropicStream` direct LiteLLM forward | `llm.ts:177, 234` | Target's `runtime.useModel(TEXT_LARGE, ...)` + `@elizaos/plugin-anthropic` (or LiteLLM virtual) supersedes |
| `prepareAnthropicBody` (system message lift, max_tokens default) | `server.ts:256-286` | Target plugins handle Anthropic system message shape natively |
| Hand-rolled HMAC session format | `auth.ts:92-96` | Replaced with JWT (jose) — standard tooling, ~30 LOC saved |
| Custom Prometheus registry (zero-dep) | `metrics.ts:1-184` | Target uses `IntegrationObservabilityEvent` + `audit-log.ts`; OpenTelemetry plugin (`@elizaos/plugin-diagnostics-otel`) is the future direction. Re-export the same metric names as OTel meters |
| `dashboard/` SPA + zero-dep static server | `dashboard/server.mjs:1` | Target has `packages/app-core` (Vite + React + RainbowKit equivalents); port the 2 useful screens (usage history, top-up wizard, key management) as new app-core views |
| `landing/` static site | `landing/server.mjs:1` | Out of scope — marketing site stays in source repo until decommission |
| `mprocs.yaml` + anvil shell scripts | root `mprocs.yaml`, `scripts/*.sh` | Replaced by `turbo dev` + a documented Anvil quickstart in `packages/billing/README.md` |
| Korean architectural docs | `docs/*.md` | Translate the 2 most useful (`architecture.md`, `proxy.md`) to English in `packages/billing/docs/`; archive the rest |
| Top-level Foundry build pipeline | `contracts/` | Lives outside this monorepo (see "Smart contracts — out of scope") |
| `better-sqlite3` audit DB | `proxy/package.json:17` + `usageStore.ts` | Replaced by Postgres/PGLite via `@elizaos/plugin-sql` |

---

## Design Migration

### Data model

New Drizzle schemas in `packages/billing/src/ledger/schema.ts`. All tables namespaced `billing_*` to avoid collision with existing tokagentos tables (`@elizaos/plugin-sql` owns the migration runner per `package.json:51-52`):

```ts
billing_credit_state {
  wallet:       text PK (lowercased, 0x-prefixed)
  balance:      numeric(78,0)  // atto-PTON
  reserved:     numeric(78,0)
  accrued:      numeric(78,0)
  first_accrual_at: timestamptz nullable
  last_hydrated_at: timestamptz nullable
  updated_at:   timestamptz
}
billing_reservations {
  id:           uuid PK
  wallet:       text FK → billing_credit_state.wallet
  amount_pton:  numeric(78,0)
  request_id:   text  // tracing id
  created_at:   timestamptz
  released_at:  timestamptz nullable  // commit OR release
  outcome:      enum('committed','released_complete','released_abort','released_error') nullable
}
billing_consume_batches {
  batch_id:     bytea PK  // keccak256(wallet || firstAccrualAt || amount)
  wallet:       text
  amount_pton:  numeric(78,0)
  state:        enum('pending','submitted','confirmed','dead_letter')
  attempts:     int default 0
  tx_hash:      bytea nullable
  first_attempt_at: timestamptz
  last_attempt_at:  timestamptz nullable
}
billing_topup_quotes {
  id:           text PK  // topupId
  wallet:       text
  amount_pton:  numeric(78,0)
  amount_usd:   numeric(20,8)
  ton_usd:      numeric(20,8)
  expires_at:   timestamptz
  consumed_at:  timestamptz nullable
}
billing_topup_preauth_slots {
  wallet:       text
  nonce:        bytea  // EIP-3009 nonce
  amount_pton:  numeric(78,0)
  valid_after:  timestamptz
  valid_before: timestamptz
  v: smallint, r: bytea, s: bytea
  state:        enum('available','consumed','poisoned','expired')
  PK (wallet, nonce)
}
billing_api_keys {
  id:           text PK
  wallet:       text
  name:         text
  hash:         bytea  // HMAC-SHA256(key, AUTH_SECRET)
  created_at:   timestamptz
  last_used_at: timestamptz nullable
  revoked_at:   timestamptz nullable
}
billing_auth_nonces {
  nonce:        text PK
  envelope:     jsonb  // EIP-712 typed-data
  issued_at:    timestamptz
  expires_at:   timestamptz
}
billing_call_log {  // replaces SQLite call_log
  id:           uuid PK
  wallet:       text
  api_key_id:   text nullable
  ts:           timestamptz
  model:        text
  input_tokens: int, output_tokens: int, cache_input_tokens: int, cache_creation_tokens: int
  cost_usd:     numeric(20,8)
  cost_pton:    numeric(78,0)
  request_id:   text  // tracing
  status:       enum('ok','error','aborted')
  INDEX (wallet, ts DESC)
  INDEX (ts DESC)
  INDEX (wallet, api_key_id, ts DESC)
}
```

### Config consolidation

Source has two `.env` levels (deploy + proxy runtime). Target has one root `.env.example` with mirrors in `packages/templates/fullstack-app/.env.example` and `packages/tokagentos/templates/fullstack-app/.env.example` (per `PLUGINS.md` §10.1 three-mirror rule). All billing envs land under `BILLING_*` namespace and are mirrored to all three locations:

```
# --- Web3 billing (optional; off by default) ---
BILLING_ENABLED=false
BILLING_AUTH_REQUIRED=true
BILLING_AUTH_SECRET=
BILLING_VAULT_ADDRESS=
BILLING_PTON_ADDRESS=
BILLING_OPERATOR_PRIVATE_KEY=          # consider OS keychain via @elizaos/plugin-sql storage
BILLING_CHAIN_RPC_URL=
BILLING_CHAIN_ID=1
BILLING_MAINNET_RPC_URL=               # for TWAP reads
BILLING_LITELLM_BASE_URL=              # only if upstream is LiteLLM and needs to be checked separately from LITELLM_BASE_URL
BILLING_TWAP_WINDOW_SECONDS=1800
BILLING_PRICE_CACHE_MS=60000
BILLING_MAX_PRICE_STALENESS_MS=600000
BILLING_FIXED_TON_USD=                 # test override
BILLING_MARGIN_BPS=100
BILLING_MARGIN_FLOOR_BPS=
BILLING_PROMOTION_DISCOUNT_BPS=0
BILLING_TOPUP_AMOUNT_PTON=
BILLING_CONSUME_BATCH_MIN_PTON=
BILLING_CONSUME_MAX_AGE_MS=300000
BILLING_CONSUME_SCAN_INTERVAL_MS=30000
BILLING_CONSUME_MAX_PER_CYCLE=10
BILLING_RATE_LIMIT_ENABLED=true
BILLING_RATE_LIMIT_QUOTE_PER_MIN=60
BILLING_RATE_LIMIT_SETTLE_PER_MIN=30
BILLING_USAGE_RETENTION_DAYS=90
```

`packages/billing/src/config.ts` exports a zod schema (port from `proxy/src/config.ts:26-131`); root `packages/shared/src/runtime-env.ts` adds `getBillingConfig()` so other packages don't have to import `@tokagentos/billing` for env reads.

### Middleware unification

Target has CORS + DNS-rebinding + bearer-token gate as inline checks in `handleRequest` (`server.ts:2667-2729`). Billing adds three more middleware that must run **before** route dispatch but **after** CORS/auth:
1. `apiKeyResolve` — populates `req.locals.wallet` from `x-api-key` or SIWE bearer
2. `rateLimit` — uses billing's rate-limiter; key is `wallet`
3. `billingGate` — only on `/v1/messages*`, `/v1/chat/completions`, `/v1/topup/settle`; performs reserve

Implement as one composed function `applyBillingMiddleware(req, res, runtime)` exported from the plugin and called from `server.ts` at a single seam (e.g. just before `if (pathname.startsWith('/v1/'))` dispatch). The seam is annotated `// BILLING_HOOK` so future Elysia rewrites can preserve it.

### Observability alignment

Replace the Prometheus registry with **two** target-native sinks:
1. **Existing**: emit `IntegrationObservabilityEvent` (`packages/agent/src/diagnostics/integration-observability.ts`, schema `integration_boundary_v1`) at every reserve/commit/release/deposit/consume — boundary type `wallet`. This is the canonical observability surface.
2. **OTel**: when `@elizaos/plugin-diagnostics-otel` is enabled (FEATURE_PLUGINS), expose meters with the **same names** as the source's Prometheus series (`ai_proxy_calls_total` → `tokagent_billing_calls_total`, etc.). One-to-one rename to canonical project naming.

Audit log writes via `packages/agent/src/security/audit-log.ts` for: SIWE login, API key mint/revoke, deposit settle, withdraw event observation. `AUDIT_EVENT_TYPES` and `AUDIT_SEVERITIES` may need extension — coordinate with audit-log owner.

### Error handling conventions

Source uses `pino` + ad-hoc `Response` envelopes. Target uses Adze logger (`@tokagentos/core` `logger`) and the `error(res, msg, status)` / `json(res, body, status)` helpers (`http-helpers.ts`). All migrated routes adopt the latter. Synthetic Anthropic error envelopes (`handleMessages.ts:486-498`) are dropped — target's `/v1/messages` already produces compatible errors via the plugin layer. Billing-specific errors (insufficient balance, expired quote, etc.) use HTTP 402 with `{type: "billing_error", code, message}` body, documented in `packages/billing/docs/errors.md`.

### Logger conventions

`packages/billing` uses `import { logger } from '@tokagentos/core'`. Namespace: `logger.withMeta({src: 'billing'})`. Pino is removed from deps.

---

## Phased Rollout

Each phase is independently shippable: the agent runtime continues to function with `BILLING_ENABLED=false` until Phase 7. Phases 1–7 land behind a feature flag; Phase 8 is cutover.

### Phase 0 — Preparation (no code changes; ~2 days)

**Scope**: legibility prerequisites and decision unblockers.

- Translate `llm-api-gateway/docs/architecture.md` and `proxy.md` to English; commit to `packages/billing/docs/_archive/` for reference.
- Read `proxy/src/handleMessages.ts` end-to-end (~600 lines) and produce a 1-page reserve-flow diagram. This is the only file in source not fully decomposed in recon §4.
- Decide contracts location (Path A vs B, see "Smart contracts — out of scope"). **Recommendation**: Path A. Resolve before Phase 1.
- Capture mainnet/Sepolia/Polygon vault and PTON addresses; add to `packages/billing/src/chain/addresses.ts` (mirror the `plugin-tokagent-shared/src/chain-config.ts` shape).
- Open questions list (see §Open Questions) — get answers from product/contracts owner.

**Validation gate**: doc PR merged; addresses file populated.
**Rollback**: trivial — no code.

### Phase 1 — Scaffolding `@tokagentos/billing` + `plugin-tokagent-billing` workspaces (~3 days)

**Scope**: empty workspaces with build + lint + test wired; no business logic yet.

- Add `packages/billing/` with `package.json` (workspace name `@tokagentos/billing`, type module, main `src/index.ts`, scripts `build/lint/typecheck/test`), `tsconfig.json` extending `tsconfig.base.json`, `tsconfig.build.json`, `build.ts` (Bun.build, ESM, externals: `viem`, `@elizaos/core`, `@tokagentos/core`, `drizzle-orm`).
- Add `plugins/plugin-tokagent-billing/` with the same conventions as `plugin-tokagent-yield` (use it as a template; it's the closest in shape).
- `turbo.json`: add per-package overrides if needed (otherwise default `^build` graph picks them up).
- `tsconfig.json` root: add references.
- `bunfig.toml` / `lerna.json`: no changes (workspace globs already match).
- Empty stubs: `src/index.ts` re-exports nothing; `src/__tests__/smoke.test.ts` validates `bun run build` + `bun run typecheck` succeed.
- **Three-mirror rule**: nothing yet (no env, no plugin entries).

**Validation gate**: `bun run build` (root) succeeds with new workspaces present; CI green.
**Rollback**: revert workspace dirs.

### Phase 2 — Pricing, billing, TWAP (pure functions; ~5 days)

**Scope**: port the pure (no-I/O) layers — pricing tables, token estimator, USD↔PTON math, TWAP oracle (with injectable client). All testable in isolation.

- Port `proxy/src/pricing.ts` → `packages/billing/src/pricing/{rates,tokenize,usage}.ts`
- Port `proxy/src/billing.ts` → `packages/billing/src/billing/charge.ts`
- Port `proxy/src/twap.ts` → `packages/billing/src/twap/{oracle,cache}.ts`. Drop the `mainnetClient` Proxy lazy-init; require an explicit `viem.PublicClient` argument.
- Port `proxy/src/abi.ts` → `packages/billing/src/chain/abi/{pton,vault}.ts` (TypeScript constants, not JSON; matches `plugin-tokagent-shared/src/contracts/abis/` style).
- Add zod-based `packages/billing/src/config.ts` (port `proxy/src/config.ts:26-191` minus chain-write env).
- Tests: `pricing/usage.test.ts` (cache-token shape detection, OpenAI-vs-Anthropic), `billing/charge.test.ts` (atto-precision rounding, margin floor), `twap/oracle.test.ts` (composite math, stale-cache fallback) — port from `proxy/__tests__/` if present, otherwise write fresh.

**Validation gate**: 100% of source's pricing test suite passes against new module (port the tests verbatim where possible). Vitest run green.
**Rollback**: delete `pricing/`, `billing/`, `twap/` subtrees. No external consumers yet.

### Phase 3 — Chain layer (~4 days)

**Scope**: viem clients, vault read/write, EIP-3009 verify. Sandboxable against an Anvil mainnet fork.

- Port `proxy/src/onchain.ts` → `packages/billing/src/chain/{clients,vault,pton}.ts`. Clients accept config explicitly; no Proxy exports.
- Reuse `plugin-tokagent-shared/src/wallet.ts:getPublicClient/getWalletClient` if their signature is compatible (they handle multi-chain config); otherwise duplicate intentionally — the billing layer's chain set (Ethereum mainnet for TWAP + L2 for vault) is narrower than tokagent's general purpose.
- `chain/abi/` populated with PTON + ClaudeVault ABIs from `forge build` artifacts. Add a `scripts/sync-abis.sh` that copies from `llm-api-gateway/contracts/out/` (one-shot until contracts move).
- Tests: integration tests against an Anvil node spun up in `beforeAll` (tokagent uses Anvil in CI per `.github/workflows/`; reuse the harness if one exists, otherwise add `dockerized-anvil` to `bunfig.toml` test setup).

**Validation gate**: `vault.depositX402` + `vault.consumeCredits` round-trip on Anvil; `verifyEip3009Signature` matches PTON contract's recovery address.
**Rollback**: delete `chain/` subtree.

### Phase 4 — Persistence (Drizzle schemas + ledger; ~5 days)

**Scope**: replace in-memory state with DB-backed primitives. The most invasive structural change.

- Add Drizzle schema in `packages/billing/src/ledger/schema.ts` (per "Data model" above).
- Wire migration via `@elizaos/plugin-sql` (root `package.json:51-52` `migrate` script already filters by plugin; either add a billing migration directory the SQL plugin picks up, or contribute a minor PR to the SQL plugin to register additional schema sources).
- Implement `ledger/ledger.ts` `reserve()`, `release()`, `commit()`, `accrue()`, `flushAccrued()` in Postgres + PGLite (PGLite path uses advisory-lock alternatives for `SELECT FOR UPDATE`).
- Implement `auth/api-keys.ts`, `ledger/preauth.ts`, `auth/nonces.ts`, `pricing/quotes.ts` against DB.
- Tests: per-table CRUD + a concurrency stress test (10 concurrent reserves on the same wallet must serialize correctly).

**Validation gate**: stress test green; no race condition observed in 10k iterations.
**Rollback**: schema migration is forward-only; rollback requires `DROP SCHEMA billing CASCADE` SQL — document in runbook.

### Phase 5 — Workers + services (~4 days)

**Scope**: lifecycle-managed background jobs.

- Port `consumeWorker.ts` → `workers/consume-worker.ts`. State now in `billing_consume_batches`. Dead-letter persists.
- Port `withdrawWatcher.ts` → `workers/withdraw-watcher.ts`. Use `viem.watchContractEvent`.
- Port TWAP refresh tick + usage cleanup as `services/twap-service.ts` and `services/usage-cleanup-service.ts`.
- Wrap each in `Plugin.services` entries in `plugin-tokagent-billing/src/index.ts`. Lifecycle: `Plugin.init` starts services, `Plugin.dispose` stops them gracefully.
- Tests: simulate worker eligibility via DB seeding; assert `vault.consumeCredits` is called with expected `batchId`.

**Validation gate**: end-to-end on Anvil — record N synthetic accruals, advance time/block, assert `consumeCredits` tx mined with expected total.
**Rollback**: services are off until plugin is loaded; trivial.

### Phase 6 — Routes + auth + middleware (~5 days)

**Scope**: HTTP surface lands; gate is wired but disabled by default.

- Implement `plugin-tokagent-billing/src/routes/*.ts` per the table in §H.
- Implement middleware: `api-key-resolve.ts`, `rate-limit.ts`, `billing-gate.ts`.
- Replace HMAC sessions with JWT (jose) in `auth/siwe.ts`.
- Add a single seam to `packages/agent/src/api/server.ts` — `// BILLING_HOOK` in `handleRequest()` — that conditionally invokes `applyBillingMiddleware` when `BILLING_ENABLED=true`. The seam is < 10 lines.
- **Three-mirror rule applies**: add `BILLING_*` envs to root `.env.example`, `packages/templates/fullstack-app/.env.example`, and `packages/tokagentos/templates/fullstack-app/.env.example`. Add `@tokagentos/billing` + `@tokagent/plugin-tokagent-billing` to `packages/tokagentos/scaffold-patches/packages/agent/src/runtime/core-plugins.ts` if billing should auto-enable in scaffolded projects (decision pending — likely **no**, billing is opt-in per environment).
- Onboarding wizard: do **not** add a billing step to the LLM provider wizard; billing is operator-config, not user-config. (If product wants it, add as a separate "Enable Web3 billing" toggle later.)
- Tests: integration test: spin up agent with billing enabled, send `/v1/chat/completions` with valid `sk-ai-*`, assert reservation + commit; send without auth, assert 402.

**Validation gate**: agent boots with `BILLING_ENABLED=true`; full reserve→useModel→commit cycle works against Anvil + a mocked OpenAI provider.
**Rollback**: set `BILLING_ENABLED=false`; the seam is a no-op.

### Phase 7 — UI integration in `app-core` (~3 days)

**Scope**: minimum-viable billing screens. Replaces the source's bespoke `dashboard/`.

- New view: `packages/app-core/src/views/billing/credits.tsx` — displays `/v1/credits/me` (balance/reserved/accrued).
- New view: `packages/app-core/src/views/billing/topup.tsx` — wraps `/v1/topup/quote` + EIP-3009 signing flow + `/v1/topup/settle`. Uses the existing wagmi-style hooks already in `app-core`.
- New view: `packages/app-core/src/views/billing/keys.tsx` — `sk-ai-*` mint/list/revoke.
- New view: `packages/app-core/src/views/billing/usage.tsx` — `/v1/usage/calls` paginated.
- These views are registered behind a sidebar entry that only renders when `runtime-env` reports `BILLING_ENABLED=true`.

**Validation gate**: manual smoke test — fresh wallet, sign SIWE, mint key, top-up via EIP-3009, send a `/v1/chat/completions` with the key, see usage row appear.
**Rollback**: remove sidebar entry; views become orphaned but don't break the app.

### Phase 8 — Cutover & decommission (~2 days)

**Scope**: switch production traffic, archive source.

- Deploy tokagentos with `BILLING_ENABLED=true` pointing at the same vault + PTON contracts the source was using.
- Drain: announce 30-day deprecation window for source; redirect `/v1/messages` on the source proxy to the new endpoint with a `Deprecation` and `Sunset` header.
- After drain: archive `llm-api-gateway` repo (read-only); contracts repo (or branch in tokagentos parent) keeps Solidity deployment.
- Remove `BILLING_*` "feature flag" treatment if billing is now mandatory in the production deployment profile.

**Validation gate**: zero traffic on source for 7 consecutive days; ledger consistency check (sum of `billing_credit_state.balance` ≈ on-chain `credits[wallet]`) passes.
**Rollback**: re-enable source proxy by un-archiving repo; revert DNS. **This rollback window closes when the source is archived (Phase 8b)**.

### Effort summary (engineer-days, single full-time)

| Phase | Days |
|-------|------|
| 0 — Preparation | 2 |
| 1 — Scaffolding | 3 |
| 2 — Pure functions | 5 |
| 3 — Chain layer | 4 |
| 4 — Persistence | 5 |
| 5 — Workers | 4 |
| 6 — Routes + middleware | 5 |
| 7 — UI | 3 |
| 8 — Cutover | 2 |
| **Total** | **33 days** |

Plus ~10% slack for review cycles and CI fixes → **~6 calendar weeks** for one engineer; ~3 weeks if Phases 2–5 are split across two.

---

## Cutover & Decommission

- **Source repo lifecycle**:
  - End of Phase 6: source still runs production. Tokagentos billing is shadow-deployed, observing.
  - End of Phase 7: tokagentos billing is dual-deployed; new tenants onboarded on tokagentos; existing tenants drained over 30 days.
  - End of Phase 8: source archived. `llm-api-gateway` becomes read-only.
- **Flag-flip plan**: `BILLING_ENABLED=true` in tokagentos deployment manifest; corresponding deprecation header on source.
- **Data migration**: source stores **only** `proxy/data/usage.db` (SQLite call_log) durably. Decision:
  - **A (preferred)**: declare it not migrated; archive the SQLite file alongside the source repo; users querying historical usage do so via a one-shot dump.
  - **B (alt)**: write a one-time `bun run migrate:billing-import-sqlite` script in `packages/billing/scripts/` that loads SQLite into `billing_call_log`. Effort: ~0.5 day.

  All other source state is in-memory and is intentionally lost on archive (it was already lost on every restart by design — `apiKeys.ts:13-16` comment).
- **Secrets migration**:
  - `OPERATOR_PRIVATE_KEY` (source) = `BILLING_OPERATOR_PRIVATE_KEY` (target). **Same key**, vault-resident.
  - `AUTH_SECRET` (source) ≠ `BILLING_AUTH_SECRET` (target). New JWT keys; existing SIWE sessions on source invalidated at cutover. API keys (`sk-ai-*`) are HMAC'd with the new secret too — **mandatory re-mint** for all customers, communicated in deprecation comms.
  - `LITELLM_API_KEY` already in target's `.env.example:60`; reuse.
  - TWAP pool addresses: same on Ethereum mainnet; copy verbatim.
- **Re-bind operator address**: ClaudeVault has `setOperator(...)` (`ClaudeVault.sol`). At cutover, no change needed if the same key is reused. If rotated, batch a `setOperator` tx into the cutover runbook.

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner-type |
|---|------|------------|--------|------------|------------|
| R1 | In-memory ledger semantics ↔ DB semantics drift (lost reservations, double-charges) | High | High | Phase 4 stress tests; staged rollout with `BILLING_ENABLED=false` default; ledger consistency check in Phase 8 validation gate | Backend eng |
| R2 | EIP-3009 nonce reuse / vault `topupId` reuse during drain (parallel source + target writing) | Medium | Critical (fund-loss-class) | At Phase 7 cutover, **fence** writes: source set to read-only `/v1/messages` rejection mode before tokagentos writes any deposit; OR partition operator addresses (different operator per gateway). | Smart-contract eng |
| R3 | SSE commit-once latch behaviour differs under `runtime.useModel` abstraction (target streams via plugin layer, not raw upstream `Response.body.getReader()`) | High | Medium (over/under-charge) | Phase 6 includes an explicit SSE harness test covering complete / abort / error paths; verify `streamCommit` triggers exactly once per request | Backend eng |
| R4 | `better-sqlite3` → Drizzle behavioral drift (e.g., `BigInt` precision in `numeric(78,0)`) | Medium | Medium | Phase 4 includes property tests (`fast-check`) on USD↔PTON round-trips with extreme values | Backend eng |
| R5 | Three-mirror scaffold rule violation produces silent drift; new projects scaffolded without billing config | Medium | Low | Phase 6 PR template explicitly enumerates all three mirror locations; CI lint scans for `BILLING_*` keys present in all three | DX eng |
| R6 | Korean docs in source contain undocumented constraints not surfaced in code | Low | Medium | Phase 0 translation; spot-check the translation against `proxy/src/*.ts` comment density | Backend eng |
| R7 | Operator hot-key in env var is incompatible with cloud-managed deployment (`TOKAGENT_CLOUD_PROVISIONED=1`) | High (in cloud profile) | High | Phase 6 wires `BILLING_OPERATOR_PRIVATE_KEY` through the OS keychain helper at `packages/agent/src/auth/credentials.ts:43-134` for cloud profile; document that bare-env operator key is local-only | Security eng |
| R8 | TWAP staleness + RPC outage produces revenue loss (proxy continues charging at stale rate) | Medium | Medium | Existing `MAX_PRICE_STALENESS_MS` policy preserved; alert when stale > threshold via OTel meter `tokagent_billing_twap_last_success_age_seconds` | SRE |
| R9 | `plan.md` has already drifted from implementation; relying on it for design decisions creates further drift | High | Low (process risk) | Phase 0 Korean docs are reference-only; only `proxy/src/*.ts` is authoritative for behavior; document this in `packages/billing/README.md` | Tech-lead |
| R10 | Existing tokagentos `/v1/messages` route consumers expect plugin-routed responses; billing gate rejects requests they previously made (no SIWE / no API key) | High | Low | Default `BILLING_ENABLED=false`; opt-in per deployment profile. Local-first / self-hosted users unaffected. | Product |
| R11 | Source's pricing table snapshot date `2026-04-20` (`server.ts:1090-1091`) drifts further during migration | Medium | Low | Phase 0 verify pricing table against current LiteLLM rates; add `bun run verify-pricing` task as a quarterly cron note in runbook | Product |
| R12 | Bun `better-sqlite3` rebuild not relevant after migration but the source's tests use it; porting the test suite verbatim breaks under Bun | Low | Low | Port pricing/billing tests to Vitest using mocks; do not preserve SQLite-bound tests (they test discarded code) | Backend eng |
| R13 | Smart contract deployment ownership ambiguous (Path A vs B unresolved) | High (until Phase 0 closes) | Medium | Resolve in Phase 0; default to Path A | Tech-lead |
| R14 | Withdraw-watcher race: chain reorg removes a `WithdrawRequested` event after we've pre-empted a flush | Low | Low | viem's `watchContractEvent` already handles reorgs; confirm `confirmations` parameter is set ≥ chain finality threshold | Backend eng |

---

## Open Questions

Each blocks at least one phase. Recommended answers in **bold** so the team can quickly accept or override.

1. **Smart contracts location** — Path A (keep in source repo / move to parent contracts tree) vs Path B (new sibling workspace in tokagentos parent). **Recommend A.** Blocks Phase 0.
2. **Per-tenant or per-key quotas** — source has none; target has none. Adding now is scope creep. **Recommend: defer; document as a Phase 9+ extension on the `billing_api_keys` table.** Blocks nothing; stakeholder request only.
3. **Cloud profile operator key handling** — does Tokagent Cloud (`cloud/cloud-proxy.ts`) host the operator key per-tenant or per-deployment? **Recommend: per-deployment**, with the cloud bridge issuing scoped per-tenant SIWE sessions against a single cloud-resident operator. Blocks Phase 6 cloud wiring; affects R7.
4. **JWT vs HMAC sessions** — replacing source's hand-rolled HMAC with JWT adds a `jose` dependency. **Recommend: yes, JWT with 24h TTL**; debt repaid is worth ~30 LOC of standard tooling. Blocks Phase 6.
5. **Auto-enable behavior in scaffold** — should `BILLING_ENABLED=true` propagate to scaffolded projects via `core-plugins.ts` overlay? **Recommend: no.** Billing is opt-in per deployment; scaffolded projects start with billing off. Blocks Phase 6 scaffold-patches mirror.
6. **SQLite call_log historical migration** — Path A (archive only) vs B (one-shot import script). **Recommend A** unless customers explicitly request usage history. Blocks Phase 8.
7. **Multi-instance / horizontal scaling** — source's plan.md (lines 871-872) flagged Redis as future work. Drizzle + Postgres covers shared state. **Recommend: scale-out is unblocked by Phase 4; explicitly mention in Phase 4 acceptance.** Blocks nothing in core path; product decision on whether to advertise multi-instance.
8. **Embedding routing through billing** — current LiteLLM design doc says embeddings are out of scope; tokagent uses `@elizaos/plugin-local-embedding`. **Recommend: keep embeddings out of billing scope.** Decision to revisit when embeddings are routed through paid providers.
9. **Operator address parity at cutover** — reuse source's operator address or rotate? **Recommend: reuse**, single `setOperator` migration tx at cutover only if rotating. Blocks Phase 8 runbook.
10. **Allow-list union** — source allowlist includes `glm-4.7` test entry and Claude/GPT/Gemini families; target plugin layer accepts whatever the loaded provider plugin advertises. **Recommend: billing's allowlist gates which models are billable; non-billable models reject under `BILLING_ENABLED=true`. Document this asymmetry.** Blocks Phase 2.

---

### Sense check (per the prompt's gate)

- **A new engineer can execute Phase 1 from this document alone**: yes — file paths, naming conventions, build tooling, and templates (`plugin-tokagent-yield`) are explicit.
- **All source features accounted for**: yes — every directory in §1 of the source recon has a row in §A–§I above, either migrated or rejected with reason.
- **Every architectural claim references real code**: spot-checked. Source citations land in `proxy/src/*` files documented in `/tmp/recon_source_llm_gateway.md`. Target citations land in `packages/agent/src/api/server.ts`, `packages/typescript/src/runtime.ts`, and the plugin layer documented in `/tmp/recon_target_tokagentos.md`.

---

**Next action**: close Open Questions 1, 4, 5, and 6 to unblock Phases 0 and 1. Phase 0 can start the same day.
