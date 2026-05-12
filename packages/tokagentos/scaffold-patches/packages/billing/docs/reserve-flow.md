# Reserve Flow — `handleMessages.ts`

> Reference: `llm-api-gateway/proxy/src/handleMessages.ts` (543 lines, read 2026-05-11)
> Purpose: ASCII sequence diagram + key decisions + migration deltas for Phase 1 porting work.

---

## 1. Request Lifecycle Sequence Diagram

```
  CLIENT           MIDDLEWARE              HANDLER (handleMessages.ts)          UPSTREAM
    │                  │                            │                               │
    │ POST /v1/messages│                            │                               │
    │─────────────────>│                            │                               │
    │                  │  apiKeyResolve / rateLimit  │                               │
    │                  │─────────────────────────────>                               │
    │                  │                            │                               │
    │                  │                  [L:226-243] Parse body                    │
    │                  │                  MessagesReqSchema.parse(body)             │
    │                  │                  ↳ 400 on failure                         │
    │                  │                            │                               │
    │                  │                  [L:246-262] Model validation              │
    │                  │                  assertSupportedModel / assertNo...        │
    │                  │                  ↳ 400 on UnsupportedModel / Disallowed    │
    │                  │                            │                               │
    │                  │                  [L:264-295] Auth                          │
    │                  │                  resolveCallerIdentity(auth, x-api-key)    │
    │                  │                  ↳ 401 on failure                         │
    │                  │                            │                               │
    │                  │                  [L:303-317] Rate limit                    │
    │                  │                  callLimiter.consume("call:{wallet}")      │
    │                  │                  ↳ 429 + retry-after on exceeded           │
    │                  │                            │                               │
    │                  │                  [L:319-324] Optional X-PAYMENT topup      │
    │                  │                  if paymentHeader → handleTopup(...)       │
    │                  │                  ledger.credit(wallet, amount)             │
    │                  │                            │                               │
    │                  │                  [L:326-354] Estimate cost                 │
    │                  │                  detectCacheControl(parsed)               │
    │                  │                  estimateInputTokens(messages, tools, sys) │
    │                  │                  getTonUsd() ───────── TWAP oracle ────>   │
    │                  │                  ↳ 503 if oracle unavailable               │
    │                  │                  estimateMaxCostUsd(model, tokens, cache)  │
    │                  │                  quotedUsd = rawUsd * (1 + marginBps/10k)  │
    │                  │                  reserveAmt = usdToPton(quotedUsd, tonUsd) │
    │                  │                            │                               │
    │                  │                  [L:356-357] Hydrate balance               │
    │                  │                  hydrateBalance(wallet) → vault.credits()  │
    │                  │                  ledger.reserve(wallet, reserveAmt)        │
    │                  │                            │                               │
    │                  │         [L:368-437] Insufficient balance branch             │
    │                  │         need = reserveAmt - available                      │
    │                  │         topupBatch.popOne(wallet, need)                    │
    │                  │           ├─ if slot found: depositOnChain(auth, sig)      │
    │                  │           │  ledger.credit(wallet, auth.value)             │
    │                  │           │  markConsumed(nonce)                           │
    │                  │           │  re-try reserve                                │
    │                  │           └─ if no slot / reverted: markPoisoned / no-op   │
    │                  │         if still !ok:                                      │
    │                  │           API key → 402 insufficient_funds_error           │
    │                  │           SIWE    → 402 + topup quote (quoteStore.save)    │
    │                  │                            │                               │
    │          ┌───────────────── STREAM (parsed.stream === true) ─────────────────┐│
    │          │       [L:443-467] handleStreaming(...)                             ││
    │          │         ├─ on throw: ledger.release(wallet, reserveAmt) → 502     ││
    │          │         └─ delegates entirely to handleStream.ts                  ││
    │          │            [handleStream.ts, not read here]:                      ││
    │          │              POST upstream (stream:true)     ──────────────────>  ││
    │          │              SSE relay chunk-by-chunk        <──────────────────  ││
    │          │              absorbUsageFromEvent (accumulate)                    ││
    │          │              makeStreamCommit.once()                              ││
    │          │                → ledger.commit(wallet, reserveAmt, totalPton)     ││
    │          │                → consumeWorker: if accrued ≥ threshold → flush    ││
    │          └────────────────────────────────────────────────────────────────── ┘│
    │                            │                               │                   │
    │          ┌───────────────── UNARY ────────────────────────┐│                   │
    │          │       [L:469-498] callUpstream(body, headers)  ││                   │
    │          │         POST upstream (stream:false) ──────────>│                   │
    │          │         <── response ──────────────────────────>│                   │
    │          │       on throw: ledger.release → 502            ││                   │
    │          │       if upstream.status >= 400:                ││                   │
    │          │         ledger.release → forward error body     ││                   │
    │          │       [L:513-542] Commit                        ││                   │
    │          │         computeActualCostUsd(model, usage)      ││                   │
    │          │         computeCharge(actualUsd, tonUsd, margin)││                   │
    │          │         ledger.commit(wallet, reserveAmt, total)││                   │
    │          │         set response headers:                   ││                   │
    │          │           x-credits-balance, x-actual-pton,     ││                   │
    │          │           x-fee-pton, x-total-pton,             ││                   │
    │          │           x-reserved-released, x-pending-consume││                   │
    │          └───────────────────────────────────────────────── ┘│                   │
    │                            │                               │                   │
    │ 200 + body + billing hdrs <│                               │                   │
    │<─────────────────────────── ─────────────────────────────────────────────────  │
    │                                                                                 │
  (periodic, out-of-band)
    │
    │  consumeWorker (every 30s)
    │    ledger.pendingAccruals() → select wallets where accrued ≥ MIN or age ≥ MAX
    │    consumeCreditsOnChain(wallet, amount, batchId)
    │      vault.consumeCredits(...)  →  credits[wallet] -= amount (on-chain)
    │      ledger.markConsumed(wallet, amount)
```

---

## 2. Key Decisions Inside `handleMessages.ts`

| Decision | Location | Detail |
|---|---|---|
| **Cache-control detection** | L:327 `detectCacheControl(parsed)` | Returns `{ has: boolean; ttl: "5m" \| "1h" }`. The `"1h"` TTL tier is used when Anthropic `cache_control` blocks are present in the request; this affects both `estimateMaxCostUsd` (lower cap because cache hit reduces output cost) and `computeActualCostUsd` (cache-read vs cache-write rates differ). |
| **Input-token estimation gate** | L:328 `estimateInputTokens(messages, tools, system)` | Pure heuristic in `pricing.ts:267-354`. Used to compute `reserveAmt`. If the heuristic underestimates significantly, actual tokens > estimate → `totalPton > reserveAmt` → commit pulls from balance. No 402 protection against this; the contract's `consumeCredits` is the floor. |
| **USD→PTON conversion timing** | L:354 `usdToPton(quotedUsd, tonUsd)` | `tonUsd` is fetched fresh from the TWAP oracle immediately before `usdToPton` (L:332–344). Not cached per-request — if the oracle fetch fails, a 503 is returned without any reservation. The TWAP cache (`twap.ts`) provides a stale fallback up to `MAX_PRICE_STALENESS_MS`. |
| **Reservation amount choice** | L:353 `quotedUsd = rawUsd * (1 + effectiveMarginBps/10000)` | The *maximum* estimated cost (including margin) is reserved, not the most-likely cost. `reserveAmt` covers the worst-case scenario (all output tokens consumed + full margin). Over-reservation is refunded at commit via `released = reserveAmt - totalPton` (written to `x-reserved-released`). |
| **Commit-once latch** | Streaming: via `makeStreamCommit` (in `streamCommit.ts`), referenced at L:447–466. Unary: direct call at L:526 `ledger.commit(...)` | For streaming, commit fires once exactly — either on `message_stop` event from the SSE stream, or on stream-end fallback. If the SSE pump is interrupted before `message_stop` arrives, a fallback in `streamCommit.ts` uses the estimated cost. For unary there is no latch — `ledger.commit` is called at L:526 exactly once in the happy path. |
| **Error / abort paths — how reservation is released** | Streaming throw: L:452 `creditLedger.release(wallet, reserveAmt)`. Unary throw: L:487 same. Upstream 4xx: L:503–510 same. | All error paths call `ledger.release` before returning. There is no cleanup timer — if the process crashes after reserve but before release, the in-memory reservation is lost and the wallet's `reserved` balance leaks until a restart rehydrates from chain. |
| **Auto-topup path** | L:368–404 | Only executes when `reserveResult.ok === false`. Pops the first viable pre-signed EIP-3009 slot from `topupBatch`. If `depositOnChain` rejects, the slot is `markPoisoned` (never retried). The entire auto-topup round adds one on-chain round-trip latency to the request path. |

---

## 3. Migration Deltas vs Target

When porting to tokagentos's `runtime.useModel` abstraction, the following behaviors **must change** or require explicit adapter logic:

| Delta | Source behavior | Required change in target |
|---|---|---|
| **Commit-once latch (plan §B3)** | `makeStreamCommit` wraps the raw `Response.body.getReader()` SSE pump in `handleStream.ts`. The latch fires when the internal `ReadableStream` drains or on `message_stop` event. | In target, `runtime.useModel(TEXT_LARGE, params)` abstracts the streaming interface — the raw `getReader()` is never exposed. The commit closure (plan §C4 `commit()` primitive) must hook into whatever completion signal `runtime.useModel` exposes: either a returned `AsyncIterable<chunk>` exhaustion, or a `onComplete` callback in the plugin interface. The latch itself (`makeStreamCommit`'s `once` wrapper) is portable; only its trigger-point changes. |
| **Reserve/release/commit primitives (plan §C4)** | All three are in-memory Map mutations on `CreditLedger`. Atomic within the same Node event loop tick. No serialization needed. | Target's ledger is DB-backed (Drizzle + Postgres). Each primitive must execute inside a `SERIALIZABLE` transaction (or PGLite advisory lock). The function signatures from `credits.ts` are preserved, but their bodies become async DB calls. Callers in the ported `handleMessages`-equivalent middleware must `await` them. |
| **`callUpstream` DI slot** | In `handleMessages.ts` (L:83-90), `callUpstream` is an injected dependency — a function that accepts `(body, opts)` and returns `{ status, body, forwardHeaders }`. In production it is wired to `callAnthropic` from `llm.ts`. | In target, this slot is replaced by `runtime.useModel(modelType, params)`. The billing gate middleware (`billing-gate.ts`) must pass a `commit` closure **into** the request context (`req.locals`) before `runtime.useModel` is called by the downstream route handler. The commit closure must be called by the post-processing middleware, not the route itself. |
| **Synthetic Anthropic error envelopes** | `anthropicError(c, status, type, message)` (L:118-122) produces Anthropic-shaped error bodies for all billing errors (402, 429, 503). | Target's plugin layer already produces compatible error shapes for LLM errors. Billing-specific errors (402 insufficient funds, 402 topup quote, 429 rate limit) should use the `{type: "billing_error", code, message}` shape documented in `packages/billing/docs/errors.md`. The existing tokagentos `error(res, msg, status)` helper from `http-helpers.ts` is the right primitive. |
| **`x-credits-balance` + billing response headers** | Set at L:529-535 via `c.header(...)` after unary commit; streaming equivalent in `handleStream.ts`. | These headers must be added by the post-processing middleware on the way out, after the commit closure fires. They are not part of `runtime.useModel`'s response contract — they are billing decorations appended to whatever the provider returned. |
| **Oracle 503 escape hatch** | L:332-344: if `getTonUsd()` throws, handler returns 503 immediately before any reservation. | Preserve this escape hatch in the billing gate. `BILLING_FIXED_TON_USD` config override (plan config §Config consolidation) allows bypassing the oracle in tests and local dev. |
