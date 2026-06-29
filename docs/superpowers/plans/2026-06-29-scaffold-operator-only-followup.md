# Follow-up plan: propagate operator-only UI into the scaffold (`tokagentos create`)

> **Status:** Deferred from the 2026-06-29 operator-only migration. The app-core side is **done + merged to alpha** (commits `91fcc9ff..73bcc4af`). This plan covers ONLY the remaining scaffold work, which needs an environment where a scaffold can be generated **and built** to verify.
>
> **Why deferred:** the scaffold does NOT use the monorepo `@tokagentos/app-core`. It clones a **pinned remote `elizaos/eliza`** base (`packages/tokagentos/templates/fullstack-app/template.json` → repo `elizaos/eliza`, commit `db00cf61…`, `git-submodule`) and overlays `scaffold-patches/**` + applies `UPSTREAM_SURGICAL_PATCHES` (`scaffold.ts`) onto *that* clone. So changing app-core does nothing for the scaffolded product, and any change here can only be validated by running `tokagentos create` + building the generated app. That was not possible in the migration session (network clone + heavy build), and shipping unverified changes risks breaking `tokagentos create` for all users.

## Goal
A freshly scaffolded app (`tokagentos create -t fullstack-app`) renders the **operator console only** at the top level — matching the operator-only monorepo. Today it still ships the old multi-tab UI (Chat/Wallet/Automations/Settings/Billing + Operator).

## Current scaffold state (verified 2026-06-29)
- `scaffold-patches/packages/app-core/src/navigation/index.ts` — a **16KB old multi-tab** nav overlay (NOT operator-only).
- **No** `scaffold-patches/.../App.tsx` overlay — the upstream eliza `App.tsx` is modified via surgical patches instead.
- Stale page overlays present: `components/pages/{SettingsView,ChatView,AutomationsView,InventoryView,BillingPageView,ConfigPageView}.tsx`.
- Operator subtree overlay (`components/pages/operator/**`) **is already in sync** with the monorepo (re-synced in `73bcc4af`, including the migrated quick-setup card in `SettingsPage.tsx`).
- `scaffold.ts` `UPSTREAM_SURGICAL_PATCHES` (~L205-712) add, to the upstream eliza App.tsx/nav: the **x402 tab**, the **Operator console** import/case, **BillingPageView** lazy import + `billing` route, and a `SettingsView` lazy import + `settings` route. Their `find` anchors reference the upstream eliza shape (`lazyNamedView`, `TabContentView chatDisabled`).

## Approach decision (resolve first, in the verified env)
Pick ONE, based on what the pinned eliza `App.tsx` actually provides (inspect the hydrated clone):
- **(A) Full overlay** — add `scaffold-patches/.../App.tsx` + replace `navigation/index.ts` with the operator-only versions. RISK: the monorepo `App.tsx` imports many modules (`./bridge`, `./components/apps`, `./components/chat`, `./components/music`, `./components/shell`, `./hooks`, `./platform`, `./state`, `./components/pages/StreamView`) that the upstream eliza app-core may not have. Must verify every import resolves in the generated tree, and that the operator-only `navigation/index.ts` exports everything upstream consumers import. Must NOT import `./styles/brand-gold.css` (scaffold ships only `operator.css`).
- **(B) Surgical patches** — keep overlaying onto upstream eliza, but change the patches so the result is operator-only (default→operator, remove other tabs, route only operator). Needs the exact upstream `App.tsx`/nav `find` anchors. Lower module-compat risk; higher patch-authoring effort.

Recommended: start by **hydrating the scaffold once and reading the upstream `App.tsx` + `navigation/index.ts`**, then choose. (B) is likely safer.

## Steps
1. **Make scaffold generation runnable non-interactively.** `cli.ts` `create` is interactive-only. Either add `-t/-y/--llm` option parsing, or drive `scaffoldProject({ providerId: "x402", … })` from a node script. Use `--llm x402` (NOT `--llm skip`, invalid).
2. **Hydrate once + inspect** the upstream eliza `packages/app-core/src/{App.tsx,navigation/index.ts}` in the generated tree to ground the approach choice.
3. Apply approach (A) or (B) to make the generated nav + App operator-only.
4. **Delete stale page overlays** (`SettingsView, ChatView, AutomationsView, InventoryView, BillingPageView, ConfigPageView`) AND reconcile every `scaffold.ts` patch that references them (the `SettingsView`/`BillingPageView` lazy-import + route patches at ~L582-621) so no patch `find` throws and no generated import dangles. NOTE `scaffold-patches/.../AutomationsView.tsx:80` imports `../../hooks/useWorkflowGenerationState`, which exists in upstream eliza but was deleted from the monorepo — deleting this overlay removes that concern.
5. Keep the **operator subtree overlay** (already correct) and the **x402/operator** surgical patches that wire the operator console.
6. **Update the stale e2e selector** together: `packages/app-core/test/app/qa-checklist.real.e2e.test.ts:1275` waits for `[data-testid="settings-shell"]` (removed with the monorepo `SettingsView`). Once the scaffold is operator-only, repoint this probe at the operator console / its Settings sub-tab. (It's live-gated `describeIf(CAN_RUN)`, not in CI; safe to leave until the scaffold flips.)

## Verification (the whole reason this is deferred)
```
# non-interactive generate into a temp dir
node packages/tokagentos/dist/cli.js create -t fullstack-app -y --llm x402   # after step 1
```
Then in `<project>/tokagent/packages/app-core/src/`:
- nav has a single Operator group, `BuiltinTab` is `"operator"`, no Chat/Wallet/Automations/Settings/Billing top-level groups;
- `App.tsx` renders the operator console (no `case "billing"`, no `BillingPageView`, no `lazyNamedView`/`chatDisabled` leftovers);
- `components/pages/operator/OperatorShell.tsx` + `styles/operator.css` present; `brand-gold.css` NOT shipped;
- run `tsc --noEmit` inside the generated `packages/app-core` → clean;
- launch the generated app and confirm only the operator console renders.

Only commit scaffold changes after the generated app builds + renders operator-only.
