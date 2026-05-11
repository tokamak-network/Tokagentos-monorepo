> **Source**: `llm-api-gateway/docs/architecture.md` (Korean original)
> **Translated**: 2026-05-11
> **Status**: archived reference; authoritative source for behavior is `llm-api-gateway/proxy/src/*.ts`
> **Note**: When this file disagrees with the source code (see plan Risk R9), code wins.

# Architecture

> A single reference point for the project's component map, request timeline, external dependency contracts, and scaling constraints.

---

## 1. Component Overview

```
┌────────────────────────────────────────────────────────────────────┐
│  Ethereum mainnet (anvil fork, chainId=1)                          │
│                                                                    │
│   ┌──────────┐      ┌──────────────┐    ┌─────────────────────┐    │
│   │   TON    │◀────▶│    PTON      │◀──▶│    ClaudeVault      │    │
│   │  ERC-20  │      │  ERC-20 +    │    │  Pausable + RG      │    │
│   │          │      │  EIP-3009    │    │  admin / operator   │    │
│   └──────────┘      └──────────────┘    │  credits[user]      │    │
│                                          │  depositX402        │    │
│   ┌─────────────────┐       ┌───────────│  consumeCredits     │    │
│   │ Uniswap V3       │       │ Uniswap V3│  withdraw           │    │
│   │ WTON/WETH pool   │       │ WETH/USDC └─────────────────────┘    │
│   └────────────────▲┘       └──────────────────────▲─┐              │
└────────────────────┼──────────────────────────────┼──┼──────────────┘
                     │ observe()                     │  │ readCredits()
                     ▼                               ▼  ▼
          ┌──────────────────────────────────────────────────────┐
          │                proxy (TypeScript · Hono)             │
          │                                                      │
          │  server.ts ─────────── HTTP (Hono) — 20+ routes      │
          │  handleMessages.ts ── /v1/messages handler (DI)      │
          │  handleStream.ts ──── SSE streaming proxy            │
          │  handleTopup.ts ───── X-PAYMENT topup handling       │
          │  credits.ts ───────── in-memory ledger (B/R/A)       │
          │  consumeWorker.ts ─── batch consume (threshold+idle) │
          │  withdrawWatcher.ts ── Withdrew event watcher        │
          │  auth.ts ──────────── SIWE login + session tokens    │
          │  apiKeys.ts ───────── API key issuance & revocation  │
          │  topupBatch.ts ────── pre-signed topup batch mgmt    │
          │  pricing.ts ───────── model rates, token est., cost  │
          │  billing.ts ───────── usdToPton, computeCharge       │
          │  twap.ts ──────────── composite TWAP oracle (single) │
          │  quotes.ts ────────── in-memory quote store (60s TTL)│
          │  onchain.ts ───────── viem clients, deposit/consume  │
          │  llm.ts ───────────── Anthropic API forwarder        │
          │  streamCommit.ts ──── streaming commit (commit-once) │
          │  streamParse.ts ───── SSE parsing + usage accumulate │
          │  rateLimit.ts ─────── token-bucket rate limiting     │
          │  metrics.ts ───────── Prometheus metrics             │
          │  usageStore.ts ────── SQLite audit log               │
          │  usageRecorder.ts ─── async call recording           │
          │  config.ts ────────── zod-validated env loader       │
          │  abi.ts ───────────── PTON/Vault ABI + EIP-712 types │
          │  schemas.ts ───────── shared zod schemas             │
          │  log.ts ───────────── pino logger                    │
          └──────────────────────────────────────────────────────┘
                    │ Bearer LITELLM_API_KEY
                    ▼
          ┌─────────────────────────────────────────┐
          │  Anthropic API (api.tokamak.network)    │
          │  Messages API (/v1/messages)            │
          └─────────────────────────────────────────┘
```

Four external dependencies:
1. **`anvil` fork** — all contract calls (deposit, consume, withdraw, TWAP) connect to the same fork.
2. **Two Uniswap V3 pools** — WTON/WETH and WETH/USDC. No direct TON/USDC pool exists on mainnet, so the composite path is used to derive the TON/USD price.
3. **Anthropic API** — all LLM requests are proxied to the Messages API-compatible endpoint.
4. **OPERATOR private key** — the signer the proxy uses to send `depositX402`/`consumeCredits` transactions. Kept separate from the admin key.

## 2. Request Timeline (credit mode, happy path)

```
t=0   client → POST /v1/messages  Authorization: Bearer <jwt>
       ├─ MessagesReqSchema (zod) parse
       ├─ assertSupportedModel / assertNoDisallowedModifiers
       ├─ resolveCallerIdentity → wallet + apiKeyId
       ├─ rate-limit("call:{wallet}")
       │
       ├─ [if X-PAYMENT present] handleTopup
       │   ├─ verifyEip3009Signature
       │   ├─ depositOnChain → vault.depositX402
       │   └─ ledger.credit(wallet, amount)
       │
       ├─ estimateInputTokens(messages, tools, system)
       ├─ detectCacheControl(body)
       ├─ oracle.getPrice()  ──▶ Uniswap V3 observe() × 2
       ├─ estimateMaxCostUsd → quotedUsd → reserveAmt
       ├─ hydrateBalance(wallet) ──▶ vault.credits(wallet)
       ├─ ledger.reserve(wallet, reserveAmt)
       │
       │  [insufficient balance → attempt auto-topup → 402 on failure]
       │
       ├─ [streaming] handleStreaming
       │   ├─ POST Anthropic (stream: true)
       │   ├─ SSE relay (chunk-by-chunk)
       │   ├─ absorbUsageFromEvent (accumulate)
       │   └─ makeStreamCommit.once → ledger.commit
       │       └─ consumeWorker: accrued ≥ threshold? flush!
       │
       └─ [unary] callAnthropic
           ├─ POST Anthropic Messages API
           ├─ computeActualCostUsd(usage)
           ├─ computeCharge → { actualPton, feePton, totalPton }
           └─ ledger.commit(wallet, reserveAmt, totalPton)
       ← 200 + Anthropic body + x-credits-balance, x-actual-pton, x-fee-pton,
            x-total-pton, x-reserved-released, x-pending-consume

t=≤30s consumeWorker scan
       → select flush candidates from ledger.pendingAccruals()
       → consumeCreditsOnChain(wallet, amount, batchId)
         ├─ usedConsumeBatches[batchId]=true
         ├─ credits[wallet] -= amount
         └─ operator revenue += amount
```

## 3. Inter-Component Contracts

### 3.1 PTON ↔ ClaudeVault

- The Vault constructor pins the `pton` address as `immutable`.
- The Vault calls `pton.transferWithAuthorization(from, vault, …)` using the user's EIP-3009 signature — only via `depositX402`.
- `consumeCredits` deducts from the credits mapping inside the vault without the user's per-call consent — the user already consented by making the original deposit.
- `withdraw` is called directly by the user — it deducts from credits and pays out PTON.

### 3.2 ClaudeVault ↔ proxy

- The proxy's viem wallet address must equal `vault.operator`. If this mapping breaks, every `depositX402`/`consumeCredits` call reverts.
- The proxy **does not maintain an event indexer** — it confirms success via transaction receipts. The sole exception is `withdrawWatcher`, which polls for `Withdrew` events.
- `credits[user]` is mirrored in the proxy's in-memory ledger. The on-chain state is the source of truth for accounting.

### 3.3 proxy ↔ client (credit mode)

- Clients authenticate via SIWE login or an API key.
- Top-up: client signs an EIP-3009 authorization based on `accepts[0]` from a 402 response, then settles via `POST /v1/topup/settle`. Alternatively, clients register a pre-signed batch via `/v1/topup/preauth` for auto-topup.
- Credit deduction: `reserveAmt` (maximum estimate-based amount) is reserved from balance → actual usage commits → excess is returned.
- Final USD cost to user: `actualUsd × (1 + effectiveMarginBps/10000)`.

### 3.4 proxy ↔ Anthropic API

- Requests: `POST ${LITELLM_BASE_URL}/v1/messages`, `x-api-key: ${LITELLM_API_KEY}`.
- Uses the Anthropic-native Messages API format directly (Anthropic version + beta header forwarding).
- 120-second timeout. Non-2xx response → immediately call `ledger.release` to free the reservation, then return 502.

## 4. Trust Boundaries and Fund Flow

```
┌─────── signed by USER (off-chain, EIP-712) ───────┐
│  TransferWithAuthorization(to=VAULT, value)       │
└───────────────┬────────────────────────────────────┘
                │ X-PAYMENT header (Base64 JSON)
                ▼
┌─────── operator signs (on-chain) ────────────────┐
│  ClaudeVault.depositX402(...)                    │
│   └─ PTON.transferWithAuthorization(...)         │
│   └─ credits[from] += value                      │
└──────────┬───────────────────────────────────────┘
           │ credits[user] increases
           ▼
┌─────── proxy ledger (in-memory) ─────────────────┐
│  balance → reserved → accrued (call lifecycle)   │
│  consumeWorker: batch consumeCredits              │
└──────────┬───────────────────────────────────────┘
           │ operator signs (on-chain, batch)
           ▼
┌─────── ClaudeVault.consumeCredits ───────────────┐
│  credits[user] -= amount                          │
│  operator revenue += amount                       │
└──────────────────────────────────────────────────┘
```

- **User funds move only at deposit time.** Subsequent calls are pure in-ledger accounting.
- **If the operator key is compromised**, `consumeCredits` can drain arbitrary user credits — up to the vault balance. Mitigation: admin `pause()` + `setOperator()`.
- **If the admin key is compromised**, everything is at risk including `sweepRevenue`. Mandatory mitigation: Safe multisig + timelock.

## 5. Scaling and Constraint Boundaries

- **In-memory ledger** — only one process may run. Ledger is lost on restart; state can be reconstructed from chain, but there is a recovery window risk. Migration to Redis/Postgres is recommended.
- **In-memory quote store** — same caveat. Multiple instances would produce quoteId misses.
- **Composite TWAP required** — no direct TON/USDC pool on mainnet; the path `WTON/WETH × WETH/USDC` is mandatory.
- **No multi-chain support** — `VAULT_ADDRESS`/`PTON_ADDRESS` are single-chain config.
