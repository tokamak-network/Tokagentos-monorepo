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
| 4 | Drizzle ledger, persistence | ⏳ next |
| 5 | Workers (consume, withdraw, TWAP refresh, usage cleanup) | — |
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
