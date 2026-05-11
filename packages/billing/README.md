# @tokagentos/billing

Web3 credit-billing rail for the tokagentos LLM gateway. Migrated from `llm-api-gateway` in 2026.

The billing package implements a four-component system: PTON token (EIP-3009 wrapper over TON) +
`ClaudeVault` Solidity contract (on-chain credit hub) + a TypeScript billing engine that mediates
`reserve → forward → commit` against a DB-backed ledger (Drizzle + Postgres/PGLite) with periodic
on-chain `consumeCredits` flushes + composite Uniswap V3 TWAP for USD→PTON pricing.

---

## Status (as of 2026-05-11)

| Phase | Scope | State |
|---|---|---|
| 0 | Docs, decisions, addresses staging | ✅ landed |
| 1 | Workspace scaffolding | ✅ landed |
| 2 | Pricing, billing math, TWAP (pure) | ✅ landed |
| 3 | Chain layer: clients, vault, EIP-3009 verify, Anvil harness | ✅ landed |
| 4 | Drizzle ledger, persistence | ✅ landed |
| 5 | Workers (consume, withdraw, TWAP refresh, usage cleanup) | ✅ landed |
| 6 | Routes + auth + middleware + scaffold mirroring | — |
| 7 | app-core billing UI | — |
| 8 | Cutover + decommission | — |

---

## Docs Index

```
packages/billing/docs/
├── decisions.md          # Committed answers to OQ1–OQ10 from the integration plan
├── reserve-flow.md       # ASCII sequence diagram of the credit reserve/commit lifecycle
└── _archive/
    ├── architecture.en.md  # English translation of llm-api-gateway/docs/architecture.md
    └── proxy.en.md         # English translation of llm-api-gateway/docs/proxy.md
```

**Source-of-truth note**: When `_archive/*.en.md` disagrees with
`llm-api-gateway/proxy/src/*.ts`, **code wins** (per plan Risk R9).
The translated docs are archived reference material; the proxy TypeScript source is
authoritative for all behavioral claims.

---

## Integration Plan

Full phased integration plan:

```
../../docs/superpowers/specs/2026-05-11-llm-api-gateway-integration-plan.md
```

Source repo (deprecating after Phase 8 cutover):

```
../../../../llm-api-gateway/proxy/src/
```

---

## Database

Phase 4 replaces all in-memory Map state from the source `llm-api-gateway` proxy with a
DB-backed ledger using [Drizzle ORM](https://orm.drizzle.team/) and Postgres.

### Runtime requirements

- **Postgres 15+** — required for production. Pass the connection string via
  `BILLING_DATABASE_URL=postgres://user:pass@host:5432/db`.
- **PGLite** — used automatically in tests (no external process required).

### Schema overview

Eight tables, all prefixed `billing_*` to avoid collision with `@elizaos/plugin-sql` tables:

| Table | Purpose |
|---|---|
| `billing_credit_state` | Per-wallet balance / reserved / accrued accumulators |
| `billing_reservations` | In-flight request reservations (reserve → commit/release) |
| `billing_consume_batches` | On-chain `consumeCredits` batch records |
| `billing_topup_preauth_slots` | Pre-signed EIP-3009 authorization slots |
| `billing_topup_quotes` | Single-use topup deposit quotes |
| `billing_api_keys` | HMAC-SHA256 hashed API key store |
| `billing_auth_nonces` | One-shot SIWE nonce store |
| `billing_call_log` | Per-request usage log (model, tokens, cost) |

atto-PTON amounts are stored as `numeric(78,0)` and mapped to TypeScript `bigint` (Decision Z15).
All mutating ledger operations run under SERIALIZABLE isolation with automatic retry on Postgres
error code `40001` (Decision Z14).

### Migrations

Migrations live in `packages/billing/drizzle/migrations/` and are committed to the repository.
To regenerate after a schema change:

```bash
cd packages/billing
bunx drizzle-kit generate --config drizzle.config.ts
```

Migrations are **forward-only** — no down migrations. Apply in production via the standard
`drizzle-orm/node-postgres` `migrate()` call before starting the billing service.

### Running tests

Unit and concurrency tests run against PGLite — no external database needed:

```bash
bun run test --filter=@tokagentos/billing
```

For the full 10k-iteration concurrency stress test (validation gate):

```bash
BILLING_STRESS_FULL=1 bun run test --filter=@tokagentos/billing
```

---

## Workers & Services

Phase 5 ships four background workers, each implemented as a pure function in
`packages/billing/src/workers/` and wrapped in an elizaOS `Service` in
`plugins/plugin-tokagent-billing/src/services/`.

### Service summary

| Service | Cadence / trigger | Description |
|---|---|---|
| `ConsumeService` | Every 30s (scan); OR if wallet accrued ≥ 0.5 PTON or accrual is ≥ 5 min old | Flushes accrued credits to `vault.consumeCredits` on-chain |
| `WithdrawWatcherService` | Event-driven — `vault.WithdrawRequested` | Pre-empts a user's pending withdrawal by flushing their accrued balance first |
| `TwapRefreshService` | Every 60s + initial prime on start | Refreshes composite TON/USD Uniswap V3 TWAP price into `TwapCache` |
| `UsageCleanupService` | Every 24h | Sweeps expired rows from `billing_call_log`, `billing_auth_nonces`, `billing_topup_quotes`, `billing_topup_preauth_slots` |

### Lifecycle

Services are registered in `tokagentBillingPlugin.services`. The elizaOS runtime calls
`Service.start(runtime)` for each during plugin init and `Service.stop()` on shutdown.
Each service resolves its deps (DB pool, viem clients, config) from `runtime.getSetting()`
via `resolveBillingRuntime()` — no constructor injection needed.

### Tunable envs (Phase 5 additions)

| Env | Default | Purpose |
|---|---|---|
| `BILLING_CONSUME_BATCH_MIN_PTON` | `500000000000000000` | Size threshold for flush (atto-PTON) |
| `BILLING_CONSUME_MAX_AGE_MS` | `300000` | Idle age threshold for flush (ms) |
| `BILLING_CONSUME_SCAN_INTERVAL_MS` | `30000` | Consume scan interval (ms) |
| `BILLING_CONSUME_MAX_PER_CYCLE` | `10` | Max wallets per scan |
| `BILLING_USAGE_RETENTION_DAYS` | `90` | call_log retention (days) |
| `BILLING_USAGE_CLEANUP_INTERVAL_MS` | `86400000` | Cleanup tick cadence (ms) |
| `BILLING_PRICE_REFRESH_INTERVAL_MS` | `60000` | TWAP refresh cadence (ms) |

All have safe defaults; none are required if the defaults are acceptable.

### Anvil end-to-end (consume worker integration)

```bash
BILLING_TEST_ANVIL=1 bun run test --filter=@tokagentos/billing
```

This runs the full consume-worker integration test against a fresh Anvil chain
(see Anvil Quickstart section below for prerequisites).

---

## Anvil Quickstart

Phase 3 introduces the Anvil harness and integration tests. The chain-write round-trip
(`depositX402` + `consumeCredits`) can be exercised locally against a fresh Anvil node
with the source repo's contracts deployed.

### Prerequisites

- [Foundry](https://getfoundry.sh/) installed (`~/.foundry/bin/anvil` + `forge`).
- Source repo cloned at `../../../../llm-api-gateway/` relative to this package.
- No network access required — the tests use a fresh non-forked Anvil chain (chainId=31337).

### Steps

```bash
# 1. Build the source contracts (one-time, or after contract changes)
cd ../../../../llm-api-gateway/contracts
forge build

# 2. Run the full billing test suite including Anvil integration tests
cd ../../Tokamak-AI-Layer/tokagentos
BILLING_TEST_ANVIL=1 bun run test --filter=@tokagentos/billing
```

The integration suite takes ~15–20s when BILLING_TEST_ANVIL is set:
- Anvil process start: ~5s
- `forge script Deploy.s.sol --broadcast`: ~5s
- Vault read/write round-trips: ~6s

Without `BILLING_TEST_ANVIL=1`, integration tests are silently skipped.
The unit tests (EIP-3009 offline verify, typed-data shape) always run.

### Required env vars (chain layer)

The five chain-layer envs are required when `BILLING_ENABLED=true` (Phase 6).
For Phase 3 manual testing, pass them directly to `createBillingClients()`:

```
BILLING_CHAIN_RPC_URL=http://127.0.0.1:8545
BILLING_CHAIN_ID=31337
BILLING_VAULT_ADDRESS=<output from forge script>
BILLING_PTON_ADDRESS=<output from forge script>
BILLING_OPERATOR_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80  # Anvil default key — never use in production
```

For TWAP reads (Ethereum mainnet only):
```
BILLING_MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/<your-key>
```

---

## Architecture Summary

```
Client
  │  POST /v1/chat/completions  (Authorization: Bearer <siwe> OR x-api-key: sk-ai-*)
  ▼
packages/agent/src/api/server.ts
  ├─ billing.gate(req)       ← plugin-tokagent-billing middleware (Phase 6)
  │     ├─ resolveCallerIdentity → wallet
  │     ├─ rate-limit (token-bucket, keyed by wallet)
  │     ├─ estimateMaxCostUsd → usdToPton → reserveAmt
  │     └─ ledger.reserve(wallet, reserveAmt)  [DB-backed, Phase 4]
  ▼
runtime.useModel(TEXT_LARGE, params)   ← existing plugin layer, unchanged
  ▼
upstream provider (Anthropic / OpenAI / LiteLLM)
  ▼
streamCommit / unaryCommit             ← billing post-processing middleware (Phase 6)
  ├─ computeActualCostUsd → actualPton + feePton + totalPton
  ├─ ledger.commit(wallet, reservation, totalPton)
  └─ usageStore.record(...)

(background, every 30s)
consume-worker → vault.consumeCredits(wallet, accrued, batchId)
```

Billing is **opt-in**: set `BILLING_ENABLED=true` in your deployment's environment to activate.
Local-first and self-hosted deployments run with `BILLING_ENABLED=false` (the default) and are
entirely unaffected.
