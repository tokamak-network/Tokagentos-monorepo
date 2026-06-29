# Design: Refocus tokagentOS app to operator-only gateway

- **Date:** 2026-06-25
- **Status:** Approved (design); pending spec review → implementation plan
- **Owner:** mehdi-defiesta (CTO)
- **Base branch:** `alpha`
- **Scope package:** `packages/app-core` (`@tokagentos/app-core`)

---

## 1. Context & problem

"The gateway" is the tokagentOS application UI. Today `app-core`'s `<App>` renders a
full multi-tab console (Chat, Apps, Character, Wallet/Inventory, Browser, Stream,
Automations, Settings, Billing, **Operator**, plus a set of apps-tool tabs). The
**Operator** tab is a self-contained console (`localhost:2138`) that already embeds
the full gateway — its own internal sidebar with chat, wallet, **x402 credits/gateway**,
automations, plugins, and settings sub-pages.

We are refocusing the product: the gateway should be **composed of the Operator page
only**. The standalone top-level pages (Chat, Automations, Wallet, the standalone
x402/Billing page, and everything else except Settings) become redundant because the
Operator console already embeds them. They will be **hard-removed**.

## 2. Goals

- `app-core`'s `<App>` exposes exactly two top-level tabs: **Operator** and **Settings**.
- **Operator is the default landing tab** (its internal default sub-page is `x402`, the gateway).
- All other top-level tabs, their routes, their `ViewRouter` cases, and their now-dead
  page component files are removed from `app-core`.
- The build, typecheck, lint, and app run stay green.

## 3. Non-goals / explicit exclusions

- **Do NOT modify the Operator console internals.** Everything under
  `packages/app-core/src/components/pages/operator/**` stays exactly as-is, including its
  embedded sidebar pages (chat / wallet / **x402 gateway** / automations / plugins /
  settings) and its live `/v1` billing wiring. This subtree *is* "the full gateway
  embedded in the Operator page."
- No changes to the `apps/*` white-label packages (companion, lifeops, shopify, steward,
  etc.). They consume `app-core`'s barrel exports (UI primitives, hooks,
  `registerOverlayApp`) and register *into* app-core; they do **not** import the page
  views being removed. Their nav surfaces are deprecated/out of scope for this change.
- No backend / plugin / billing-server changes. The `plugin-tokagent-billing` gateway
  proxy and its `/billing/setup-panel` + `/dashboard` HTML are unrelated to this UI change.

## 4. Decisions (locked from stakeholder)

| Question | Decision |
|---|---|
| Base branch | `alpha` (already contains the merged Operator console; `feat/operator-console` is fully merged, 0 commits ahead) |
| Tabs to keep | **Operator + Settings** only |
| Default tab | **Operator** |
| Disable semantics | **Hard-remove** — tabs, routes, ViewRouter cases, and dead page code |
| Removal layer | **Refocus `app-core` itself** (the whole app becomes operator-only) |
| Other products | Refocused away; other white-label nav surfaces deprecated/out of scope |
| Operator internals | **Untouched** |

## 5. Current architecture (key references on `alpha`)

- **Navigation:** `packages/app-core/src/navigation/index.ts`
  - `BuiltinTab` union (chat, lifeops, tasks, automations, browser, companion, stream,
    apps, character, character-select, inventory, knowledge, connectors, triggers,
    plugins, skills, advanced, fine-tuning, trajectories, relationships, memories,
    rolodex, voice, runtime, database, desktop, settings, logs, billing, **operator**)
  - `ALL_TAB_GROUPS` (Chat, Apps, Character, Wallet, Browser, Stream, Automations,
    Settings, Billing, **Operator**)
  - `APPS_TOOL_TABS` + `isAppsToolTab`
  - `getTabGroups(streamEnabled, walletEnabled, browserEnabled, dynamicTabs, billingEnabled)`
  - `TAB_PATHS` record, legacy path redirects, `titleForTab(tab)`
- **App shell:** `packages/app-core/src/App.tsx`
  - Top-level imports of ~16 page views (lines ~46–61).
  - `ViewRouter` switch: cases for chat, lifeops, browser, companion, stream, apps, tasks,
    character/character-select/knowledge, inventory, connectors, automations/triggers,
    voice, settings, plugins, **operator**; `default → <ChatView />`.
  - `OperatorShell` lazy-mounted for case `operator`; `BillingPageView` lazy for `billing`.
  - Chat-workspace mobile layout driven by `isChat` / `isChatWorkspace` /
    `isChatMobileLayout` (lines ~366–793): conversations panel, tasks-events panel.
- **State/routing:** `packages/app-core/src/state/shell-routing.ts`
  (`getTabForShellView`, `deriveUiShellModeForTab`), `state/useNavigationState.ts`,
  `navigation/index.ts` last-native-tab normalization.
- **Kept page — Settings:** `packages/app-core/src/components/pages/SettingsView.tsx`
  depends on (must be preserved): `./ReleaseCenterView`, `../settings/*`
  (`LearnedSkills`, `TrainingSettings`, …), `../local-inference/LocalInferencePanel`.
- **Operator console (kept, untouched):**
  `packages/app-core/src/components/pages/operator/**` (~61 files: `OperatorShell.tsx`,
  `Sidebar.tsx`, `pages/*`, `x402/*`, `client-gateway.ts`, `client-billing.ts`,
  `eip712.ts`, `auth.ts`, `chain-config.ts`, …) + `styles/operator.css`.
- **Deployment:** the scaffolded `fullstack-app` template
  (`packages/tokagentos/templates/fullstack-app/apps/app/src/main.tsx`) renders
  `app-core`'s `<App>` via `createRoot`. Trimming `app-core` propagates to scaffolds on
  the next release; no template nav to change.

## 6. Target architecture

`app-core`'s `<App>` renders a two-tab shell:

1. **Operator** (default) — the full `localhost:2138` console (`OperatorShell`), unchanged.
2. **Settings** — the real `SettingsView`.

`ViewRouter` default route → Operator. Removed/legacy routes redirect to `/operator`.

## 7. Detailed change spec, by area

### 7.1 `navigation/index.ts`
- Reduce `ALL_TAB_GROUPS` to `Operator` + `Settings`.
- Trim `BuiltinTab` to the surviving tabs (`operator`, `settings`, and any ids still
  required by kept code — to be confirmed by typecheck). Trimming this union is the
  primary mechanism that surfaces every stale reference elsewhere.
- Remove `APPS_TOOL_TABS` / `isAppsToolTab` (Apps group gone).
- Simplify `getTabGroups` — drop the now-moot `streamEnabled` / `walletEnabled` /
  `browserEnabled` / `billingEnabled` gating. Preserve `dynamicTabs` handling only if a
  surviving consumer needs it; otherwise remove (plugin dynamic nav tabs are out of scope).
- `TAB_PATHS` → keep `operator`, `settings`.
- **Legacy redirects:** map removed paths (`/`, `/chat`, `/billing`, `/inventory`,
  `/automations`, `/apps/*`, `/stream`, `/browser`, …) → `/operator` so old deep links and
  the previous default don't 404.
- `titleForTab` → keep `operator`, `settings` cases.

### 7.2 `App.tsx`
- `ViewRouter`: keep only `settings` and `operator`; **`default` returns `<OperatorShell />`** (via the existing lazy import) instead of `<ChatView />`.
- Remove top-level imports + lazy imports for deleted views (ChatView, InventoryView,
  AutomationsView, BillingPageView, StreamView, AppsPageView, BrowserWorkspaceView,
  ConnectorsPageView, DatabasePageView, LogsPageView, PluginsPageView, RuntimeView,
  SkillsView, TrajectoriesView, RelationshipsView, MemoryViewerView, etc.).
- Unwind the chat-workspace mobile layout: collapse the `isChat` / `isChatWorkspace` /
  `isChatMobileLayout` branch and its conversations/tasks-events panels so the standard
  render path (TabContentView/TabScrollView → Operator) is the only path. Remove dead
  state/effects tied to chat.

### 7.3 State / routing
- `shell-routing.ts`: `getTabForShellView` / `deriveUiShellModeForTab` — drop
  `companion`/`character`/chat handling; sanitize to `operator` / `settings`.
- Sanitize persisted "last native tab" (normalization helper) so stored values for removed
  tabs resolve to `operator`.
- `useNavigationState` and onboarding/deep-link config: remove references to deleted tabs.

### 7.4 Delete dead page files (compiler-guided sweep)
Target directory: `packages/app-core/src/components/pages/` and exclusively-owned
subtrees. Candidate deletions (indicative — final set determined by the sweep):
chat* (`ChatView`, `ChatModalView`, `ChatPanelLayout`, `chat-view-hooks`),
automation* (`AutomationsView`, `AutomationRoomChatPane`, `automation-conversations`),
`billing/` + `BillingPageView`, apps* (`AppsPageView`, `AppsView`), browser*
(`BrowserWorkspaceView`, `useBrowserWorkspaceWalletBridge`), `ConnectorsPageView`,
database* (`DatabasePageView`, `DatabaseView`, `database-utils`, `SqlEditorPanel`,
`VectorBrowserView`, `vector-browser-utils`), logs* (`LogsPageView`, `LogsView`),
plugins* (`PluginsPageView`, `PluginsView`, `plugin-*`, `PluginCard`, `PluginConfigForm`),
`RuntimeView`, skills* (`SkillsView`, `skill-*`), trajector*
(`TrajectoriesView`, `TrajectoryDetailView`), relationships*
(`RelationshipsView`, `RelationshipsGraphPanel`, `RelationshipsIdentityCluster`),
memory* (`MemoryViewerView`, `MemoryDetailPanel`), knowledge*
(`KnowledgeView`, `knowledge-*`), character*, `StreamView`, `MediaGalleryView`,
`TasksPageView`, `TriggersView`, `HeartbeatsView`/`HeartbeatForm`/`heartbeat-utils`,
`N8nWorkflowsPanel`/`WorkflowGraphViewer`, `AdvancedPageView`,
`ConfigPageView`/`config-page-sections`, `managed-discord-utils`, etc.

**Deletion rule (hard gate):** delete a file only if **nothing surviving** imports it,
where "surviving" = post-trim `App.tsx`, `SettingsView` and its dependency chain
(`ReleaseCenterView`, `settings/*`, `local-inference/*` — **KEEP**), `OperatorShell` and
the entire `operator/**` subtree (**KEEP**), the `index.ts` barrel, providers, onboarding,
and `apps/*`. If a file is still referenced by a kept module, it stays.

### 7.5 Barrel `index.ts`
- Remove exports of deleted modules. (Note: the barrel does **not** currently export the
  page views, and no `apps/*` imports them — verified — so blast radius is limited to
  app-core-internal references plus any utility/type exports from deleted files.)

### 7.6 Tests
- Update `packages/app-core/src/navigation/index.test.ts`: assert only `Operator` +
  `Settings` groups; assert default tab resolves to `operator`; assert legacy paths
  redirect to `/operator`.
- Remove tests belonging to deleted pages; keep `SettingsView` and operator tests.

## 8. Execution plan (phased; build stays green between phases)

1. **Isolation:** create a git worktree off `alpha`.
2. **Phase 1 — nav + default route (no deletions yet):** trim `ALL_TAB_GROUPS` to
   Operator+Settings, point `ViewRouter` default → Operator. `typecheck` + run the app;
   confirm only two tabs render and Operator is default. (Page code still present.)
3. **Phase 2 — delete dead page files in waves:** delete a wave, run `tsc`, let it surface
   broken references, fix (remove imports/cases), repeat until the candidate set is gone
   and the build is green. Respect the §7.4 deletion gate.
4. **Phase 3 — cleanup:** barrel exports, onboarding/deep-link references, legacy
   redirects to `/operator`, persisted-tab sanitization, App.tsx chat-layout unwind.
5. **Phase 4 — verify:** `typecheck` + `lint` + `build` for `@tokagentos/app-core`
   (and dependents via turbo); update/extend tests; run the app to confirm an
   operator-only, Operator-default UI with Settings reachable.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| `App.tsx` chat-workspace unwind is intricate (mobile layout, conversations/tasks panels) | Do it in Phase 3 after nav is proven; lean on typecheck + manual run |
| Hidden references to removed tabs (command palette, onboarding, mobile nav, deep links) | Trim `BuiltinTab` early so `tsc` flags every stale reference |
| Accidentally deleting a file `SettingsView`/Operator needs | §7.4 deletion gate + compiler-guided waves; explicit KEEP list |
| Large deletion diff hurts reviewability | Keep build green per wave; group deletions by subsystem in commits |
| Scaffold/template propagation | Template renders app-core `<App>`; change propagates on next release — no template edit needed |

## 10. Open questions

None blocking. (Plugin-provided dynamic nav tabs are treated as out of scope; if a kept
consumer needs the mechanism, it will surface during the Phase 1 typecheck.)
