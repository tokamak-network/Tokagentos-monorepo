> **Source**: `llm-api-gateway/docs/proxy.md` (Korean original)
> **Translated**: 2026-05-11
> **Status**: archived reference; authoritative source for behavior is `llm-api-gateway/proxy/src/*.ts`
> **Note**: When this file disagrees with the source code (see plan Risk R9), code wins.

# Proxy Server

> The `proxy/` directory. Node 20+ · TypeScript 5 · Hono 4 · viem 2 · zod 3 · pino 9 · better-sqlite3. Single-process HTTP server.

---

## 1. Module Map

| File | Role | Key exports |
|---|---|---|
| `src/server.ts` | Hono entry point, route registration, bootstrap, graceful shutdown | `app`, `createApp`, `ptonDomain` |
| `src/handleMessages.ts` | `/v1/messages` handler — parse, auth, estimate, reserve, forward, settle (DI-injected) | `handleMessagesRequest`, `MessagesReqSchema` |
| `src/handleStream.ts` | SSE streaming proxy — open upstream connection → relay chunks → commit-once | `handleStreamingRequest` |
| `src/handleTopup.ts` | X-PAYMENT topup — signature verification, on-chain deposit, ledger credit | `handleTopup`, `PaymentPayloadSchema` |
| `src/config.ts` | zod-validated env loader, frozen `config` object | `config`, `loadConfig` |
| `src/log.ts` | pino logger initialization | `log` |
| `src/abi.ts` | `PTON_ABI`, `VAULT_ABI`, `TRANSFER_WITH_AUTH_TYPES` | (same) |
| `src/schemas.ts` | `MessagesReqSchema` and other shared zod schemas, Anthropic error types | (same) |
| `src/pricing.ts` | Model rate table (Anthropic + OpenAI + Gemini), token estimation, estimate/actual cost USD calculation, `normalizeModelId` | `PRICING`, `SUPPORTED_MODELS`, `getRates`, `estimateInputTokens`, `estimateMaxCostUsd`, `computeActualCostUsd`, `normalizeUsage` |
| `src/billing.ts` | USD → atto-PTON conversion, per-call charge split (atto-space margin) | `usdToPton`, `computeCharge` |
| `src/twap.ts` | Uniswap V3 composite TWAP oracle (WTON/WETH × WETH/USDC) | `TonPriceOracle` |
| `src/quotes.ts` | In-memory quote store (60s TTL, auto-sweep) | `quoteStore`, `QUOTE_TTL_MS` |
| `src/onchain.ts` | viem public/wallet clients, `depositOnChain`, `consumeCreditsOnChain`, `readCreditsOnChain`, `verifyEip3009Signature` | (same) |
| `src/llm.ts` | Anthropic Messages API forwarder (unary + streaming, 120s timeout) | `callAnthropic`, `callAnthropicStream` |
| `src/credits.ts` | In-memory credit ledger — balance/reserved/accrued 3-way split | `creditLedger`, `CreditLedger` |
| `src/consumeWorker.ts` | Batch consume worker — threshold (0.5 PTON) + idle (5 min) triggers, 3 retries → dead-letter | `startConsumeWorker`, `stopConsumeWorker`, `flushNow`, `workerStats` |
| `src/withdrawWatcher.ts` | `Withdrew` event watcher → `ledger.applyWithdraw`, pre-flush before consume | `startWithdrawWatcher` |
| `src/auth.ts` | SIWE-style EIP-712 login + HMAC session token issuance & verification | `issueLoginNonce`, `completeLogin`, `requireWalletFromHeader`, `resolveCallerIdentity` |
| `src/apiKeys.ts` | API key create / list / revoke (HMAC-signed, `sk-` prefix) | `apiKeyStore` |
| `src/topupBatch.ts` | Pre-signed topup batches — register, popOne, revoke | `topupBatch` |
| `src/rateLimit.ts` | Token-bucket rate limiter (injectable clock) | `TokenBucketLimiter`, `extractClientKey` |
| `src/metrics.ts` | Prometheus text-format metrics (zero-dep, Counter/Gauge/Histogram) | `registry`, individual metric instances |
| `src/usageStore.ts` | SQLite call audit log (better-sqlite3) | `getUsageStore` |
| `src/usageRecorder.ts` | Async call recording + retention cleanup worker | `recordCall`, `recordFailedCall`, `startUsageCleanupWorker` |
| `src/streamCommit.ts` | Streaming commit closure — guarantees commit-once | `makeStreamCommit` |
| `src/streamParse.ts` | SSE `data:` line parsing + usage accumulation | event parser |

## 2. HTTP Routes

### 2.1 `POST /v1/messages` — Core Endpoint

Anthropic Messages API-compatible. Branching by authentication method:

**Authentication**: `Authorization: Bearer <jwt>` (SIWE) or `x-api-key: sk-...` (API key).

**Branch A — X-PAYMENT header present (topup)**

`handleTopup` → EIP-3009 signature verification → `depositOnChain` → `ledger.credit` → continue with the request.

**Branch B — Normal call flow**

1. Parse request body with zod → `MessagesReqSchema`. Failure → **400**.
2. `assertSupportedModel`, `assertNoDisallowedModifiers`. Failure → **400**.
3. `resolveCallerIdentity` → wallet + apiKeyId. Failure → **401**.
4. Rate-limit(`call:{wallet}`). Exceeded → **429** + `retry-after`.
5. `estimateInputTokens`, `detectCacheControl`, `oracle.getPrice()`.
6. `estimateMaxCostUsd` → `quotedUsd` → `reserveAmt`.
7. `hydrateBalance` → `ledger.reserve(wallet, reserveAmt)`.
8. **Insufficient balance**: attempt auto-topup → if it fails, return **402** `insufficient_funds_error` for API key users, **402** + topup quote for SIWE users.
9. **Streaming** (`stream: true`): `handleStreaming` → SSE relay → `makeStreamCommit` ensures commit-once.
10. **Unary**: `callAnthropic` → `computeActualCostUsd` → `computeCharge` → `ledger.commit`.
11. Successful response **200** + Anthropic body + headers:
    - `x-credits-balance` — available balance after commit
    - `x-actual-pton` — LLM cost (atto-PTON)
    - `x-fee-pton` — operator margin (atto-PTON)
    - `x-total-pton` — total deducted (`actualPton + feePton`)
    - `x-reserved-released` — excess returned from reservation
    - `x-pending-consume` — accrued balance pending a consume batch
    - `x-margin-bps` — margin bps applied

**Upstream failure**: call `ledger.release(wallet, reserveAmt)` to release the full reservation → return **502**.

### 2.2 Auth Routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/auth/nonce` | Issue SIWE nonce. `{ wallet }` → `{ nonce, issuedAt, expiresAt, domain, types }` |
| `POST` | `/v1/auth/login` | Submit signature → issue session token. `{ wallet, nonce, issuedAt, expiresAt, signature }` → `{ token, expiresAt }` |

### 2.3 API Key Routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/keys` | Create key. `{ name? }` → `{ key, id, name, wallet, createdAt }` |
| `GET` | `/v1/keys` | List keys. `{ keys: [{ id, name, createdAt, lastUsedAt, revokedAt }] }` |
| `DELETE` | `/v1/keys/:id` | Revoke key. `{ revoked }` |

### 2.4 Credits / Usage Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/credits/me` | Own credit status. `{ wallet, onChainCredits, ledger: { balance, reserved, accrued } }` |
| `GET` | `/v1/usage/summary` | Call aggregates (default: 30 days). `{ calls, inputTokens, outputTokens, actualPton }` |
| `GET` | `/v1/usage/calls` | Call log (cursor-based pagination). `?cursor=&limit=50` |
| `GET` | `/v1/usage/keys` | Per-key usage. `?since=&until=` |

### 2.5 Topup Routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/topup/preauth` | Register a pre-signed topup batch |
| `GET` | `/v1/topup/status` | Batch status |
| `POST` | `/v1/topup/revoke` | Revoke a batch |
| `GET` | `/v1/topup/info` | Topup info (chainId, vault, asset, domain) |
| `POST` | `/v1/topup/quote` | Issue a topup quote |
| `POST` | `/v1/topup/settle` | Settle a topup (X-PAYMENT header) |

### 2.6 Miscellaneous Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | `{ ok, ts }` |
| `GET` | `/v1/price` | `{ tonUsd, snapshot }` |
| `GET` | `/v1/quote/:id` | Retrieve a StoredQuote |
| `GET` | `/v1/stats` | Consume worker + ledger stats |
| `GET` | `/metrics` | Prometheus text format 0.0.4 |
| `GET` | `/v1/models` | `{ data: [{ id, type, display_name }] }` |
| `POST` | `/v1/messages/count_tokens` | `{ input_tokens }` (auth required) |
| `POST` | `/v1/estimate` | Free estimate. `{ model, inputTokens, maxOutputTokens, amountPton }` |

## 3. zod Schemas

### `MessagesReqSchema`

```ts
{
  model: string,
  messages: [{ role, content }] (minimum 1),
  max_tokens?: positive integer (default DEFAULT_MAX_TOKENS=1024),
  temperature?: number,
  tools?: unknown[],
  system?: string | unknown[],        // Anthropic top-level system
  stream?: boolean,
  metadata?: object,
  ...passthrough                      // Anthropic extension fields
}
```

Fields that Anthropic understands beyond this schema (`thinking`, `service_tier`, etc.) are forwarded through verbatim via `passthrough`.

### `PaymentPayloadSchema` (X-PAYMENT topup)

```ts
{
  x402Version: number,
  scheme: "exact",
  network: string,
  payload: {
    signature: { v: int, r: 0x+64hex, s: 0x+64hex },
    authorization: {
      from, to: 0x+40hex,
      value, validAfter, validBefore: string,    // BigInt → string
      nonce: 0x+64hex
    },
    topupId: 0x+64hex
  }
}
```

## 4. Error Matrix

| Condition | HTTP | Body type |
|---|---|---|
| Request schema failure | 400 | `invalid_request_error` |
| Unsupported model | 400 | `invalid_request_error` |
| Disallowed modifier | 400 | `invalid_request_error` |
| Auth failure | 401 | `authentication_error` |
| Insufficient credit (API key) | 402 | `insufficient_funds_error` |
| Insufficient credit (SIWE) | 402 | topup quote (x402) |
| Rate limit exceeded | 429 | `rate_limit_error` + `retry-after` |
| Upstream failure (reservation released) | 502 | `api_error` |
| Oracle failure | 503 | `overloaded_error` |

## 5. Credit Ledger

`CreditLedger` (`credits.ts`) — in-memory 3-way split:

```
onChainCredits == balance + reserved + accrued
```

| Operation | Effect |
|---|---|
| `setBalance(wallet, onChain)` | Initial hydration. `balance = onChain - (reserved + accrued)` |
| `credit(wallet, amount)` | Deposit. `balance += amount` |
| `reserve(wallet, maxCost)` | Reserve before call. `balance -= maxCost`, `reserved += maxCost` |
| `commit(wallet, reserved, actual)` | Confirm after call. `reserved -= reserved`, `balance += (reserved - actual)`, `accrued += actual` |
| `release(wallet, reserved)` | Release on failure. `reserved -= reserved`, `balance += reserved` |
| `markConsumed(wallet, amount)` | Batch consume complete. `accrued -= amount` |
| `applyWithdraw(wallet, amount)` | Withdrawal event. `balance -= amount` |

## 6. Consume Worker

`consumeWorker.ts`. Configuration:

| Constant | Default |
|---|---|
| `CONSUME_BATCH_MIN_PTON` | 0.5 PTON |
| `CONSUME_MAX_AGE_MS` | 300s (5 minutes) |
| `CONSUME_SCAN_INTERVAL_MS` | 30s |
| `CONSUME_MAX_PER_CYCLE` | 10 |
| `MAX_ATTEMPTS` | 3 |

Two triggers (OR logic):
- `accrued >= 0.5 PTON` (size threshold)
- `now - firstAccrualAt >= 5 minutes` (idle timeout)

On failure: 3 retries → dead-letter (exposed at `GET /v1/stats`).

## 7. Runtime Bootstrap

`main()` execution order:

1. Start banner — prints chainId, vault, pton, litellm, and pricing info.
2. `oracle.refresh()` — cold-start priming.
3. `setInterval(oracle.refresh, PRICE_REFRESH_INTERVAL_MS)` — background TWAP refresh.
4. `startConsumeWorker()` — scan on `CONSUME_SCAN_INTERVAL_MS` interval.
5. `startWithdrawWatcher()` — watch for `Withdrew` events.
6. `getUsageStore()` + `startUsageCleanupWorker()` — SQLite audit log.
7. Bytecode sanity check — confirms vault/pton code exists on chain.
8. `serve()` — Hono binding. `PORT` (default 3000).
9. `SIGINT`/`SIGTERM` → `stopConsumeWorker`, `stopWithdrawWatcher`, `consumeFlushNow`, `server.close()`.

## 8. Unit Tests

| File | Key coverage |
|---|---|
| `pricing.test.ts` | Model rate consistency, token estimation, cost calculation |
| `billing.test.ts` | `usdToPton` ceil-divide, `computeCharge` atto-margin precision |
| `rateLimit.test.ts` | Token-bucket algorithm (injectable clock) |
| `metrics.test.ts` | Prometheus text format validation |
| `streamCommit.test.ts` | Commit-once guarantee, usage fallback |
| `handleMessages.test.ts` | `/v1/messages` handler 12+ branches |
| `handleTopup.test.ts` | X-PAYMENT topup handling |
| `auth.test.ts` | SIWE login flow |
| `e2e.ts` | Full flow against real Anthropic API |
