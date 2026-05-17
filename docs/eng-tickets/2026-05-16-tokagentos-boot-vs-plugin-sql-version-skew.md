# Tokagentos boot blocked by `@elizaos/plugin-sql@1.7.2` interface skew

**Status**: Open — blocks any HTTP-server-dependent runtime work (chat, dashboard, billing's `/v1/messages` route)
**Severity**: P1 — agent runtime cannot serve requests
**Filed**: 2026-05-16
**Discovered during**: mainnet rollout of the billing plugin (see `mainnet-deployment.md`)

---

## TL;DR

`packages/agent/src/runtime/tokagent.ts` and `packages/typescript/src/runtime.ts` are built against a richer database-adapter interface than `@elizaos/plugin-sql@1.7.2` (the only currently-installable version) implements. The agent crashes during `initialize()` before the HTTP server starts listening on port 2138. Symptoms appear at **at least four distinct layers**; a generic adapter Proxy shim unblocks three of them, the fourth is a schema-column gap and is not shim-able.

The billing plugin (`@tokagent/plugin-tokagent-billing`) and its Neon backing DB are unaffected — they own their own pg.Pool — but the chat e2e through tokagentos can't run until this is resolved.

---

## What works today (so we know what NOT to break)

- **Mainnet contracts** PTON `0x00D1EDcE8E7c617891FF76224DFf501c568f1Ce0` and ClaudeVault `0x1072f70e7c490E460fA72AC4171F7aDD1ef2d79F` are deployed, verified on Etherscan, and exercised end-to-end via the source `llm-api-gateway/proxy` (which uses better-sqlite3, sidesteps tokagentos entirely).
- **Billing plugin against Neon**: `scripts/billing-boot-smoke.ts` runs in ~800ms — 8 `billing_*` tables created, 3 Drizzle migrations applied, TWAP read succeeds, all 4 workers start, dispose clean. Run with `bun run scripts/billing-boot-smoke.ts` from the repo root.
- **TWAP probe**: `bun run --cwd packages/billing probe-twap` returns TON/USD against live mainnet Uniswap pools.

Anything that depends only on the billing plugin's surface (not the host agent runtime) is solid.

---

## Reproduction

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
# .env is already set with mainnet contracts + Neon URL + LiteLLM key
LOG_LEVEL=info bun run packages/app-core/src/entry.ts start
```

Boot reaches `billing plugin initialized — BILLING_ENABLED=true`, then proceeds into agent runtime initialize() and dies before the API server listens. Port 2138 stays closed.

---

## The four walls (and which we've patched)

Each wall surfaced as the previous one was fixed. The path is:
plugin pre-register → agent runtime initialize → `ensureAgentExists` → `ensureRoomExists` → schema compat check.

### Wall 1 — Missing batch-read methods on the adapter ✅ patched

**Symptom**:
```
TypeError: this.adapter.getAgentsByIds is not a function
TypeError: this.adapter.getWorldsByIds is not a function
```

**Root cause**: `packages/typescript/src/runtime.ts` calls plural batch reads (`getAgentsByIds`, `getWorldsByIds`, `getEntitiesByIds`, …) but `@elizaos/plugin-sql@1.7.2` only ships singular forms (`getAgent`, `getWorld`, `getEntity`).

**Patch**: a JS Proxy wrapper in `runtime.ts` `wrapAdapterWithCompatShim()` that routes plural `get*ByIds([ids])` to `Promise.all(ids.map(getX))` when a matching singular method exists.

### Wall 2 — Bulk-write upsert returning no-op ✅ patched

**Symptom**:
```
Error: Failed to retrieve agent after upsert: 563fa9cb-0557-0793-a81e-f72e8386310f
```

**Root cause**: `runtime.ts:7341` calls `this.adapter.upsertAgents([agentToUpsert])`. The adapter has no `upsertAgents` (or `upsertX` in general). My initial shim returned `[]` as a default, then the immediate `getAgentsByIds([agent.id])` read returned null → throw.

**Patch**: extended the Proxy to recognise `upsert<X>s` / `create<X>s` patterns and route them to singular `createX(item, ...rest)` per element. `upsert` swallows "already exists" errors as no-op.

### Wall 3 — Plural method name mismatch ✅ patched

**Symptom**:
```
Error: Failed to add agent ... as participant to its own room
```

**Root cause**: `runtime.ts:1733` calls `createRoomParticipants(entityIds, roomId)`. Adapter has `addParticipantsRoom(entityIds, roomId)` — different verb, same signature.

**Patch**: explicit `ADAPTER_METHOD_ALIASES` table in the shim. Currently one entry; will grow as more divergent names surface.

### Wall 4 — Database schema columns missing ❌ NOT patched

**Symptom**:
```
Error: [sql-compat] Missing required column "trajectories"."step_count"
  (integer NOT NULL DEFAULT 0). Run the appropriate database migrations
  before starting the app.
```

**Root cause**: `@elizaos/plugin-sql@1.7.2`'s bundled migrations don't create the `trajectories.step_count` column. The runtime's `[sql-compat]` checker validates schema shape against runtime expectations and refuses to continue.

Plugin-sql logged `"No changes detected, skipping migration (pluginName=@elizaos/plugin-sql, hash=0837c648...)"` on boot — its hash thinks it's up to date, but the runtime disagrees.

**Why this isn't shim-able**: the gap is at the SQL schema layer, not the JS method layer. Compat checker reads `information_schema.columns` directly and won't be fooled by a Proxy.

**Worth noting**: there may be other column gaps below this one. We've only confirmed `trajectories.step_count` because that's the column the runtime checks first.

---

## Root cause (single sentence)

**`@elizaos/plugin-sql@1.7.2` is the most recent installable version that Bun can resolve, but `packages/typescript/src/runtime.ts` and `packages/agent/src/runtime/tokagent.ts` are built against an unreleased / private newer version of the adapter interface — both methods and schema.**

This is a packaging / dependency issue, not a billing or contract issue.

---

## Recommended fix paths, ranked

### Option A — Fix forward: handwrite migrations to add the missing columns

**Effort**: medium (hours, possibly a day)
**Risk**: low — additive schema changes
**Steps**:
1. Boot tokagentos with auto-shim active. Iterate: each `[sql-compat]` error names one missing column.
2. For each, write a Drizzle migration in a new `packages/agent/src/migrations/<plugin>/00NN_compat_*.sql` that adds the column.
3. Wire it into plugin-sql's migration discovery (or run them out-of-band via `bun run migrate`).
4. Repeat until the compat checker is satisfied and boot completes.
5. Keep the adapter Proxy shim in `runtime.ts` — it's still needed for method gaps.

This is what tokagentos's own runbook (`docs/superpowers/specs/2026-05-04-litellm-provider-integration-design.md`) implicitly assumes — that adapter columns can be re-aligned via DB migrations.

### Option B — Upgrade `@elizaos/plugin-sql` to 2.0.0-beta.1

**Effort**: small to large, depending on what breaks
**Risk**: medium-high — we tried this once and hit `Cannot find module '@elizaos/plugin-sql' from .../tokagent.ts`. The 2.0.0-beta.1 has an `exports`/`module` layout that doesn't resolve under Bun 1.3.14 + our workspace.

**Steps if you take this path**:
1. Re-add the override:
   ```jsonc
   "overrides": { "@elizaos/plugin-sql": "2.0.0-beta.1" }
   ```
2. Investigate the resolution failure. Likely candidates:
   - The package's `main` field is `src/dist/index.js` but Bun is looking at `node:` export. Verify the exports map handles Bun's resolver correctly.
   - There may need to be a postinstall script that rebuilds the package's TS source.
3. Once resolved, the runtime methods should match — no shim needed.
4. Revert `wrapAdapterWithCompatShim` and the `ADAPTER_METHOD_ALIASES` in `runtime.ts`.

### Option C — Patch the runtime to call only what 1.7.2 provides

**Effort**: large (engineering rewrite)
**Risk**: medium — touches the core runtime; could ripple
**Steps**: edit `packages/typescript/src/runtime.ts` to use singular `getAgent` / `getWorld` / etc. directly, drop `upsertAgents` in favor of an explicit `getAgent → updateAgent || createAgent` dance, etc. Mirrors the v1.x adapter interface from above.

Don't recommend — it's writing tokagentos backwards.

### Option D (escape hatch) — Bypass the sql-compat check

**Effort**: tiny
**Risk**: high — the check exists for a reason; bypassing it lets the agent start but at runtime it'll crash on queries that touch the missing columns

```ts
// packages/agent/src/services/sql-compat.ts or equivalent
if (process.env.TOKAGENT_SKIP_SQL_COMPAT === "1") {
  log.warn("SQL compat check bypassed — runtime queries against missing columns will crash");
  return;
}
```

**Use only** for "I just need the HTTP server to listen so I can probe routes" debugging. Don't ship.

---

## Files touched by the shim work (revert path if Option B succeeds)

| File | What was changed | Revert cost |
|---|---|---|
| `packages/typescript/src/runtime.ts` | Added `wrapAdapterWithCompatShim()` function (~110 lines, above `class AgentRuntime`) and replaced `registerDatabaseAdapter` body to wrap the adapter through it. Also added `ADAPTER_METHOD_ALIASES` lookup table. | ~115 LoC; clean revert via git |
| `packages/agent/package.json` | Added `@elizaos/plugin-agent-skills: 2.0.0-alpha.537` and `@tokagent/plugin-tokagent-billing: workspace:*` to `dependencies`. | Keep — both are needed regardless |
| Root `package.json` | Added `@ai-sdk/anthropic: 3.0.71` override (fixed nested-anthropic-2.0.79 resolution). Removed `@elizaos/plugin-sql: 2.0.0-beta.1` override after it failed to resolve. | Keep the anthropic override |
| `packages/agent/src/runtime/core-plugins.ts` | Added `@tokagent/plugin-tokagent-billing` to `CORE_PLUGINS`. | Keep |
| `tokagentos/.env` and `~/.tokagent/config.env` | `BILLING_DATABASE_URL` pointed at Neon. Docker-pg backups at `.docker-pg.bak.<ts>`. | Keep |
| Bun version | Globally upgraded 1.2.21 → 1.3.14 (1.2.21 segfaulted on workspace resolution). | Keep |

---

## Test plan once Option A or B lands

1. **Boot smoke**: `bun run packages/app-core/src/entry.ts start` should reach `API server listening on http://0.0.0.0:2138` (or equivalent) without error.
2. **Plugin lifecycle**: `tokagent-billing` plugin must still init cleanly against Neon (we already proved this).
3. **Health check**: `curl http://localhost:2138/healthz` returns 200.
4. **Route mount**: `curl http://localhost:2138/v1/auth/nonce -X POST -d '{"wallet":"0x..."}'` returns a 200 with EIP-712 envelope (proves the billing plugin's routes are reachable through the agent HTTP server).
5. **End-to-end billable chat**: from the existing `apps/app-companion` or via a hand-built fetch in a test, send a `/v1/chat/completions` with an `sk-ai-*` key. Verify a row appears in `billing_call_log` on Neon.
6. **Regression**: re-run the 4 unit-test suites we have passing now — `packages/billing` rates (22), `packages/billing` schema (16), `plugin-tokagent-billing` plugin (216, modulo 2 pre-existing unrelated nonce-test failures), `app-core` x402-send (7).

---

## Open questions for the assignee

1. **Where does the v2-shape adapter interface come from?** Is there a private fork of `@elizaos/plugin-sql` somewhere in Tokamak's infra? If so, publish it (or vendor it).
2. **Is the runtime's expected schema documented anywhere?** A list of expected columns per table would let us write the additive migrations in one pass rather than discovering them one error at a time.
3. **Was tokagentos's runtime ever booted successfully in this repo's current state?** Check git history: was there a known-good Bun + plugin-sql combo before this regression?
4. **Should billing plugin keep its own DB (Neon) or join PGLite?** Today it's separate by design — billing has financial-loss exposure that PGLite's single-file model can't back. Worth confirming with the security/ops owner.

---

## Adjacent context

- **Mainnet deploy doc**: `llm-api-gateway/docs/mainnet-deployment.md`
- **Mainnet runbook**: `llm-api-gateway/docs/mainnet-launch-runbook.md`
- **x402 chat-fallback recipe** (waits on this ticket): `packages/app-core/src/lib/X402_INTEGRATION_RECIPE.md`
- **Billing plugin boot smoke**: `scripts/billing-boot-smoke.ts`
- **TWAP probe**: `bun run --cwd packages/billing probe-twap`
- **Integration plan** (pre-mainnet): `docs/superpowers/specs/2026-05-11-llm-api-gateway-integration-plan.md`
- **Adapter shim**: search `wrapAdapterWithCompatShim` in `packages/typescript/src/runtime.ts`

---

## Closing note

The shim approach taught us this is **fundamentally a packaging problem**, not a logic problem. The runtime is correct, the adapter we have is older. The right fix is to align the two — either pull plugin-sql forward (Option B) or pin migrations to fill the schema gaps (Option A). The current shim should be considered a development-only bridge; **it must not ship to production** because silent no-ops on the methods we haven't reached yet will mask real bugs.

If you're picking this up, start by running the reproduction above with `LOG_LEVEL=debug` — the shim emits debug logs every time it intercepts a missing method, which gives a complete inventory of what the v1.7.2 adapter is missing.
