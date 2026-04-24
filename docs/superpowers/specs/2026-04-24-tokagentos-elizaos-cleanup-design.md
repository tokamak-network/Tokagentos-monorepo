# TokagentOS elizaOS Legacy Cleanup — Design

**Date:** 2026-04-24
**Scope:** `tokagentos/` subtree only (the elizaOS fork). Does not touch sibling projects in the Tokamak-AI-Layer monorepo.
**Status:** Approved for plan-writing.

## 1. Purpose

TokagentOS is a fork of elizaOS restyled for Tokamak. The fork currently inherits almost the entire elizaOS surface area — 17 apps (mostly game integrations), 15 Capacitor native-plugin bridges, 30+ plugin submodules, a managed-cloud subsystem ("Eliza Cloud"), and assorted language bindings. The Tokagent product needs roughly 10% of this surface.

This cleanup prunes the fork down to what the Tokagent product actually uses, while preserving mergeability with upstream elizaOS for the files we still share.

## 2. Non-Goals

- Modernizing the wallet model beyond env-var signing.
- Renaming `@elizaos/plugin-*` imports to `@tokagentos/plugin-*`.
- Fixing bugs in `plugin-tokagent-*` or adding new tests.
- Touching anything outside `tokagentos/` (the Tokamak-AI-Layer monorepo has sibling projects that stay untouched).

## 3. Target Product Shape

TokagentOS post-cleanup is a web-only, dual-mode agent framework for on-chain DeFi strategies on HyperEVM, Polygon, and Polymarket.

**Runtime modes**, selected by `TOKAGENT_EXECUTION_MODE`:
- `daemon` — headless; `StrategyRunnerService` ticks, actions execute via env-configured wallets. No UI served.
- `operator` — boots daemon + serves the local React UI on `SERVER_PORT`.

**Operator UI tabs** (already defined by scaffold-patches): Chat / Automations / Wallet / Settings. No Eliza Cloud badge, no billing or provisioning surface.

**Wallet model:** `OPERATOR_PRIVATE_KEY` + `VAULT_ADDRESS_*` + `RPC_*` per chain, all in `.env`. No SIWE binding, no cloud relay.

**Platform target:** web only. No mobile, no desktop bundle, no Capacitor.

## 4. What Is Kept

### In-tree plugins (Tokagent-authored)
- `plugin-tokagent-shared` — vault bindings, chain config, protocol packs, wallet helper.
- `plugin-tokagent-strategy` — strategy engine + `StrategyRunnerService`.
- `plugin-tokagent-perps` — Hyperliquid perps on HyperEVM.
- `plugin-tokagent-polymarket` — Polymarket prediction markets.
- `plugin-tokagent-yield` — Aave v3 on Polygon.

### Required runtime infrastructure (submodules)
- `plugin-sql`, `plugin-agent-skills`, `plugin-evm`, `plugin-pdf`, `plugin-local-embedding`.

### Optional, env-gated (submodules)
- **AI providers:** `plugin-{anthropic,openai,openrouter,groq,ollama,local-ai,google-genai}`.
- **Messaging channels:** `plugin-{telegram,discord,twitter,whatsapp,signal,wechat,bluebubbles,imessage}`.

### Core packages
- `packages/tokagentos` — CLI (contains its own `templates/fullstack-app/` and `templates/plugin/` used by `tokagentos create`).
- `packages/agent` — headless agent runtime.
- `packages/app-core` — operator UI (Capacitor removed).
- `packages/typescript` — `@tokagentos/core`.
- `packages/ui`, `packages/shared`, `packages/schemas`.
- `packages/templates` — upstream-shared template source (kept only if still used by the CLI at scaffold time; else consolidate into `packages/tokagentos/templates/`. Decided in Phase 5).

## 5. What Is Removed

### 5a. Deleted outright (`git rm`)

**Submodules:**
- `cloud/` — managed hosting backend.
- `steward-fi/` — unrelated DeFi SDK.

**Directories:**
- `packages/native-plugins/` (all 15 Capacitor bridges).
- 16 of 17 `apps/*` (17th, `app-companion`, gated by Phase 1 investigation — see †): `app-2004scape`, `app-babylon`, `app-browser`, `app-clawville`, `app-companion`†, `app-defense-of-the-agents`, `app-form`, `app-hyperscape`, `app-knowledge`, `app-lifeops`, `app-scape`, `app-shopify`, `app-steward`, `app-task-coordinator`, `app-tokagentmaker`, `app-training`, `app-vincent`.
- `packages/{benchmarks,examples,scenario-runner,scenario-schema,prompts,interop,python,rust,skills,docs,plugin-hiveexchange}`.

† `app-companion` deletion is gated by a Phase 1 investigation: if the Chat tab depends on it, keep it; otherwise delete. See §8.

**Files:**
- `packages/agent/src/api/cloud-*.ts` (~10 route files).
- `packages/app-core/src/components/cloud/`.
- `packages/app-core/src/runtime/ensure-text-to-speech-handler.ts` (edge-tts dependency).
- `foo.json` (stray file at root).

### 5b. Submodule-removed (`.gitmodules` + `git rm`)

Plugins with no use in the Tokagent product:
`plugin-shell`, `plugin-executecode`, `plugin-computeruse`, `plugin-github`, `plugin-music-library`, `plugin-music-player`, `plugin-edge-tts`, `plugin-calendly`, `plugin-solana`, `plugin-cli`, `plugin-commands`, `plugin-cron`, `plugin-agent-orchestrator`, `plugin-elizacloud`.

## 6. In-Place Edits

These files are upstream-derived but have diverged and must be modified in place. Prefer scaffold-patch mechanism where it already exists; otherwise direct edit.

| File | Change |
|------|--------|
| `packages/agent/src/runtime/tokagent.ts` | Delete imports/wiring for `app-lifeops`, `app-tokagentmaker`, `plugin-elizacloud`. Delete `TOKAGENTOS_CLOUD_ENABLED` branch. |
| `packages/agent/src/config/plugin-auto-enable.ts` | Delete `TOKAGENTOS_CLOUD_*` env branches. Delete auto-enable entries for any removed submodule. Keep `ENABLE_EVM_PLUGIN`. |
| `packages/agent/src/runtime/plugin-collector.ts`, `core-plugins.ts`, `release-plugin-policy.ts` | Remove every `plugin-elizacloud` reference. |
| `packages/agent/src/api/server.ts` (or wherever routes mount) | Remove registrations of deleted `cloud-*` routes. |
| `packages/app-core/src/navigation/index.ts` | Confirm scaffold-patch still shows Chat + Automations + Wallet + Settings. |
| `packages/app-core/src/` | Grep + excise `CloudStatusBadge`, "Eliza Cloud", "managed hosting", cloud-status strings. |
| `.env.example` (root + template) | Keep in sync. Only vars the product reads. Documented sections: Server / DB / Execution mode / AI provider / Operator wallet / Per-chain vault & RPC / Channel providers (optional). |
| `packages/tokagentos/templates/fullstack-app/` | Project template must match cleanup. Remove cloud/billing/steward/mobile references. `package.json` workspace deps reflect kept plugins. |
| `packages/tokagentos/scaffold-patches/` | Re-audit. Delete patches targeting deleted files. |
| `packages/tokagentos/src/commands/create.ts` | Confirm no cloud flows. Provider prompt lists only kept providers. Writes env file from template. |
| `turbo.json`, `lerna.json`, root `package.json` `workspaces` | Remove filter exclusions and workspace entries for deleted packages. |
| `scripts/plugin-submodules-dev.mjs` | Update managed-submodule list. |
| `knip.json`, `biome.json` | Update globs to match new layout. |
| `tsconfig.json`, `tsconfig.base.json` | Remove references to deleted dirs. |

Role gating in `packages/agent/src/runtime/plugin-role-gating.ts` is **not** simplified in this cleanup — it is a behavior change, deferred.

## 7. Architecture Post-Cleanup

```
tokagentos/
├── packages/
│   ├── tokagentos/               # CLI (create | start | info | version)
│   ├── agent/                    # headless agent runtime
│   │   └── src/
│   │       ├── runtime/tokagent.ts       # cloud branches deleted
│   │       ├── api/                      # cloud-*.ts deleted
│   │       └── config/plugin-auto-enable.ts
│   ├── app-core/                 # operator UI (Capacitor removed)
│   │   └── src/
│   │       ├── navigation/               # Chat+Automations+Wallet+Settings
│   │       └── components/               # cloud/ deleted
│   ├── typescript/               # @tokagentos/core
│   ├── ui/  shared/  schemas/  templates/
│
├── plugins/
│   ├── plugin-tokagent-shared
│   ├── plugin-tokagent-strategy
│   ├── plugin-tokagent-perps
│   ├── plugin-tokagent-polymarket
│   ├── plugin-tokagent-yield
│   ├── plugin-sql, plugin-agent-skills, plugin-evm, plugin-pdf, plugin-local-embedding
│   ├── plugin-{anthropic,openai,openrouter,groq,ollama,local-ai,google-genai}
│   └── plugin-{telegram,discord,twitter,whatsapp,signal,wechat,bluebubbles,imessage}
│
└── .env.example                  # only vars the product reads
```

No `cloud/` dir. No `steward-fi/` dir. No `apps/` dir (or only `app-companion` if investigation keeps it). No `packages/native-plugins/`.

## 8. Phased Execution

Each phase lands as a separate PR. Each phase leaves a working build. Each phase ends with the Per-Phase Gate (§9a).

### Phase 0 — Baseline & Safety Net (~0.5 day, no risk)
- Tag: `git tag pre-cleanup`.
- Record Phase-0 baseline: `bun install && bun run build && bun test`; note which targets pass/fail today.
- Snapshot: `du -sh packages/ plugins/ apps/`, `bun pm ls --filter '*' | wc -l`.
- Branch: `cleanup/remove-eliza-legacy` from `feat/tokagentos-fork`.

**Exit:** baseline recorded, branch + tag exist.

### Phase 1 — Apps & Native-Plugins (~1 day, low risk)
- **Investigation first:** grep for `app-companion` imports outside `packages/agent/src/runtime/tokagent.ts`. If only that file imports it → delete. If UI depends on it → keep and document.
- Unwire `app-lifeops` and `app-tokagentmaker` from `tokagent.ts`.
- `git rm -r apps/*` (respecting the app-companion decision).
- `git rm -r packages/native-plugins/`.
- Update root `package.json` workspaces and `turbo.json` filters.
- Per-Phase Gate.

**Exit:** build green, ~30 fewer workspaces.

### Phase 2 — Cloud Surface (~1 day, medium risk)
- `git rm packages/agent/src/api/cloud-*.ts`.
- Remove cloud route registrations from `server.ts`.
- `git rm -r packages/app-core/src/components/cloud/`.
- Grep-excise `elizacloud`, `eliza cloud`, `ElizaCloud`, `TOKAGENTOS_CLOUD`, `CloudStatusBadge` across repo.
- Remove `TOKAGENTOS_CLOUD_*` branches from `tokagent.ts`, `plugin-auto-enable.ts`, `plugin-collector.ts`, `core-plugins.ts`, `release-plugin-policy.ts`.
- Expand grep to `packages/app-core/src/{providers,context,hooks,layouts}/` for less-obvious couplings.
- `git submodule deinit cloud && git rm cloud`; same for `steward-fi`. Update `.gitmodules`.
- Per-Phase Gate + Runtime Smoke Tests (§9b).

**Exit:** no file references Eliza Cloud or managed-cloud APIs; build green; both runtime modes boot clean.

### Phase 3 — Plugin Submodule Removal (~0.5 day, low risk)
- For each plugin in §5b: remove workspace dep from `package.json`s, remove imports from `packages/agent/src/**` and `packages/app-core/src/**`, `git submodule deinit` + `git rm`, update `.gitmodules`.
- Special cases:
  - `plugin-edge-tts`: delete `ensure-text-to-speech-handler.ts` and stub its callsite first.
  - `plugin-agent-orchestrator`: unwire from `tokagent.ts` and `api/server.ts` compat shim first.
- Per-Phase Gate + Runtime Smoke Tests.

**Exit:** 14 fewer submodules; build green; workspace count drops again.

### Phase 4 — Irrelevant Packages (~0.5 day, low risk)
- `git rm -r packages/{benchmarks,examples,scenario-runner,scenario-schema,prompts,interop,python,rust,skills,docs,plugin-hiveexchange}`.
- Update root `package.json` workspaces, `turbo.json` filter exclusions, `tsconfig.json` references.
- Per-Phase Gate.

**Exit:** ~11 fewer workspaces; `bun install` meaningfully faster.

### Phase 5 — Scaffold & Env Surface (~1 day, medium risk)
- Rewrite root `.env.example` to match product behavior, with section headers + inline comments + safe defaults. Sections: Server / DB / Execution mode / AI provider / Operator wallet / Chain vault addresses / Chain RPC / Optional channels.
- Clone into `packages/tokagentos/templates/fullstack-app/.env.example`; enforce sync via a scripts helper.
- Audit `packages/tokagentos/src/commands/create.ts`: no cloud flows; provider list reflects kept providers; writes env from template.
- Audit every `scaffold-patches/` entry: delete patches targeting deleted files.
- Update `scripts/plugin-submodules-dev.mjs`, `knip.json`, `biome.json`, tsconfigs.
- Per-Phase Gate + Runtime Smoke Tests + CLI Scaffold Smoke Test (§9c).

**Exit:** clean scaffold works end-to-end from a fresh dir; env surface matches product behavior.

### Phase 6 — Scrub & Normalize (~0.5 day, no risk)
- Grep the tree for `eliza`, `ElizaOS`, `elizaOS`, `@elizaos` outside permitted files (LICENSE, NOTICE.md, .gitmodules, attribution comments, this spec). Triage each.
- Remove dead TODOs referencing deleted features.
- Update `README.md` to reflect product shape, not upstream fork status.
- (Optional) Squash cleanup commits into one chore commit for clean history.
- Grep-Based Tripwires (§9d).

**Exit:** repo is idiomatically Tokagent-branded; size/complexity targets recorded in PR description.

### Total Budget

~5 focused days, six PRs.

## 9. Validation

### 9a. Per-Phase Gate (after every phase)

| Check | Command | Pass Condition |
|-------|---------|----------------|
| Install | `rm -rf node_modules && bun install` | Exit 0, no "package not found" warnings |
| Build | `bun run build` | Exit 0; no *new* failures vs. Phase 0 baseline |
| Typecheck | `bun run typecheck` | Exit 0 |
| Lint | `bun run lint:check` | Exit 0 |
| Test | `bun run test` | Same pass count as Phase 0 baseline |
| Workspace count | `bun pm ls --filter '*' \| wc -l` | Monotonic decrease since previous phase (except 0 and 6) |

### 9b. Runtime Smoke Tests (after Phases 2, 3, 5)

**Daemon mode:**
```bash
TOKAGENT_EXECUTION_MODE=daemon ANTHROPIC_API_KEY=... OPERATOR_PRIVATE_KEY=... \
RPC_HYPEREVM=... VAULT_ADDRESS_HYPEREVM=... bun run start
```
Pass: boots without "Cannot find module", no cloud-relay errors, `StrategyRunnerService` logs its first tick within 30s.

**Operator mode:**
```bash
TOKAGENT_EXECUTION_MODE=operator (...same env...) bun run start
```
Open `http://localhost:3000`. Pass: four tabs render (Chat / Automations / Wallet / Settings), Wallet shows operator address, no "Eliza Cloud" text, no cloud-route 404 in console. Ask in Chat: "what strategies are running?" — structured answer from `activeStrategies` provider.

**Strategy lifecycle (Phase 5):**
```
deploy tokagent vault
start strategy yield-auto-compound on polygon with 100 USDC
list strategies
stop strategy <id>
```
Pass: each action returns structured response, state persists across agent restart.

### 9c. CLI Scaffold Smoke (Phase 5 gate)

```bash
cd /tmp && rm -rf my-agent
bun link tokagentos  # from packages/tokagentos
tokagentos create my-agent --provider anthropic
cd my-agent && bun install && bun run build && bun run start
```
Pass: no resolver errors, no missing-package failures, builds, starts in both modes.

### 9d. Grep-Based Tripwires (Phase 6 gate)

Zero hits outside permitted files (LICENSE, NOTICE.md, .gitmodules, upstream-attribution comments, this spec):

```bash
git grep -i "eliza cloud"
git grep -i "CloudStatusBadge"
git grep -i "TOKAGENTOS_CLOUD_"
git grep -iE "elizacloud|@elizaos/plugin-elizacloud"
git grep -l "cloud-billing\|cloud-provisioning\|cloud-relay\|cloud-routes"
git grep -l "native-plugin-entrypoints"
git grep -l "app-2004scape\|app-babylon\|app-clawville\|app-hyperscape"
```

### 9e. Size / Complexity Targets

Recorded in final PR description. Not hard gates.

- `du -sh packages/ plugins/ apps/` → ~40–50% reduction vs. Phase 0.
- `bun pm ls --filter '*' | wc -l` → ~50+ fewer workspaces.
- `time bun install` → meaningfully faster (drops Capacitor, llama.cpp, game deps).
- `.gitmodules` entries → down by ~15.

### 9f. Definition of Done

1. All six phases merged.
2. Grep tripwires (§9d) all return zero.
3. Both runtime modes boot clean.
4. CLI scaffold smoke test passes.
5. README updated to reflect product shape.
6. Size/complexity targets recorded.
7. `pre-cleanup` tag preserved for rollback (retain for 1–2 months).

## 10. Risks & Mitigations

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Runtime wiring in `tokagent.ts` is tighter than grep shows — wrong delete causes "Cannot find module" at boot. | Smoke-test after every edit to this file. Phase 1 + 2 gates both include runtime boot. |
| 2 | Scaffold-patch drift as upstream changes. | Prefer adding new patches over modifying existing ones. Keep patches minimal. |
| 3 | A "clearly unused" package turns out to be transitively required. | Before each delete-heavy phase, `bun pm ls` to check reverse-deps. Don't batch phases into one commit. |
| 4 | CLI template references a workspace package we removed. | Phase 5's scaffold smoke test is the gate. Don't merge Phase 5 until it passes. |
| 5 | `turbo.json` / `knip.json` filter lists drift silently. | Phase 4 + 5 include config audits. Run `lint:all` after each phase. |
| 6 | `packages/app-core` has deeper Eliza Cloud coupling than grep shows (providers, contexts, route guards). | Phase 2 grep expanded to `src/{providers,context,hooks,layouts}/`. Operator UI smoke click-test. |
| 7 | Chat tab depends on `app-companion`. | Phase 1 investigation gates the delete. If load-bearing, keep and document. |

## 11. Rollback

- **Per-phase:** revert the PR.
- **Full:** `git reset --hard pre-cleanup`.
- **Partial mid-phase:** `git reset --hard <last-green-commit>`.

**Forbidden:**
- `git push --force` on `feat/tokagentos-fork` or `master`.
- `git submodule foreach` broad operations. Every submodule removal is explicit.
- Deletion of `LICENSE`, `NOTICE.md`, upstream attribution.
- Rename of `@elizaos/plugin-*` → `@tokagentos/plugin-*` (deferred as a separate refactor).

## 12. Open Questions for Plan Stage

The following concrete decisions are deferred to the implementation plan (writing-plans):

1. **app-companion fate** — resolved by the Phase 1 investigation. Plan should specify the exact grep command and decision criteria.
2. **Sync mechanism for root `.env.example` ↔ template `.env.example`** — a diff check in pre-commit, or a generation script. Plan should pick one.
3. **Whether to squash into one chore commit in Phase 6** — style choice. Plan should recommend one default.
4. **Order of Phase 3 submodule removals** — some have more coupling than others (`agent-orchestrator` > `calendly`). Plan should order them low-coupling first so a failure doesn't block cheap wins.
