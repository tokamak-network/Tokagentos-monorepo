# @tokagentos/billing

Web3 credit-billing rail for the tokagentos LLM gateway. Migrated from `llm-api-gateway` in 2026.

The billing package implements a four-component system: PTON token (EIP-3009 wrapper over TON) +
`ClaudeVault` Solidity contract (on-chain credit hub) + a TypeScript billing engine that mediates
`reserve → forward → commit` against a DB-backed ledger (Drizzle + Postgres/PGLite) with periodic
on-chain `consumeCredits` flushes + composite Uniswap V3 TWAP for USD→PTON pricing.

---

## Status

**Phase 0 (staging) — package not yet built into the workspace graph.**

Phase 1 will create `package.json`, `tsconfig.json`, and wire into `turbo.json`. Until then, the
files in this directory are pre-staged reference artifacts only:

| Artifact | Purpose | Phase it becomes active |
|---|---|---|
| `docs/_archive/architecture.en.md` | English translation of source architecture doc | Reference only (never "active") |
| `docs/_archive/proxy.en.md` | English translation of source proxy server doc | Reference only |
| `docs/reserve-flow.md` | Reserve→commit sequence diagram from `handleMessages.ts` | Reference only |
| `docs/decisions.md` | Committed answers to integration plan Open Questions | Governance (all phases) |
| `src/chain/addresses.ts` | PTON + ClaudeVault deployed addresses | Phase 3 (chain layer) |

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

```
TODO(phase-4): Add Anvil quickstart instructions here once the chain layer and
Anvil harness land (Phase 4). The source repo's mprocs.yaml + scripts/
will be replaced by a documented Anvil fork command and turbo dev integration.
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
