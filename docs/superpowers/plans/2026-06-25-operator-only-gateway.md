# Operator-Only Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocus the `@tokagentos/app-core` UI so the application is composed of the **Operator** console only — Operator + Settings are the sole top-level tabs, Operator is the default, and every other top-level page is hard-removed (tabs, routes, ViewRouter cases, and dead page code).

**Architecture:** `app-core`'s `App.tsx` renders a single shared multi-tab `ViewRouter`. We (1) make Operator the default landing tab, (2) reduce the visible nav to Operator + Settings, (3) collapse `ViewRouter` to those two tabs and unwind the chat-workspace render scaffolding, (4) delete the now-orphaned page-view files in compiler/knip-guided waves, (5) narrow the navigation types + persistence/shell-routing to `operator | settings`, and (6) sweep remaining dead code. Each task keeps typecheck/lint/test/build green. The Operator console subtree (`components/pages/operator/**`) is never modified — it already embeds the full gateway (its internal x402 page).

**Tech Stack:** TypeScript, React 18, Vite, Vitest, Biome, Turborepo, Bun, Knip.

**Spec:** `docs/superpowers/specs/2026-06-25-operator-only-gateway-design.md`

## Global Constraints

- **Base branch:** `alpha`. All work happens in an isolated git worktree off `alpha`.
- **Never modify** `packages/app-core/src/components/pages/operator/**` or `packages/app-core/src/styles/operator.css` — this subtree is "the full gateway embedded in the Operator page."
- **Keep tab set:** exactly `operator` (default) and `settings`. Remove every other top-level tab.
- **KEEP gate for deletions:** never delete a file still imported by a surviving module. Surviving = post-edit `App.tsx`, `SettingsView.tsx` **and its dependency chain** (`./ReleaseCenterView`, `../settings/**`, `../local-inference/**`), the entire `components/pages/operator/**` subtree, `src/index.ts` (barrel), providers/onboarding/state, and anything under `apps/**` / `plugins/**`.
- **Do not touch** `apps/**`, `plugins/**`, `frontend/`, or `handoff_app/`.
- **Build stays green between tasks.** Hard gates after each task: `typecheck`, `lint`, `test` for `@tokagentos/app-core`, plus a root `typecheck` at the end to catch cross-package breakage.
- **Package manager is `bun`.** Run package-scoped scripts from `packages/app-core`.

### Verification commands (referenced throughout)

```bash
# package-scoped (run from packages/app-core)
bun run typecheck     # tsc --noEmit -p tsconfig.json
bun run test          # vitest run
bun run lint          # biome check src

# whole-graph (run from repo root) — catches dependents of app-core
bun run typecheck     # turbo run typecheck  (all workspaces)

# orphaned-file detection (run from repo root)
bunx knip             # reports "Unused files" — the deletion oracle
```

---

### Task 1: Worktree + green baseline

**Files:** none modified (setup + verification only).

- [ ] **Step 1: Create the isolated worktree off `alpha`**

Use the `superpowers:using-git-worktrees` skill to create a worktree based on `alpha` (do NOT branch off the current `fix/chat-streaming-reliability`). If creating manually:

```bash
git fetch origin
git worktree add -b feat/operator-only-gateway ../tokagentos-operator-only alpha
cd ../tokagentos-operator-only
bun install
```

- [ ] **Step 2: Establish the green baseline**

Run from the worktree root, then `packages/app-core`:

```bash
cd packages/app-core
bun run typecheck && bun run lint && bun run test
```

Expected: all three PASS. If anything fails on a clean `alpha`, STOP and report — the baseline must be green before edits.

- [ ] **Step 3: Capture the knip baseline (so we can diff orphans later)**

```bash
cd ../..            # repo root
bunx knip > /tmp/knip-baseline.txt 2>&1 || true
```

Expected: command completes; `/tmp/knip-baseline.txt` lists pre-existing unused files (some may already exist — those are NOT our concern). No commit.

---

### Task 2: Make Operator the default landing tab

Make Operator the default everywhere a tab is initialized or a stale/persisted value is sanitized — while all pages still exist (safe, reversible, independently verifiable).

**Files:**
- Modify: `packages/app-core/src/navigation/index.ts` (`tabFromPath` root case)
- Modify: `packages/app-core/src/state/AppContext.tsx:154`
- Modify: `packages/app-core/src/state/startup-phase-hydrate.ts:151`
- Modify: `packages/app-core/src/state/persistence.ts:442-476` (`normalizeLastNativeTab`, `loadLastNativeTab`)
- Test: `packages/app-core/src/navigation/index.test.ts`

**Interfaces:**
- Produces: `tabFromPath("/") === "operator"`; `DEFAULT_LANDING_TAB === "operator"`; `loadLastNativeTab()` falls back to `"operator"`.

- [ ] **Step 1: Write the failing test**

In `packages/app-core/src/navigation/index.test.ts`, add inside the `describe("navigation", …)` block:

```ts
  it("defaults the root path to the operator console", () => {
    expect(tabFromPath("/")).toBe("operator");
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd packages/app-core
bun run test -- index.test
```

Expected: FAIL — `tabFromPath("/")` currently returns `"chat"`.

- [ ] **Step 3: Point the root path at operator**

In `packages/app-core/src/navigation/index.ts`, in `tabFromPath`, change the root return (currently `if (normalized === "/") return "chat";`) to:

```ts
  if (normalized === "/") return "operator";
```

- [ ] **Step 4: Change the two `DEFAULT_LANDING_TAB` constants**

`packages/app-core/src/state/AppContext.tsx:154` — replace:

```ts
const DEFAULT_LANDING_TAB: Tab = COMPANION_ENABLED ? "companion" : "chat";
```

with:

```ts
const DEFAULT_LANDING_TAB: Tab = "operator";
```

(If `COMPANION_ENABLED` becomes an unused import after this, remove it from the import statement — `bun run lint` will flag it.)

`packages/app-core/src/state/startup-phase-hydrate.ts:151` — replace `const DEFAULT_LANDING_TAB: Tab = "chat";` with:

```ts
const DEFAULT_LANDING_TAB: Tab = "operator";
```

- [ ] **Step 5: Sanitize persisted tab to operator/settings**

In `packages/app-core/src/state/persistence.ts`, replace the whole `normalizeLastNativeTab` function (lines ~442-468) with:

```ts
function normalizeLastNativeTab(tab: unknown): Tab {
  switch (tab) {
    case "settings":
      return "settings";
    case "operator":
      return "operator";
    default:
      return "operator";
  }
}
```

And in `loadLastNativeTab` (just below), change the `tryLocalStorage(..., "chat")` fallback to `"operator"`:

```ts
export function loadLastNativeTab(): Tab {
  return tryLocalStorage(
    () =>
      normalizeLastNativeTab(localStorage.getItem(LAST_NATIVE_TAB_STORAGE_KEY)),
    "operator",
  );
}
```

- [ ] **Step 6: Run the test + typecheck**

```bash
cd packages/app-core
bun run test -- index.test && bun run typecheck && bun run lint
```

Expected: the new test PASSES; typecheck + lint PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/app-core/src/navigation/index.ts \
        packages/app-core/src/navigation/index.test.ts \
        packages/app-core/src/state/AppContext.tsx \
        packages/app-core/src/state/startup-phase-hydrate.ts \
        packages/app-core/src/state/persistence.ts
git commit -m "feat(app-core): default landing tab to operator console"
```

---

### Task 3: Reduce visible navigation to Operator + Settings

Show only the two tabs in the sidebar. Page code still exists; this is the first user-visible milestone.

**Files:**
- Modify: `packages/app-core/src/navigation/index.ts` (`ALL_TAB_GROUPS`)
- Test: `packages/app-core/src/navigation/index.test.ts`

**Interfaces:**
- Produces: `getTabGroups()` returns groups whose labels are exactly `["Operator", "Settings"]`.

- [ ] **Step 1: Write the failing test**

Add to `packages/app-core/src/navigation/index.test.ts`:

```ts
  it("exposes only the operator and settings tab groups", () => {
    const labels = getTabGroups().map((g) => g.label);
    expect(labels).toEqual(["Operator", "Settings"]);
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd packages/app-core
bun run test -- index.test
```

Expected: FAIL — many groups are currently returned.

- [ ] **Step 3: Trim `ALL_TAB_GROUPS`**

In `packages/app-core/src/navigation/index.ts`, replace the entire `ALL_TAB_GROUPS` array (lines ~97-160) with only the two surviving groups, Operator first (it is the default):

```ts
export const ALL_TAB_GROUPS: TabGroup[] = [
  {
    label: "Operator",
    tabs: ["operator"],
    icon: KeyRound,
    description:
      "Local operator console — x402 credits & agent-to-agent network",
  },
  {
    label: "Settings",
    tabs: ["settings"],
    icon: Settings,
    description: "Configuration and preferences",
  },
];
```

`getTabGroups` needs no change — its label-based filters (`"Apps"`, `"Stream"`, `"Wallet"`, `"Browser"`, `"Billing"`) are now vacuously satisfied. Leave `getTabGroups` as-is for this task (the unused icon imports are cleaned in Task 6).

- [ ] **Step 4: Run the test + typecheck**

```bash
cd packages/app-core
bun run test -- index.test && bun run typecheck
```

Expected: both new tests PASS; typecheck PASS (icon imports like `MessageSquare` may now be unused — if `tsc`/biome flags them as errors, remove just those import identifiers; otherwise defer to Task 6).

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/navigation/index.ts \
        packages/app-core/src/navigation/index.test.ts
git commit -m "feat(app-core): show only Operator + Settings tabs"
```

---

### Task 4: Collapse the App.tsx router + unwind the chat workspace

Make `ViewRouter` render only `settings`/`operator` (default Operator), and remove the chat-workspace render scaffolding so no removed page view is referenced. After this, the page-view files are orphaned (deleted in Task 5).

**Files:**
- Modify: `packages/app-core/src/App.tsx`

**Interfaces:**
- Consumes: `OperatorShell` (lazy, already imported at `App.tsx:30`), `SettingsView` (`App.tsx:58`).
- Produces: a `ViewRouter` with cases `settings`, `operator`, and `default → <OperatorShell />`.

- [ ] **Step 1: Replace the `ViewRouter` switch body**

In `packages/app-core/src/App.tsx`, replace the entire `switch (tab) { … }` inside `ViewRouter`'s `view` IIFE (the block running from `case "chat":` through the `default: return <ChatView />;`) with exactly:

```tsx
    switch (tab) {
      case "settings":
        return (
          <TabContentView>
            <SettingsView key="settings-root" />
          </TabContentView>
        );
      case "operator":
      default:
        return (
          <TabContentView>
            <Suspense fallback={null}>
              <OperatorShell />
            </Suspense>
          </TabContentView>
        );
    }
```

Keep the surrounding `const view = (() => { … })();` and `return <ErrorBoundary>{view}</ErrorBoundary>;`. You may drop the now-unused `onCharacterHeaderActionsChange` param if `tsc` flags it; otherwise leave it.

- [ ] **Step 2: Remove the page-view imports**

Delete these now-unused import lines near the top of `App.tsx` (lines ~6, ~46-61) and the lazy `BillingPageView` block (lines ~25-29):

```
import { FineTuningView } from "@tokagentos/app-training/ui/FineTuningView";
const BillingPageView = lazy(() => import("./components/pages/BillingPageView.js")…)
import { AppsPageView } from "./components/pages/AppsPageView";
import { AutomationsView } from "./components/pages/AutomationsView";
import { BrowserWorkspaceView } from "./components/pages/BrowserWorkspaceView";
import { ChatView } from "./components/pages/ChatView";
import { ConnectorsPageView } from "./components/pages/ConnectorsPageView";
import { DatabasePageView } from "./components/pages/DatabasePageView";
import { InventoryView } from "./components/pages/InventoryView";
import { LogsPageView } from "./components/pages/LogsPageView";
import { MemoryViewerView } from "./components/pages/MemoryViewerView";
import { PluginsPageView } from "./components/pages/PluginsPageView";
import { RelationshipsView } from "./components/pages/RelationshipsView";
import { RuntimeView } from "./components/pages/RuntimeView";
import { SkillsView } from "./components/pages/SkillsView";
import { StreamView } from "./components/pages/StreamView";
import { TrajectoriesView } from "./components/pages/TrajectoriesView";
import { DesktopWorkspaceSection } from "./components/settings/DesktopWorkspaceSection";
```

Keep `SettingsView` (`App.tsx:58`) and the lazy `OperatorShell` block (`App.tsx:30-34`). Do not guess every line — after editing, let `bun run typecheck` enumerate any remaining unused/needed import; remove unused, keep referenced.

- [ ] **Step 3: Unwind the chat-workspace render block**

The `App()` render `return` currently branches on `isChatWorkspace ? (…chat layout…) : (…default…)` and references removed pages plus chat infra (`ConversationsSidebar`, `TasksEventsPanel`, `CharacterEditor`, `GameViewOverlay`, mobile chat controls). Since `tab` is now only `operator`/`settings`:

1. Set the chat booleans to constant-false by deleting the chat-workspace branch: replace the `isChatWorkspace ? ( … ) : ( … )` ternary in the main render with **only its non-chat (`else`) branch** (the branch that renders `<ViewRouter … />` inside the standard shell).
2. Remove the now-dead locals and their state/effects flagged by `tsc`: `isChat`, `isChatWorkspace`, `isConnectors`, `isCompanionTab`, `isCharacterPage`, `isWallets`, `isHeartbeats`, `isAppsToolPage`, `isBillingPage`, `isDesktopWorkspacePage`, `mobileConversationsOpen`, `tasksEventsPanelOpen`, `isChatMobileLayout`, `mobileChatControls`, `characterHeaderActions`/`setCharacterHeaderActions`, and the `useEffect`s at lines ~458-471 that depend on them.
3. Remove the corresponding imports flagged as unused: `ConversationsSidebar`, `TasksEventsPanel`, `SaveCommandModal`, `CharacterEditor`, `GameViewOverlay`, `CustomActionEditor`/`CustomActionsPanel` (only if unused after the cut), `isAppsToolTab`, `APPS_ENABLED`, `CHAT_MOBILE_BREAKPOINT_PX`.

> Method: this is the most intricate edit. Make the cut, then run `bun run typecheck` and let the compiler list every unused symbol and broken reference. Remove dead symbols; keep anything still used by the operator/settings/shell path. Repeat until green. Do NOT delete the component files yet (Task 5).

- [ ] **Step 4: Typecheck → fix → repeat until green**

```bash
cd packages/app-core
bun run typecheck
```

Expected: iterate until PASS. Then:

```bash
bun run lint && bun run test
```

Expected: PASS (lint may auto-flag leftover unused imports — remove them).

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/App.tsx
git commit -m "refactor(app-core): collapse ViewRouter to operator + settings"
```

---

### Task 5: Delete orphaned page-view files (knip-guided waves)

Now that nothing imports them, hard-delete the page-view files. Knip is the orphan oracle; the KEEP gate (Global Constraints) is the safety net.

**Files:** deletions under `packages/app-core/src/components/pages/` and exclusively-owned subtrees. **Keep:** `SettingsView.tsx`, `ReleaseCenterView.tsx`, everything under `components/pages/operator/**`, `components/settings/**`, `components/local-inference/**`.

- [ ] **Step 1: Identify newly-orphaned files**

```bash
cd ../..            # repo root
bunx knip > /tmp/knip-now.txt 2>&1 || true
diff /tmp/knip-baseline.txt /tmp/knip-now.txt
```

The diff's newly-listed "Unused files" under `packages/app-core/src/components/pages/` (and their exclusive helpers) are the deletion set. Cross-check each against the KEEP gate before deleting.

- [ ] **Step 2: Delete in subsystem waves, verifying after each**

Delete one subsystem at a time (so a regression is easy to bisect), e.g. chat → automations → billing → apps → browser → connectors → database → logs → plugins → runtime → skills → trajectories → relationships → memory → knowledge → character → stream → tasks/triggers → misc. After EACH wave:

```bash
cd packages/app-core && bun run typecheck && cd ../..
```

Expected: PASS after every wave. If `tsc` reports a broken import, either (a) the file was still referenced by a surviving module — restore it and investigate, or (b) remove the now-dead reference in the surviving module. Never leave the tree red between waves.

- [ ] **Step 3: Re-run knip until the page subsystem is clean**

```bash
bunx knip > /tmp/knip-now.txt 2>&1 || true
```

Expected: no remaining unused files under `components/pages/` except intentional KEEPs. Repeat Step 2 for any stragglers (test files, `*-utils.ts`, panels) that became orphaned by the deletions.

- [ ] **Step 4: Full package gate**

```bash
cd packages/app-core
bun run typecheck && bun run lint && bun run test
```

Expected: PASS. Delete any now-orphaned `*.test.tsx` belonging to removed pages (knip/Vitest will surface them).

- [ ] **Step 5: Commit (one commit per 2-3 waves keeps the diff reviewable)**

```bash
git add -A packages/app-core/src/components/pages
git commit -m "feat(app-core): remove non-operator page views"
```

---

### Task 6: Narrow navigation types, paths, and routing to operator/settings

Hard-remove the dead tab identifiers from the type system and routing tables, and sanitize shell-routing so removed/persisted tabs resolve to operator.

**Files:**
- Modify: `packages/app-core/src/navigation/index.ts`
- Modify: `packages/app-core/src/state/shell-routing.ts`

**Interfaces:**
- Produces: `BuiltinTab = "settings" | "operator"`; `TAB_PATHS` has only `settings`, `operator`; `titleForTab` returns correct titles for both; legacy paths resolve to `operator`.

- [ ] **Step 1: Narrow `BuiltinTab` and routing tables**

In `packages/app-core/src/navigation/index.ts`:

```ts
export type BuiltinTab = "settings" | "operator";
```

Replace `TAB_PATHS` with:

```ts
const TAB_PATHS: Record<BuiltinTab, string> = {
  settings: "/settings",
  operator: "/operator",
};
```

Remove `APPS_TOOL_TABS`, `APPS_TOOL_TAB_SET`, and `isAppsToolTab` (now unused — Task 4 removed the consumer). Simplify `getTabGroups` to drop the dead `streamEnabled`/`walletEnabled`/`browserEnabled`/`billingEnabled` filtering (keep an optional `dynamicTabs` merge only if a surviving caller passes it; otherwise return `[...ALL_TAB_GROUPS]`). Remove unused lucide icon imports (`Clock3`, `Coins`, `Gamepad2`, `MessageSquare`, `Monitor`, `PencilLine`, `Radio`, `Wallet` — keep `KeyRound`, `Settings`).

- [ ] **Step 2: Collapse `titleForTab`, `LEGACY_PATHS`, `APPS_SUB_TABS`, and the `tabFromPath` redirects**

Replace `titleForTab` with:

```ts
export function titleForTab(tab: Tab): string {
  switch (tab) {
    case "operator":
      return "Operator";
    case "settings":
      return "Settings";
    default:
      return tab.charAt(0).toUpperCase() + tab.slice(1).replace(/-/g, " ");
  }
}
```

Replace `LEGACY_PATHS` so every retired path redirects to operator (keeps old deep links alive):

```ts
const LEGACY_PATHS: Record<string, Tab> = {
  "/": "operator",
  "/chat": "operator",
  "/billing": "operator",
  "/inventory": "operator",
  "/wallets": "operator",
  "/automations": "operator",
  "/apps": "operator",
  "/browser": "operator",
  "/stream": "operator",
  "/connectors": "operator",
  "/character": "operator",
  "/companion": "operator",
};
```

In `tabFromPath`, remove the `APPS_SUB_TABS`/`/apps/`/`/character/` branches and the companion/apps feature-flag branches; keep root → `operator`, the `/settings`/`/settings/*` → `settings` branch, and a final `return PATH_TO_TAB.get(normalized) ?? LEGACY_PATHS[normalized] ?? "operator";`. Remove now-unused helpers (`APPS_SUB_TABS`, `getAppSlugFromPath` if unused) — let `tsc`/knip confirm.

- [ ] **Step 3: Sanitize `shell-routing.ts`**

Replace `packages/app-core/src/state/shell-routing.ts` body so companion/character collapse to operator:

```ts
export function deriveUiShellModeForTab(_tab: Tab): UiShellMode {
  return "native";
}

export function getTabForShellView(_view: ShellView, lastNativeTab: Tab): Tab {
  return lastNativeTab === "settings" ? "settings" : "operator";
}
```

(Keep `shouldStartAtCharacterSelectOnLaunch` returning `false`.)

- [ ] **Step 4: Compiler-guided fix-up across the package**

```bash
cd packages/app-core && bun run typecheck && cd ../..
```

`tsc` will now flag every remaining reference to a removed tab id (command palette entries in `chat/index.ts`, `window-shell.ts`, `CompanionSceneConfigContext.tsx`, onboarding, etc.). For each: redirect the value to `"operator"` (or delete the entry if it belongs to a removed page). Iterate until PASS.

- [ ] **Step 5: Update the navigation test for legacy redirects**

In `packages/app-core/src/navigation/index.test.ts`, replace the obsolete `node catalog`/`Nodes` tests (which referenced `automations`) with:

```ts
  it("redirects retired paths to the operator console", () => {
    expect(tabFromPath("/chat")).toBe("operator");
    expect(tabFromPath("/billing")).toBe("operator");
    expect(tabFromPath("/automations")).toBe("operator");
  });

  it("keeps settings addressable", () => {
    expect(tabFromPath("/settings")).toBe("settings");
  });
```

- [ ] **Step 6: Gate**

```bash
cd packages/app-core
bun run typecheck && bun run lint && bun run test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/app-core/src/navigation packages/app-core/src/state/shell-routing.ts
git commit -m "refactor(app-core): narrow tab types + routing to operator/settings"
```

---

### Task 7: Sweep remaining dead code (non-page modules)

Removing the pages orphans chat-infra and helper modules (e.g. `components/chat/*`, `components/conversations/*`, `components/custom-actions/*`, `components/apps/*` overlays) that no surviving module imports. Remove them so "hard-remove" is complete.

**Files:** knip-reported orphans outside `components/pages/`, excluding KEEPs.

- [ ] **Step 1: List remaining orphans**

```bash
cd ../..            # repo root
bunx knip > /tmp/knip-final.txt 2>&1 || true
diff /tmp/knip-baseline.txt /tmp/knip-final.txt
```

- [ ] **Step 2: Delete in waves against the KEEP gate**

For each newly-orphaned file confirmed unused (re-check with `git grep -n "<ExportName>" packages/app-core/src` to be safe), delete it, then:

```bash
cd packages/app-core && bun run typecheck && cd ../..
```

Expected: PASS after each wave. Stop when `diff` shows no app-core orphans beyond the pre-existing baseline. Do not chase orphans into `apps/**`, `plugins/**`, or the operator subtree.

- [ ] **Step 3: Prune the barrel**

```bash
cd packages/app-core && bun run typecheck
```

If any deleted module was re-exported from `src/index.ts`, remove that export line (knip flags unused exports). The page views are not re-exported (verified), so changes here should be limited to incidental utility/type exports.

- [ ] **Step 4: Commit**

```bash
git add -A packages/app-core/src
git commit -m "chore(app-core): remove dead code orphaned by page removal"
```

---

### Task 8: Full verification + manual run

**Files:** none (verification); add a regression assertion if a gap surfaced.

- [ ] **Step 1: Package gates**

```bash
cd packages/app-core
bun run typecheck && bun run lint && bun run test
```

Expected: all PASS.

- [ ] **Step 2: Whole-graph typecheck + build (catches dependents)**

```bash
cd ../..            # repo root
bun run typecheck
bunx turbo run build --filter=@tokagentos/app-core...
```

Expected: PASS — including any workspace that consumes `@tokagentos/app-core` (the `...` suffix includes dependents). If a dependent breaks, fix the reference (it should only be navigation/type-level).

- [ ] **Step 3: Manual run — confirm the operator-only UI**

Launch the dev app (from repo root):

```bash
bun run dev
```

Open the app in the browser. Verify:
1. Only **Operator** and **Settings** appear in the nav.
2. The app **lands on Operator** by default; the Operator console renders with its internal sidebar (including the **x402 gateway** sub-page) intact.
3. **Settings** opens `SettingsView`.
4. Visiting an old path (e.g. append `/chat` or `/billing` to the URL) redirects into the Operator console, not a 404.

> If `bun run dev` does not surface the app-core UI directly in this environment, run the scaffolded template app (`packages/tokagentos/templates/fullstack-app/apps/app`) or app-core Storybook (`packages/app-core/.storybook`) as a fallback, and confirm the same four points.

- [ ] **Step 4: Knip clean check**

```bash
bunx knip
```

Expected: no app-core entries beyond the Task 1 baseline.

- [ ] **Step 5: Commit any verification fixups**

```bash
git add -A
git commit -m "test(app-core): verify operator-only gateway"   # only if changes were needed
```

---

### Task 9: Finish the branch

- [ ] **Step 1: Use the finishing-a-development-branch skill**

Invoke `superpowers:finishing-a-development-branch` to choose how to integrate (PR against `alpha`, merge, or hand off). Do not push or open a PR without explicit user confirmation (per working rules).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Default tab = Operator → Task 2. ✓
- Only Operator + Settings visible → Task 3. ✓
- ViewRouter collapsed, default Operator, chat unwind → Task 4. ✓
- Hard-remove page files (KEEP gate, knip-guided) → Task 5. ✓
- Legacy redirects → /operator → Task 6 (LEGACY_PATHS) + test. ✓
- Narrow BuiltinTab/TAB_PATHS/titleForTab/APPS_TOOL_TABS, persistence + shell-routing sanitize → Tasks 2/6. ✓
- Barrel + dead-code sweep → Task 7. ✓
- Operator subtree untouched → Global Constraints (enforced every task). ✓
- SettingsView dependency chain preserved → Global Constraints KEEP gate. ✓
- Tests updated (nav default/visible/redirects) → Tasks 2/3/6. ✓
- Build green per task + whole-graph + manual run → Tasks 1-8. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to". Deletion sets are expressed as a concrete knip+tsc+KEEP-gate procedure (the correct oracle for orphan detection), not vague instructions.

**Type consistency:** `BuiltinTab = "settings" | "operator"` (Task 6) is consistent with `ALL_TAB_GROUPS` tabs (Task 3), `TAB_PATHS` keys (Task 6), `normalizeLastNativeTab` returns (Task 2), `getTabForShellView` returns (Task 6), and the `ViewRouter` cases (Task 4). `DEFAULT_LANDING_TAB` is `"operator"` in both definitions (Task 2).
