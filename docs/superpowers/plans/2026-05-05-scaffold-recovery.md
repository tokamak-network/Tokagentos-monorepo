# Scaffold Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot tokagentos from dead `elizaos-plugins/*` git submodules to npm-resolution for elizaos plugin dependencies — fixing both the broken `tokagentos create` scaffolding pipeline AND the dev repo's stub workspace state, in one coherent change.

**Architecture:** Drop 19 dead submodule entries from `tokagentos/.gitmodules` and the matching stub directories under `plugins/`. Replace 7 `workspace:*` declarations in root `package.json` with exact npm version pins. Extend `UPSTREAM_PRUNE_PATHS` in the scaffold pipeline so dead `elizaos-plugins/*` submodule URLs are stripped from upstream eliza's `.gitmodules` BEFORE recursive submodule init runs. Drop the OpenRouter source-mutation surgical patch and replace its behavior with a `.env` writer call to the existing `writeLlmExtraEnv` helper. Reconcile `templates-manifest.json` and `template.json` to drop the dead `requiredSubmodules`/`requiredWorkspaces` entries.

**Tech Stack:** TypeScript, Bun, Vitest, Commander, `@clack/prompts`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-05-scaffold-recovery-design.md`

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `tokagentos/.gitmodules` | Modify | Delete 19 entries pointing at the depopulated `elizaos-plugins/*` org. Keep any other entries unchanged. |
| `tokagentos/plugins/plugin-{anthropic,discord,evm,google-genai,groq,imessage,local-ai,local-embedding,ollama,openai,openrouter,pdf,shopify,sql,telegram,twitter,wechat,whatsapp,agent-skills}/` | Delete | 19 stub directories whose only content is a `package.json` declaring `"version": "0.0.0-stub"`. |
| `tokagentos/package.json` | Modify | Replace 7 `workspace:*` declarations with exact npm version pins (`@elizaos/plugin-{anthropic,groq,local-embedding,local-ai,ollama,openai,sql}`). Workspaces glob unchanged. |
| `packages/tokagentos/src/scaffold.ts:59-62` | Modify | Append 19 dead `plugins/plugin-*` paths to `UPSTREAM_PRUNE_PATHS`. |
| `packages/tokagentos/src/scaffold.ts:184-201` | Modify | Delete the OpenRouter surgical patch object from the patches array. |
| `packages/tokagentos/src/commands/create.ts` (orchestration block at ~line 552-559) | Modify | Add a `writeLlmExtraEnv` call that writes `OPENROUTER_SMALL_MODEL=anthropic/claude-haiku-4-5` and `OPENROUTER_LARGE_MODEL=anthropic/claude-sonnet-4.6` to the scaffolded `.env`, replacing the deleted surgical patch's behavior. |
| `packages/tokagentos/templates-manifest.json` | Modify | Drop `plugins/plugin-local-ai`, `plugins/plugin-ollama`, `plugins/plugin-sql` from `requiredSubmodules`. Drop `plugins/plugin-local-ai/typescript`, `plugins/plugin-ollama/typescript`, `plugins/plugin-sql/typescript` from `requiredWorkspaces`. |
| `packages/tokagentos/templates/fullstack-app/template.json` | Modify | Same edits as `templates-manifest.json` (this file mirrors the fullstack-app entry). |
| `packages/tokagentos/src/__tests__/gitmodules.test.ts` | Create | Regression test asserting `.gitmodules` contains no `elizaos-plugins/` URLs. |
| `packages/tokagentos/src/__tests__/scaffold-patches.test.ts` | Modify | Add assertions that `UPSTREAM_PRUNE_PATHS` includes the 19 dead paths AND the surgical patches array contains no entry targeting `plugins/plugin-openrouter/`. |
| `packages/tokagentos/src/__tests__/create.test.ts` | Modify | Add assertion that scaffolded `.env` contains both `OPENROUTER_SMALL_MODEL=` and `OPENROUTER_LARGE_MODEL=` lines with the exact values. |

**Pre-flight constraint:** the working tree currently has uncommitted modifications to `packages/tokagentos/templates-manifest.json` and `packages/tokagentos/templates/fullstack-app/template.json` that overlap with the files Task 6 edits. Task 0 reconciles this BEFORE any other task starts. Skipping Task 0 will produce conflict-prone diffs.

---

## Task 0: Reconcile working-tree state

**Files:**
- Inspect: `packages/tokagentos/templates-manifest.json`, `packages/tokagentos/templates/fullstack-app/template.json`

**Context:** The user has uncommitted modifications to these two files at the start of this work. They may be in-flight work related to this exact recovery, or unrelated drift. Either way they must be resolved before Task 6 edits the same files.

- [ ] **Step 1: Show the diff and decide**

Run:
```bash
git diff packages/tokagentos/templates-manifest.json packages/tokagentos/templates/fullstack-app/template.json
```

Inspect output. Three possibilities:

1. **The diff already matches Task 6's intent** (drops `plugins/plugin-{local-ai,ollama,sql}` from required arrays). Action: commit it as a wip-then-amend later, or leave staged and let Task 6 build on it.
2. **The diff is unrelated** (different field edits, manifest version bump, etc.). Action: stash it via `git stash push -- packages/tokagentos/templates-manifest.json packages/tokagentos/templates/fullstack-app/template.json`, complete this plan, then `git stash pop` and resolve any conflicts manually.
3. **The diff is in-flight but partial** (e.g., dropped from one file but not the other). Action: stash, complete this plan, `git stash pop`, manually merge.

**If unsure, default to stash.** Record what was stashed in the implementer's report so the controller can guide post-plan reconciliation.

- [ ] **Step 2: Confirm clean state for the two manifest files**

Run:
```bash
git status packages/tokagentos/templates-manifest.json packages/tokagentos/templates/fullstack-app/template.json
```

Expected: no listed changes for these two files (either committed, stashed, or already absent from the modified set).

- [ ] **Step 3: Report back without committing**

Report what you found and what you did. Do NOT advance to Task 1 until the controller confirms the chosen disposition.

**Status this task as DONE_WITH_CONCERNS if you stashed**, with the stash ref in the report so the user can recover their work later.

---

## Task 1: Dev repo cleanup (gitmodules + stubs + workspace pins)

**Files:**
- Modify: `tokagentos/.gitmodules` — delete 19 entries
- Delete: 19 directories under `tokagentos/plugins/plugin-*`
- Modify: `tokagentos/package.json` — replace 7 `workspace:*` with version pins

**Context:** These three changes must land in ONE commit because they're internally inconsistent if separated. Removing the workspace declarations without deleting the stubs leaves `bun install` confused (workspace pkg + npm pin colliding on the same package name). Deleting the stubs without removing the gitmodules entries leaves git's submodule tracking complaining. Single atomic commit.

- [ ] **Step 1: Read current state**

Run:
```bash
cat tokagentos/.gitmodules | grep -c '\[submodule'
ls tokagentos/plugins/ | grep -c '^plugin-' | head
grep '"@elizaos/plugin-.*workspace:\*"' tokagentos/package.json
```

Expected output (approximately):
- `.gitmodules`: 20 submodule entries (19 to delete + at least 1 to keep, e.g., `plugin-tokagent-shared` is in `plugins/` but is owned by tokagent — but actually wait, `plugin-tokagent-*` are NOT submodules, they're in-tree; verify)
- `plugins/`: 24 directories (19 stubs to delete + 5 `plugin-tokagent-*`)
- `package.json`: 7 workspace:* lines

If counts don't match the spec's expectations, STOP and report as NEEDS_CONTEXT. Do not proceed.

- [ ] **Step 2: Edit `tokagentos/.gitmodules`**

Open `.gitmodules` and delete the 19 `[submodule ...]` blocks for these paths:

```
plugins/plugin-agent-skills
plugins/plugin-anthropic
plugins/plugin-discord
plugins/plugin-evm
plugins/plugin-google-genai
plugins/plugin-groq
plugins/plugin-imessage
plugins/plugin-local-ai
plugins/plugin-local-embedding
plugins/plugin-ollama
plugins/plugin-openai
plugins/plugin-openrouter
plugins/plugin-pdf
plugins/plugin-shopify
plugins/plugin-sql
plugins/plugin-telegram
plugins/plugin-twitter
plugins/plugin-wechat
plugins/plugin-whatsapp
```

Each block looks like:
```
[submodule "plugins/plugin-X"]
	path = plugins/plugin-X
	url = https://github.com/elizaos-plugins/plugin-X.git
	branch = alpha
```

(or `branch = main`/`master` for some). Delete the entire 4-line block per submodule.

After editing, verify no `elizaos-plugins/` URLs remain:
```bash
grep -c "elizaos-plugins" tokagentos/.gitmodules
```
Expected: `0`.

- [ ] **Step 3: Delete the 19 stub directories**

Run:
```bash
cd tokagentos
git rm -rf plugins/plugin-agent-skills plugins/plugin-anthropic plugins/plugin-discord plugins/plugin-evm plugins/plugin-google-genai plugins/plugin-groq plugins/plugin-imessage plugins/plugin-local-ai plugins/plugin-local-embedding plugins/plugin-ollama plugins/plugin-openai plugins/plugin-openrouter plugins/plugin-pdf plugins/plugin-shopify plugins/plugin-sql plugins/plugin-telegram plugins/plugin-twitter plugins/plugin-wechat plugins/plugin-whatsapp
```

Expected: `git rm` reports 19 deletions (1 file each, the stub `package.json`). If git complains about untracked files in any of these dirs, inspect first — should not happen but worth verifying.

- [ ] **Step 4: Edit `tokagentos/package.json` — swap workspace:* for npm pins**

Open `tokagentos/package.json`. Find the 7 lines:

```json
"@elizaos/plugin-anthropic": "workspace:*",
"@elizaos/plugin-groq": "workspace:*",
"@elizaos/plugin-local-embedding": "workspace:*",
"@elizaos/plugin-local-ai": "workspace:*",
"@elizaos/plugin-ollama": "workspace:*",
"@elizaos/plugin-openai": "workspace:*",
"@elizaos/plugin-sql": "workspace:*",
```

Replace each with the exact npm version (verified during spec self-review):

```json
"@elizaos/plugin-anthropic": "1.5.12",
"@elizaos/plugin-groq": "1.0.4",
"@elizaos/plugin-local-embedding": "2.0.0-alpha.3",
"@elizaos/plugin-local-ai": "1.2.1",
"@elizaos/plugin-ollama": "1.2.4",
"@elizaos/plugin-openai": "1.6.0",
"@elizaos/plugin-sql": "1.7.2",
```

Preserve dependency-block ordering otherwise. Do NOT touch `@elizaos/plugin-tokagent-*` declarations or other unrelated dependency lines.

- [ ] **Step 5: Run `bun install` to confirm resolution**

Run:
```bash
cd tokagentos
bun install
```

Expected: install completes without errors. The 7 elizaos plugins resolve from npm into `node_modules/@elizaos/plugin-*`. Workspace plugins (`plugins/plugin-tokagent-*`) continue to resolve via the workspace glob. If install fails:
- Read the error carefully. If a package version isn't found, the npm pin in step 4 may have drifted since spec time — report as BLOCKED with the specific missing version.
- If a workspace conflict appears, the stub deletion in step 3 may have been incomplete — verify.

- [ ] **Step 6: Spot-check a runtime resolution**

Run:
```bash
cd tokagentos
ls node_modules/@elizaos/plugin-openai/dist 2>&1 | head -3
```

Expected: `dist/` listing showing `index.js`, `index.d.ts`, etc. — confirms the npm tarball populated correctly.

- [ ] **Step 7: Commit (single atomic commit covers .gitmodules, stub deletions, package.json swap)**

```bash
git add tokagentos/.gitmodules tokagentos/package.json
# stub deletions were staged by `git rm` in Step 3
git commit -m "chore(scaffold-recovery): drop dead elizaos-plugins submodules; pin to npm

The github.com/elizaos-plugins/* org is depopulated — every plugin repo
returns 404. Drop 19 stub submodule entries from .gitmodules + their
empty stub directories. Replace 7 workspace:* declarations in root
package.json with exact npm version pins (verified complete tarballs
on npm). After this, bun install resolves elizaos plugins entirely from
the npm registry; the in-tree plugin-tokagent-* set continues to
resolve via the workspace glob.

Teammates may need: rm -rf any dangling plugins/plugin-{old-list}/
directories in their working tree post-pull.
"
```

If `bun install` updated `bun.lock` materially (it should — the resolution shape changed), include that:
```bash
git add bun.lock
git commit --amend --no-edit
```

---

## Task 2: Add gitmodules regression test

**Files:**
- Create: `packages/tokagentos/src/__tests__/gitmodules.test.ts`

**Context:** A future syncing of upstream eliza's `.gitmodules` (or a `git submodule sync` operation) could re-introduce the dead URLs. A trivial content-assertion test catches drift early.

- [ ] **Step 1: Write the test**

Create `packages/tokagentos/src/__tests__/gitmodules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("tokagentos/.gitmodules", () => {
  it("contains no entries pointing at the depopulated elizaos-plugins org", () => {
    // Path resolves from the test file location to the repo root
    // (packages/tokagentos/src/__tests__/ → ../../.. → tokagentos/).
    const repoRoot = path.resolve(__dirname, "../../../..");
    const gitmodulesPath = path.join(repoRoot, ".gitmodules");
    if (!fs.existsSync(gitmodulesPath)) {
      // No .gitmodules at all is also fine (e.g., fresh worktrees, CI
      // sparse checkouts). The assertion only fires if the file exists.
      return;
    }
    const content = fs.readFileSync(gitmodulesPath, "utf-8");
    expect(content).not.toMatch(/elizaos-plugins\//i);
  });

  it("contains no URLs for the 19 known-dead plugin repos by name", () => {
    const repoRoot = path.resolve(__dirname, "../../../..");
    const gitmodulesPath = path.join(repoRoot, ".gitmodules");
    if (!fs.existsSync(gitmodulesPath)) return;
    const content = fs.readFileSync(gitmodulesPath, "utf-8");
    const deadPaths = [
      "plugin-agent-skills",
      "plugin-anthropic",
      "plugin-discord",
      "plugin-evm",
      "plugin-google-genai",
      "plugin-groq",
      "plugin-imessage",
      "plugin-local-ai",
      "plugin-local-embedding",
      "plugin-ollama",
      "plugin-openai",
      "plugin-openrouter",
      "plugin-pdf",
      "plugin-shopify",
      "plugin-sql",
      "plugin-telegram",
      "plugin-twitter",
      "plugin-wechat",
      "plugin-whatsapp",
    ];
    for (const dead of deadPaths) {
      // Match `[submodule "plugins/plugin-X"]` exactly so we don't false-
      // positive on a hypothetical future plugin-X-foo.
      expect(content).not.toMatch(
        new RegExp(`\\[submodule "plugins/${dead}"\\]`, "i"),
      );
    }
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd packages/tokagentos
bunx vitest run src/__tests__/gitmodules.test.ts
```

Expected: 2/2 pass. If either fails, Task 1 was incomplete — return to Task 1 and verify.

- [ ] **Step 3: Commit**

```bash
git add packages/tokagentos/src/__tests__/gitmodules.test.ts
git commit -m "test(scaffold-recovery): regression test against elizaos-plugins drift in .gitmodules"
```

---

## Task 3: Extend `UPSTREAM_PRUNE_PATHS`

**Files:**
- Modify: `packages/tokagentos/src/scaffold.ts:59-62`
- Modify: `packages/tokagentos/src/__tests__/scaffold-patches.test.ts` (extend)

**Context:** `UPSTREAM_PRUNE_PATHS` (currently 2 entries) feeds `removeSubmodulesFromGitmodules`, which strips matching submodule blocks from upstream eliza's `.gitmodules` BEFORE `git submodule update --init --recursive` runs. Adding the 19 dead `plugins/plugin-*` paths to this list prevents the scaffold from attempting to clone them.

- [ ] **Step 1: Write the failing test**

Open `packages/tokagentos/src/__tests__/scaffold-patches.test.ts`. Add a new `describe` block:

```ts
import { UPSTREAM_PRUNE_PATHS } from "../scaffold.js";

describe("UPSTREAM_PRUNE_PATHS", () => {
  it("includes all 19 dead elizaos-plugins paths", () => {
    const required = [
      "plugins/plugin-agent-skills",
      "plugins/plugin-anthropic",
      "plugins/plugin-discord",
      "plugins/plugin-evm",
      "plugins/plugin-google-genai",
      "plugins/plugin-groq",
      "plugins/plugin-imessage",
      "plugins/plugin-local-ai",
      "plugins/plugin-local-embedding",
      "plugins/plugin-ollama",
      "plugins/plugin-openai",
      "plugins/plugin-openrouter",
      "plugins/plugin-pdf",
      "plugins/plugin-shopify",
      "plugins/plugin-sql",
      "plugins/plugin-telegram",
      "plugins/plugin-twitter",
      "plugins/plugin-wechat",
      "plugins/plugin-whatsapp",
    ];
    for (const p of required) {
      expect(UPSTREAM_PRUNE_PATHS).toContain(p);
    }
  });
});
```

You'll also need to **export** `UPSTREAM_PRUNE_PATHS` from `scaffold.ts`. Today it's declared as `const`. Change line 59 from:
```ts
const UPSTREAM_PRUNE_PATHS = [
```
to:
```ts
export const UPSTREAM_PRUNE_PATHS = [
```

(Test the export change in Step 3.)

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/tokagentos
bunx vitest run src/__tests__/scaffold-patches.test.ts -t "UPSTREAM_PRUNE_PATHS"
```

Expected: FAIL. The 19 paths aren't in the list yet.

- [ ] **Step 3: Edit `scaffold.ts` to add the 19 paths**

Open `packages/tokagentos/src/scaffold.ts`. Find the existing `UPSTREAM_PRUNE_PATHS` declaration around line 59-62:

```ts
export const UPSTREAM_PRUNE_PATHS = [
  "plugins/plugin-elizacloud",
  "cloud",
] as const;
```

(After Step 1 added the `export` keyword.) Append the 19 dead plugin paths with a comment block explaining provenance:

```ts
export const UPSTREAM_PRUNE_PATHS = [
  "plugins/plugin-elizacloud",
  "cloud",
  // Dead `elizaos-plugins/*` submodules. The github.com/elizaos-plugins
  // org was depopulated as of 2026-05-05 — every plugin repo returns 404.
  // Stripping these entries from upstream eliza's .gitmodules BEFORE
  // recursive submodule init prevents the scaffold from 404-storming.
  // Plugin code is now resolved via npm (see root package.json pins).
  // Refresh procedure: when bumping the upstream eliza commit, grep
  // upstream's .gitmodules for `elizaos-plugins/` and add any newly-
  // appearing paths to this list.
  "plugins/plugin-agent-skills",
  "plugins/plugin-anthropic",
  "plugins/plugin-discord",
  "plugins/plugin-evm",
  "plugins/plugin-google-genai",
  "plugins/plugin-groq",
  "plugins/plugin-imessage",
  "plugins/plugin-local-ai",
  "plugins/plugin-local-embedding",
  "plugins/plugin-ollama",
  "plugins/plugin-openai",
  "plugins/plugin-openrouter",
  "plugins/plugin-pdf",
  "plugins/plugin-shopify",
  "plugins/plugin-sql",
  "plugins/plugin-telegram",
  "plugins/plugin-twitter",
  "plugins/plugin-wechat",
  "plugins/plugin-whatsapp",
] as const;
```

Preserve `as const` so consumers still get the literal-tuple type.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/tokagentos
bunx vitest run src/__tests__/scaffold-patches.test.ts -t "UPSTREAM_PRUNE_PATHS"
```

Expected: PASS.

- [ ] **Step 5: Run the full scaffold-patches suite**

```bash
cd packages/tokagentos
bunx vitest run src/__tests__/scaffold-patches.test.ts
```

Expected: all assertions pass for new test; pre-existing failures (the `result.missing` assertion on line 35 of the file) may persist — they're unrelated to this task and pre-date all this work.

- [ ] **Step 6: Commit**

```bash
git add packages/tokagentos/src/scaffold.ts packages/tokagentos/src/__tests__/scaffold-patches.test.ts
git commit -m "feat(scaffold-recovery): prune elizaos-plugins/* submodules before upstream init

Adds the 19 dead `plugins/plugin-*` paths to UPSTREAM_PRUNE_PATHS so
removeSubmodulesFromGitmodules strips them from upstream eliza's
.gitmodules before recursive submodule init runs. Without this, the
scaffold pipeline hits 19 × 404 against the depopulated elizaos-plugins
org.
"
```

---

## Task 4: Drop the OpenRouter surgical patch

**Files:**
- Modify: `packages/tokagentos/src/scaffold.ts:184-201` — delete the patch entry
- Modify: `packages/tokagentos/src/__tests__/scaffold-patches.test.ts` (extend)

**Context:** The OpenRouter surgical patch targets `plugins/plugin-openrouter/typescript/utils/config.ts`, which Task 3's pruning prevents from existing in the scaffold (the plugin-openrouter submodule won't clone). Even with Task 3 in place, this patch will throw the `[surgical-patch] target file missing` error. Replacement behavior moves to Task 5's `.env` writer.

- [ ] **Step 1: Identify the existing patch entry**

Run:
```bash
grep -n "plugins/plugin-openrouter" packages/tokagentos/src/scaffold.ts
```

Expected: one hit at approximately line 185. Read lines 184-201 to confirm shape:

```ts
{
  path: "plugins/plugin-openrouter/typescript/utils/config.ts",
  description:
    "Repoint OpenRouter defaults from Google Gemini (free-tier, prone " +
    "to 429s and 504s — drives ~20s/turn retry backoff in chat) to " +
    "Anthropic Claude Haiku/Sonnet, which OpenRouter routes reliably " +
    "without a separate provider key. Users can still override via " +
    "OPENROUTER_SMALL_MODEL / OPENROUTER_LARGE_MODEL env or per-call.",
  find:
    'export const DEFAULT_SMALL_MODEL = "google/gemini-2.0-flash-001";\n' +
    'export const DEFAULT_LARGE_MODEL = "google/gemini-2.5-flash";\n',
  replaceWith:
    '// [tokagent surgical-patch] Anthropic models route reliably on\n' +
    '// OpenRouter even without a paid Google key. Override via\n' +
    '// OPENROUTER_SMALL_MODEL / OPENROUTER_LARGE_MODEL env.\n' +
    'export const DEFAULT_SMALL_MODEL = "anthropic/claude-haiku-4-5";\n' +
    'export const DEFAULT_LARGE_MODEL = "anthropic/claude-sonnet-4.6";\n',
},
```

Note the model strings — Task 5 will copy them verbatim into the `.env` writer.

- [ ] **Step 2: Write the failing test**

In `packages/tokagentos/src/__tests__/scaffold-patches.test.ts`, add another `describe` block:

```ts
import { UPSTREAM_SURGICAL_PATCHES } from "../scaffold.js";

describe("UPSTREAM_SURGICAL_PATCHES", () => {
  it("does not target plugins/plugin-openrouter (npm-resolved, not source-mutated)", () => {
    const targets = UPSTREAM_SURGICAL_PATCHES.map((p) => p.path);
    for (const t of targets) {
      expect(t).not.toMatch(/^plugins\/plugin-openrouter\//);
    }
  });
});
```

The patches array exists in `scaffold.ts:129` as `const UPSTREAM_SURGICAL_PATCHES: ReadonlyArray<{...}> = [...]` — it's already named, just not exported. Add the `export` keyword:

```ts
// scaffold.ts line 129 — change:
const UPSTREAM_SURGICAL_PATCHES: ReadonlyArray<{
// to:
export const UPSTREAM_SURGICAL_PATCHES: ReadonlyArray<{
```

No array refactor needed. The variable is already in the right shape; just make it visible to the test file.

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd packages/tokagentos
bunx vitest run src/__tests__/scaffold-patches.test.ts -t "UPSTREAM_SURGICAL_PATCHES"
```

Expected: FAIL. The OpenRouter patch is still in the array.

- [ ] **Step 4: Delete the OpenRouter patch entry**

In `packages/tokagentos/src/scaffold.ts`, delete the entire patch object (lines ~184-201, the one with `path: "plugins/plugin-openrouter/typescript/utils/config.ts"`). Preserve commas so the array remains valid.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/tokagentos
bunx vitest run src/__tests__/scaffold-patches.test.ts -t "UPSTREAM_SURGICAL_PATCHES"
```

Expected: PASS.

- [ ] **Step 6: Run all scaffold-patches tests to confirm no regression**

```bash
cd packages/tokagentos
bunx vitest run src/__tests__/scaffold-patches.test.ts
```

Expected: pre-existing `result.missing` assertion failure may persist (unrelated, pre-existing). All other tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/tokagentos/src/scaffold.ts packages/tokagentos/src/__tests__/scaffold-patches.test.ts
git commit -m "feat(scaffold-recovery): drop OpenRouter source-mutation surgical patch

The patch targeted plugins/plugin-openrouter/typescript/utils/config.ts,
which is no longer cloned (Task 3 pruned it). Behavior is preserved by
the .env-writer call added in the next commit (Task 5).
"
```

---

## Task 5: Replace OpenRouter source mutation with `.env` writer

**Files:**
- Modify: `packages/tokagentos/src/commands/create.ts` — add `writeLlmExtraEnv` call for OpenRouter defaults
- Modify: `packages/tokagentos/src/__tests__/create.test.ts` (extend)

**Context:** The just-deleted surgical patch was setting `DEFAULT_SMALL_MODEL = "anthropic/claude-haiku-4-5"` and `DEFAULT_LARGE_MODEL = "anthropic/claude-sonnet-4.6"` in the OpenRouter plugin's source. The same UX is reproduced by writing `OPENROUTER_SMALL_MODEL` and `OPENROUTER_LARGE_MODEL` to the scaffolded `.env` — the OpenRouter plugin reads these env vars at runtime and uses them instead of its hardcoded defaults.

The existing `writeLlmExtraEnv` helper from the LiteLLM work (`commit da184efd`) already does exactly this. Reuse it.

- [ ] **Step 1: Locate the orchestration block**

Run:
```bash
grep -n "writeLlmEnvFile\|writeLlmExtraEnv" packages/tokagentos/src/commands/create.ts
```

Expected: definitions of both helpers, plus calls to them inside the `create` function (around line 552-560 today). Read those lines to confirm structure.

- [ ] **Step 2: Write the failing test**

Open `packages/tokagentos/src/__tests__/create.test.ts`. Inside the existing `describe("create command — litellm", () => { ... })` block (or in a new sibling `describe`), add:

```ts
  it("writes OpenRouter model defaults to .env regardless of provider", async () => {
    await withTempCwd(async (dir) => {
      await create("test-app-or", {
        template: "fullstack-app",
        language: "typescript",
        yes: true,
        llm: "anthropic",
        apiKey: "sk-ant-test",
      });
      const envPath = path.join(dir, "test-app-or", ".env");
      const content = fs.readFileSync(envPath, "utf-8");
      expect(content).toMatch(/^OPENROUTER_SMALL_MODEL=anthropic\/claude-haiku-4-5$/m);
      expect(content).toMatch(/^OPENROUTER_LARGE_MODEL=anthropic\/claude-sonnet-4\.6$/m);
    });
  });
```

This test uses `--llm anthropic` (an arbitrary non-OpenRouter provider) to prove the OpenRouter defaults are written **regardless of which provider the user picks** — they're defaults that activate if the user later switches to OpenRouter via the in-app provider switcher.

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd packages/tokagentos
bunx vitest run src/__tests__/create.test.ts -t "OpenRouter"
```

Expected: FAIL — the OpenRouter env defaults aren't being written yet.

- [ ] **Step 4: Add the `writeLlmExtraEnv` call in `create.ts`**

Open `packages/tokagentos/src/commands/create.ts`. Find the orchestration block (around line 552-559):

```ts
  if (apiKey) {
    writeLlmEnvFile(destinationDir, llmProvider, apiKey);
    spinner.message(
      `Wrote ${llmProvider.envVar} to .env (${llmProvider.label})`,
    );
    if (litellmExtras) {
      writeLlmExtraEnv(destinationDir, [
        { key: "LITELLM_BASE_URL", value: litellmExtras.baseUrl },
        { key: "LITELLM_SMALL_MODEL", value: litellmExtras.smallModel },
        { key: "LITELLM_LARGE_MODEL", value: litellmExtras.largeModel },
      ]);
    }
    // Pre-complete onboarding so the UI doesn't prompt for the key again.
    preCompleteOnboarding(finalProjectName, llmProvider);
  }
```

After the existing `if (litellmExtras)` block and before `preCompleteOnboarding`, add an unconditional OpenRouter defaults write:

```ts
    // OpenRouter model defaults — written unconditionally so the in-app
    // provider switcher can flip to OpenRouter later without the user
    // having to manually edit .env. Replaces the (deleted) surgical patch
    // on plugins/plugin-openrouter/typescript/utils/config.ts that
    // previously hardcoded these as the plugin's source-level defaults.
    // Override these by editing .env or via env var.
    writeLlmExtraEnv(destinationDir, [
      { key: "OPENROUTER_SMALL_MODEL", value: "anthropic/claude-haiku-4-5" },
      { key: "OPENROUTER_LARGE_MODEL", value: "anthropic/claude-sonnet-4.6" },
    ]);
```

The exact model strings (`anthropic/claude-haiku-4-5`, `anthropic/claude-sonnet-4.6`) MUST match the strings the deleted surgical patch was setting at `scaffold.ts:199-200`. Verified during spec writing — copy verbatim.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/tokagentos
bunx vitest run src/__tests__/create.test.ts -t "OpenRouter"
```

Expected: PASS.

- [ ] **Step 6: Run the full create.test.ts suite to confirm no regression**

```bash
cd packages/tokagentos
bunx vitest run src/__tests__/create.test.ts
```

Expected: all 3 tests pass (2 from LiteLLM + 1 new).

- [ ] **Step 7: Commit**

```bash
git add packages/tokagentos/src/commands/create.ts packages/tokagentos/src/__tests__/create.test.ts
git commit -m "feat(scaffold-recovery): write OpenRouter model defaults to .env

Replaces the deleted source-mutation surgical patch (Task 4) with an
.env writer that sets OPENROUTER_SMALL_MODEL and OPENROUTER_LARGE_MODEL
unconditionally during scaffold. Same default model strings as the old
patch (anthropic/claude-haiku-4-5, anthropic/claude-sonnet-4.6).
Reuses the writeLlmExtraEnv helper introduced in the LiteLLM work.
"
```

---

## Task 6: Reconcile template manifest files

**Files:**
- Modify: `packages/tokagentos/templates-manifest.json`
- Modify: `packages/tokagentos/templates/fullstack-app/template.json`

**Context:** Both files declare `requiredSubmodules` and `requiredWorkspaces` arrays that include `plugins/plugin-local-ai`, `plugins/plugin-ollama`, `plugins/plugin-sql` (and the `/typescript` subpaths for workspaces). After Task 3's pruning, those submodule paths no longer exist in the cloned eliza tree — listing them in `requiredSubmodules` would cause the scaffold's individual-submodule-init retry loop to attempt and fail.

This task assumes Task 0 reconciled any pre-existing working-tree modifications. If Task 0 stashed conflicting changes, the implementer should consider how those interact with these edits AFTER this task lands.

- [ ] **Step 1: Read the current state of both files**

```bash
cat packages/tokagentos/templates-manifest.json
cat packages/tokagentos/templates/fullstack-app/template.json
```

Both files should currently contain (or contain something close to):

```json
"requiredSubmodules": [
  "plugins/plugin-local-ai",
  "plugins/plugin-ollama",
  "plugins/plugin-sql"
],
"requiredWorkspaces": [
  "plugins/plugin-local-ai/typescript",
  "plugins/plugin-ollama/typescript",
  "plugins/plugin-sql/typescript"
]
```

If these arrays already differ (because of Task 0's stash decision or in-flight edits the user committed), STOP and report as NEEDS_CONTEXT — the controller needs to confirm what shape these files should land in.

- [ ] **Step 2: Edit `templates-manifest.json`**

Open `packages/tokagentos/templates-manifest.json`. Find the `fullstack-app` template block. Replace the `requiredSubmodules` array with `[]` (empty array) and the `requiredWorkspaces` array with `[]`.

Result block:

```json
{
  "id": "fullstack-app",
  "name": "fullstack-app",
  ...
  "upstream": {
    ...
    "requiredSubmodules": [],
    "requiredWorkspaces": []
  }
}
```

Keep all other fields unchanged (commit hash, repo, branch, mode).

- [ ] **Step 3: Edit `template.json`**

Open `packages/tokagentos/templates/fullstack-app/template.json`. Apply the same edit — empty both arrays.

- [ ] **Step 4: Verify the JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/tokagentos/templates-manifest.json','utf-8'))"
node -e "JSON.parse(require('fs').readFileSync('packages/tokagentos/templates/fullstack-app/template.json','utf-8'))"
```

Expected: no output (silent success). If either prints a SyntaxError, fix the JSON before proceeding.

- [ ] **Step 5: Verify no test or build references the dropped paths**

```bash
grep -rn "plugins/plugin-local-ai\|plugins/plugin-ollama\|plugins/plugin-sql" packages/tokagentos/src/ packages/tokagentos/scripts/ 2>/dev/null | grep -v __tests__
```

Expected: zero hits, OR only the `UPSTREAM_PRUNE_PATHS` references in `scaffold.ts` (those are intended). If other code references these as expected paths (e.g., the `requiredSubmodules` reading code in the scaffold pipeline), inspect — likely it iterates the empty array and no-ops, which is desired.

- [ ] **Step 6: Commit**

```bash
git add packages/tokagentos/templates-manifest.json packages/tokagentos/templates/fullstack-app/template.json
git commit -m "fix(scaffold-recovery): clear dead requiredSubmodules/requiredWorkspaces

After UPSTREAM_PRUNE_PATHS strips the elizaos-plugins/* submodule
entries from the cloned eliza .gitmodules, those paths no longer
exist in the scaffolded tokagent tree. Empty the requiredSubmodules
and requiredWorkspaces arrays so the scaffold's individual-init retry
loop doesn't attempt to clone them.
"
```

---

## Task 7: Final verification

**Files:** none directly — this is sync + test + smoke documentation.

**Context:** Confirms the changes from Tasks 1-6 land cleanly together — no regressions, no plugin-mirror drift, all tests passing.

- [ ] **Step 1: Run the plugin sync check**

```bash
cd packages/tokagentos
bun run sync:plugins
```

Expected: "0 file(s) updated" or equivalent — no drift in the plugin-tokagent-* mirror tree (we didn't touch it).

- [ ] **Step 2: Run typecheck across the workspace**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
bunx turbo run typecheck 2>&1 | tail -50
```

Expected: no NEW type errors. Pre-existing `TS2307 Cannot find module` errors in `@tokagentos/agent` (from missing `@tokagentos/app-lifeops`, etc.) may persist — they're orthogonal to this work. Only flag NEW errors.

- [ ] **Step 3: Run the full vitest workspace suite**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
bunx turbo run test 2>&1 | tail -50
```

Expected: all tests we added in Tasks 2-5 pass. Pre-existing failures (`scaffold-patches.test.ts` `result.missing` assertion, `scaffold.test.ts` workspace assertions, `dist/__tests__/create.test.js` mock issues, `conversation-routes.test.ts` missing `service-loader`) may persist — all pre-existing.

- [ ] **Step 4: Confirm `bun install` works on a clean state**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
rm -rf node_modules
bun install 2>&1 | tail -20
```

Expected: install completes without errors. The 7 elizaos plugins resolve from npm. The 5 in-tree `plugin-tokagent-*` plugins resolve from the workspace.

- [ ] **Step 5: Smoke-test the scaffold (skip if no LiteLLM proxy available)**

If the user has a LiteLLM proxy reachable, run:
```bash
cd packages/tokagentos
bun run build
bun link
cd /tmp
rm -rf scaffold-recovery-smoke
tokagentos create scaffold-recovery-smoke \
  --template fullstack-app \
  --language typescript \
  --llm litellm \
  --api-key <key> \
  --llm-base-url <url> \
  --llm-small-model <model> \
  --llm-large-model <model> \
  --yes
```

Expected: scaffold completes WITHOUT the previous `[surgical-patch] target file missing` crash. The scaffolded `.env` contains both `LITELLM_*` lines AND `OPENROUTER_*_MODEL` lines. `cd scaffold-recovery-smoke && bun install && bun run dev` boots the agent.

If no LiteLLM proxy is available, document this as a release-checklist item to be performed manually before publishing the next alpha.

- [ ] **Step 6: Final commit (if anything changed)**

If `bun.lock` updated during Step 4 in a way not already captured in Task 1's amend, commit it:
```bash
git add bun.lock
git commit -m "chore(scaffold-recovery): refresh bun.lock after dependency cleanup"
```

If sync:plugins reported any updates (it shouldn't — plugin-tokagent-* wasn't touched), commit them.

- [ ] **Step 7: Push (if controller authorizes)**

Per the user's `git_remote_policy.md` memory: push to `tokamak-network/Tokamak-AI-Layer` (origin), never to a personal fork. The user explicitly authorizes pushes — do NOT push without that authorization.

If authorized:
```bash
git push origin master
```

If not authorized: report the local commit list to the controller and stop.

---

## Self-review checklist (run after writing the plan)

- [x] **Spec coverage:**
  - Component 1 (gitmodules deletion) → Task 1 step 2
  - Component 2 (stub directory deletion) → Task 1 step 3
  - Component 3 (workspace:* → npm pin) → Task 1 step 4
  - Component 4 (extend UPSTREAM_PRUNE_PATHS) → Task 3
  - Component 5 (drop OpenRouter surgical patch) → Task 4
  - Component 6 (env writer) → Task 5
  - Component 7 (templates-manifest reconciliation) → Task 6 (with Task 0 pre-flight)
  - Component 8 (tests) → Task 2 (gitmodules) + Task 3 (UPSTREAM_PRUNE_PATHS) + Task 4 (UPSTREAM_SURGICAL_PATCHES) + Task 5 (.env)
  - All 8 failure modes from the spec are addressed by Task 1's `bun install` verification + Task 7's full-workspace verification + the regression test in Task 2.

- [x] **Placeholder scan:** No "TBD", "TODO", "implement appropriate error handling" in the plan. Every code block contains executable content. The `<key>`/`<url>` placeholders in Task 7 step 5 are user-supplied secrets, not plan placeholders.

- [x] **Type consistency:**
  - `UPSTREAM_PRUNE_PATHS` exported in Task 3 step 1, then consumed in Task 3 step 4 test and used as-is in Task 6's verification (step 5 grep).
  - `UPSTREAM_SURGICAL_PATCHES` introduced in Task 4 step 2 (with refactor instructions if currently inline). Test imports the named export.
  - `writeLlmExtraEnv` referenced in Task 5 was already added in the LiteLLM work (commit `da184efd`); the new call simply reuses the existing helper without any signature change.
  - Model strings (`anthropic/claude-haiku-4-5` for small, `anthropic/claude-sonnet-4.6` for large) consistent across spec, Task 4 step 1 (existing patch), Task 5 step 4 (new env write), Task 5 step 2 (test assertion).
  - File path `packages/tokagentos/src/commands/create.ts` consistent across Task 5 step 1 grep and step 4 edit.
