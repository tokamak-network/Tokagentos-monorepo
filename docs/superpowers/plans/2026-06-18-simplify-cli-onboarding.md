# Simplify `tokagentos` CLI Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the `@tokagent/tokagentos` create flow to two interactive steps (project name → LLM provider + key), delete the `plugin` starter template and the `upgrade` command, and remove all code that becomes dead as a result.

**Architecture:** All work is in `packages/tokagentos`. Order is leaf-first so each task ends with a green build: (1) tear down `upgrade` + project metadata, (2) remove the `plugin` template, (3) collapse the CLI to a flag-free 2-step flow and extract a headless `scaffoldProject()` core, (4) rewrite the packaged smoke test against that core, (5) docs. The fullstack-app template and its bundled runtime plugins are untouched.

**Tech Stack:** TypeScript, Bun, `@clack/prompts` (interactive UI), `commander` (arg parsing), Biome (lint), Vitest (tests). Build is `bun run build` (regenerates `templates-manifest.json` from `templates/<id>/template.json`, then `tsc`).

## Global Constraints

- Package under change: `@tokagent/tokagentos` (`packages/tokagentos`). Run all package commands from that directory.
- **Keep** every fullstack upstream-submodule function in `scaffold.ts` (`resolveTemplateUpstream`, `initializeGitSubmodule`, `hydrateGitSubmoduleWorkspace`, `ensurePackageJsonWorkspaces`, `removePackageJsonWorkspaces`, `removePackageJsonDependencies`, `pruneUpstream*`, `rewriteUpstreamWorkspaceDeps`, `applyUpstreamSurgicalPatches`, `ensureUpstreamCompatibilityFiles`, `applyTokagentScaffoldPatches`, `renderTemplateTree`, `resolveTemplateSourceDir`, `copyRenderedTreeInternal`, `sha256`, `toDisplayName`, `normalizeKebabCase`, `buildFullstackTemplateValues`, `getFullstackReplacementEntries`).
- **Keep** the bundled fullstack plugins (`templates/fullstack-app/plugins/plugin-*`) and `scripts/sync-tokagent-plugins.mjs`. These are NOT the plugin starter template.
- **Do not** modify historical records under `docs/superpowers/plans/*` or `docs/superpowers/specs/*` other than this plan.
- Interactive-only: the CLI must expose no creation flags/args after Task 3.
- The scaffolded app must still boot fully configured (`.env` written + `~/.eliza/<project>.json` onboarding pre-completed) when a keyed provider + key are supplied.
- Verification commands (run from `packages/tokagentos`): `bun run typecheck`, `bun run lint:check`, `bun run test`, `bun run build`.
- Every commit message ends with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 0: Branch + green baseline

**Files:** none (setup only).

- [ ] **Step 1: Create a feature branch off the main branch**

```bash
cd /Users/mehdiberiane/Documents/tokamak/Tokagentos-monorepo
git fetch origin
git checkout alpha
git checkout -b feat/simplify-cli-onboarding
```

- [ ] **Step 2: Establish a green baseline**

Run:
```bash
cd packages/tokagentos
bun run build && bun run typecheck && bun run lint:check && bun run test
```
Expected: all four succeed (tests pass). If anything fails on a clean checkout, stop and report — the baseline must be green before changes.

---

## Task 1: Tear down `upgrade`, project metadata, and `--skip-upstream`

**Files:**
- Delete: `packages/tokagentos/src/commands/upgrade.ts`
- Delete: `packages/tokagentos/src/project-metadata.ts`
- Modify: `packages/tokagentos/src/scaffold.ts` (remove `buildMetadata`, `updateManagedFiles`, `createRenderedTempDir`, `updateGitSubmodule`; drop `os` + `ProjectTemplateMetadata` imports)
- Modify: `packages/tokagentos/src/commands/create.ts` (drop metadata write + `--skip-upstream` handling)
- Modify: `packages/tokagentos/src/commands/index.ts` (drop `upgrade` export)
- Modify: `packages/tokagentos/src/index.ts` (drop `upgrade` export)
- Modify: `packages/tokagentos/src/cli.ts` (remove `upgrade` command + `--skip-upstream` option + `upgrade` import)
- Modify: `packages/tokagentos/src/types.ts` (remove `UpgradeOptions`, `ProjectTemplateMetadata`; drop `skipUpstream` from `CreateOptions`)
- Test: `packages/tokagentos/src/__tests__/scaffold.test.ts` (remove the `updateManagedFiles` test + its imports)
- Test: `packages/tokagentos/src/__tests__/types.test.ts` (remove the `UpgradeOptions` test + import)

**Interfaces:**
- Produces: `scaffold.ts` no longer exports `buildMetadata`, `updateManagedFiles`, `createRenderedTempDir`, `updateGitSubmodule`. `create.ts` no longer writes `.tokagentos/template.json`.

- [ ] **Step 1: Delete the upgrade command and project-metadata module**

```bash
cd packages/tokagentos
git rm src/commands/upgrade.ts src/project-metadata.ts
```

- [ ] **Step 2: Remove `upgrade` from the command barrels**

In `src/commands/index.ts`, replace the whole file with:

```ts
/**
 * CLI Commands
 */

export { create } from "./create.js";
export { info } from "./info.js";
export { version } from "./version.js";
```

In `src/index.ts`, replace the whole file with:

```ts
/**
 * tokagentOS CLI - Public API
 */

export { create, info, version } from "./commands/index.js";
export { loadManifest } from "./manifest.js";
export type { TemplateDefinition, TemplatesManifest } from "./types.js";
```

- [ ] **Step 3: Remove the `upgrade` command + `--skip-upstream` option from the CLI**

In `src/cli.ts`:

1. Change the import on line 6 from:
```ts
import { create, info, upgrade, version } from "./commands/index.js";
```
to:
```ts
import { create, info, version } from "./commands/index.js";
```

2. In `defaultAction`, delete the `upgrade` option and its branch so the function reads:
```ts
async function defaultAction(): Promise<void> {
	const choice = await clack.select({
		message: "What do you want to do?",
		options: [
			{ value: "create", label: "Create a new project" },
			{ value: "info", label: "Show available templates" },
		],
	});

	if (clack.isCancel(choice)) {
		clack.cancel(c.warning("Operation cancelled."));
		process.exit(0);
	}

	if (choice === "create") {
		await create(undefined, {});
		return;
	}
	info({});
}
```

3. Delete the `--skip-upstream` option line from the `create` command registration:
```ts
		.option("--skip-upstream", "Skip initializing the upstream tokagent checkout")
```

4. Delete the entire `upgrade` command registration block:
```ts
applyHelpTheme(
	program
		.command("upgrade")
		.description("Upgrade the current generated project to the latest template")
		.option("--check", "Check what would change without writing files")
		.option("--dry-run", "Preview the upgrade without writing files")
		.option("--skip-upstream", "Skip updating the upstream tokagent checkout")
		.action(upgrade),
);
```

- [ ] **Step 4: Stop writing project metadata in `create.ts` and always init upstream**

In `src/commands/create.ts`:

1. Delete the import line:
```ts
import { writeProjectMetadata } from "../project-metadata.js";
```

2. In the import block from `../scaffold.js`, remove `buildMetadata` from the named imports.

3. Replace `getNextSteps` (the whole function) with this simplified version:
```ts
function getNextSteps(projectDir: string): string[] {
  return [`cd ${projectDir}`, "bun install", "bun run dev"];
}
```

4. Update the call site of `getNextSteps` (inside `create`) to pass just the directory:
```ts
  clack.note(getNextSteps(finalProjectName).join("\n"), "Next steps");
```

5. Change the upstream guard from `if (template.upstream && !options.skipUpstream) {` to:
```ts
  if (template.upstream) {
```

6. Delete the entire metadata block:
```ts
  writeProjectMetadata(
    destinationDir,
    buildMetadata({
      cliVersion: getCliVersion(),
      language,
      managedFiles,
      template,
      values: values as Record<string, string>,
    }),
  );
```
…and the now-unused `managedFiles` capture: change
```ts
  const managedFiles = renderTemplateTree({
```
to
```ts
  renderTemplateTree({
```

- [ ] **Step 5: Delete the upgrade-only functions from `scaffold.ts`**

In `src/scaffold.ts`:

1. Remove the `os` import (line 4) — `import * as os from "node:os";` — it is used only by `createRenderedTempDir`.
2. In the `import type { … } from "./types.js";` block, remove `ProjectTemplateMetadata` (keep `FullstackTemplateValues`, `PluginTemplateValues`, `TemplateDefinition`, `TemplateUpstream`).
3. Delete the entire `createRenderedTempDir` function (the `export function createRenderedTempDir(options: { … }) { … }` block).
4. Delete the entire `buildMetadata` function (`export function buildMetadata(options: { … }): ProjectTemplateMetadata { … }`).
5. Delete the entire `updateManagedFiles` function (`export function updateManagedFiles(options: { … }) { … }`).
6. Delete the entire `updateGitSubmodule` function (`export function updateGitSubmodule(options: { … }): void { … }`).

- [ ] **Step 6: Remove the dead types**

In `src/types.ts`:

1. Delete the `UpgradeOptions` interface.
2. Delete the `ProjectTemplateMetadata` interface.
3. In `CreateOptions`, delete the `skipUpstream?: boolean;` line.

- [ ] **Step 7: Update the scaffold tests (remove the `updateManagedFiles` test)**

In `src/__tests__/scaffold.test.ts`:

1. In the import from `../scaffold.js`, remove `updateManagedFiles`.
2. Remove the `ProjectTemplateMetadata` type import line:
```ts
import type { ProjectTemplateMetadata } from "../types.js";
```
3. Delete the entire `test("updates untouched managed files and reports conflicts", …)` block (the last test in the `managed file upgrades` describe).

In `src/__tests__/types.test.ts`:

1. In the import block, remove `UpgradeOptions`.
2. Delete the `test("upgrade options support dry runs", …)` block.

- [ ] **Step 8: Verify typecheck, lint, tests, and no dangling references**

Run:
```bash
cd packages/tokagentos
bun run typecheck && bun run lint:check && bun run test
```
Expected: all pass.

Run:
```bash
grep -rn "upgrade\|readProjectMetadata\|writeProjectMetadata\|buildMetadata\|updateManagedFiles\|updateGitSubmodule\|createRenderedTempDir\|skipUpstream\|ProjectTemplateMetadata\|UpgradeOptions" src/ | grep -v "__tests__"
```
Expected: no matches in `src/` outside tests (the only acceptable residual is none — the smoke script in `scripts/` is handled in Task 4).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(tokagentos): remove upgrade command and project metadata" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Remove the `plugin` starter template

**Files:**
- Delete: `packages/tokagentos/templates/plugin/` (entire tree)
- Modify: `packages/tokagentos/src/scaffold.ts` (remove `buildPluginTemplateValues`, `getPluginReplacementEntries`, `getTemplateReplacementEntries`; drop `PluginTemplateValues` import)
- Modify: `packages/tokagentos/src/commands/create.ts` (drop plugin prompts/branches; use `buildFullstackTemplateValues` + `getFullstackReplacementEntries` directly)
- Modify: `packages/tokagentos/src/types.ts` (delete `PluginTemplateValues`; narrow `TemplateId`; drop plugin-only `CreateOptions` fields)
- Modify: `packages/tokagentos/src/cli.ts` (remove `--description` / `--github-username` / `--repo-url` options)
- Test: `packages/tokagentos/src/__tests__/scaffold.test.ts` (drop plugin builder test; re-point the render test to fullstack tokens)
- Test: `packages/tokagentos/src/__tests__/types.test.ts` (fullstack-only template + drop plugin values test)
- Test: `packages/tokagentos/src/__tests__/manifest.test.ts` (assert single template; assert plugin dir absent)
- Test: `packages/tokagentos/src/__tests__/create.test.ts` (fix the `scaffold.js` mock)

**Interfaces:**
- Produces: `scaffold.ts` exports `getFullstackReplacementEntries` as the only replacement-entry builder; `getTemplateReplacementEntries` and the plugin builders no longer exist. `TemplateId` is `"fullstack-app"`.

- [ ] **Step 1: Delete the plugin template tree**

```bash
cd packages/tokagentos
git rm -r templates/plugin
```

- [ ] **Step 2: Delete the plugin functions in `scaffold.ts`**

In `src/scaffold.ts`:

1. In the `import type { … } from "./types.js";` block, remove `PluginTemplateValues` (keep `FullstackTemplateValues`, `TemplateDefinition`, `TemplateUpstream`).
2. Delete the entire `buildPluginTemplateValues` function.
3. Delete the entire `getPluginReplacementEntries` function.
4. Delete the entire `getTemplateReplacementEntries` function (callers switch to `getFullstackReplacementEntries` in Step 3).

- [ ] **Step 3: Remove plugin paths from `create.ts`**

In `src/commands/create.ts`:

1. Replace the entire import section at the top of the file (the node / clack / picocolors / manifest / package-info / scaffold / types imports) with exactly:
```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { getTemplateById, getTemplates, getTemplatesDir } from "../manifest.js";
import {
  buildFullstackTemplateValues,
  getFullstackReplacementEntries,
  hydrateGitSubmoduleWorkspace,
  initializeGitSubmodule,
  renderTemplateTree,
  resolveTemplateSourceDir,
  resolveTemplateUpstream,
} from "../scaffold.js";
import type { CreateOptions } from "../types.js";
```
This drops the now-unused `getCliVersion` (no caller after `promptPluginValues` is deleted), `FullstackTemplateValues` and `PluginTemplateValues` types, and the `buildPluginTemplateValues` / `getTemplateReplacementEntries` scaffold imports, and adds `getFullstackReplacementEntries`. (`getTemplates` stays — `promptTemplateId` still uses it until Task 3.)
2. Delete the plugin entry from `TEMPLATE_ICONS` so it reads:
```ts
const TEMPLATE_ICONS: Record<string, string> = {
  "fullstack-app": "🧱",
};
```
3. Delete the entire `promptPluginValues` function.
4. Delete the plugin name-prefix branch:
```ts
  if (template.id === "plugin" && !finalProjectName.startsWith("plugin-")) {
    finalProjectName = `plugin-${finalProjectName}`;
  }
```
5. Replace the `values` assignment:
```ts
  const values: PluginTemplateValues | FullstackTemplateValues =
    template.id === "plugin"
      ? await promptPluginValues(finalProjectName, options)
      : buildFullstackTemplateValues(finalProjectName);
```
with:
```ts
  const values = buildFullstackTemplateValues(finalProjectName);
```
6. Replace the `getTemplateReplacementEntries` call:
```ts
  const replacements = getTemplateReplacementEntries({
    templateId: template.id,
    values: values as Record<string, string>,
  });
```
with:
```ts
  const replacements = getFullstackReplacementEntries(values);
```

- [ ] **Step 4: Narrow the types**

In `src/types.ts`:

1. Change `TemplateId`:
```ts
export type TemplateId = "fullstack-app";
```
2. Delete the `PluginTemplateValues` interface.
3. In `CreateOptions`, delete the plugin-only fields: `description?`, `githubUsername?`, `repoUrl?`.

- [ ] **Step 5: Remove the plugin-only CLI flags**

In `src/cli.ts`, inside the `create` command registration, delete these three option lines:
```ts
		.option("--description <description>", "Plugin description override")
		.option("--github-username <username>", "Plugin GitHub username override")
		.option("--repo-url <url>", "Plugin repository URL override")
```

- [ ] **Step 6: Update the scaffold test (drop plugin, re-point render test)**

In `src/__tests__/scaffold.test.ts`:

1. In the `../scaffold.js` import, remove `buildPluginTemplateValues` and `getPluginReplacementEntries`.
2. Delete the `test("builds plugin naming defaults", …)` block.
3. Replace the `test("renders replacement values into file paths as well as file contents", …)` block with this fullstack-token version:
```ts
  test("renders replacement values into file paths as well as file contents", () => {
    const sourceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "tokagentos-render-src-"),
    );
    const destinationDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "tokagentos-render-dest-"),
    );
    tempDirs.push(sourceDir, destinationDir);

    fs.mkdirSync(path.join(sourceDir, "src", "e2e"), { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, "src", "e2e", "__PROJECT_SLUG__.e2e.ts"),
      'export const value = "__PROJECT_SLUG__";\n',
    );

    const values = buildFullstackTemplateValues("cool app");

    const managedFiles = renderTemplateTree({
      destinationDir,
      replacements: getFullstackReplacementEntries(values),
      sourceDir,
    });

    const renderedPath = path.join(
      destinationDir,
      "src",
      "e2e",
      "cool-app.e2e.ts",
    );
    expect(fs.existsSync(renderedPath)).toBe(true);
    expect(fs.readFileSync(renderedPath, "utf8")).toContain("cool-app");
    expect(managedFiles).toHaveProperty("src/e2e/cool-app.e2e.ts");
  });
```

- [ ] **Step 7: Update the types test (fullstack-only)**

In `src/__tests__/types.test.ts`:

1. In the import block, remove `PluginTemplateValues`.
2. Replace the `describe("TemplateDefinition", …)` block with:
```ts
describe("TemplateDefinition", () => {
  test("describes the fullstack-app template", () => {
    const template: TemplateDefinition = {
      description: "Fullstack workspace",
      id: "fullstack-app",
      kind: "fullstack-app",
      languages: ["typescript"],
      name: "fullstack-app",
      version: 1,
    };

    expect(template.id).toBe("fullstack-app");
    expect(template.languages).toContain("typescript");
  });
});
```
3. Delete the `test("plugin values capture scaffold substitutions", …)` block (inside `describe("Template value types", …)`).

- [ ] **Step 8: Update the manifest test (single template)**

In `src/__tests__/manifest.test.ts`:

1. Replace the `test("manifest contains expected template entries", …)` block with:
```ts
  test("manifest contains only the fullstack-app template", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(PACKAGE_ROOT, "templates-manifest.json"),
        "utf-8",
      ),
    );

    expect(Array.isArray(manifest.templates)).toBe(true);
    expect(
      manifest.templates.map((template: { id: string }) => template.id),
    ).toEqual(["fullstack-app"]);
  });
```
2. Replace the `test("packaged templates directory contains the expected source templates", …)` block with:
```ts
  test("packaged templates directory contains fullstack-app and not plugin", () => {
    expect(
      fs.existsSync(path.join(PACKAGE_ROOT, "templates", "fullstack-app")),
    ).toBe(true);
    expect(fs.existsSync(path.join(PACKAGE_ROOT, "templates", "plugin"))).toBe(
      false,
    );
  });
```

- [ ] **Step 9: Fix the create-test scaffold mock**

In `src/__tests__/create.test.ts`, in the `vi.mock("../scaffold.js", …)` factory, remove the `buildPluginTemplateValues` and `getTemplateReplacementEntries` keys and add `getFullstackReplacementEntries`, so the factory's returned object includes:
```ts
  buildFullstackTemplateValues: (name: string) => ({ projectSlug: name }),
  buildMetadata: () => ({}),
  getFullstackReplacementEntries: () => [],
  hydrateGitSubmoduleWorkspace: vi.fn(),
  initializeGitSubmodule: vi.fn(),
  renderTemplateTree: ({ destinationDir }: { destinationDir: string }) => {
    fs.mkdirSync(destinationDir, { recursive: true });
    return {};
  },
  resolveTemplateSourceDir: () => "/fake/source",
  resolveTemplateUpstream: () => ({ branch: "main", commit: "x", path: "x", repo: "x" }),
```
(Note: `buildMetadata` / `writeProjectMetadata` mock keys are harmless leftovers; they are removed when this file is rewritten in Task 3.)

- [ ] **Step 10: Rebuild the manifest, then verify**

The manifest is generated at build time, so regenerate it before testing:
```bash
cd packages/tokagentos
bun run build && bun run typecheck && bun run lint:check && bun run test
```
Expected: build regenerates `templates-manifest.json` with only `fullstack-app`; all checks pass.

Run:
```bash
grep -rn "plugin" src/ | grep -v "__tests__" | grep -viE "plugins/plugin-|@elizaos/plugin-|@tokagentos/|bundled"
```
Expected: no references to the plugin **template** (the remaining `plugins/plugin-*` and `@elizaos/plugin-*` strings in `scaffold.ts` are the fullstack app's bundled plugins and are expected).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(tokagentos): remove plugin starter template" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Collapse to the 2-step interactive flow; extract `scaffoldProject`; drop `info`/`version`/flags

**Files:**
- Delete: `packages/tokagentos/src/commands/info.ts`, `packages/tokagentos/src/commands/version.ts`
- Modify: `packages/tokagentos/src/commands/create.ts` (rewrite: arg-free `create()` + exported headless `scaffoldProject()`; simplified prompts; no confirm)
- Modify: `packages/tokagentos/src/commands/index.ts` (export only `create` + `scaffoldProject`)
- Modify: `packages/tokagentos/src/index.ts` (export `create`, `scaffoldProject`, `loadManifest`, types)
- Modify: `packages/tokagentos/src/cli.ts` (rewrite: bare → `create`; no menu, no commands except help/version flag)
- Modify: `packages/tokagentos/src/types.ts` (remove `CreateOptions`, `InfoOptions`)
- Test: `packages/tokagentos/src/__tests__/create.test.ts` (rewrite around `scaffoldProject` + a prompt-mocked flow test)

**Interfaces:**
- Produces:
  - `create(): Promise<void>` — interactive, no arguments.
  - `scaffoldProject(input: ScaffoldProjectInput): ScaffoldProjectResult` where
    `ScaffoldProjectInput = { cwd: string; projectName: string; providerId: string; apiKey?: string; litellm?: { baseUrl: string; smallModel: string; largeModel: string } }`
    and `ScaffoldProjectResult = { projectDir: string; envVarWritten?: string }`.
  - `index.ts` re-exports `create`, `scaffoldProject`, `loadManifest`, and the template types.

- [ ] **Step 1: Write the failing test for the headless core and the flow**

Replace the **entire** contents of `src/__tests__/create.test.ts` with:

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn((msg: string) => {
    throw new Error(`CLACK_CANCEL: ${msg}`);
  }),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() })),
  isCancel: vi.fn(() => false),
  text: vi.fn(),
  password: vi.fn(),
  select: vi.fn(),
  log: { warn: vi.fn() },
}));

vi.mock("../scaffold.js", () => ({
  buildFullstackTemplateValues: (name: string) => ({ projectSlug: name }),
  getFullstackReplacementEntries: () => [],
  hydrateGitSubmoduleWorkspace: vi.fn(),
  initializeGitSubmodule: vi.fn(),
  renderTemplateTree: ({ destinationDir }: { destinationDir: string }) => {
    fs.mkdirSync(destinationDir, { recursive: true });
    return {};
  },
  resolveTemplateSourceDir: () => "/fake/source",
  resolveTemplateUpstream: () => ({ branch: "main", commit: "x", path: "x", repo: "x" }),
}));

vi.mock("../manifest.js", () => ({
  getTemplateById: () => ({
    id: "fullstack-app",
    name: "fullstack-app",
    languages: ["typescript"],
    upstream: undefined,
  }),
  getTemplatesDir: () => "/fake/templates",
}));

import * as clack from "@clack/prompts";
import { create, scaffoldProject } from "../commands/create.js";

function withTempCwd(fn: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokagent-create-test-"));
  const prev = process.cwd();
  process.chdir(dir);
  return Promise.resolve(fn(dir)).finally(() => {
    process.chdir(prev);
    fs.rmSync(dir, { force: true, recursive: true });
  });
}

describe("scaffoldProject — env writing", () => {
  it("writes the provider key and OpenRouter model defaults to .env", () => {
    return withTempCwd((dir) => {
      scaffoldProject({
        cwd: dir,
        projectName: "test-app-or",
        providerId: "anthropic",
        apiKey: "sk-ant-test",
      });
      const content = fs.readFileSync(
        path.join(dir, "test-app-or", ".env"),
        "utf-8",
      );
      expect(content).toMatch(/^ANTHROPIC_API_KEY=sk-ant-test$/m);
      expect(content).toMatch(/^OPENROUTER_SMALL_MODEL=anthropic\/claude-haiku-4-5$/m);
      expect(content).toMatch(/^OPENROUTER_LARGE_MODEL=anthropic\/claude-sonnet-4\.6$/m);
    });
  });

  it("writes LITELLM_* lines when litellm extras are supplied", () => {
    return withTempCwd((dir) => {
      scaffoldProject({
        cwd: dir,
        projectName: "test-app-lite",
        providerId: "litellm",
        apiKey: "lt-key",
        litellm: {
          baseUrl: "https://lite.example.com",
          smallModel: "gpt-4o-mini",
          largeModel: "gpt-4o",
        },
      });
      const content = fs.readFileSync(
        path.join(dir, "test-app-lite", ".env"),
        "utf-8",
      );
      expect(content).toMatch(/^LITELLM_API_KEY=lt-key$/m);
      expect(content).toMatch(/^LITELLM_BASE_URL=https:\/\/lite\.example\.com$/m);
      expect(content).toMatch(/^LITELLM_SMALL_MODEL=gpt-4o-mini$/m);
      expect(content).toMatch(/^LITELLM_LARGE_MODEL=gpt-4o$/m);
      expect(content).not.toMatch(/^OPENAI_API_KEY=lt-key$/m);
    });
  });
});

describe("create — two-step interactive flow", () => {
  it("prompts for name then provider+key and scaffolds the project", () => {
    return withTempCwd((dir) => {
      vi.mocked(clack.text).mockResolvedValueOnce("flow-app");
      vi.mocked(clack.select).mockResolvedValueOnce("anthropic");
      vi.mocked(clack.password).mockResolvedValueOnce("sk-ant-flow");
      return create().then(() => {
        const content = fs.readFileSync(
          path.join(dir, "flow-app", ".env"),
          "utf-8",
        );
        expect(content).toMatch(/^ANTHROPIC_API_KEY=sk-ant-flow$/m);
      });
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:
```bash
cd packages/tokagentos
bun run test src/__tests__/create.test.ts
```
Expected: FAIL — `scaffoldProject` is not exported from `../commands/create.js` yet.

- [ ] **Step 3: Rewrite `create.ts` to the 2-step flow + headless core**

Replace the **entire** contents of `src/commands/create.ts` with:

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { getTemplateById, getTemplatesDir } from "../manifest.js";
import {
  buildFullstackTemplateValues,
  getFullstackReplacementEntries,
  hydrateGitSubmoduleWorkspace,
  initializeGitSubmodule,
  renderTemplateTree,
  resolveTemplateSourceDir,
  resolveTemplateUpstream,
} from "../scaffold.js";

const TEMPLATE_ID = "fullstack-app";

/**
 * LLM providers the scaffolded project can be pre-configured for.
 * Selecting one writes <PROVIDER>_API_KEY=<key> to the project's .env.
 */
interface LlmProvider {
  id: string;
  label: string;
  envVar: string;
  hint?: string;
  /**
   * When true, the provider is offered even though it doesn't write an API
   * key to `.env` during scaffold (x402 is configured in-app via the x402
   * tab after `bun run dev`).
   */
  configuredInApp?: boolean;
}

const LLM_PROVIDERS: readonly LlmProvider[] = [
  {
    id: "x402",
    label: "x402 only (can be configured from the gateway)",
    envVar: "",
    hint: "Configure from the x402 tab after `bun run dev`",
    configuredInApp: true,
  },
  { id: "openai", label: "OpenAI", envVar: "OPENAI_API_KEY", hint: "sk-proj-…" },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    envVar: "ANTHROPIC_API_KEY",
    hint: "sk-ant-api03-…",
  },
  { id: "google", label: "Google (Gemini)", envVar: "GOOGLE_API_KEY", hint: "AIza…" },
  { id: "groq", label: "Groq", envVar: "GROQ_API_KEY", hint: "gsk_…" },
  {
    id: "openrouter",
    label: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    hint: "sk-or-v1-…",
  },
  {
    id: "litellm",
    label: "LiteLLM Proxy (OpenAI-compatible)",
    envVar: "LITELLM_API_KEY",
    hint: "lt-...",
  },
] as const;

function findLlmProvider(id: string): LlmProvider | undefined {
  return LLM_PROVIDERS.find((p) => p.id === id.toLowerCase());
}

function normalizeProjectName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unwrapPromptResult<T>(value: T, message = "Operation cancelled."): T {
  if (clack.isCancel(value)) {
    clack.cancel(message);
    process.exit(0);
  }
  return value;
}

function validateProjectDirectory(
  name: string | undefined,
): string | Error | undefined {
  const normalized = normalizeProjectName(name ?? "");
  if (!normalized) return "Project name is required";
  if (fs.existsSync(normalized)) return `Directory '${normalized}' already exists`;
  return undefined;
}

function getNextSteps(projectDir: string): string[] {
  return [`cd ${projectDir}`, "bun install", "bun run dev"];
}

// ─── Step 1: project name ────────────────────────────────────────────────────
async function promptProjectName(): Promise<string> {
  const input = await clack.text({
    defaultValue: "my-app",
    message: "Project name:",
    placeholder: "my-app",
    validate: validateProjectDirectory,
  });
  return normalizeProjectName(unwrapPromptResult(input) as string);
}

// ─── Step 2: LLM provider + key ──────────────────────────────────────────────
async function promptLlmProvider(): Promise<LlmProvider> {
  // Offer keyed providers + configuredInApp (x402). Local-only options are
  // not offered for the fullstack app.
  const options = LLM_PROVIDERS.filter(
    (p) => p.envVar.length > 0 || p.configuredInApp === true,
  );
  const choice = await clack.select({
    message: "Which LLM provider will this project use?",
    options: options.map((p) => ({
      value: p.id,
      label: p.label,
      hint: p.envVar || undefined,
    })),
  });
  return findLlmProvider(unwrapPromptResult(choice as string)) as LlmProvider;
}

async function promptApiKey(provider: LlmProvider): Promise<string> {
  while (true) {
    const input = await clack.password({
      message: `Enter your ${provider.label} API key:`,
      mask: "·",
    });
    const trimmed = (unwrapPromptResult(input) as string).trim();
    if (trimmed.length > 0) return trimmed;
    clack.log.warn(`API key is required for ${provider.label}. Try again.`);
  }
}

async function promptLitellmExtras(): Promise<{
  baseUrl: string;
  smallModel: string;
  largeModel: string;
}> {
  const baseUrl = (
    unwrapPromptResult(
      await clack.text({
        message: "LiteLLM proxy base URL (e.g. https://litellm.company.com):",
        placeholder: "https://litellm.company.com",
        validate: (v) =>
          !v?.trim() ? "Base URL is required for LiteLLM" : undefined,
      }),
    ) as string
  ).trim();
  const smallModel = (
    unwrapPromptResult(
      await clack.text({
        defaultValue: "gpt-4o-mini",
        message: "Small model alias (used for TEXT_SMALL). Default: gpt-4o-mini",
        placeholder: "gpt-4o-mini",
      }),
    ) as string
  ).trim();
  const largeModel = (
    unwrapPromptResult(
      await clack.text({
        defaultValue: "gpt-4o",
        message: "Large model alias (used for TEXT_LARGE). Default: gpt-4o",
        placeholder: "gpt-4o",
      }),
    ) as string
  ).trim();
  return { baseUrl, smallModel, largeModel };
}

/**
 * Pre-complete the app's onboarding state so the UI skips the provider/
 * API-key prompt. State lives at `~/.eliza/<namespace>.json` (the upstream
 * runtime convention). No-op if the file already exists or the provider sets
 * no key (x402).
 */
function preCompleteOnboarding(projectName: string, provider: LlmProvider): void {
  if (!provider.envVar) return;
  const stateDir = path.join(os.homedir(), ".eliza");
  const configPath = path.join(stateDir, `${projectName}.json`);
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    if (fs.existsSync(configPath)) return;
    const config = {
      meta: { onboardingComplete: true },
      serviceRouting: { llmText: { backend: provider.id, transport: "local" } },
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  } catch {
    // Non-fatal — user can click through onboarding once if the write fails.
  }
}

/** Materialize <projectRoot>/.env from .env.example if it doesn't exist. */
function ensureEnvFromExample(projectRoot: string): void {
  const envPath = path.join(projectRoot, ".env");
  const examplePath = path.join(projectRoot, ".env.example");
  if (fs.existsSync(envPath)) return;
  if (!fs.existsSync(examplePath)) return;
  fs.copyFileSync(examplePath, envPath);
}

/** Set or insert the selected provider's API-key line in <projectRoot>/.env. */
function writeLlmEnvFile(
  projectRoot: string,
  provider: LlmProvider,
  apiKey: string,
): void {
  if (!provider.envVar || !apiKey) return;
  const envPath = path.join(projectRoot, ".env");
  const examplePath = path.join(projectRoot, ".env.example");
  const apiKeyLine = `${provider.envVar}=${apiKey}`;
  const activeRe = new RegExp(`^${provider.envVar}=.*$`, "m");
  const commentedRe = new RegExp(`^#\\s*${provider.envVar}=.*$`, "m");

  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, "utf8");
    if (activeRe.test(existing)) {
      fs.writeFileSync(envPath, existing.replace(activeRe, apiKeyLine));
      return;
    }
    if (commentedRe.test(existing)) {
      fs.writeFileSync(envPath, existing.replace(commentedRe, apiKeyLine));
      return;
    }
    const sep = existing.endsWith("\n") ? "" : "\n";
    fs.writeFileSync(envPath, `${existing}${sep}${apiKeyLine}\n`);
    return;
  }

  const base = fs.existsSync(examplePath)
    ? fs.readFileSync(examplePath, "utf8")
    : `# API key set by \`tokagentos\` (${provider.id}).\n`;
  let filled: string;
  if (activeRe.test(base)) {
    filled = base.replace(activeRe, apiKeyLine);
  } else if (commentedRe.test(base)) {
    filled = base.replace(commentedRe, apiKeyLine);
  } else {
    filled = `${base.endsWith("\n") ? base : `${base}\n`}${apiKeyLine}\n`;
  }
  fs.writeFileSync(envPath, filled);
}

/** Write additional key=value lines to a project .env (multi-key providers). */
function writeLlmExtraEnv(
  projectRoot: string,
  entries: Array<{ key: string; value: string }>,
): void {
  if (entries.length === 0) return;
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, "");
  }
  let content = fs.readFileSync(envPath, "utf8");
  for (const { key, value } of entries) {
    const line = `${key}=${value}`;
    const activeRe = new RegExp(`^${key}=.*$`, "m");
    const commentedRe = new RegExp(`^#\\s*${key}=.*$`, "m");
    if (activeRe.test(content)) {
      content = content.replace(activeRe, line);
    } else if (commentedRe.test(content)) {
      content = content.replace(commentedRe, line);
    } else {
      content = `${content.endsWith("\n") ? content : `${content}\n`}${line}\n`;
    }
  }
  fs.writeFileSync(envPath, content);
}

export interface ScaffoldProjectInput {
  cwd: string;
  projectName: string;
  providerId: string;
  apiKey?: string;
  litellm?: { baseUrl: string; smallModel: string; largeModel: string };
}

export interface ScaffoldProjectResult {
  projectDir: string;
  envVarWritten?: string;
}

/**
 * Headless project scaffolding — renders the fullstack-app template, initializes
 * the upstream tokagent checkout, materializes .env, and pre-completes the app's
 * onboarding. No prompts, no console UI. `create()` wraps this with the
 * interactive flow; the packaged smoke test calls it directly.
 */
export function scaffoldProject(
  input: ScaffoldProjectInput,
): ScaffoldProjectResult {
  const template = getTemplateById(TEMPLATE_ID);
  if (!template) {
    throw new Error(`Template '${TEMPLATE_ID}' not found.`);
  }
  const provider = findLlmProvider(input.providerId);
  if (!provider) {
    throw new Error(`Unknown LLM provider '${input.providerId}'.`);
  }
  const language = template.languages[0];
  const finalName = normalizeProjectName(input.projectName);
  const destinationDir = path.resolve(input.cwd, finalName);

  const values = buildFullstackTemplateValues(finalName);
  const sourceDir = resolveTemplateSourceDir({
    language,
    template,
    templatesDir: getTemplatesDir(),
  });
  renderTemplateTree({
    destinationDir,
    replacements: getFullstackReplacementEntries(values),
    sourceDir,
  });

  if (template.upstream) {
    const upstream = resolveTemplateUpstream(template.upstream);
    initializeGitSubmodule({
      branch: upstream.branch,
      commit: upstream.commit,
      projectRoot: destinationDir,
      repo: upstream.repo,
      submodulePath: upstream.path,
    });
    hydrateGitSubmoduleWorkspace({ projectRoot: destinationDir, upstream });
  }

  ensureEnvFromExample(destinationDir);

  let envVarWritten: string | undefined;
  if (input.apiKey && provider.envVar) {
    writeLlmEnvFile(destinationDir, provider, input.apiKey);
    envVarWritten = provider.envVar;
    if (input.litellm) {
      writeLlmExtraEnv(destinationDir, [
        { key: "LITELLM_BASE_URL", value: input.litellm.baseUrl },
        { key: "LITELLM_SMALL_MODEL", value: input.litellm.smallModel },
        { key: "LITELLM_LARGE_MODEL", value: input.litellm.largeModel },
      ]);
    }
    // OpenRouter model defaults — written unconditionally so the in-app
    // provider switcher can flip to OpenRouter later without editing .env.
    writeLlmExtraEnv(destinationDir, [
      { key: "OPENROUTER_SMALL_MODEL", value: "anthropic/claude-haiku-4-5" },
      { key: "OPENROUTER_LARGE_MODEL", value: "anthropic/claude-sonnet-4.6" },
    ]);
    preCompleteOnboarding(finalName, provider);
  }

  return { projectDir: destinationDir, envVarWritten };
}

/**
 * Interactive two-step create flow: project name → LLM provider (+ key).
 */
export async function create(): Promise<void> {
  clack.intro(pc.bgCyan(pc.black(" tokagentOS ")));

  const projectName = await promptProjectName();

  const provider = await promptLlmProvider();
  const apiKey = provider.envVar ? await promptApiKey(provider) : undefined;
  const litellm =
    provider.id === "litellm" ? await promptLitellmExtras() : undefined;

  const spinner = clack.spinner();
  spinner.start("Creating project...");

  const result = scaffoldProject({
    cwd: process.cwd(),
    projectName,
    providerId: provider.id,
    apiKey,
    litellm,
  });

  if (result.envVarWritten) {
    spinner.message(`Wrote ${result.envVarWritten} to .env (${provider.label})`);
  }
  spinner.stop("Project created successfully!");

  console.log();
  clack.note(
    getNextSteps(path.basename(result.projectDir)).join("\n"),
    "Next steps",
  );
  clack.outro(`${pc.green("✨")} Your project is ready!`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd packages/tokagentos
bun run test src/__tests__/create.test.ts
```
Expected: PASS (all three tests).

- [ ] **Step 5: Delete the `info` and `version` commands**

```bash
cd packages/tokagentos
git rm src/commands/info.ts src/commands/version.ts
```

In `src/commands/index.ts`, replace the whole file with:
```ts
/**
 * CLI Commands
 */

export { create, scaffoldProject } from "./create.js";
```

In `src/index.ts`, replace the whole file with:
```ts
/**
 * tokagentOS CLI - Public API
 */

export { create, scaffoldProject } from "./commands/index.js";
export { loadManifest } from "./manifest.js";
export type { TemplateDefinition, TemplatesManifest } from "./types.js";
```

- [ ] **Step 6: Rewrite `cli.ts` to the flag-free, menu-free entry**

Replace the **entire** contents of `src/cli.ts` with:
```ts
#!/usr/bin/env node

import { Command } from "commander";
import { renderBanner } from "./banner.js";
import { create } from "./commands/index.js";
import { applyHelpTheme } from "./help-formatter.js";
import { getCliVersion } from "./package-info.js";

const program = new Command();

applyHelpTheme(program);

program
	.name("tokagentos")
	.description("Create a tokagentOS project")
	.version(getCliVersion(), "-v, --version")
	.action(create);

// Show banner on bare invocation or --help (suppressed for non-TTY / NO_COLOR).
const argv = process.argv.slice(2);
const wantsBanner =
	argv.length === 0 || argv.includes("--help") || argv.includes("-h");
if (wantsBanner) {
	process.stdout.write(renderBanner());
}

await program.parseAsync();
```

- [ ] **Step 7: Remove the dead CLI option types**

In `src/types.ts`, delete the `CreateOptions` and `InfoOptions` interfaces. After this, the file exports only `TemplateId`, `TemplateUpstream`, `TemplateDefinition`, `TemplatesManifest`, and `FullstackTemplateValues`.

- [ ] **Step 8: Verify the whole package**

Run:
```bash
cd packages/tokagentos
bun run build && bun run typecheck && bun run lint:check && bun run test
```
Expected: all pass.

Run:
```bash
grep -rn "CreateOptions\|InfoOptions\|defaultAction\|\.command(\|promptTemplateId\|promptLanguage\|confirm(" src/ | grep -v "__tests__"
```
Expected: no matches (no remaining commander subcommands, no template/language prompts, no confirm step).

- [ ] **Step 9: Manual smoke of the binary (arg parsing + flow shape)**

Run:
```bash
cd packages/tokagentos
node dist/cli.js --help
node dist/cli.js -v
```
Expected: `--help` shows only the create usage (no `create`/`upgrade`/`info` subcommands); `-v` prints the version. (Do not run the bare interactive command here — it waits for prompts.)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(tokagentos): collapse create to a 2-step interactive flow" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Rewrite the packaged smoke test at the scaffold-function level

**Files:**
- Modify: `packages/tokagentos/scripts/packaged-smoke.mjs`

**Interfaces:**
- Consumes: `scaffoldProject` from the installed package (`dist/index.js`), signature per Task 3.

- [ ] **Step 1: Replace `packaged-smoke.mjs` with a single fullstack, scaffold-fn path**

Replace the **entire** contents of `scripts/packaged-smoke.mjs` with:
```js
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const tmpBaseDir =
  process.env.TOKAGENTOS_SMOKE_TMPDIR ||
  (fs.existsSync("/tmp") ? "/tmp" : os.tmpdir());
const tmpRoot = fs.mkdtempSync(
  path.join(tmpBaseDir, "tokagentos-packaged-smoke-"),
);
const shouldKeepTemp = process.env.TOKAGENTOS_SMOKE_KEEP_TEMP === "1";
const shouldInstallGeneratedFullstack =
  process.env.TOKAGENTOS_SMOKE_FULLSTACK_INSTALL === "1";
const shouldUseRemoteUpstream =
  process.env.TOKAGENTOS_SMOKE_REMOTE_UPSTREAM === "1";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const tokagentosBinName =
  process.platform === "win32" ? "tokagentos.cmd" : "tokagentos";
const localUpstreamRepo = path.resolve(packageDir, "..", "..");
const useLocalUpstream =
  !shouldUseRemoteUpstream &&
  fs.existsSync(
    path.join(localUpstreamRepo, "packages", "app-core", "package.json"),
  );
const fullstackInstallEnv = {
  ...process.env,
  MILADY_NO_VISION_DEPS: process.env.MILADY_NO_VISION_DEPS || "1",
  SKIP_AVATAR_CLONE: process.env.SKIP_AVATAR_CLONE || "1",
};

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function getTarballName(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const tarball = [...lines].reverse().find((line) => line.endsWith(".tgz"));
  if (!tarball) {
    throw new Error(
      `Unable to determine tarball name from npm pack output:\n${output}`,
    );
  }
  return tarball;
}

function assertPathExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Expected path to exist: ${targetPath}`);
  }
}

async function main() {
  let passed = false;

  try {
    run("bun", ["run", "build"], { cwd: packageDir });

    const packOutput = run(npmCommand, [
      "pack",
      packageDir,
      "--pack-destination",
      tmpRoot,
    ]);
    const tarballName = getTarballName(packOutput);
    const tarballPath = path.join(tmpRoot, tarballName);
    const smokeDir = path.join(tmpRoot, "smoke");
    fs.mkdirSync(smokeDir, { recursive: true });
    fs.writeFileSync(
      path.join(smokeDir, "package.json"),
      `${JSON.stringify({ name: "tokagentos-packaged-smoke", private: true }, null, 2)}\n`,
    );
    run(npmCommand, ["install", tarballPath], { cwd: smokeDir });

    const installedPkgDir = path.join(
      smokeDir,
      "node_modules",
      "@tokagent",
      "tokagentos",
    );

    // 1. Binary arg-parse smoke: --help and -v must work from the packaged bin.
    const binPath = path.join(smokeDir, "node_modules", ".bin", tokagentosBinName);
    const helpOut = run(binPath, ["--help"], { cwd: smokeDir });
    if (/\b(upgrade|info|plugin)\b/.test(helpOut)) {
      throw new Error(
        `--help still advertises removed surface:\n${helpOut}`,
      );
    }
    run(binPath, ["-v"], { cwd: smokeDir });

    // 2. Scaffold-fn smoke: drive the headless core with fixed inputs.
    //    Redirect HOME so preCompleteOnboarding writes under the temp dir.
    const fakeHome = path.join(tmpRoot, "home");
    fs.mkdirSync(fakeHome, { recursive: true });
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    if (useLocalUpstream) {
      process.env.TOKAGENTOS_UPSTREAM_REPO =
        process.env.TOKAGENTOS_UPSTREAM_REPO || localUpstreamRepo;
      if (process.env.TOKAGENTOS_UPSTREAM_BRANCH === undefined) {
        process.env.TOKAGENTOS_UPSTREAM_BRANCH = "";
      }
    }

    const workspaceDir = path.join(smokeDir, "workspace");
    fs.mkdirSync(workspaceDir, { recursive: true });

    const mod = await import(
      pathToFileURL(path.join(installedPkgDir, "dist", "index.js")).href
    );
    const { projectDir, envVarWritten } = mod.scaffoldProject({
      cwd: workspaceDir,
      projectName: "fullstack-demo",
      providerId: "anthropic",
      apiKey: "sk-ant-smoke",
    });

    assertPathExists(path.join(projectDir, "package.json"));
    assertPathExists(path.join(projectDir, "apps", "app", "package.json"));
    assertPathExists(path.join(projectDir, "tokagent"));
    assertPathExists(path.join(projectDir, ".env"));
    const env = fs.readFileSync(path.join(projectDir, ".env"), "utf8");
    if (!/^ANTHROPIC_API_KEY=sk-ant-smoke$/m.test(env)) {
      throw new Error(`.env missing ANTHROPIC_API_KEY line:\n${env}`);
    }
    if (envVarWritten !== "ANTHROPIC_API_KEY") {
      throw new Error(`unexpected envVarWritten: ${envVarWritten}`);
    }

    if (shouldInstallGeneratedFullstack) {
      run("bun", ["install"], { cwd: projectDir, env: fullstackInstallEnv });
      run("bun", ["run", "typecheck"], {
        cwd: projectDir,
        env: fullstackInstallEnv,
      });
      run("bun", ["run", "build"], {
        cwd: projectDir,
        env: fullstackInstallEnv,
      });
    }

    passed = true;
    console.log("tokagentos packaged smoke test passed");
  } finally {
    if (!shouldKeepTemp && passed) {
      fs.rmSync(tmpRoot, { force: true, recursive: true });
    } else if (!passed || shouldKeepTemp) {
      console.log(`tokagentos packaged smoke temp dir: ${tmpRoot}`);
    }
  }
}

await main();
```

- [ ] **Step 2: Run the packaged smoke test**

Run:
```bash
cd packages/tokagentos
bun run test:packaged
```
Expected: prints `tokagentos packaged smoke test passed`. (This packs the tarball, installs it, runs `--help`/`-v`, and scaffolds a fullstack project against the local upstream. It does not run the heavy `bun install` unless `TOKAGENTOS_SMOKE_FULLSTACK_INSTALL=1`.)

- [ ] **Step 3: Confirm `agent-chat-smoke.mjs` needs no change**

Run:
```bash
grep -n "tokagentos create\|--template\|--llm\|--yes\|upgrade" scripts/agent-chat-smoke.mjs
```
Expected: no matches (it runs against an already-running scaffold and does not invoke `create`). If any match appears, update those invocations to the new flag-free reality; otherwise leave the file unchanged.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(tokagentos): rewrite packaged smoke against scaffoldProject" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Docs + package description

**Files:**
- Modify: `packages/tokagentos/README.md`
- Modify: `packages/tokagentos/scaffold-patches/README.md`
- Modify: `packages/tokagentos/package.json` (description)

- [ ] **Step 1: Rewrite the package README to the 2-step flow**

Replace the **entire** contents of `packages/tokagentos/README.md` with:
```markdown
# tokagentOS CLI

Create a tokagentOS project in two steps.

## Usage

```bash
npx @tokagent/tokagentos@latest
```

You will be asked for:

1. **Project name**
2. **LLM provider** — then that provider's API key (LiteLLM also asks for a base
   URL and small/large model aliases). Choose **x402** to configure billing from
   the in-app x402 tab instead of supplying a key.

The CLI scaffolds a fullstack-app workspace backed by a local `tokagent`
checkout, writes your provider key to `.env`, and pre-completes onboarding so the
app boots ready. Then:

```bash
cd <project>
bun install
bun run dev
```

`bun run dev` launches the UI, the API server, and the headless agent runtime.

## Other flags

```bash
tokagentos --help      # usage
tokagentos -v          # version
```

## Development

```bash
bun run build
bun run test
bun run test:packaged
```
```

- [ ] **Step 2: Drop the `upgrade` reference in the scaffold-patches README**

In `packages/tokagentos/scaffold-patches/README.md`, replace this bullet (the three lines):
```markdown
- If a user later runs `tokagentos upgrade` to pull a new upstream version,
  the overlays re-apply automatically. If upstream renamed or removed the
  target file, `applyTokagentScaffoldPatches` reports a conflict.
```
with:
```markdown
- Overlay patches are applied once, at scaffold-time, against the freshly
  cloned upstream checkout. If upstream renamed or removed the target file,
  `applyTokagentScaffoldPatches` reports a conflict.
```

- [ ] **Step 3: Update the package description**

In `packages/tokagentos/package.json`, change the `description` field from
`"tokagentOS CLI - Create and upgrade tokagentOS project templates"` to:
```json
  "description": "tokagentOS CLI - Create a tokagentOS project",
```

- [ ] **Step 4: Verify the version command's blurb and docs are consistent**

Run:
```bash
cd packages/tokagentos
grep -rn "upgrade" README.md scaffold-patches/README.md package.json
```
Expected: no matches.

Run a final full verification:
```bash
bun run build && bun run typecheck && bun run lint:check && bun run test && bun run test:packaged
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(tokagentos): document the 2-step create flow" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (whole-package, after all tasks)

- [ ] **Build regenerates a single-template manifest**

```bash
cd packages/tokagentos
bun run build
cat templates-manifest.json
```
Expected: `templates` contains exactly one entry, `fullstack-app`.

- [ ] **No dead references remain**

```bash
cd packages/tokagentos
grep -rn "upgrade\|plugin starter\|--template\|--skip-upstream\|--llm\|--api-key\|readProjectMetadata\|writeProjectMetadata\|buildMetadata\|PluginTemplateValues\|getTemplateReplacementEntries\|InfoOptions\|CreateOptions\|UpgradeOptions" src/ scripts/ README.md | grep -v "__tests__"
```
Expected: no matches (bundled `plugins/plugin-*` strings in `scaffold.ts` are fine and are not matched by these patterns).

- [ ] **Full gate**

```bash
cd packages/tokagentos
bun run typecheck && bun run lint:check && bun run test && bun run test:packaged
```
Expected: all pass.

- [ ] **Manual interactive walkthrough (optional, recommended)**

```bash
cd packages/tokagentos
node dist/cli.js
```
Expected: banner → "Project name:" → "Which LLM provider will this project use?" → API-key prompt → "Project created successfully!" with `cd … / bun install / bun run dev` next steps. No template/language/confirm prompts, no menu.
```
