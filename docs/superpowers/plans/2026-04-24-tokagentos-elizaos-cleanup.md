# TokagentOS elizaOS Legacy Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prune the `tokagentos/` elizaOS fork down to the Tokagent product surface (strategy runner + hyperliquid/polymarket/yield plugins + web-only operator UI), removing cloud-managed flows, mobile/desktop bridges, game apps, and unused upstream plugins.

**Architecture:** Six sequential phases, each landing as a separate PR that leaves the tree buildable. Phase 0 sets up rollback anchors. Phases 1–4 delete code. Phase 5 rewrites the scaffold/env surface. Phase 6 normalizes.

**Tech Stack:** Bun 1.3.5 (package manager + runtime), Turbo 2.x (monorepo builds), Biome 2.x (lint/format), Lerna (release), TypeScript 6.x, Git submodules (plugin mechanism).

**Working directory for every task:** `/Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos` (the git repo root is one level up — `tokagentos/` is a subdirectory of the `Tokamak-AI-Layer` repo, which means `git` commands operate on the whole monorepo; scope your diffs carefully).

**Source spec:** `docs/superpowers/specs/2026-04-24-tokagentos-elizaos-cleanup-design.md`

---

## File Structure Changes

### Files deleted outright
- `cloud/` (submodule dir + `.gitmodules` entry)
- `steward-fi/` (submodule dir + `.gitmodules` entry)
- `packages/native-plugins/` (all 15 child packages)
- 16 of 17 `apps/*` (17th, `app-companion`, Phase 1 gated)
- `packages/agent/src/api/cloud-*.ts` (all cloud route files)
- `packages/app-core/src/components/cloud/` (CloudStatusBadge et al.)
- `packages/app-core/src/runtime/ensure-text-to-speech-handler.ts` (edge-tts dep)
- `packages/{benchmarks,examples,scenario-runner,scenario-schema,prompts,interop,python,rust,skills,docs,plugin-hiveexchange}/`
- `plugins/plugin-{shell,executecode,computeruse,github,music-library,music-player,edge-tts,calendly,solana,cli,commands,cron,agent-orchestrator,elizacloud}/` (all submodules)
- `foo.json`

### Files modified (in-place edits)
- `package.json` (root) — workspaces array, dependencies
- `.gitmodules` — remove entries for deleted submodules
- `.env.example` (root) — rewrite to match product surface
- `turbo.json` — remove filter exclusions for deleted packages
- `lerna.json` (if it enumerates workspaces)
- `tsconfig.json`, `tsconfig.base.json` — path cleanup
- `knip.json`, `biome.json` — ignore/include globs
- `packages/agent/src/runtime/tokagent.ts` — delete cloud branch, app-lifeops/tokagentmaker imports
- `packages/agent/src/config/plugin-auto-enable.ts` — delete TOKAGENTOS_CLOUD_* branches
- `packages/agent/src/runtime/{plugin-collector,core-plugins,release-plugin-policy}.ts` — remove elizacloud refs
- `packages/agent/src/api/server.ts` (or wherever routes mount) — unregister cloud-* routes
- `packages/app-core/src/runtime/ensure-text-to-speech-handler.ts` callsite — stub/remove
- `packages/tokagentos/templates/fullstack-app/.env.example` — sync with root
- `packages/tokagentos/templates/fullstack-app/package.json` — cleanup workspace deps
- `packages/tokagentos/scaffold-patches/**` — audit, remove patches targeting deleted files
- `packages/tokagentos/src/commands/create.ts` — confirm no cloud flows
- `scripts/plugin-submodules-dev.mjs` — update managed-submodule list
- `README.md` — reflect cleaned product shape

---

## Phase 0 — Baseline & Safety Net

### Task 0.1: Capture Phase-0 build & test baseline

**Files:**
- Create: `tokagentos/.cleanup-baseline.txt` (gitignored — local only)

- [ ] **Step 1: Confirm starting branch**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
git rev-parse --abbrev-ref HEAD
```
Expected: `feat/tokagentos-fork` (if not, stop and coordinate with user).

- [ ] **Step 2: Run full install + build + test, capture output**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
{
  echo "=== Date: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "=== Commit: $(git rev-parse HEAD) ==="
  echo
  echo "=== du -sh packages/ plugins/ apps/ ==="
  du -sh packages/ plugins/ apps/ 2>&1
  echo
  echo "=== workspace count ==="
  bun pm ls --filter '*' 2>/dev/null | wc -l
  echo
  echo "=== .gitmodules line count ==="
  wc -l .gitmodules
  echo
  echo "=== install ==="
  time bun install 2>&1 | tail -20
  echo
  echo "=== build ==="
  bun run build 2>&1 | tail -50
  echo
  echo "=== typecheck ==="
  bun run typecheck 2>&1 | tail -30
  echo
  echo "=== test ==="
  bun run test 2>&1 | tail -50
} > .cleanup-baseline.txt 2>&1
```
Expected: file created, ~200–500 lines.

- [ ] **Step 3: Review baseline to confirm current green/red state**

```bash
cat tokagentos/.cleanup-baseline.txt | grep -iE "pass|fail|error" | head -40
```
Record pass/fail counts. These are the acceptance thresholds for every subsequent phase.

### Task 0.2: Create rollback anchor and cleanup branch

- [ ] **Step 1: Tag the baseline**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
git tag pre-cleanup
git tag -l pre-cleanup
```
Expected: `pre-cleanup` printed.

- [ ] **Step 2: Create the cleanup branch**

```bash
git checkout -b cleanup/remove-eliza-legacy
git rev-parse --abbrev-ref HEAD
```
Expected: `cleanup/remove-eliza-legacy`.

- [ ] **Step 3: Gitignore the baseline file so it doesn't get committed**

Check if `.cleanup-baseline.txt` is already covered by `.gitignore`. If not, add it:

```bash
grep -q '^\.cleanup-baseline\.txt$' .gitignore || echo '.cleanup-baseline.txt' >> .gitignore
git diff .gitignore
```
Expected: either no-op (already ignored) or one-line addition.

- [ ] **Step 4: Commit baseline setup**

```bash
git add .gitignore
git commit -m "chore(tokagentos): add cleanup-baseline to gitignore"
git log --oneline -1
```

---

## Phase 1 — Apps & Native-Plugins

Low-coupling deletes. `app-companion` deletion is gated by an investigation task.

### Task 1.1: Investigate `app-companion` coupling

**Files:**
- Read only.

- [ ] **Step 1: Grep for all `app-companion` references outside the runtime wiring**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
git grep -l 'app-companion\|@tokagentos/app-companion\|pluginAppCompanion' \
  -- ':(exclude)packages/agent/src/runtime/tokagent.ts' \
     ':(exclude)apps/app-companion/**' \
     ':(exclude)node_modules/**' \
     ':(exclude)**/node_modules/**'
```
Expected: one of:
- (a) Empty output → deletion is safe.
- (b) Hits only in templates/scaffold-patches → deletion safe, but also delete those references in Task 1.2.
- (c) Hits in `packages/app-core/src/` React code → deletion is NOT safe without refactor. Task 1.2 is "keep and document".

- [ ] **Step 2: If there are hits in `packages/app-core/src/`, check what they do**

```bash
git grep -n 'app-companion\|@tokagentos/app-companion\|pluginAppCompanion' -- 'packages/app-core/src/**'
```
Inspect each hit. If the hit is a feature registration (plugin load), the UI's Chat tab may still work without it. If the hit is a UI component import (e.g., `CompanionChatPanel`), the Chat tab depends on it.

- [ ] **Step 3: Record the decision**

Pick one:
- **DELETE-SAFE** — proceed with Task 1.2 adding `apps/app-companion` to the delete list and stripping all references.
- **KEEP** — `apps/app-companion` is load-bearing. Remove it from the delete list for the rest of Phase 1. Update the spec's §5a footnote † to note "kept because {reason}".

Document the decision at the top of the Phase 1 commit message.

### Task 1.2: Unwire legacy app imports from runtime

**Files:**
- Modify: `packages/agent/src/runtime/tokagent.ts`

- [ ] **Step 1: Locate the app imports in `tokagent.ts`**

```bash
grep -n 'pluginAppCompanion\|pluginAppLifeops\|app-tokagentmaker' packages/agent/src/runtime/tokagent.ts
```
Expected: three regions — imports at the top, a record/registry mapping short names to modules, and a dynamic import for `app-tokagentmaker`.

- [ ] **Step 2: Read the surrounding context**

Open `packages/agent/src/runtime/tokagent.ts`. Read the imports section and the plugin registration block (~200 lines around the hits). Understand the shape of the registry object that maps package names to imported modules.

- [ ] **Step 3: Remove `app-lifeops` import and registration**

Delete the line `import * as pluginAppLifeops from "@tokagentos/app-lifeops/plugin";` and the registry entry `"@tokagentos/app-lifeops": pluginAppLifeops,`. If `pluginAppLifeops` is referenced elsewhere in this file, delete those too.

- [ ] **Step 4: Remove `app-tokagentmaker` dynamic import**

Find and delete the block:
```ts
const { initializeOGCode } = await import("@tokagentos/app-tokagentmaker");
```
along with any call to `initializeOGCode(...)` that uses it.

- [ ] **Step 5: Handle `app-companion` per Task 1.1 decision**

If **DELETE-SAFE**: also delete the `pluginAppCompanion` import and registry entry.
If **KEEP**: leave `pluginAppCompanion` untouched.

- [ ] **Step 6: Verify the file still typechecks in isolation**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
bun run --cwd packages/agent typecheck 2>&1 | tail -30
```
Expected: no new "Cannot find module '@tokagentos/app-*'" errors beyond the packages you're about to delete. Errors about the to-be-deleted modules are acceptable at this step (they go away after Task 1.4).

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/runtime/tokagent.ts
git commit -m "refactor(agent): unwire legacy app imports from runtime"
```

### Task 1.3: Delete 15 Capacitor native-plugin packages

**Files:**
- Delete: `packages/native-plugins/` (entire tree)

- [ ] **Step 1: List what's being deleted**

```bash
ls packages/native-plugins/
```
Expected: 15 directories — `activity-tracker`, `agent`, `appblocker`, `camera`, `canvas`, `desktop`, `gateway`, `llama`, `location`, `macosalarm`, `mobile-signals`, `screencapture`, `swabble`, `talkmode`, `websiteblocker`.

- [ ] **Step 2: Check for any non-runtime imports that might break the build**

```bash
git grep -l 'packages/native-plugins\|@tokagentos/native-' \
  -- ':(exclude)packages/native-plugins/**' ':(exclude)node_modules/**' ':(exclude)**/node_modules/**' \
  | head -30
```
Expected: hits in `packages/app-core/src/main.tsx` or similar Capacitor entry points. These are already neutered per commit `9c5a0742` / `d194e98d`, but verify.

- [ ] **Step 3: Delete the directory**

```bash
git rm -r packages/native-plugins/
```

- [ ] **Step 4: Remove from root `package.json` workspaces**

Open `package.json`. In the `workspaces` array find `"packages/native-plugins/*"`. Delete that entry.

```bash
grep -n 'native-plugins' package.json
```
Expected after edit: no match.

- [ ] **Step 5: Commit**

```bash
git add packages/native-plugins/ package.json
git commit -m "chore(tokagentos): remove Capacitor native-plugins (web-only)"
```

### Task 1.4: Delete 16 app directories

**Files:**
- Delete: 16 of 17 `apps/*` directories (per Task 1.1 decision)

- [ ] **Step 1: Build the deletion list**

Base list (always delete):
```
apps/app-2004scape
apps/app-babylon
apps/app-browser
apps/app-clawville
apps/app-defense-of-the-agents
apps/app-form
apps/app-hyperscape
apps/app-knowledge
apps/app-lifeops
apps/app-scape
apps/app-shopify
apps/app-steward
apps/app-task-coordinator
apps/app-tokagentmaker
apps/app-training
apps/app-vincent
```
If Task 1.1 returned DELETE-SAFE: also add `apps/app-companion`.

- [ ] **Step 2: Delete the directories**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
git rm -r apps/app-2004scape apps/app-babylon apps/app-browser apps/app-clawville \
          apps/app-defense-of-the-agents apps/app-form apps/app-hyperscape apps/app-knowledge \
          apps/app-lifeops apps/app-scape apps/app-shopify apps/app-steward \
          apps/app-task-coordinator apps/app-tokagentmaker apps/app-training apps/app-vincent
```
If DELETE-SAFE, append `apps/app-companion` to the command.

- [ ] **Step 3: Check if `apps/` directory is now empty (only if DELETE-SAFE)**

```bash
ls apps/
```
Expected: empty if DELETE-SAFE; `app-companion` if KEEP.

- [ ] **Step 4: Remove `apps/*` from workspaces if directory is empty**

If `apps/` is empty, edit `package.json` — find `"apps/*"` in the `workspaces` array and delete that entry.
If `apps/app-companion` remains, leave the `apps/*` workspace entry.

- [ ] **Step 5: Run install**

```bash
rm -rf node_modules && bun install 2>&1 | tail -20
```
Expected: exit 0, no "package not found" for tokagent-core deps. Warnings about the deleted apps are expected and ignorable.

- [ ] **Step 6: Commit**

```bash
git add apps/ package.json
git commit -m "chore(tokagentos): remove legacy app integrations (games, mobile, tokagentmaker)"
```

### Task 1.5: Phase 1 gate

- [ ] **Step 1: Run full build**

```bash
bun run build 2>&1 | tail -60
```
Expected: exit 0. Compare against Phase-0 baseline — no *new* failures.

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck 2>&1 | tail -30
```
Expected: exit 0.

- [ ] **Step 3: Run lint**

```bash
bun run lint:check 2>&1 | tail -30
```
Expected: exit 0.

- [ ] **Step 4: Run tests**

```bash
bun run test 2>&1 | tail -50
```
Expected: same pass count as Phase-0 baseline. No new failures.

- [ ] **Step 5: Check workspace count decreased**

```bash
bun pm ls --filter '*' | wc -l
```
Expected: at least 30 fewer than the Phase-0 baseline (~15 native-plugins + ~16 apps).

- [ ] **Step 6: If all gates pass, push the branch**

```bash
git push -u origin cleanup/remove-eliza-legacy
```

---

## Phase 2 — Cloud Surface Removal

### Task 2.1: Delete cloud API routes in `packages/agent`

**Files:**
- Delete: `packages/agent/src/api/cloud-*.ts`

- [ ] **Step 1: List the cloud route files**

```bash
ls packages/agent/src/api/cloud-*.ts
```
Expected: ~10 files (e.g., `cloud-billing.ts`, `cloud-provisioning.ts`, `cloud-relay-routes.ts`, `cloud-routes.ts`, `cloud-wallet-binding.ts`, `cloud-status.ts`, etc.).

- [ ] **Step 2: Check where these files are imported**

```bash
git grep -l 'from.*cloud-\(billing\|provisioning\|relay\|routes\|status\|wallet-binding\)\|require.*cloud-' packages/agent/src/
```
Record each importer path — these need editing in the next task.

- [ ] **Step 3: Delete the cloud route files**

```bash
git rm packages/agent/src/api/cloud-*.ts
```
Expected: ~10 files removed.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/api/
git commit -m "chore(agent): delete cloud-managed API route files"
```

### Task 2.2: Unregister cloud routes from the server

**Files:**
- Modify: `packages/agent/src/api/server.ts` (or whichever file mounts the routes, per Task 2.1 Step 2)

- [ ] **Step 1: Open the server mounting file**

From Task 2.1 Step 2, identify the file(s) that import cloud-* modules. Common candidates: `packages/agent/src/api/server.ts`, `packages/agent/src/api/index.ts`, `packages/agent/src/server/index.ts`.

- [ ] **Step 2: Remove cloud-* imports and route registrations**

For each cloud-* import statement, delete the import line.
For each call like `app.use('/api/cloud', cloudRoutes)` or `registerCloudBilling(app)`, delete the call.

- [ ] **Step 3: Verify no dangling references**

```bash
git grep -n 'cloud-billing\|cloud-provisioning\|cloud-relay\|cloud-routes\|cloud-status\|cloud-wallet-binding\|CloudRoutes\|registerCloud' \
  -- packages/agent/src/
```
Expected: empty output.

- [ ] **Step 4: Typecheck agent package**

```bash
bun run --cwd packages/agent typecheck 2>&1 | tail -30
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/
git commit -m "chore(agent): unregister deleted cloud routes from server"
```

### Task 2.3: Delete cloud UI components

**Files:**
- Delete: `packages/app-core/src/components/cloud/`

- [ ] **Step 1: List and note importers**

```bash
ls packages/app-core/src/components/cloud/ 2>/dev/null
git grep -l 'components/cloud\|CloudStatusBadge' -- packages/app-core/src/
```
Record each importer file — edited next.

- [ ] **Step 2: Delete the directory**

```bash
git rm -r packages/app-core/src/components/cloud/
```

- [ ] **Step 3: Remove all importers of the deleted components**

For each file recorded in Step 1, open it and:
- Delete the import statement of `CloudStatusBadge` (or any other deleted component).
- Delete the JSX usage of the component.
- Delete any state/hook/context tied solely to the cloud badge.

- [ ] **Step 4: Typecheck app-core**

```bash
bun run --cwd packages/app-core typecheck 2>&1 | tail -30
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/
git commit -m "chore(app-core): delete CloudStatusBadge and cloud UI components"
```

### Task 2.4: Expanded grep for hidden cloud coupling

**Files:**
- Modify: whatever hits.

- [ ] **Step 1: Run the expanded grep across likely coupling sites**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
git grep -niE 'eliza ?cloud|elizacloud|CloudStatusBadge|cloud-billing|cloud-provisioning|cloud-relay|cloud-status|cloud-wallet-binding|TOKAGENTOS_CLOUD_' \
  -- 'packages/app-core/src/providers/' \
     'packages/app-core/src/context/' \
     'packages/app-core/src/hooks/' \
     'packages/app-core/src/layouts/' \
     'packages/app-core/src/components/' \
     'packages/app-core/src/pages/' \
     'packages/agent/src/'
```
Expected: each hit is either (a) a React provider/context tied to cloud auth, (b) a stale comment, or (c) a hook consuming cloud state.

- [ ] **Step 2: Fix each hit**

For each hit:
- If it's a React provider/context that only manages cloud state: delete the provider, and remove its `<CloudProvider>` wrapper from the app tree.
- If it's a hook: delete the hook definition + inline replace its consumers with the default value (e.g., `useCloudStatus()` returning `'disabled'` permanently).
- If it's a comment referencing cloud: delete the comment.

- [ ] **Step 3: Re-run the grep to confirm zero hits**

```bash
git grep -niE 'eliza ?cloud|elizacloud|CloudStatusBadge|cloud-billing|cloud-provisioning|cloud-relay|cloud-status|cloud-wallet-binding' \
  -- 'packages/app-core/src/' 'packages/agent/src/'
```
Expected: empty.

- [ ] **Step 4: Typecheck app-core + agent**

```bash
bun run --cwd packages/app-core typecheck 2>&1 | tail -30
bun run --cwd packages/agent typecheck 2>&1 | tail -30
```
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/
git commit -m "chore(tokagentos): excise hidden cloud coupling (providers/context/hooks)"
```

### Task 2.5: Delete `TOKAGENTOS_CLOUD_*` env branches

**Files:**
- Modify: `packages/agent/src/runtime/tokagent.ts`
- Modify: `packages/agent/src/config/plugin-auto-enable.ts`
- Modify: `packages/agent/src/runtime/plugin-collector.ts`
- Modify: `packages/agent/src/runtime/core-plugins.ts`
- Modify: `packages/agent/src/runtime/release-plugin-policy.ts`

- [ ] **Step 1: Find every `TOKAGENTOS_CLOUD_*` reference**

```bash
git grep -n 'TOKAGENTOS_CLOUD_' -- packages/agent/src/
```
Expected: hits in the 5 files above + possibly others.

- [ ] **Step 2: Remove each env branch**

For each file, open it and delete:
- Any `if (process.env.TOKAGENTOS_CLOUD_ENABLED)` / `if (process.env.TOKAGENTOS_CLOUD_API_KEY)` block — and the guarded code inside.
- Any `dynamic require('@elizaos/plugin-elizacloud')` or `import(...)` tied to those env gates.
- Any entry in a `CORE_PLUGINS` / `BLOCKED_PLUGINS` / `pluginsToLoad` set referring to `elizacloud`.

- [ ] **Step 3: Re-grep to confirm zero `TOKAGENTOS_CLOUD_` references**

```bash
git grep -n 'TOKAGENTOS_CLOUD_\|@elizaos/plugin-elizacloud' -- packages/agent/src/
```
Expected: empty.

- [ ] **Step 4: Typecheck agent**

```bash
bun run --cwd packages/agent typecheck 2>&1 | tail -30
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/
git commit -m "refactor(agent): remove TOKAGENTOS_CLOUD env branches and elizacloud wiring"
```

### Task 2.6: Submodule-remove `cloud/` and `steward-fi/`

**Files:**
- Delete: `cloud/`, `steward-fi/`
- Modify: `.gitmodules`

- [ ] **Step 1: Deinit and remove `cloud/` submodule**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
git submodule deinit -f cloud
git rm -f cloud
rm -rf .git/modules/tokagentos/cloud 2>/dev/null || true
```
Expected: the `cloud` entry is removed from `.gitmodules` automatically by `git rm`. Verify:
```bash
grep -n '^\[submodule "cloud"\]' .gitmodules
```
Expected: empty.

- [ ] **Step 2: Deinit and remove `steward-fi/` submodule**

```bash
git submodule deinit -f steward-fi
git rm -f steward-fi
rm -rf .git/modules/tokagentos/steward-fi 2>/dev/null || true
grep -n '^\[submodule "steward-fi"\]' .gitmodules
```
Expected: empty for the grep.

- [ ] **Step 3: Confirm no dangling references in code**

```bash
git grep -l 'steward-fi\|cloud/src\|cloud/index' -- ':(exclude)node_modules/**' ':(exclude)**/node_modules/**'
```
Expected: empty or only in docs/spec files.

- [ ] **Step 4: Commit**

```bash
git add .gitmodules cloud steward-fi
git commit -m "chore(tokagentos): remove cloud/ and steward-fi/ submodules"
```

### Task 2.7: Phase 2 gate — build + runtime smoke

- [ ] **Step 1: Fresh install**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
rm -rf node_modules && bun install 2>&1 | tail -20
```
Expected: exit 0.

- [ ] **Step 2: Build + typecheck + lint + test**

```bash
bun run build 2>&1 | tail -50
bun run typecheck 2>&1 | tail -20
bun run lint:check 2>&1 | tail -20
bun run test 2>&1 | tail -50
```
Expected: all exit 0. Same test pass count as Phase-0 baseline.

- [ ] **Step 3: Daemon-mode smoke test**

Create a throwaway `.env.test` in the repo root (do NOT commit):
```bash
cat > /tmp/tokagent-daemon.env <<'EOF'
TOKAGENT_EXECUTION_MODE=daemon
ANTHROPIC_API_KEY=sk-ant-fake-for-boot-test
OPERATOR_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001
RPC_HYPEREVM=https://rpc.hyperliquid.xyz/evm
VAULT_ADDRESS_HYPEREVM=0xae55d30deac214e4687d336c24bfc6e2a437904d
EOF
```
Then:
```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
set -a; . /tmp/tokagent-daemon.env; set +a
timeout 45 bun run start 2>&1 | tee /tmp/tokagent-daemon.log | tail -40
```
Expected:
- No "Cannot find module" for deleted paths.
- No error mentioning `cloud/`, `elizacloud`, `TOKAGENTOS_CLOUD_*`.
- `StrategyRunnerService` (or equivalent) emits a first-tick log line within 30s.

Clean up:
```bash
rm /tmp/tokagent-daemon.env /tmp/tokagent-daemon.log
```

- [ ] **Step 4: Operator-mode boot smoke (no browser click-test)**

```bash
cat > /tmp/tokagent-operator.env <<'EOF'
TOKAGENT_EXECUTION_MODE=operator
SERVER_PORT=3456
ANTHROPIC_API_KEY=sk-ant-fake-for-boot-test
OPERATOR_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001
RPC_HYPEREVM=https://rpc.hyperliquid.xyz/evm
VAULT_ADDRESS_HYPEREVM=0xae55d30deac214e4687d336c24bfc6e2a437904d
EOF
set -a; . /tmp/tokagent-operator.env; set +a
timeout 45 bun run start 2>&1 | tee /tmp/tokagent-operator.log | tail -50
```
Expected: same as Step 3, plus a log line confirming HTTP server bound on port 3456. Then:
```bash
curl -sS http://localhost:3456/ | head -10
```
Expected: HTML or a 404 at `/`, but the process is reachable. (Full UI click-test is a manual human step — not part of automated gate.)

Clean up:
```bash
rm /tmp/tokagent-operator.env /tmp/tokagent-operator.log
```

- [ ] **Step 5: Push the branch**

```bash
git push
```

---

## Phase 3 — Plugin Submodule Removal

Ordered low-to-high coupling so the cheap wins land first.

### Task 3.1: Remove low-coupling media/tooling plugins

**Files:**
- Delete: `plugins/plugin-calendly/`, `plugins/plugin-music-library/`, `plugins/plugin-music-player/`, `plugins/plugin-github/`, `plugins/plugin-computeruse/`
- Modify: `.gitmodules`, root `package.json` (if listed), any importer

- [ ] **Step 1: Confirm these plugins have zero imports in `packages/`**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
for p in plugin-calendly plugin-music-library plugin-music-player plugin-github plugin-computeruse; do
  echo "=== $p ==="
  git grep -l "@elizaos/$p\|$p/typescript\|$p/plugin" -- 'packages/' 'plugins/plugin-tokagent-*' || echo "no importers"
done
```
Expected for each: "no importers" or only hits in the plugin's own source.

- [ ] **Step 2: Remove each as a submodule**

```bash
for p in plugin-calendly plugin-music-library plugin-music-player plugin-github plugin-computeruse; do
  git submodule deinit -f "plugins/$p"
  git rm -f "plugins/$p"
  rm -rf ".git/modules/tokagentos/plugins/$p" 2>/dev/null || true
done
```

- [ ] **Step 3: Remove from root `package.json` if listed as a workspace dep**

```bash
for p in plugin-calendly plugin-music-library plugin-music-player plugin-github plugin-computeruse; do
  grep -n "\"@elizaos/$p\"" package.json || true
done
```
For each hit, edit `package.json` and delete the `"@elizaos/$p": "workspace:*"` line.

- [ ] **Step 4: Confirm `.gitmodules` is clean**

```bash
for p in plugin-calendly plugin-music-library plugin-music-player plugin-github plugin-computeruse; do
  grep -n "\"plugins/$p\"" .gitmodules || echo "OK: $p removed"
done
```

- [ ] **Step 5: Install + typecheck**

```bash
rm -rf node_modules && bun install 2>&1 | tail -10
bun run typecheck 2>&1 | tail -20
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add .gitmodules package.json plugins/
git commit -m "chore(plugins): remove media/tooling plugin submodules (calendly, music-*, github, computeruse)"
```

### Task 3.2: Remove shell/executecode/solana plugins

**Files:**
- Delete: `plugins/plugin-shell/`, `plugins/plugin-executecode/`, `plugins/plugin-solana/`

- [ ] **Step 1: Confirm zero importers**

```bash
for p in plugin-shell plugin-executecode plugin-solana; do
  echo "=== $p ==="
  git grep -l "@elizaos/$p\|$p/typescript\|$p/plugin" -- 'packages/' 'plugins/plugin-tokagent-*' || echo "no importers"
done
```
Expected: no importers.

- [ ] **Step 2: Submodule-remove + drop workspace deps**

```bash
for p in plugin-shell plugin-executecode plugin-solana; do
  git submodule deinit -f "plugins/$p"
  git rm -f "plugins/$p"
  rm -rf ".git/modules/tokagentos/plugins/$p" 2>/dev/null || true
done
for p in plugin-shell plugin-executecode plugin-solana; do
  grep -n "\"@elizaos/$p\"" package.json || true
done
```
Edit `package.json` for each hit.

- [ ] **Step 3: Install + typecheck**

```bash
rm -rf node_modules && bun install 2>&1 | tail -10
bun run typecheck 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add .gitmodules package.json plugins/
git commit -m "chore(plugins): remove shell/executecode/solana submodules"
```

### Task 3.3: Remove upstream CLI-layer plugins

**Files:**
- Delete: `plugins/plugin-cli/`, `plugins/plugin-commands/`, `plugins/plugin-cron/`

- [ ] **Step 1: Confirm zero importers (these may have stale refs)**

```bash
for p in plugin-cli plugin-commands plugin-cron; do
  echo "=== $p ==="
  git grep -l "@elizaos/$p\|$p/typescript\|$p/plugin" -- 'packages/' 'plugins/plugin-tokagent-*' || echo "no importers"
done
```
If there are importers, inspect each — likely dead registration code in `packages/agent/src/runtime/tokagent.ts` or `plugin-auto-enable.ts`.

- [ ] **Step 2: Remove any stale importers**

For each import found in Step 1, open the file and delete the import line and any registration/usage of the imported plugin.

- [ ] **Step 3: Submodule-remove + drop workspace deps**

```bash
for p in plugin-cli plugin-commands plugin-cron; do
  git submodule deinit -f "plugins/$p"
  git rm -f "plugins/$p"
  rm -rf ".git/modules/tokagentos/plugins/$p" 2>/dev/null || true
  grep -n "\"@elizaos/$p\"" package.json || true
done
```
Edit `package.json` for each hit.

- [ ] **Step 4: Install + typecheck**

```bash
rm -rf node_modules && bun install 2>&1 | tail -10
bun run typecheck 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add .gitmodules package.json plugins/ packages/
git commit -m "chore(plugins): remove upstream cli/commands/cron submodules"
```

### Task 3.4: Remove `plugin-edge-tts` (special: delete the handler first)

**Files:**
- Delete: `packages/app-core/src/runtime/ensure-text-to-speech-handler.ts` (or equivalent), `plugins/plugin-edge-tts/`
- Modify: the file that calls `ensureTextToSpeechHandler`

- [ ] **Step 1: Locate the handler and its callsite**

```bash
find packages/app-core/src -name 'ensure-text-to-speech-handler*' 2>/dev/null
git grep -l 'ensureTextToSpeechHandler\|ensure-text-to-speech-handler\|edge-tts' -- 'packages/'
```
Record the handler path and the callsite path.

- [ ] **Step 2: Stub the callsite**

Open the file that imports `ensureTextToSpeechHandler`. Delete the import line. Delete the call to the function. If the function's return value is used, replace with a no-op equivalent (e.g., `Promise.resolve()` or the default value that the caller expects).

- [ ] **Step 3: Delete the handler file**

```bash
git rm packages/app-core/src/runtime/ensure-text-to-speech-handler.ts
# If the path differs, use the path found in Step 1.
```

- [ ] **Step 4: Remove any remaining `edge-tts` references**

```bash
git grep -n 'edge-tts\|plugin-edge-tts' -- 'packages/' 'plugins/plugin-tokagent-*'
```
Expected: empty. Delete any remaining hit.

- [ ] **Step 5: Submodule-remove + drop workspace dep**

```bash
git submodule deinit -f plugins/plugin-edge-tts
git rm -f plugins/plugin-edge-tts
rm -rf .git/modules/tokagentos/plugins/plugin-edge-tts 2>/dev/null || true
grep -n '@elizaos/plugin-edge-tts' package.json || true
```
Edit `package.json` if hit.

- [ ] **Step 6: Check `ensure-plugin-builds.mjs`**

```bash
git grep -n 'edge-tts' packages/tokagentos/scripts/ packages/templates/ scripts/ 2>/dev/null
```
If hits: the commit `4c978d67` added `plugin-edge-tts` to a build list. Remove that entry from each script.

- [ ] **Step 7: Install + typecheck**

```bash
rm -rf node_modules && bun install 2>&1 | tail -10
bun run typecheck 2>&1 | tail -20
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(plugins): remove plugin-edge-tts and its app-core handler"
```

### Task 3.5: Remove `plugin-agent-orchestrator` (special: unwire from runtime and server)

**Files:**
- Modify: `packages/agent/src/runtime/tokagent.ts`
- Modify: `packages/agent/src/api/server.ts` (compat shim)
- Modify: any other runtime wiring
- Delete: `plugins/plugin-agent-orchestrator/`

- [ ] **Step 1: Find every runtime reference**

```bash
git grep -n 'agent-orchestrator\|AgentOrchestrator\|pluginAgentOrchestrator' -- 'packages/'
```
Record each hit.

- [ ] **Step 2: Unwire from `tokagent.ts`**

Open `packages/agent/src/runtime/tokagent.ts`. Delete:
- The static/dynamic import of `agent-orchestrator`.
- The `pluginsToLoad` entry or registry entry for it.
- Any conditional branch guarded by "swarm enabled" or "orchestrator available".

- [ ] **Step 3: Unwire from `api/server.ts` compat shim**

Open `packages/agent/src/api/server.ts`. Search for `agent-orchestrator` or `AgentOrchestrator`. If there's a compatibility route or service registration, delete it.

- [ ] **Step 4: Handle `packages/agent/src/api/wallet-capability.ts` if affected**

```bash
git grep -n 'AGENT_ORCHESTRATOR' packages/agent/src/api/wallet-capability.ts 2>/dev/null || echo "not used"
```
If used, delete the capability constant and its consumers.

- [ ] **Step 5: Re-grep for zero remaining references**

```bash
git grep -n 'agent-orchestrator\|AgentOrchestrator\|pluginAgentOrchestrator' -- 'packages/'
```
Expected: empty.

- [ ] **Step 6: Typecheck**

```bash
bun run --cwd packages/agent typecheck 2>&1 | tail -30
```
Expected: exit 0.

- [ ] **Step 7: Submodule-remove + drop workspace dep**

```bash
git submodule deinit -f plugins/plugin-agent-orchestrator
git rm -f plugins/plugin-agent-orchestrator
rm -rf .git/modules/tokagentos/plugins/plugin-agent-orchestrator 2>/dev/null || true
grep -n '@elizaos/plugin-agent-orchestrator' package.json
```
Edit `package.json` — delete the `"@elizaos/plugin-agent-orchestrator": "workspace:*"` entry.

- [ ] **Step 8: Install + typecheck + build**

```bash
rm -rf node_modules && bun install 2>&1 | tail -10
bun run typecheck 2>&1 | tail -20
bun run build 2>&1 | tail -50
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore(plugins): remove plugin-agent-orchestrator and unwire runtime+server coupling"
```

### Task 3.6: Remove `plugin-elizacloud` submodule

**Files:**
- Delete: `plugins/plugin-elizacloud/`

Most of the runtime references should already be gone from Phase 2 Task 2.5. This task closes the loop.

- [ ] **Step 1: Confirm zero remaining references**

```bash
git grep -n 'plugin-elizacloud\|pluginElizacloud\|@elizaos/plugin-elizacloud' -- ':(exclude)plugins/plugin-elizacloud/**'
```
Expected: empty. If any hit, fix it before proceeding.

- [ ] **Step 2: Submodule-remove**

```bash
git submodule deinit -f plugins/plugin-elizacloud
git rm -f plugins/plugin-elizacloud
rm -rf .git/modules/tokagentos/plugins/plugin-elizacloud 2>/dev/null || true
grep -n 'plugin-elizacloud' package.json .gitmodules || echo "OK"
```

- [ ] **Step 3: Install + typecheck**

```bash
rm -rf node_modules && bun install 2>&1 | tail -10
bun run typecheck 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(plugins): remove plugin-elizacloud submodule"
```

### Task 3.7: Phase 3 gate — build + smoke

- [ ] **Step 1: Fresh install**

```bash
rm -rf node_modules && bun install 2>&1 | tail -20
```
Expected: exit 0.

- [ ] **Step 2: Build + typecheck + lint + test**

```bash
bun run build 2>&1 | tail -50
bun run typecheck 2>&1 | tail -20
bun run lint:check 2>&1 | tail -20
bun run test 2>&1 | tail -50
```
Expected: all exit 0.

- [ ] **Step 3: Daemon smoke test (reuse Phase 2 Task 2.7 Step 3 procedure)**

Same procedure as before — build env, start, tail log, verify no "Cannot find module" for any deleted plugin.

- [ ] **Step 4: Push the branch**

```bash
git push
```

---

## Phase 4 — Remove Irrelevant `packages/*`

### Task 4.1: Delete 11 irrelevant packages

**Files:**
- Delete: `packages/{benchmarks,examples,scenario-runner,scenario-schema,prompts,interop,python,rust,skills,docs,plugin-hiveexchange}/`

- [ ] **Step 1: Confirm zero runtime imports**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
for p in benchmarks examples scenario-runner scenario-schema prompts interop python rust skills docs plugin-hiveexchange; do
  echo "=== @tokagentos/$p ==="
  git grep -l "@tokagentos/$p" \
    -- 'packages/agent/' 'packages/app-core/' 'packages/tokagentos/' 'plugins/plugin-tokagent-*' \
    || echo "no importers"
done
```
Expected for each: "no importers". If any hit, inspect — if it's a dev-only reference (benchmarks, example scripts), it's safe to delete. If it's a runtime dep, promote the hit to its own investigation task.

- [ ] **Step 2: Delete the directories**

```bash
git rm -r packages/benchmarks packages/examples packages/scenario-runner packages/scenario-schema \
         packages/prompts packages/interop packages/python packages/rust packages/skills \
         packages/docs packages/plugin-hiveexchange
```

- [ ] **Step 3: Update root `package.json`**

Remove any explicit workspace entries and resolutions for deleted packages.

```bash
grep -nE 'packages/(benchmarks|examples|scenario-runner|scenario-schema|prompts|interop|python|rust|skills|docs|plugin-hiveexchange)' package.json
grep -nE '@tokagentos/(benchmarks|examples|scenario-runner|scenario-schema|prompts|interop|python|rust|skills|docs|plugin-hiveexchange)' package.json
grep -n '@mediar-ai/workflow' package.json
```
For each hit, delete the entry.

- [ ] **Step 4: Update `turbo.json`**

```bash
grep -nE '!@tokagentos/(python|rust|computeruse|docs|skills|prompts|interop)|@mediar-ai/workflow' turbo.json
```
For each filter-exclusion entry listed, delete it.

- [ ] **Step 5: Update `tsconfig.json` and `tsconfig.base.json`**

```bash
grep -nE 'benchmarks|examples|scenario-|prompts|interop|python|rust|skills|docs|plugin-hiveexchange' tsconfig.json tsconfig.base.json
```
For each `paths` entry or `references` entry pointing at a deleted package, delete it.

- [ ] **Step 6: Install + typecheck**

```bash
rm -rf node_modules && bun install 2>&1 | tail -20
bun run typecheck 2>&1 | tail -20
```
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(tokagentos): remove unused packages (benchmarks/examples/bindings/scenario/etc.)"
```

### Task 4.2: Phase 4 gate

- [ ] **Step 1: Full gate**

```bash
bun run build 2>&1 | tail -50
bun run typecheck 2>&1 | tail -20
bun run lint:check 2>&1 | tail -20
bun run test 2>&1 | tail -50
```
Expected: all exit 0.

- [ ] **Step 2: Workspace-count check**

```bash
bun pm ls --filter '*' | wc -l
```
Expected: at least 11 fewer than Phase-3 count.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Phase 5 — Rewrite Scaffold & Env Surface

### Task 5.1: Rewrite root `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Read the current `.env.example`**

```bash
cat .env.example
```
Use this as the base — keep what's still product-relevant, add missing sections, remove any `TOKAGENTOS_CLOUD_*` / `ELIZA_*` keys.

- [ ] **Step 2: Replace with the clean version**

Open `.env.example`. Replace its contents with the following (adjust defaults only if the codebase expects different values):

```dotenv
####################################
#### Execution Mode ####
####################################

# Required. Selects runtime topology.
#   daemon   — headless; strategy runner ticks, no UI served.
#   operator — daemon + local React UI served on SERVER_PORT.
TOKAGENT_EXECUTION_MODE=operator

####################################
#### Server ####
####################################

# Server port (operator mode only).
SERVER_PORT=3000

# Server host. Default: 0.0.0.0
SERVER_HOST=

# development | production. Affects UI availability and security defaults.
NODE_ENV=development

# Force-enable ("true") or force-disable ("false") the web UI regardless of mode.
# Leave unset for automatic behavior (enabled in dev, disabled in prod).
TOKAGENT_UI_ENABLE=

# When set, all /api/* routes require X-API-KEY: <value>.
TOKAGENT_SERVER_AUTH_TOKEN=

# Express max payload size (default 2mb).
EXPRESS_MAX_PAYLOAD=2mb

####################################
#### Database ####
####################################

# PostgreSQL URL. If unset, falls back to PGLite (local file/memory).
POSTGRES_URL=

# PGLite directory. Use memory:// for in-memory (dev only).
PGLITE_DATA_DIR=

####################################
#### AI Provider (pick at least one) ####
####################################

# Anthropic Claude API key. Always-on provider; required if no other provider set.
ANTHROPIC_API_KEY=

# Optional additional providers (auto-enabled when their key is present).
OPENAI_API_KEY=
OPENROUTER_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
GROQ_API_KEY=

# Local LLM endpoints (optional).
OLLAMA_API_ENDPOINT=

####################################
#### Operator Wallet ####
####################################

# The hot wallet that signs all strategy transactions. Required.
OPERATOR_PRIVATE_KEY=

####################################
#### Per-Chain Vault Addresses ####
####################################

# Tokagent vaults, one per deployed chain. Fill only the chains you use.
VAULT_ADDRESS_HYPEREVM=
VAULT_ADDRESS_POLYGON=
VAULT_ADDRESS_ETHEREUM=

####################################
#### Per-Chain RPC Endpoints ####
####################################

RPC_HYPEREVM=https://rpc.hyperliquid.xyz/evm
RPC_POLYGON=
RPC_ETHEREUM=

####################################
#### Optional Messaging Channels ####
####################################

# Each channel is auto-enabled when its credentials are present.
TELEGRAM_BOT_TOKEN=
DISCORD_BOT_TOKEN=
TWITTER_API_KEY=
TWITTER_API_SECRET=
WHATSAPP_ACCESS_TOKEN=
SIGNAL_PHONE_NUMBER=

####################################
#### Runtime Tunables (optional) ####
####################################

# Total timeout for parallel providers, in ms (default 1000).
PROVIDERS_TOTAL_TIMEOUT_MS=1000

# Non-interactive CLI mode.
TOKAGENT_NONINTERACTIVE=

# Character URLs (comma-separated).
REMOTE_CHARACTER_URLS=

####################################
#### Data Directories (optional) ####
####################################

# TOKAGENT_DATA_DIR=.tokagent
# TOKAGENT_DATABASE_DIR=
# TOKAGENT_DATA_DIR_CHARACTERS=
# TOKAGENT_DATA_DIR_GENERATED=
```

- [ ] **Step 3: Cross-check: does the codebase actually read each key?**

```bash
for key in TOKAGENT_EXECUTION_MODE SERVER_PORT TOKAGENT_UI_ENABLE TOKAGENT_SERVER_AUTH_TOKEN \
           ANTHROPIC_API_KEY OPENAI_API_KEY OPERATOR_PRIVATE_KEY VAULT_ADDRESS_HYPEREVM \
           RPC_HYPEREVM TELEGRAM_BOT_TOKEN; do
  hits=$(git grep -l "$key" -- 'packages/' 'plugins/plugin-tokagent-*' 2>/dev/null | wc -l)
  echo "$key → $hits files"
done
```
Expected: each key has ≥1 hit. If `TOKAGENT_EXECUTION_MODE` has 0 hits, the execution-mode gate from commit `a985030b` lives elsewhere — locate and update.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore(env): rewrite .env.example to match product surface"
```

### Task 5.2: Sync template `.env.example` with root

**Files:**
- Modify: `packages/tokagentos/templates/fullstack-app/.env.example`
- Modify: `packages/templates/fullstack-app/.env.example` (if present)

- [ ] **Step 1: Locate both template `.env.example` files**

```bash
find packages -name '.env.example' -not -path '*/node_modules/*'
```
Expected: `packages/tokagentos/templates/fullstack-app/.env.example` and possibly `packages/templates/fullstack-app/.env.example`.

- [ ] **Step 2: Copy the root `.env.example` to each template location**

```bash
cp .env.example packages/tokagentos/templates/fullstack-app/.env.example
# Only if the file exists:
[ -f packages/templates/fullstack-app/.env.example ] && \
  cp .env.example packages/templates/fullstack-app/.env.example
```

- [ ] **Step 3: Diff-check to confirm sync**

```bash
diff .env.example packages/tokagentos/templates/fullstack-app/.env.example
```
Expected: no output (identical).

- [ ] **Step 4: Commit**

```bash
git add packages/tokagentos/templates/ packages/templates/ 2>/dev/null
git commit -m "chore(templates): sync .env.example with root"
```

### Task 5.3: Add a sync check script

**Files:**
- Create: `scripts/check-env-sync.mjs`
- Modify: `package.json` (add script entry)

This operationalizes spec §12 open question #2 (sync mechanism).

- [ ] **Step 1: Create the check script**

```bash
cat > scripts/check-env-sync.mjs <<'EOF'
#!/usr/bin/env node
// Verifies root .env.example matches every template .env.example.
// Run via: bun run check:env-sync
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const canonical = join(ROOT, '.env.example');
const targets = [
  join(ROOT, 'packages/tokagentos/templates/fullstack-app/.env.example'),
  join(ROOT, 'packages/templates/fullstack-app/.env.example'),
];

if (!existsSync(canonical)) {
  console.error(`Missing canonical file: ${canonical}`);
  process.exit(2);
}
const expected = readFileSync(canonical, 'utf8');

let drift = false;
for (const t of targets) {
  if (!existsSync(t)) continue; // skip if template doesn't exist
  const actual = readFileSync(t, 'utf8');
  if (actual !== expected) {
    console.error(`DRIFT: ${t} differs from ${canonical}`);
    drift = true;
  }
}

if (drift) {
  console.error('\nRun: cp .env.example <each drifted path>');
  process.exit(1);
}
console.log('env-sync: OK');
EOF
chmod +x scripts/check-env-sync.mjs
```

- [ ] **Step 2: Add an npm script**

Open `package.json`. In the `"scripts"` block, add:
```json
"check:env-sync": "node scripts/check-env-sync.mjs"
```

- [ ] **Step 3: Run the check**

```bash
bun run check:env-sync
```
Expected: `env-sync: OK`.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-env-sync.mjs package.json
git commit -m "chore(scripts): add check:env-sync for template .env drift"
```

### Task 5.4: Audit `packages/tokagentos/src/commands/create.ts`

**Files:**
- Modify: `packages/tokagentos/src/commands/create.ts`

- [ ] **Step 1: Read the file**

Open `packages/tokagentos/src/commands/create.ts`. Note any reference to cloud flows, Eliza Cloud, managed hosting, or registry publishing.

- [ ] **Step 2: Grep the src/commands directory**

```bash
grep -rniE 'cloud|eliza|managed|publish|registry' packages/tokagentos/src/commands/
```
Record each hit.

- [ ] **Step 3: Fix each hit**

For each hit:
- If it's a command flow (e.g., `publishToRegistry`): delete the flow and all its UI prompts.
- If it's a menu/prompt choice (e.g., "Deploy to Eliza Cloud"): delete that choice.
- If it's a comment: delete the comment.

- [ ] **Step 4: Confirm the provider prompt lists only kept providers**

Find the LLM provider prompt (look for `inquirer.prompt` with a provider choice list). Ensure the list is:
```
anthropic, openai, openrouter, google, groq, ollama, skip
```
Remove any provider not in the kept list (see spec §4).

- [ ] **Step 5: Typecheck the CLI package**

```bash
bun run --cwd packages/tokagentos typecheck 2>&1 | tail -20
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/tokagentos/src/commands/
git commit -m "chore(cli): audit create.ts — remove cloud/registry flows"
```

### Task 5.5: Audit `scaffold-patches/` and delete orphans

**Files:**
- Delete: any scaffold-patch targeting a deleted file

- [ ] **Step 1: List all scaffold patches**

```bash
find packages/tokagentos/scaffold-patches -type f 2>/dev/null
```

- [ ] **Step 2: For each patch, check that its target still exists**

```bash
# A patch at packages/tokagentos/scaffold-patches/packages/X/src/Y.ts targets
# the corresponding file in a scaffolded project. After our deletions, some
# patches may target deleted upstream files.
# Run this heuristic check:
for patch in $(find packages/tokagentos/scaffold-patches -type f); do
  # Strip the leading path to get the target path inside a scaffold.
  target="${patch#packages/tokagentos/scaffold-patches/}"
  # Check if a corresponding template file exists (it should).
  if ! [ -f "packages/tokagentos/templates/fullstack-app/$target" ] && \
     ! [ -f "packages/templates/fullstack-app/$target" ]; then
    echo "ORPHAN: $patch (no matching template target)"
  fi
done
```
Record each ORPHAN path.

- [ ] **Step 3: For each orphan, decide: delete, or keep if it targets a file the scaffolded project will add**

For each orphan:
- If the patch targets something we deleted (e.g., `packages/app-core/src/components/cloud/`): delete the patch.
- If the patch targets a file a scaffolded user project creates (not the template itself): keep.

When in doubt, delete. The CLI scaffold smoke test (Task 5.7) will catch regressions.

- [ ] **Step 4: Delete orphan patches**

```bash
git rm <each orphan path>
```

- [ ] **Step 5: Commit**

```bash
git add packages/tokagentos/scaffold-patches/
git commit -m "chore(cli): remove orphan scaffold-patches targeting deleted files"
```

### Task 5.6: Update `scripts/plugin-submodules-dev.mjs` and config files

**Files:**
- Modify: `scripts/plugin-submodules-dev.mjs`
- Modify: `knip.json`
- Modify: `biome.json`

- [ ] **Step 1: Read the submodule-dev script**

Open `scripts/plugin-submodules-dev.mjs`. Find any hardcoded list of managed plugin submodules.

- [ ] **Step 2: Update the list to match current `.gitmodules`**

```bash
# Current managed plugin submodules (per spec §4 "Kept"):
# sql, agent-skills, evm, pdf, local-embedding,
# anthropic, openai, openrouter, groq, ollama, local-ai, google-genai,
# telegram, discord, twitter, whatsapp, signal, wechat, bluebubbles, imessage

# Diff against the script's current list and update.
grep -nE 'plugin-[a-z-]+' scripts/plugin-submodules-dev.mjs | sort -u
```
Delete any plugin name no longer in the managed list. Add any missing names from the spec.

- [ ] **Step 3: Update `knip.json`**

```bash
cat knip.json
```
Remove glob entries pointing at deleted paths (apps/*, packages/native-plugins/*, packages/{benchmarks,examples,…}/, plugins/plugin-{calendly,music-*,etc.}/).

- [ ] **Step 4: Update `biome.json`**

```bash
cat biome.json
```
Same: remove include/ignore globs pointing at deleted paths.

- [ ] **Step 5: Run `bun run lint:check` to confirm config still parses**

```bash
bun run lint:check 2>&1 | tail -20
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/plugin-submodules-dev.mjs knip.json biome.json
git commit -m "chore(tooling): update submodule-dev + knip + biome config for cleaned tree"
```

### Task 5.7: Phase 5 smoke test — fresh scaffold end-to-end

- [ ] **Step 1: Build and link the CLI**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
bun run --cwd packages/tokagentos build 2>&1 | tail -10
bun link --cwd packages/tokagentos
```
Expected: `tokagentos` binary on PATH.

- [ ] **Step 2: Scaffold a test project**

```bash
SCAFFOLD_DIR=$(mktemp -d -t tokagent-smoke)
cd "$SCAFFOLD_DIR"
tokagentos create my-agent --provider anthropic 2>&1 | tail -40
ls my-agent/
```
Expected: project dir contains `package.json`, `.env`, `src/`.

- [ ] **Step 3: Install and build the scaffold**

```bash
cd "$SCAFFOLD_DIR/my-agent"
bun install 2>&1 | tail -10
bun run build 2>&1 | tail -20
```
Expected: both exit 0. No "package not found".

- [ ] **Step 4: Check the scaffolded `.env`**

```bash
grep -cE '^[A-Z_]+=.*$' .env
grep -E 'TOKAGENTOS_CLOUD_|ELIZA_' .env && echo "FAIL: cloud keys in scaffold" || echo "OK"
```
Expected: second grep prints `OK`.

- [ ] **Step 5: Boot the scaffold in daemon mode**

```bash
cat > .env.test <<'EOF'
TOKAGENT_EXECUTION_MODE=daemon
ANTHROPIC_API_KEY=sk-ant-fake-for-boot
OPERATOR_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001
RPC_HYPEREVM=https://rpc.hyperliquid.xyz/evm
VAULT_ADDRESS_HYPEREVM=0xae55d30deac214e4687d336c24bfc6e2a437904d
EOF
set -a; . .env.test; set +a
timeout 30 bun run start 2>&1 | tail -30
```
Expected: no "Cannot find module" errors; `StrategyRunnerService` logs its first tick OR the process runs to timeout cleanly.

- [ ] **Step 6: Clean up**

```bash
rm -rf "$SCAFFOLD_DIR"
bun unlink tokagentos --cwd packages/tokagentos 2>&1 || true
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
```

- [ ] **Step 7: Push Phase 5**

```bash
git push
```

---

## Phase 6 — Scrub & Normalize

### Task 6.1: Grep tripwires

**Files:**
- Modify: whatever turns up.

- [ ] **Step 1: Run all the tripwire greps**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
echo "=== eliza cloud ==="
git grep -i 'eliza cloud' -- ':(exclude)LICENSE' ':(exclude)NOTICE.md' ':(exclude)docs/superpowers/**'
echo
echo "=== CloudStatusBadge ==="
git grep -i 'CloudStatusBadge'
echo
echo "=== TOKAGENTOS_CLOUD_ ==="
git grep 'TOKAGENTOS_CLOUD_'
echo
echo "=== elizacloud ==="
git grep -iE 'elizacloud|@elizaos/plugin-elizacloud' -- ':(exclude)NOTICE.md' ':(exclude)docs/superpowers/**'
echo
echo "=== cloud-* route names ==="
git grep -l 'cloud-billing\|cloud-provisioning\|cloud-relay\|cloud-routes\|cloud-status\|cloud-wallet-binding' -- ':(exclude)docs/superpowers/**'
echo
echo "=== native-plugin-entrypoints ==="
git grep -l 'native-plugin-entrypoints' -- ':(exclude)docs/superpowers/**'
echo
echo "=== deleted app names ==="
git grep -l 'app-2004scape\|app-babylon\|app-clawville\|app-hyperscape\|app-defense-of-the-agents\|app-shopify' -- ':(exclude)docs/superpowers/**'
```
Expected: each section either empty or only hits in `LICENSE` / `NOTICE.md` / this plan / the spec doc / `.git*`.

- [ ] **Step 2: For each non-empty hit, fix or justify**

For each stray hit outside the allowed exclusion list:
- Delete the line if it's a stale comment or dead code.
- Replace with a product-appropriate equivalent if it's live code we missed.
- Add to the exclusion set only with a written justification — don't silently ignore.

- [ ] **Step 3: Re-run tripwires**

```bash
# Re-run Step 1. Expect all empty except allowed exclusions.
```

- [ ] **Step 4: Commit only if there were fixes**

```bash
git status --short
# If there are fixes:
git add -A
git commit -m "chore(tokagentos): final scrub — remove stale cloud/eliza/legacy references"
```

### Task 6.2: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README**

```bash
cat README.md
```

- [ ] **Step 2: Rewrite to reflect product shape**

Open `README.md`. Replace with:

```markdown
# TokagentOS

Tokamak's autonomous DeFi agent framework. Runs on-chain strategies across HyperEVM (Hyperliquid perps), Polygon (Aave yield), and Polymarket via a web-based operator UI or in headless daemon mode.

Built on a fork of [elizaOS](https://github.com/elizaos/eliza) — see [NOTICE.md](./NOTICE.md) for attribution.

## Runtime modes

Select via `TOKAGENT_EXECUTION_MODE` in `.env`:

- **`daemon`** — headless; `StrategyRunnerService` ticks, actions sign via the operator private key in env. No UI served.
- **`operator`** — daemon + local React UI on `SERVER_PORT`. Four tabs: Chat / Automations / Wallet / Settings.

## Quick start

```bash
cd tokagentos
bun install
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, OPERATOR_PRIVATE_KEY, RPC_HYPEREVM, VAULT_ADDRESS_HYPEREVM
bun run start
```

## Plugins

In-tree Tokagent plugins:
- `plugin-tokagent-strategy` — strategy engine + `StrategyRunnerService`
- `plugin-tokagent-perps` — Hyperliquid perpetuals on HyperEVM
- `plugin-tokagent-polymarket` — Polymarket prediction markets
- `plugin-tokagent-yield` — Aave v3 yield on Polygon
- `plugin-tokagent-shared` — shared vault bindings, chain config, wallet helpers

AI providers and messaging channels are env-gated — set the relevant API key to auto-enable.

## CLI

The `tokagentos` CLI scaffolds new projects from templates:

```bash
bunx @tokagent/tokagentos create my-agent --provider anthropic
```

See `packages/tokagentos/README.md` for full CLI usage.

## License

MIT, inherited from upstream elizaOS. See [LICENSE](./LICENSE).
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): rewrite to reflect cleaned product shape"
```

### Task 6.3: Record size/complexity targets in a PR-description file

**Files:**
- Create: `.cleanup-metrics.txt` (gitignored — local artifact for PR writing)

- [ ] **Step 1: Capture post-cleanup metrics**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
{
  echo "=== Date: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "=== Commit: $(git rev-parse HEAD) ==="
  echo
  echo "=== du -sh packages/ plugins/ apps/ ==="
  du -sh packages/ plugins/ apps/ 2>&1 || true
  echo
  echo "=== workspace count ==="
  bun pm ls --filter '*' 2>/dev/null | wc -l
  echo
  echo "=== .gitmodules line count ==="
  wc -l .gitmodules
  echo
  echo "=== install timing ==="
  rm -rf node_modules
  time bun install 2>&1 | tail -5
} > .cleanup-metrics.txt 2>&1
```

- [ ] **Step 2: Compare against Phase-0 baseline**

```bash
diff <(grep -E 'workspace|\.gitmodules|du -sh|real\s' .cleanup-baseline.txt) \
     <(grep -E 'workspace|\.gitmodules|du -sh|real\s' .cleanup-metrics.txt)
```
Expected: disk usage, workspace count, gitmodules count all decreased; install time decreased.

- [ ] **Step 3: Paste the before/after into the final PR description (no commit needed — these are local artifacts)**

### Task 6.4: Final gate + push

- [ ] **Step 1: Run the full gate one more time**

```bash
rm -rf node_modules && bun install 2>&1 | tail -10
bun run build 2>&1 | tail -30
bun run typecheck 2>&1 | tail -20
bun run lint:check 2>&1 | tail -20
bun run test 2>&1 | tail -30
```
Expected: all exit 0. Same test pass count as Phase-0 baseline.

- [ ] **Step 2: Push the final state**

```bash
git push
```

- [ ] **Step 3: Open the final PR**

In the GitHub UI (or via `gh pr create`), open a PR titled:
```
chore(tokagentos): prune elizaOS legacy for v1 — cloud, mobile, games, unused plugins
```
Body template:
```markdown
## Summary
- Removed managed-cloud flows (cloud/ submodule, cloud-*.ts routes, CloudStatusBadge UI)
- Removed Capacitor native-plugins (web-only target)
- Removed 16 legacy apps (game integrations, task-coordinator, training, etc.)
- Removed 14 unused elizaOS plugin submodules (shell/executecode/computeruse/solana/music-*/calendly/github/cli/commands/cron/edge-tts/agent-orchestrator/elizacloud)
- Removed 11 unused packages (benchmarks/examples/scenario-*/prompts/interop/python/rust/skills/docs/plugin-hiveexchange)
- Rewrote .env.example to match the actual product surface
- Added env-sync check for root/template .env.example

## Metrics
[paste .cleanup-metrics.txt diff against .cleanup-baseline.txt]

## Rollback
Tag `pre-cleanup` exists at the pre-cleanup commit. To fully revert:
`git reset --hard pre-cleanup`

## Test plan
- [x] `bun install && bun run build && bun run test` — passes with same count as pre-cleanup baseline
- [x] Daemon smoke test — boots, no "Cannot find module", strategy runner ticks
- [x] Operator smoke test — boots, four tabs render, no cloud 404s
- [x] CLI scaffold smoke test — `tokagentos create` produces a clean working project
- [ ] Manual UI click-test in operator mode (reviewer)
```

---

## Self-Review Checklist (run after plan is written)

**Spec coverage** — each spec section has a task:
- §3 Target product shape → covered by overall plan structure
- §4 What is kept → covered implicitly (all non-kept items get deletion tasks)
- §5a Deleted outright → Phase 1 (native-plugins, apps), Phase 2 (cloud, steward-fi), Phase 4 (packages)
- §5b Submodule-removed plugins → Phase 3 (14 plugins)
- §6 In-place edits → Phase 1 (tokagent.ts), Phase 2 (cloud branches), Phase 5 (env, scaffold, configs)
- §7 Architecture post-cleanup → outcome of Phases 1–5
- §8 Phased execution → Phases 0–6 one-for-one
- §9a Per-phase gate → Task 1.5, 2.7, 3.7, 4.2, 5.7, 6.4
- §9b Runtime smoke → Task 2.7 Steps 3–4, Task 3.7 Step 3, Task 5.7 Steps 5
- §9c CLI scaffold smoke → Task 5.7
- §9d Grep tripwires → Task 6.1
- §9e Size/complexity targets → Task 6.3
- §9f Definition of done → covered across Phase 6 + final PR
- §10 Risks → embedded as cautions in relevant tasks
- §11 Rollback → Task 0.2 (tag), PR template in Task 6.4
- §12 Open questions → addressed:
  - app-companion fate → Task 1.1
  - env-sync mechanism → Task 5.3 (chose the "check script" option)
  - squash vs not → left as PR-reviewer choice in Task 6.4
  - Phase 3 submodule order → Task 3.1 → 3.6 explicitly ordered low-to-high coupling

**Placeholder scan** — none of the forbidden patterns appear:
- No "TBD", "TODO", "implement later"
- No "add appropriate error handling" without specifics
- Every code step shows exact code or exact command
- "Similar to Task N" not used — repeated patterns fully spelled out

**Type consistency** — names used consistently:
- `TOKAGENT_EXECUTION_MODE` (not `EXECUTION_MODE` or `TOKAGENT_MODE`) throughout
- `cleanup/remove-eliza-legacy` (not `cleanup/remove-elizaos`) branch name
- `pre-cleanup` tag referenced consistently
- `StrategyRunnerService` spelled the same in every smoke test
- `OPERATOR_PRIVATE_KEY`, `VAULT_ADDRESS_HYPEREVM`, `RPC_HYPEREVM` consistent across env examples and smoke tests
- Phase numbers (0–6) and Task numbers (N.M) consistent

Plan is ready for execution.
