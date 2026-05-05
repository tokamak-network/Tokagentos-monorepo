# Scaffold Recovery — Design

**Date**: 2026-05-05
**Status**: Approved (brainstorming complete; awaiting implementation plan)
**Owner**: tokagentos

---

## Context

Smoke testing the LiteLLM integration on 2026-05-05 surfaced a deeper problem: the entire `github.com/elizaos-plugins/*` org appears to have been depopulated. Every plugin repo there (`plugin-openai`, `plugin-anthropic`, `plugin-sql`, `plugin-evm`, etc.) returns 404. The org page itself returns 200 but every individual plugin repo is gone.

This breaks two things in tokagentos:

1. **Fresh scaffolds via `tokagentos create`** crash. The scaffold clones upstream eliza and runs `git submodule update --init --recursive`. Eliza's `.gitmodules` registers ~30 submodules pointing at the now-dead `elizaos-plugins/*` URLs. The recursive init produces a 404 storm, then `applyUpstreamSurgicalPatches` crashes trying to edit `plugins/plugin-openrouter/typescript/utils/config.ts` (the file isn't there because the submodule never cloned).

2. **The dev repo itself.** `tokagentos/.gitmodules` registers 19 of those same `elizaos-plugins/*` paths, with stub `package.json` files at `plugins/plugin-{openai,anthropic,...}/` claiming `"private": true, "version": "0.0.0-stub"`. Root `package.json` declares 7 of them as `workspace:*`. The current dev workflow only works because the CLI tool itself doesn't import from those packages — but the moment you try to run the runtime end-to-end from this checkout, those workspace deps fail to resolve.

### What we verified before designing the fix

`npm view` against 15 critical packages returned tarballs for 14 of them, at recent versions:

| Package | npm version | Tarball confirmed self-sufficient |
|---|---|---|
| `@elizaos/plugin-sql` | 1.7.2 | ✓ — full dist/, browser+node builds, types |
| `@elizaos/plugin-local-embedding` | 2.0.0-alpha.3 | ✓ |
| `@elizaos/plugin-agent-skills` | 1.0.0 | ✓ |
| `@elizaos/plugin-commands` | 1.0.0 | ✓ |
| `@elizaos/plugin-shell` | 1.2.0 | ✓ — minimal but complete |
| `@elizaos/plugin-local-ai` | 1.2.1 | ✓ — verified during spec self-review |
| `@elizaos/plugin-app-control` | 2.0.0-alpha.537 | ✓ |
| `@elizaos/plugin-browser-bridge` | 0.1.1 | ✓ |
| `@elizaos/plugin-evm` | 1.0.13 | ✓ — large tarball, full dist/ |
| `@elizaos/plugin-openai` | 1.6.0 | ✓ — browser+node+cjs builds, types |
| `@elizaos/plugin-anthropic` | 1.5.12 | ✓ |
| `@elizaos/plugin-google-genai` | 1.1.0 | ✓ |
| `@elizaos/plugin-groq` | 1.0.4 | ✓ |
| `@elizaos/plugin-openrouter` | 1.5.17 | ✓ |
| `@elizaos/plugin-ollama` | 1.2.4 | ✓ |
| `@elizaos/app-companion` | ❌ NOT on npm | likely an internal workspace package within the cloned eliza monorepo |

Tarballs include compiled `dist/` output, valid `main`/`module`/`exports` fields pointing at in-tarball files, and full type declarations. None require the dead GitHub repos at install or runtime.

Surgical-patch survey: 14 entries in `applyUpstreamSurgicalPatches` (`packages/tokagentos/src/scaffold.ts`). 13 target paths inside the eliza monorepo proper (`packages/...`, `apps/...`) — those clone fine. **One** patch targets a path under `plugins/*`: the OpenRouter model-default override at `plugins/plugin-openrouter/typescript/utils/config.ts`. That's the patch that crashed.

## Goals

1. Make `tokagentos create` produce working projects again, end-to-end, against any team's setup (LiteLLM proxy or any individual provider).
2. Fix the dev repo so `bun run dev` from `tokagentos/` itself produces a runnable agent rather than depending on stub workspace packages.
3. Stop relying on `github.com/elizaos-plugins/*` for plugin source. The org is unreliable; we need a source we control or a registry we can trust.
4. Maintain identical runtime UX (default models, plugin behavior) without depending on source-level mutation of vendor code.

## Non-goals

- Vendoring plugin source into `tokagentos/plugins/` or a sibling tree. npm has the tarballs; vendoring is a maintenance burden npm already absorbs.
- Mirroring the dead `elizaos-plugins/*` repos to a `tokamak-network/*` org. Same reason — npm is the canonical source for the published artifacts; mirroring git repos we can't reach is impossible without a recovery source.
- Updating the optional plugin set (`OPTIONAL_CORE_PLUGINS` in the core-plugins overlay). Out of scope; some of those packages may not exist on npm, but they're opt-in only.
- Re-publishing the OpenRouter override behavior in a different shape (e.g., as a custom plugin). Replacing one source-mutation with two `.env` writes is the minimal preservation; anything more is YAGNI for the recovery scope.
- Touching the canonical `plugins/plugin-tokagent-*` plugins. Those are entirely team-authored, npm-independent, and work today.
- Fixing the 13 non-plugin surgical patches. They work today; they target `packages/`/`apps/` paths inside the cloned eliza monorepo, which clones fine.

## Approach

Pivot **resolution mechanism** for the elizaos plugins: stop treating them as workspace packages mirrored from external git submodules; treat them as **external dependencies** delivered through npm.

The pivot is symmetric across the two affected surfaces:

- **In your dev repo** (`tokagentos/`): drop the 19 dead submodule entries from `.gitmodules`, drop the 7 `workspace:*` declarations from root `package.json` and replace with exact-version pins from the table above, delete the 19 stub directories at `plugins/plugin-{...}/`. After this, `bun install` resolves elizaos packages entirely from npm. Your in-tree `plugins/plugin-tokagent-*` continues to resolve via the workspace glob, unchanged.
- **In the scaffold pipeline** (`packages/tokagentos/src/scaffold.ts`): extend the existing `UPSTREAM_PRUNE_PATHS` list (consumed by `removeSubmodulesFromGitmodules`) to include `plugins/plugin-*`. This strips the dead submodule entries from the eliza checkout's `.gitmodules` *before* the recursive submodule-init runs. Drop the OpenRouter surgical patch from the patches array. Add a step that writes `OPENROUTER_SMALL_MODEL` and `OPENROUTER_LARGE_MODEL` to the scaffolded `.env` — same defaults the surgical patch was injecting, just delivered via env instead of source mutation. After this, scaffolded projects boot via `bun install` reading the same npm-pinned dependencies as the dev repo.

The eliza monorepo top-level clone keeps working — that's where `@elizaos/app-companion` and any other internal workspace packages live. The 13 unchanged surgical patches keep working — they target paths inside the eliza monorepo proper, which clones fine.

## Components

### 1. `tokagentos/.gitmodules` — delete 19 entries

Delete the `[submodule "plugins/plugin-X"]` block for each of:

`plugin-agent-skills`, `plugin-anthropic`, `plugin-discord`, `plugin-evm`, `plugin-google-genai`, `plugin-groq`, `plugin-imessage`, `plugin-local-ai`, `plugin-local-embedding`, `plugin-ollama`, `plugin-openai`, `plugin-openrouter`, `plugin-pdf`, `plugin-shopify`, `plugin-sql`, `plugin-telegram`, `plugin-twitter`, `plugin-wechat`, `plugin-whatsapp`.

Keep any submodule entries that don't reference `elizaos-plugins/`.

### 2. `tokagentos/plugins/plugin-{...}/` — delete 19 stub directories

`git rm -rf` each of the 19 directories above. They contain only stub `package.json` files declaring `"version": "0.0.0-stub"` and a description telling the reader to run `git submodule update --init`. After this work lands, that guidance is misleading; the directories are dead weight.

### 3. `tokagentos/package.json` — replace `workspace:*` declarations with version pins

Find the 7 declarations under `dependencies` (or `devDependencies`):

```json
"@elizaos/plugin-anthropic": "workspace:*",
"@elizaos/plugin-groq": "workspace:*",
"@elizaos/plugin-local-embedding": "workspace:*",
"@elizaos/plugin-local-ai": "workspace:*",
"@elizaos/plugin-ollama": "workspace:*",
"@elizaos/plugin-openai": "workspace:*",
"@elizaos/plugin-sql": "workspace:*",
```

Replace each with the exact version from the verification table:

```json
"@elizaos/plugin-anthropic": "1.5.12",
"@elizaos/plugin-groq": "1.0.4",
"@elizaos/plugin-local-embedding": "2.0.0-alpha.3",
"@elizaos/plugin-local-ai": "1.2.1",
"@elizaos/plugin-ollama": "1.2.4",
"@elizaos/plugin-openai": "1.6.0",
"@elizaos/plugin-sql": "1.7.2",
```

`@elizaos/plugin-local-ai 1.2.1` was verified on npm during spec self-review (tarball includes `dist/index.js`, `dist/index.d.ts`, source map). Pinned exactly.

The `workspaces: ["packages/*", "apps/*", "plugins/plugin-*"]` glob stays. After step 2 deletes the 19 stub directories, the `plugins/plugin-*` glob will only match the `plugin-tokagent-*` set, which is the desired outcome.

### 4. `packages/tokagentos/src/scaffold.ts` — extend `UPSTREAM_PRUNE_PATHS`

Find the existing `UPSTREAM_PRUNE_PATHS` constant. Add the 19 dead `plugins/plugin-*` paths to it (or a glob-equivalent shape if the function accepts it). The implementation may need to special-case `plugins/plugin-*` because the existing list is full paths, not patterns — concretely: hardcode the 19 paths, with a comment explaining that this list was determined empirically from upstream eliza's `.gitmodules` and `elizaos-plugins/*` org availability as of 2026-05-05.

If a future upstream eliza commit adds a 20th plugin under `elizaos-plugins/`, this list will silently miss it. Mitigation: leave a comment block flagging the maintenance assumption and the discovery procedure (`grep elizaos-plugins eliza/.gitmodules` after refreshing the upstream pin).

### 5. `packages/tokagentos/src/scaffold.ts` — drop the OpenRouter surgical patch

Find the patch entry at line ~185:

```ts
{
  path: "plugins/plugin-openrouter/typescript/utils/config.ts",
  description: "Repoint OpenRouter defaults from Google Gemini to Anthropic Claude...",
  find: ...,
  replace: ...,
}
```

Delete this object from the patches array. The 13 other patches in the array are unchanged.

### 6. New step: `applyUpstreamProviderEnvDefaults` in `packages/tokagentos/src/scaffold.ts` or `packages/tokagentos/src/commands/create.ts`

Add a function that, after scaffold materialization but during the `.env` writing phase (next to the existing `writeLlmEnvFile` call), writes:

```
# OpenRouter model defaults — written by tokagentos scaffold to override
# upstream defaults that were unreliable on free-tier (frequent 429/504).
# Override these by setting your own values before running the agent.
OPENROUTER_SMALL_MODEL=anthropic/claude-haiku-4-5
OPENROUTER_LARGE_MODEL=anthropic/claude-sonnet-4.6
```

Use the same regex-based active/commented-line resolution as the existing `writeLlmEnvFile` helper. If the user picked OpenRouter as their provider in the wizard, these lines complement (don't conflict with) the user's `OPENROUTER_API_KEY` line. If the user picked a different provider, these lines exist as defaults in case they later flip to OpenRouter via the in-app provider switcher.

Model strings (`anthropic/claude-haiku-4-5` for small, `anthropic/claude-sonnet-4.6` for large) match the exact defaults the surgical patch was setting at `packages/tokagentos/src/scaffold.ts:199-200`. Verified during spec self-review by reading the patch's `replaceWith` field. Copy verbatim — don't paraphrase.

### 7. `packages/tokagentos/templates-manifest.json` and `packages/tokagentos/templates/fullstack-app/template.json`

These currently have uncommitted in-flight modifications. The implementer should reconcile their state.

`requiredSubmodules` and `requiredWorkspaces` arrays may reference `plugins/plugin-local-ai`, `plugins/plugin-ollama`, `plugins/plugin-sql`. After the cleanup, those paths are dead inside the cloned eliza monorepo (we're stripping them before init). Drop those entries. Keep any other entries that reference live paths.

### 8. Tests

Three new/extended tests:

**a. `packages/tokagentos/src/__tests__/gitmodules.test.ts`** (CREATE):
```ts
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe(".gitmodules", () => {
  it("contains no entries pointing at the deprecated elizaos-plugins org", () => {
    const repoRoot = path.resolve(__dirname, "../../../../");
    const content = fs.readFileSync(path.join(repoRoot, ".gitmodules"), "utf-8");
    expect(content).not.toMatch(/elizaos-plugins\//i);
  });
});
```

(Adjust `repoRoot` to whatever resolves to `tokagentos/` from this test's location.)

**b. extend `packages/tokagentos/src/__tests__/scaffold-patches.test.ts`**:
- Assert the surgical-patches array no longer contains an entry with `path` starting with `plugins/plugin-openrouter/`.
- Assert `UPSTREAM_PRUNE_PATHS` (or its replacement) contains at least the 19 dead plugin paths.

**c. extend `packages/tokagentos/src/__tests__/create.test.ts`**:
- After a `--yes` scaffold run with any provider, assert the produced `.env` contains both `OPENROUTER_SMALL_MODEL=` and `OPENROUTER_LARGE_MODEL=` lines with the expected values.

No new behavior tests for "the runtime actually loads each plugin from npm." That stays in the manual smoke domain — see the LiteLLM design's smoke checklist; this work merges with that pre-publish gate.

## Data flow

**Before:**

```
tokagentos create my-app
  → clone eliza monorepo (works)
  → git submodule update --init --recursive (FAILS — 19 × 404 against elizaos-plugins/*)
  → required-submodule re-fetch loop (also fails)
  → applyUpstreamSurgicalPatches → CRASH on missing plugins/plugin-openrouter/...
```

**After:**

```
tokagentos create my-app
  → clone eliza monorepo (works — provides app-companion etc.)
  → removeSubmodulesFromGitmodules strips plugins/plugin-* from upstream .gitmodules
  → git submodule update --init --recursive (succeeds — only non-plugin submodules remain)
  → applyUpstreamSurgicalPatches (succeeds — OpenRouter patch dropped)
  → applyUpstreamProviderEnvDefaults writes OPENROUTER_*_MODEL to .env
  → bun install pulls @elizaos/plugin-{openai,sql,anthropic,...} from npm registry
  → runtime imports resolve through node_modules
  → agent boots
```

**Dev repo:**

```
git pull (cleanup commits land)
  → bun install pulls elizaos plugins from npm
  → existing workspace plugins (plugin-tokagent-*) still resolve from disk
  → bun run dev: works
  → No more "Run git submodule update --init" guidance in stub files; the stubs are gone
```

## Failure modes

| # | Scenario | Behavior |
|---|---|---|
| 1 | Future upstream eliza commit re-introduces dead submodule URLs in its `.gitmodules` | `removeSubmodulesFromGitmodules` runs before init; the new `UPSTREAM_PRUNE_PATHS` entries strip them. Test (a) catches drift if someone re-syncs `.gitmodules` from upstream eliza. |
| 2 | A teammate's local clone still has the old submodule directories after they `git pull` the deletion commit | Their working tree's untracked stub directories persist even after `git rm`. Commit message should include `rm -rf plugins/plugin-{...}` cleanup guidance. |
| 3 | A pinned npm version is unpublished or yanked | `bun install` fails loudly with a "package not found" error. Refresh the pin. Caret-range pins would silently drift to a newer version; exact pins surface the failure deliberately. |
| 4 | Future upstream eliza removes `@elizaos/app-companion` from its workspace | Out of scope for this work. The eliza monorepo clone path keeps working as long as `app-companion` lives somewhere in the workspace; if upstream eliza moves it elsewhere, separate problem. |
| 5 | A scaffold consumer expected the OpenRouter source-mutation behavior to set additional env-untracked things | The surgical patch only changed two model identifiers in source. The `.env` write replicates this exactly. No other behavior was being patched. |
| 6 | Someone runs `git submodule update --init --recursive` manually inside the user's dev repo after cleanup | After step 1 lands, only your remaining live submodules attempt to clone. The 19 dead URLs are not in `.gitmodules`. |
| 7 | A user enables an `OPTIONAL_CORE_PLUGINS` entry whose npm tarball doesn't exist | `bun install` fails at install time with "package not found." Same UX they'd see today (and arguably better — today's failure mode for these is inconsistent depending on whether the submodule URL was alive when last cloned). |
| 8 | A future version pin becomes unpublished on npm | Exact pinning makes this fail loudly at `bun install` time. Refresh the pin to a still-published version. Caret ranges would silently drift, hiding the failure; the deliberate fail-loud is the design intent. |

## Out of scope

- Restoring or replacing the dead `elizaos-plugins/*` git repos. Pure-npm sourcing makes this unnecessary.
- Vendoring plugin source into a `plugins/vendored/` tree. npm-as-source already gives reproducibility; vendoring adds maintenance for negative gain.
- Mirroring elizaos plugins to a `tokamak-network/tokagentos-plugin-*` org. Same as above.
- Re-publishing the OpenRouter override as a custom tokagent plugin. The two-line `.env` write produces identical UX with much less surface area.
- Auditing `OPTIONAL_CORE_PLUGINS` for npm availability. Each one is opt-in; failures will surface at install time. Worth a follow-up issue but out of scope here.
- Cleaning up other dead surgical patches (none of the remaining 13 are dead). No-op.

## Constraints worth remembering

- The scaffold pipeline already has the right primitives: `removeSubmodulesFromGitmodules`, `UPSTREAM_PRUNE_PATHS`, `pruneUpstreamPackageDependencies`, `pruneUpstreamUnusedPaths`, `removePackageJsonWorkspaces`. We're extending an existing list, not building new infrastructure.
- The runtime resolves plugins by package name through bun → `node_modules`. Switching from workspace to npm is invisible to the runtime; nothing imports a workspace path directly.
- The 13 unchanged surgical patches target paths inside the eliza monorepo proper (`packages/`, `apps/`), which the eliza top-level clone covers. Don't touch them.
- All plugin mirroring (canonical `plugins/plugin-tokagent-*` → fullstack template mirrors) operates entirely on the team-authored plugins. The cleanup doesn't change the mirror flow.
- Working-tree state: at design time, uncommitted modifications to `packages/tokagentos/templates-manifest.json` and `packages/tokagentos/templates/fullstack-app/template.json` exist. Implementer should reconcile these (commit, stash, or merge) before starting; doing so before this work prevents conflicts when step 7 edits the same files.
