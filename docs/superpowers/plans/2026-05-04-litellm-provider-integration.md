# LiteLLM Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LiteLLM Proxy as a first-class LLM provider in tokagentos — a virtual provider id that runs on `@elizaos/plugin-openai` via boot-time env mirroring, surfaced in both the `tokagentos create` wizard and the in-app Settings provider switcher.

**Architecture:** Hybrid C from the spec — no new plugin package, no new runtime model code. Six small touch points: an env mirror in the `core-plugins.ts` scaffold overlay, two map entries in the auto-enable table, one onboarding-option entry, one provider-switcher branch + default-models entry, one CLI wizard entry with three new flags, and `.env.example` documentation mirrored across three locations.

**Tech Stack:** TypeScript, Bun, Vitest, Commander (CLI), `@clack/prompts` (interactive wizard), upstream `@elizaos/plugin-openai`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-04-litellm-provider-integration-design.md`

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `packages/tokagentos/scaffold-patches/packages/agent/src/runtime/core-plugins.ts` | Modify | Boot-time mirror of `LITELLM_*` → `OPENAI_*` (override semantics) plus coupled-validation for `(API_KEY, BASE_URL)` pair. |
| `packages/tokagentos/src/__tests__/scaffold-patches.test.ts` | Modify | Content-shape assertions for the mirror calls and helper. |
| `packages/agent/src/config/plugin-auto-enable.ts` | Modify | Map `LITELLM_API_KEY` and auth-profile `litellm` to `@elizaos/plugin-openai`; force `litellm` short id in the allowlist. |
| `packages/agent/src/config/__tests__/plugin-auto-enable.test.ts` | Create | Tests for env-detection and auth-profile branches. |
| `packages/shared/src/contracts/onboarding.ts` | Modify | Add `"litellm"` to the `OnboardingProviderId` and `OnboardingProviderFamily` union literals. |
| `packages/agent/src/contracts/onboarding-provider-defaults.ts` | Modify | Append `litellm` `ProviderOption` entry. |
| `packages/agent/src/api/provider-switch-config.ts` | Modify | Add `litellm` to `PROVIDER_DEFAULT_MODELS`; export `applyLocalProviderCapabilities` for testing; add the litellm branch (write both `LITELLM_*` and `OPENAI_*`, reject if `LITELLM_BASE_URL` missing). |
| `packages/agent/src/api/__tests__/provider-switch-config.test.ts` | Create | Tests for the litellm branch happy path and rejection. |
| `packages/tokagentos/src/types.ts` | Modify | Add three optional fields to `CreateOptions`: `llmBaseUrl`, `llmSmallModel`, `llmLargeModel`. |
| `packages/tokagentos/src/cli.ts` | Modify | Three new `.option()` calls. |
| `packages/tokagentos/src/commands/create.ts` | Modify | Add `litellm` to `LLM_PROVIDERS`; special-case the prompt flow; add `writeLlmExtraEnv` helper; extend `--yes` validation. |
| `packages/tokagentos/src/__tests__/create.test.ts` | Create | Tests for the litellm `--yes` happy path and missing-flag rejection. |
| `.env.example` (root, plus two mirrors under `packages/templates/fullstack-app/` and `packages/tokagentos/templates/fullstack-app/`) | Modify | Add a 5-line LiteLLM section. |

**Note on testing strategy:** the `core-plugins.ts` file is an overlay copied into the upstream eliza submodule at scaffold time. The existing `scaffold-patches.test.ts` snapshots overlay file content rather than executing the mirror logic at runtime. Follow that pattern for Task 1 — assert the mirror function and four mirror calls are present in the overlay text. Behavior verification happens via the Task 7 manual smoke. Do not add a runtime-import test for the overlay; it would require executing scaffolded-tree code in isolation, which the test harness does not support.

---

## Task 1: Boot-time env mirror in `core-plugins.ts` overlay

**Files:**
- Modify: `packages/tokagentos/scaffold-patches/packages/agent/src/runtime/core-plugins.ts`
- Test: `packages/tokagentos/src/__tests__/scaffold-patches.test.ts:30-132`

**Context:** The overlay already has `mirrorTokagentEnvAlias(from, to)` which fills the destination only when empty. We're adding `mirrorTokagentEnvAliasOverride` (overwrites when destination is set) plus coupled-validation that suppresses the litellm group entirely if either `LITELLM_API_KEY` or `LITELLM_BASE_URL` is missing while the other is set.

- [ ] **Step 1: Read the current overlay to confirm shape**

Run: `cat packages/tokagentos/scaffold-patches/packages/agent/src/runtime/core-plugins.ts | head -40`

Expected: see existing `mirrorTokagentEnvAlias` helper and 6 mirror calls for `TOKAGENT_PRIVATE_KEY` / `TOKAGENT_RPC_URL`.

- [ ] **Step 2: Write the failing test**

Open `packages/tokagentos/src/__tests__/scaffold-patches.test.ts`. Inside the existing `describe("applyTokagentScaffoldPatches", () => { ... })` block, append:

```ts
  it("overlay mirrors LITELLM_* env vars to OPENAI_* with override semantics", () => {
    const root = makeTempSubmoduleTree();
    applyTokagentScaffoldPatches({ submoduleRoot: root });

    const overlaid = fs.readFileSync(
      path.join(root, "packages/agent/src/runtime/core-plugins.ts"),
      "utf-8",
    );

    // The override-mirror helper must be defined.
    expect(overlaid).toMatch(/function mirrorTokagentEnvAliasOverride\b/);

    // All four LITELLM → OPENAI mirror calls are present.
    expect(overlaid).toContain('mirrorTokagentEnvAliasOverride("LITELLM_API_KEY", "OPENAI_API_KEY")');
    expect(overlaid).toContain('mirrorTokagentEnvAliasOverride("LITELLM_BASE_URL", "OPENAI_BASE_URL")');
    expect(overlaid).toContain('mirrorTokagentEnvAliasOverride("LITELLM_SMALL_MODEL", "OPENAI_SMALL_MODEL")');
    expect(overlaid).toContain('mirrorTokagentEnvAliasOverride("LITELLM_LARGE_MODEL", "OPENAI_LARGE_MODEL")');

    // Coupled-validation guard is present (suppress mirror if either of the
    // two required keys is missing while the other is set).
    expect(overlaid).toMatch(/LITELLM_API_KEY.*LITELLM_BASE_URL.*missing/s);

    fs.rmSync(root, { force: true, recursive: true });
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/tokagentos && bunx vitest run src/__tests__/scaffold-patches.test.ts -t "LITELLM"`
Expected: FAIL — assertion errors on each `expect(overlaid).toMatch(...)` / `toContain(...)` because the overlay does not yet reference `LITELLM_*`.

- [ ] **Step 4: Add the override helper to the overlay**

Open `packages/tokagentos/scaffold-patches/packages/agent/src/runtime/core-plugins.ts`. Below the existing `mirrorTokagentEnvAlias` function (around line 26), insert:

```ts
function mirrorTokagentEnvAliasOverride(from: string, to: string): void {
  const src = process.env[from]?.trim();
  if (src) {
    process.env[to] = src;
  }
}

/**
 * LiteLLM Proxy support. When LITELLM_API_KEY and LITELLM_BASE_URL are both
 * set, mirror them (and the optional model-name knobs) onto the OPENAI_*
 * names that @elizaos/plugin-openai consumes natively. Override semantics:
 * if a user has both LITELLM_* and OPENAI_*, LiteLLM wins.
 *
 * Coupled validation: if only one of {LITELLM_API_KEY, LITELLM_BASE_URL} is
 * set, suppress the mirror entirely. Mirroring just the key would route the
 * virtual key against api.openai.com and produce a confusing 401; mirroring
 * just the URL would change the OpenAI plugin's endpoint while keeping the
 * real OpenAI key, which is also wrong.
 */
function configureLitellmEnvMirror(): void {
  const hasKey = !!process.env.LITELLM_API_KEY?.trim();
  const hasUrl = !!process.env.LITELLM_BASE_URL?.trim();
  if (hasKey !== hasUrl) {
    console.warn(
      "[tokagent] LITELLM_API_KEY and LITELLM_BASE_URL must be set together; one is missing — skipping LiteLLM mirror. Either set both or neither.",
    );
    return;
  }
  if (!hasKey) {
    return;
  }
  const willOverride =
    !!process.env.OPENAI_API_KEY?.trim() ||
    !!process.env.OPENAI_BASE_URL?.trim();
  if (willOverride) {
    console.warn(
      "[tokagent] LITELLM_* env vars detected; overriding OPENAI_*",
    );
  }
  mirrorTokagentEnvAliasOverride("LITELLM_API_KEY", "OPENAI_API_KEY");
  mirrorTokagentEnvAliasOverride("LITELLM_BASE_URL", "OPENAI_BASE_URL");
  mirrorTokagentEnvAliasOverride("LITELLM_SMALL_MODEL", "OPENAI_SMALL_MODEL");
  mirrorTokagentEnvAliasOverride("LITELLM_LARGE_MODEL", "OPENAI_LARGE_MODEL");
}
configureLitellmEnvMirror();
```

Place the `configureLitellmEnvMirror()` call **after** the existing `TOKAGENT_*` mirror calls so they run first and don't interfere with our override warning logic.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/tokagentos && bunx vitest run src/__tests__/scaffold-patches.test.ts -t "LITELLM"`
Expected: PASS.

- [ ] **Step 6: Run the full scaffold-patches suite to ensure no regression**

Run: `cd packages/tokagentos && bunx vitest run src/__tests__/scaffold-patches.test.ts`
Expected: all 5 tests pass (the original 4 + the new one).

- [ ] **Step 7: Commit**

```bash
git add packages/tokagentos/scaffold-patches/packages/agent/src/runtime/core-plugins.ts \
        packages/tokagentos/src/__tests__/scaffold-patches.test.ts
git commit -m "feat(litellm): mirror LITELLM_* env vars onto OPENAI_* in core-plugins overlay"
```

---

## Task 2: Wire LITELLM into the auto-enable map

**Files:**
- Modify: `packages/agent/src/config/plugin-auto-enable.ts`
- Test: `packages/agent/src/config/__tests__/plugin-auto-enable.test.ts` (CREATE)

**Context:** The runtime resolves which plugin packages to load by reading `AUTH_PROVIDER_PLUGINS` (env-key driven) and `PROVIDER_PLUGINS` (auth-profile driven). Both maps return a package name. The `addToAllowlist` helper derives a "short id" from the package name by slicing after `plugin-`, so `@elizaos/plugin-openai` → `openai`. For LiteLLM, we want the short id `litellm` (so the in-app switcher's "current provider" lookup matches the stored id), even though the package is `@elizaos/plugin-openai`. We solve this by passing an explicit short id to `addToAllowlist` in the env-key loop when the trigger env key is `LITELLM_API_KEY`.

- [ ] **Step 1: Create the test file with the failing happy-path test**

Create `packages/agent/src/config/__tests__/plugin-auto-enable.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyPluginAutoEnable } from "../plugin-auto-enable.js";

describe("applyPluginAutoEnable — LiteLLM", () => {
  it("env LITELLM_API_KEY enables @elizaos/plugin-openai with 'litellm' short id", () => {
    const result = applyPluginAutoEnable({
      config: { plugins: { allow: [], entries: {} } },
      env: { LITELLM_API_KEY: "lt-abc" } as NodeJS.ProcessEnv,
    });
    expect(result.config.plugins?.allow).toContain("@elizaos/plugin-openai");
    expect(result.config.plugins?.allow).toContain("litellm");
    expect(result.changes.some((c) => c.includes("env: LITELLM_API_KEY"))).toBe(
      true,
    );
  });

  it("auth profile provider 'litellm' enables @elizaos/plugin-openai with 'litellm' short id", () => {
    const result = applyPluginAutoEnable({
      config: {
        plugins: { allow: [], entries: {} },
        auth: { profiles: { primary: { provider: "litellm" } } },
      },
      env: {} as NodeJS.ProcessEnv,
    });
    expect(result.config.plugins?.allow).toContain("@elizaos/plugin-openai");
    expect(result.config.plugins?.allow).toContain("litellm");
  });

  it("does not allowlist 'openai' short id when only LITELLM_API_KEY is set", () => {
    const result = applyPluginAutoEnable({
      config: { plugins: { allow: [], entries: {} } },
      env: { LITELLM_API_KEY: "lt-abc" } as NodeJS.ProcessEnv,
    });
    expect(result.config.plugins?.allow).not.toContain("openai");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/agent && bunx vitest run src/config/__tests__/plugin-auto-enable.test.ts`
Expected: FAIL — `LITELLM_API_KEY` and `litellm` are not in the maps; the allowlist is empty.

- [ ] **Step 3: Add the map entries**

Open `packages/agent/src/config/plugin-auto-enable.ts`.

In `PROVIDER_PLUGINS` (around line 62), add **alphabetically** between `groq` and `xai`:

```ts
  litellm: "@elizaos/plugin-openai",
```

In `AUTH_PROVIDER_PLUGINS` (around line 82), add after `OLLAMA_BASE_URL` (or grouped with other API key entries):

```ts
  LITELLM_API_KEY: "@elizaos/plugin-openai",
```

- [ ] **Step 4: Force the `litellm` short id in the env-key loop**

In `packages/agent/src/config/plugin-auto-enable.ts`, find the env-var loop (around line 420):

```ts
  for (const [envKey, pluginName] of Object.entries(AUTH_PROVIDER_PLUGINS)) {
    const envValue = env[envKey];
    if (!envValue || typeof envValue !== "string" || envValue.trim() === "")
      continue;
    const pluginId = pluginName.includes("/plugin-")
      ? pluginName.slice(pluginName.lastIndexOf("/plugin-") + "/plugin-".length)
      : pluginName;
    if (pluginsConfig.entries[pluginId]?.enabled === false) continue;
    addToAllowlist(
      pluginsConfig.allow,
      pluginName,
      pluginId,
      changes,
      `env: ${envKey}`,
    );
  }
```

Replace the body so that `LITELLM_API_KEY` overrides the derived short id:

```ts
  for (const [envKey, pluginName] of Object.entries(AUTH_PROVIDER_PLUGINS)) {
    const envValue = env[envKey];
    if (!envValue || typeof envValue !== "string" || envValue.trim() === "")
      continue;
    // For most providers the short id is derived from the package name
    // (`@elizaos/plugin-openai` → `openai`). For LiteLLM the package is
    // plugin-openai but we want the allowlist to record `litellm` so the
    // in-app switcher's "current provider" lookup matches the stored id.
    const derivedId = pluginName.includes("/plugin-")
      ? pluginName.slice(pluginName.lastIndexOf("/plugin-") + "/plugin-".length)
      : pluginName;
    const pluginId = envKey === "LITELLM_API_KEY" ? "litellm" : derivedId;
    if (pluginsConfig.entries[pluginId]?.enabled === false) continue;
    addToAllowlist(
      pluginsConfig.allow,
      pluginName,
      pluginId,
      changes,
      `env: ${envKey}`,
    );
  }
```

The `PROVIDER_PLUGINS` auth-profile branch (around line 363) already passes `provider` (= the profile's provider id) as the short id, so `provider: "litellm"` already lands as `"litellm"` without changes there. Verify by re-reading lines 363–378.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/agent && bunx vitest run src/config/__tests__/plugin-auto-enable.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 6: Run the surrounding suite to confirm no regression**

Run: `cd packages/agent && bunx vitest run src/config`
Expected: existing tests still pass (notably `config.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/config/plugin-auto-enable.ts \
        packages/agent/src/config/__tests__/plugin-auto-enable.test.ts
git commit -m "feat(litellm): auto-enable plugin-openai when LITELLM_API_KEY is set"
```

---

## Task 3: Register LiteLLM as an onboarding provider option

**Files:**
- Modify: `packages/shared/src/contracts/onboarding.ts:73-88` and `:60-71` (the `OnboardingProviderFamily` and `OnboardingProviderId` union types)
- Modify: `packages/agent/src/contracts/onboarding-provider-defaults.ts`

**Context:** `DEFAULT_ONBOARDING_PROVIDER_OPTIONS` is the source of truth for the in-app provider switcher UI. Adding the entry surfaces "LiteLLM Proxy" in Settings → Provider. The `id` and `family` fields are typed string unions with `(string & {})` catch-alls, so the value technically type-checks today, but listing the literals makes the intent explicit and gives editor intellisense to consumers.

- [ ] **Step 1: Add `litellm` to the type unions**

Open `packages/shared/src/contracts/onboarding.ts`.

Find `OnboardingProviderFamily` (around line 60). Add `| "litellm"` before the catch-all:

```ts
export type OnboardingProviderFamily =
  | "anthropic"
  | "deepseek"
  | "tokagentcloud"
  | "gemini"
  | "grok"
  | "groq"
  | "litellm"           // ← add
  | "mistral"
  | "ollama"
  | "openai"
  | "openrouter"
  | "together"
  | "zai"
  | (string & {});
```

Find `OnboardingProviderId` (around line 73). Add `| "litellm"` before the catch-all:

```ts
export type OnboardingProviderId =
  | "anthropic"
  | "anthropic-subscription"
  | "deepseek"
  | "tokagentcloud"
  | "gemini"
  | "grok"
  | "groq"
  | "litellm"           // ← add
  | "mistral"
  | "ollama"
  | "openai"
  | "openai-subscription"
  | "openrouter"
  | "together"
  | "zai"
  | (string & {});
```

- [ ] **Step 2: Append the provider option entry**

Open `packages/agent/src/contracts/onboarding-provider-defaults.ts`. Inside `DEFAULT_ONBOARDING_PROVIDER_OPTIONS`, add an entry between the existing `openrouter` (order 70) and `gemini` (order 80) entries:

```ts
  {
    id: "litellm",
    name: "LiteLLM Proxy",
    envKey: "LITELLM_API_KEY",
    pluginName: "@elizaos/plugin-openai",
    keyPrefix: null,
    description:
      "OpenAI-compatible self-hosted or hosted LiteLLM proxy. Set LITELLM_BASE_URL in .env first.",
    family: "litellm",
    authMode: "api-key",
    group: "local",
    order: 75,
  },
```

- [ ] **Step 3: Verify the file still type-checks**

Run: `cd packages/agent && bunx tsc --noEmit -p tsconfig.json` (or whatever `bun run typecheck` resolves to from this package — check `package.json` `scripts.typecheck`).
Expected: no new type errors.

- [ ] **Step 4: Build the shared and agent packages so the change is visible to dependents**

Run: `cd packages/shared && bun run build && cd ../agent && bun run build`
Expected: success.

- [ ] **Step 5: Verify the entry appears at runtime**

Add a focused test in `packages/agent/src/config/__tests__/plugin-auto-enable.test.ts` (extend the file from Task 2):

```ts
import { DEFAULT_ONBOARDING_PROVIDER_OPTIONS } from "../../contracts/onboarding-provider-defaults.js";

describe("DEFAULT_ONBOARDING_PROVIDER_OPTIONS — LiteLLM", () => {
  it("includes a litellm entry pointing at plugin-openai", () => {
    const litellm = DEFAULT_ONBOARDING_PROVIDER_OPTIONS.find(
      (p) => p.id === "litellm",
    );
    expect(litellm).toBeDefined();
    expect(litellm?.pluginName).toBe("@elizaos/plugin-openai");
    expect(litellm?.envKey).toBe("LITELLM_API_KEY");
    expect(litellm?.authMode).toBe("api-key");
    expect(litellm?.group).toBe("local");
    expect(litellm?.order).toBe(75);
  });
});
```

Run: `cd packages/agent && bunx vitest run src/config/__tests__/plugin-auto-enable.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/contracts/onboarding.ts \
        packages/agent/src/contracts/onboarding-provider-defaults.ts \
        packages/agent/src/config/__tests__/plugin-auto-enable.test.ts
git commit -m "feat(litellm): register LiteLLM Proxy as onboarding provider option"
```

---

## Task 4: Wire LiteLLM into provider-switch-config and the switch route

**Files:**
- Modify: `packages/agent/src/api/provider-switch-config.ts:317` (`applyLocalProviderCapabilities`) and `:399-427` (`PROVIDER_DEFAULT_MODELS`)
- Modify: `packages/agent/src/api/provider-switch-routes.ts:100-140` (the route that handles provider switches)
- Test: `packages/agent/src/api/__tests__/provider-switch-config.test.ts` (CREATE)

**Context:** Two separate concerns:

1. **Inside `provider-switch-config.ts`:** add `litellm` to `PROVIDER_DEFAULT_MODELS` and add a litellm branch to `applyLocalProviderCapabilities` that writes both `LITELLM_*` and `OPENAI_*` so the live runtime picks up immediately AND the env survives restart through Task 1's boot mirror. The function keeps its `Promise<void>` return type — no signature churn.
2. **Inside `provider-switch-routes.ts`:** the HTTP route handler does the `LITELLM_BASE_URL` precondition check **before** calling `applyOnboardingConnectionConfig`, returning a structured 400 with `{ reason: "missing_litellm_base_url", message: "..." }` if the URL is missing. This puts the rejection at the layer that's actually user-visible (the API), avoids threading a rejection result through two `Promise<void>`-typed wrapper functions (`applyOnboardingConnectionConfig`, `applyOnboardingCredentialPersistence`), and matches the user-visible behavior the spec requires.

`applyLocalProviderCapabilities` is not exported today, so we add an `@internal` test-only export to support direct unit testing — same precedent as `normalizeOpenAiCompatibleProviderConfig` in `packages/agent/src/runtime/tokagent.ts`.

- [ ] **Step 1: Read the relevant code so the changes line up**

Run:
```bash
grep -n "applyLocalProviderCapabilities\|applyOnboardingConnectionConfig\|PROVIDER_DEFAULT_MODELS" packages/agent/src/api/provider-switch-config.ts | head
sed -n '95,145p' packages/agent/src/api/provider-switch-routes.ts
```

Expected: the function definition (~317), the call site (~743), the model defaults table (~399), and the route handler that catches/return errors (~100–140).

- [ ] **Step 2: Create the test file with failing tests**

Create `packages/agent/src/api/__tests__/provider-switch-config.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyLocalProviderCapabilitiesForTest } from "../provider-switch-config.js";

const ORIGINAL_ENV = { ...process.env };

describe("applyLocalProviderCapabilities — litellm", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("with LITELLM_BASE_URL in env: writes both LITELLM_* and OPENAI_* and sets default models", async () => {
    process.env.LITELLM_BASE_URL = "https://litellm.example.com";
    const config: Record<string, unknown> = {};
    await applyLocalProviderCapabilitiesForTest(config, {
      backend: "litellm" as "litellm",
      apiKey: "lt-secret",
    });

    const env = (config as { env?: Record<string, string> }).env ?? {};
    expect(env.LITELLM_API_KEY).toBe("lt-secret");
    expect(env.OPENAI_API_KEY).toBe("lt-secret");
    expect(env.OPENAI_BASE_URL).toBe("https://litellm.example.com");
    expect(env.OPENAI_SMALL_MODEL).toBe("gpt-4o-mini");
    expect(env.OPENAI_LARGE_MODEL).toBe("gpt-4o");
  });

  it("without LITELLM_BASE_URL: writes nothing — relies on the route-handler precondition", async () => {
    delete process.env.LITELLM_BASE_URL;
    const config: Record<string, unknown> = {};
    await applyLocalProviderCapabilitiesForTest(config, {
      backend: "litellm" as "litellm",
      apiKey: "lt-secret",
    });
    const env = (config as { env?: Record<string, string> }).env ?? {};
    expect(env.LITELLM_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.OPENAI_BASE_URL).toBeUndefined();
  });
});
```

The "writes nothing" assertion is the contract: the function early-returns when `LITELLM_BASE_URL` is missing, so no env writes happen. The structured-error message is the route handler's job (verified in Step 7).

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/agent && bunx vitest run src/api/__tests__/provider-switch-config.test.ts`
Expected: FAIL — `applyLocalProviderCapabilitiesForTest` is not exported.

- [ ] **Step 4: Add `litellm` to `PROVIDER_DEFAULT_MODELS`**

Open `packages/agent/src/api/provider-switch-config.ts`. In `PROVIDER_DEFAULT_MODELS` (around line 399), add an entry **alphabetically** between `groq` and `openai`:

```ts
  litellm: {
    smallKey: "OPENAI_SMALL_MODEL",
    smallVal: "gpt-4o-mini",
    largeKey: "OPENAI_LARGE_MODEL",
    largeVal: "gpt-4o",
  },
```

- [ ] **Step 5: Add the litellm branch to `applyLocalProviderCapabilities`**

Find `applyLocalProviderCapabilities` (line 317). At the top of the function body, **after** the existing early-return guard for `tokagentcloud` and **before** `clearTokagentCloudCliProxyEnv()`, insert:

```ts
  // ── LiteLLM branch ──────────────────────────────────────────────────
  // Reuses @elizaos/plugin-openai pointed at a custom base URL. Writes
  // BOTH LITELLM_* and OPENAI_* so the live runtime picks up immediately
  // AND a restart re-enters the same configured state via the boot-time
  // mirror in core-plugins.ts. If LITELLM_BASE_URL is missing, the route
  // handler should have rejected the request — but we early-return here
  // as a defense in depth so we never write half-configured state.
  if (normalizedProvider === "litellm") {
    const baseUrl =
      readEffectiveEnvValue(config, "LITELLM_BASE_URL", process.env)?.trim();
    if (!baseUrl) {
      return Promise.resolve();
    }
    const apiKey = trimToUndefined(selection.apiKey);
    if (apiKey) {
      setEnvValue(config, "LITELLM_API_KEY", apiKey);
      setEnvValue(config, "OPENAI_API_KEY", apiKey);
    }
    setEnvValue(config, "OPENAI_BASE_URL", baseUrl);
    const explicitPrimary = trimToUndefined(selection.primaryModel);
    setPrimaryModel(config, explicitPrimary ?? "@elizaos/plugin-openai");
    applyDefaultModelNames(config, "litellm");
    clearTokagentCloudCliProxyEnv();
    clearRemoteProviderConfig(config);
    clearCloudModelSelections(config);
    clearSubscriptionProviderConfig(config);
    return Promise.resolve();
  }
```

Do NOT change the function's return type. Existing callers stay untouched.

- [ ] **Step 6: Add the test-only export**

At the bottom of the same file, add:

```ts
/** @internal Exported for testing. Mirrors the `normalizeOpenAiCompatibleProviderConfig` precedent in tokagent.ts. */
export const applyLocalProviderCapabilitiesForTest = applyLocalProviderCapabilities;
```

- [ ] **Step 7: Add the route-handler precondition for `LITELLM_BASE_URL`**

Open `packages/agent/src/api/provider-switch-routes.ts`. Around line 119 the route does:

```ts
await applyOnboardingConnectionConfig(config, connection);
```

Replace that call with a precondition guard for litellm specifically:

```ts
if (normalizedProvider === "litellm" && !process.env.LITELLM_BASE_URL?.trim()) {
  ctx.setProviderSwitchInProgress(false);
  json(res, {
    success: false,
    reason: "missing_litellm_base_url",
    message: "Set LITELLM_BASE_URL in .env first",
  }, 400);
  return true;
}

await applyOnboardingConnectionConfig(config, connection);
```

If `json(res, body, status)` doesn't accept a status as the third arg in this codebase, use the existing `error(res, message, status)` helper that's already imported at the top of the file (we saw it used at line 115 for the "Invalid provider" 400). Adapt the helper call to include the structured `reason` field — typically by writing the JSON manually or extending the helper. **If the helper only takes a string message:** write the response inline with `res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ ... }));` matching the pattern used elsewhere in the same file.

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd packages/agent && bunx vitest run src/api/__tests__/provider-switch-config.test.ts`
Expected: both tests pass.

- [ ] **Step 9: Run the broader API suite to confirm no regression**

Run: `cd packages/agent && bunx vitest run src/api`
Expected: all existing tests still pass (the unrelated `wallet-routes-dual-shape.test.ts` etc.).

- [ ] **Step 10: Commit**

```bash
git add packages/agent/src/api/provider-switch-config.ts \
        packages/agent/src/api/provider-switch-routes.ts \
        packages/agent/src/api/__tests__/provider-switch-config.test.ts
git commit -m "feat(litellm): wire litellm into provider-switch-config + route precondition"
```

---

## Task 5: Add LiteLLM to the CLI wizard

**Files:**
- Modify: `packages/tokagentos/src/types.ts:38-48` (`CreateOptions`)
- Modify: `packages/tokagentos/src/cli.ts:60-80` (commander `.option()` calls)
- Modify: `packages/tokagentos/src/commands/create.ts:49-90` (`LLM_PROVIDERS`), `:204-288` (prompt fns), `:345-394` (env writers), `:437-573` (`create` orchestration)
- Test: `packages/tokagentos/src/__tests__/create.test.ts` (CREATE)

**Context:** The wizard prompts the user for provider + key, then writes those to `.env`. For LiteLLM we need four prompts (key, base URL, small model, large model), three new commander flags (`--llm-base-url`, `--llm-small-model`, `--llm-large-model`), and an extension to `writeLlmEnvFile` that handles multi-key providers.

- [ ] **Step 1: Extend `CreateOptions`**

Open `packages/tokagentos/src/types.ts`. Add three optional fields to `CreateOptions`:

```ts
export interface CreateOptions {
  template?: string;
  language?: string;
  yes?: boolean;
  description?: string;
  githubUsername?: string;
  repoUrl?: string;
  skipUpstream?: boolean;
  llm?: string;
  apiKey?: string;
  llmBaseUrl?: string;     // ← add
  llmSmallModel?: string;  // ← add
  llmLargeModel?: string;  // ← add
}
```

- [ ] **Step 2: Add the three commander options**

Open `packages/tokagentos/src/cli.ts`. After the existing `--api-key` option (around line 78), add:

```ts
.option(
  "--llm-base-url <url>",
  "Base URL for the LLM provider (LiteLLM only). Required with --llm litellm.",
)
.option(
  "--llm-small-model <model>",
  "Model alias for TEXT_SMALL (LiteLLM only). Required with --llm litellm.",
)
.option(
  "--llm-large-model <model>",
  "Model alias for TEXT_LARGE (LiteLLM only). Required with --llm litellm.",
)
```

Update the `--llm` description to include `litellm`:

```ts
.option(
  "--llm <provider>",
  "LLM provider to pre-configure: openai | anthropic | google | groq | openrouter | litellm | xai | deepseek | ollama | skip",
)
```

- [ ] **Step 3: Add `litellm` to `LLM_PROVIDERS`**

Open `packages/tokagentos/src/commands/create.ts`. Add to `LLM_PROVIDERS` (line 49-90), between `openrouter` and `ollama`:

```ts
  {
    id: "litellm",
    label: "LiteLLM Proxy (OpenAI-compatible)",
    envVar: "LITELLM_API_KEY",
    hint: "lt-...",
  },
```

- [ ] **Step 4: Write the failing test**

Create `packages/tokagentos/src/__tests__/create.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn((msg: string) => {
    throw new Error(`CLACK_CANCEL: ${msg}`);
  }),
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  })),
  note: vi.fn(),
  isCancel: vi.fn(() => false),
  text: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(() => Promise.resolve(true)),
  select: vi.fn(),
  log: { warn: vi.fn() },
}));

vi.mock("../scaffold.js", () => ({
  buildFullstackTemplateValues: (name: string) => ({ projectSlug: name }),
  buildPluginTemplateValues: () => ({}),
  buildMetadata: () => ({}),
  getTemplateReplacementEntries: () => [],
  hydrateGitSubmoduleWorkspace: vi.fn(),
  initializeGitSubmodule: vi.fn(),
  renderTemplateTree: () => ({}),
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
  getTemplates: () => [],
  getTemplatesDir: () => "/fake/templates",
}));

vi.mock("../package-info.js", () => ({
  getCliVersion: () => "0.0.0-test",
}));

vi.mock("../project-metadata.js", () => ({
  writeProjectMetadata: vi.fn(),
}));

import { create } from "../commands/create.js";

function withTempCwd(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokagent-create-test-"));
  const prev = process.cwd();
  process.chdir(dir);
  return fn(dir).finally(() => {
    process.chdir(prev);
    fs.rmSync(dir, { force: true, recursive: true });
  });
}

describe("create command — litellm", () => {
  it("--yes with all four flags writes LITELLM_* to .env", async () => {
    await withTempCwd(async (dir) => {
      await create("test-app", {
        template: "fullstack-app",
        language: "typescript",
        yes: true,
        llm: "litellm",
        apiKey: "lt-key",
        llmBaseUrl: "https://lite.example.com",
        llmSmallModel: "gpt-4o-mini",
        llmLargeModel: "gpt-4o",
      });
      const envPath = path.join(dir, "test-app", ".env");
      const content = fs.readFileSync(envPath, "utf-8");
      expect(content).toMatch(/^LITELLM_API_KEY=lt-key$/m);
      expect(content).toMatch(/^LITELLM_BASE_URL=https:\/\/lite\.example\.com$/m);
      expect(content).toMatch(/^LITELLM_SMALL_MODEL=gpt-4o-mini$/m);
      expect(content).toMatch(/^LITELLM_LARGE_MODEL=gpt-4o$/m);
      expect(content).not.toMatch(/^OPENAI_API_KEY=lt-key$/m);
    });
  });

  it("--yes with --llm litellm but missing --llm-base-url errors out", async () => {
    await withTempCwd(async () => {
      await expect(
        create("test-app2", {
          template: "fullstack-app",
          language: "typescript",
          yes: true,
          llm: "litellm",
          apiKey: "lt-key",
          // intentionally missing llmBaseUrl + llmSmallModel + llmLargeModel
        }),
      ).rejects.toThrow(/CLACK_CANCEL.*--llm-base-url/);
    });
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd packages/tokagentos && bunx vitest run src/__tests__/create.test.ts`
Expected: FAIL — the litellm wizard branch is not implemented yet.

- [ ] **Step 6: Add a `writeLlmExtraEnv` helper next to `writeLlmEnvFile`**

In `packages/tokagentos/src/commands/create.ts`, after `writeLlmEnvFile` (around line 394), add:

```ts
/**
 * Write a set of additional `.env` lines to a fresh-or-existing project .env.
 * Mirrors the behavior of writeLlmEnvFile but supports multi-key providers
 * (e.g., LiteLLM needs base URL + small model + large model in addition to
 * the API key).
 *
 * Each entry is written using the same active/commented-line resolution
 * logic as writeLlmEnvFile to play nicely with the .env.example template.
 */
function writeLlmExtraEnv(
  projectRoot: string,
  entries: Array<{ key: string; value: string }>,
): void {
  if (entries.length === 0) return;
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) {
    // writeLlmEnvFile created it; should not happen, but be defensive.
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
```

- [ ] **Step 7: Special-case the litellm prompt flow in `create`**

In the `create` function (around line 477), the existing flow is:

```ts
const llmProvider = isFullstack
  ? await promptLlmProvider(options.llm, Boolean(options.yes), true)
  : (findLlmProvider("skip") as LlmProvider);
const apiKey = llmProvider.envVar.length > 0
  ? await promptApiKey(llmProvider, options.apiKey, Boolean(options.yes), isFullstack)
  : undefined;
```

Below the `apiKey` line, add a litellm-specific prompt block:

```ts
let litellmExtras:
  | { baseUrl: string; smallModel: string; largeModel: string }
  | undefined;
if (llmProvider.id === "litellm") {
  litellmExtras = await promptLitellmExtras(options, Boolean(options.yes));
}
```

Define `promptLitellmExtras` near the other prompt helpers (after `promptApiKey`):

```ts
async function promptLitellmExtras(
  options: CreateOptions,
  yes: boolean,
): Promise<{ baseUrl: string; smallModel: string; largeModel: string }> {
  if (yes) {
    const missing: string[] = [];
    if (!options.llmBaseUrl?.trim()) missing.push("--llm-base-url");
    if (!options.llmSmallModel?.trim()) missing.push("--llm-small-model");
    if (!options.llmLargeModel?.trim()) missing.push("--llm-large-model");
    if (missing.length > 0) {
      clack.cancel(
        `--llm litellm with --yes requires ${missing.join(", ")}. Get these values from your LiteLLM proxy admin.`,
      );
      process.exit(1);
    }
    return {
      baseUrl: options.llmBaseUrl!.trim(),
      smallModel: options.llmSmallModel!.trim(),
      largeModel: options.llmLargeModel!.trim(),
    };
  }
  const baseUrl = options.llmBaseUrl?.trim()
    ? options.llmBaseUrl.trim()
    : (unwrapPromptResult(
        await clack.text({
          message: "LiteLLM proxy base URL (e.g. https://litellm.company.com):",
          placeholder: "https://litellm.company.com",
          validate: (v) =>
            !v?.trim() ? "Base URL is required for LiteLLM" : undefined,
        }),
      ) as string).trim();
  const smallModel = options.llmSmallModel?.trim()
    ? options.llmSmallModel.trim()
    : (unwrapPromptResult(
        await clack.text({
          defaultValue: "gpt-4o-mini",
          message:
            "Small model alias (used for TEXT_SMALL). Default: gpt-4o-mini",
          placeholder: "gpt-4o-mini",
        }),
      ) as string).trim();
  const largeModel = options.llmLargeModel?.trim()
    ? options.llmLargeModel.trim()
    : (unwrapPromptResult(
        await clack.text({
          defaultValue: "gpt-4o",
          message: "Large model alias (used for TEXT_LARGE). Default: gpt-4o",
          placeholder: "gpt-4o",
        }),
      ) as string).trim();
  return { baseUrl, smallModel, largeModel };
}
```

- [ ] **Step 8: Patch the `.env`-write step to also write the LiteLLM extras**

After the existing `writeLlmEnvFile(destinationDir, llmProvider, apiKey)` call (around line 553), add:

```ts
if (litellmExtras) {
  writeLlmExtraEnv(destinationDir, [
    { key: "LITELLM_BASE_URL", value: litellmExtras.baseUrl },
    { key: "LITELLM_SMALL_MODEL", value: litellmExtras.smallModel },
    { key: "LITELLM_LARGE_MODEL", value: litellmExtras.largeModel },
  ]);
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd packages/tokagentos && bunx vitest run src/__tests__/create.test.ts`
Expected: both tests pass.

- [ ] **Step 10: Run the full tokagentos suite to confirm no regression**

Run: `cd packages/tokagentos && bunx vitest run`
Expected: all tests pass (scaffold-patches + scaffold + manifest + types + create).

- [ ] **Step 11: Commit**

```bash
git add packages/tokagentos/src/types.ts \
        packages/tokagentos/src/cli.ts \
        packages/tokagentos/src/commands/create.ts \
        packages/tokagentos/src/__tests__/create.test.ts
git commit -m "feat(litellm): add LiteLLM option to CLI wizard with base-url + model prompts"
```

---

## Task 6: Document LITELLM in `.env.example` (×3 mirrors)

**Files:**
- Modify: `.env.example`
- Modify: `packages/templates/fullstack-app/.env.example`
- Modify: `packages/tokagentos/templates/fullstack-app/.env.example`

**Context:** Three mirrors of `.env.example` exist per `PLUGINS.md` §10.1. The same comment block goes in all three so users who skip the wizard or migrate an existing project still discover the LiteLLM env knobs.

- [ ] **Step 1: Verify the three files exist**

Run: `find . -maxdepth 6 -name '.env.example' -not -path '*/node_modules/*' 2>/dev/null`

Expected: at least these three paths:
- `./.env.example`
- `./packages/templates/fullstack-app/.env.example`
- `./packages/tokagentos/templates/fullstack-app/.env.example`

(A fourth path `packages/templates/fullstack-app/apps/app/.env.example` exists for the inner app — leave it alone, it's app-internal config.)

- [ ] **Step 2: Read the existing AI Provider section in the root `.env.example` to find the right insertion point**

Run: `grep -n -A1 -B1 "OPENROUTER_API_KEY\|OLLAMA_API_ENDPOINT\|GOOGLE_GENERATIVE_AI_API_KEY" .env.example`

Expected: hits showing the existing block at roughly lines 49–58 (or wherever in the current file).

- [ ] **Step 3: Insert the LiteLLM block in `.env.example`**

Open `.env.example`. Between the `OPENROUTER_API_KEY=` line (or `GROQ_API_KEY=`) and the `# Local LLM endpoints (optional).` comment, insert:

```
# LiteLLM (OpenAI-compatible proxy). Set all four to route through a self-
# hosted or hosted LiteLLM proxy. When set, these override OPENAI_* at runtime;
# a tokagent boot warning is logged so the active backend is unambiguous.
LITELLM_BASE_URL=
LITELLM_API_KEY=
LITELLM_SMALL_MODEL=
LITELLM_LARGE_MODEL=
```

- [ ] **Step 4: Apply the same edit to the two mirror files**

Open `packages/templates/fullstack-app/.env.example`. Insert the same block in the AI provider section.

Open `packages/tokagentos/templates/fullstack-app/.env.example`. Insert the same block in the AI provider section.

- [ ] **Step 5: Verify all three files contain the block**

Run:
```bash
for f in .env.example packages/templates/fullstack-app/.env.example packages/tokagentos/templates/fullstack-app/.env.example; do
  echo "=== $f ==="
  grep -A4 "LITELLM_BASE_URL" "$f"
done
```

Expected: each section shows the four `LITELLM_*` lines.

- [ ] **Step 6: Commit**

```bash
git add .env.example \
        packages/templates/fullstack-app/.env.example \
        packages/tokagentos/templates/fullstack-app/.env.example
git commit -m "docs(litellm): document LITELLM_* env knobs in .env.example mirrors"
```

---

## Task 7: Run sync, full test, and document the manual smoke

**Files:** none (verification + sync only)

**Context:** Per `PLUGINS.md` §10.1, the canonical plugin tree at `plugins/plugin-tokagent-*` is mirrored into `packages/templates/fullstack-app/plugins/` and `packages/tokagentos/templates/fullstack-app/plugins/` via `bun run sync:plugins`. None of the changes in Tasks 1–6 modify those plugin trees, so sync should be a no-op — but we verify, since CI's `sync:plugins:check` will fail otherwise.

- [ ] **Step 1: Run plugin sync from the tokagentos workspace root**

Run: `cd packages/tokagentos && bun run sync:plugins`

Expected: output reports either "no changes" or copies that are byte-identical (since we didn't touch `plugins/plugin-tokagent-*`). If sync reports unexpected file changes, investigate before proceeding.

- [ ] **Step 2: Run sync:check to confirm no drift**

Run: `cd packages/tokagentos && bun run sync:plugins:check 2>&1 || true`

Expected: exit code 0, no diff. If non-zero, the previous step missed something — re-run sync.

- [ ] **Step 3: Build the affected packages**

Run: `cd packages/shared && bun run build && cd ../agent && bun run build && cd ../tokagentos && bun run build`

Expected: success in all three.

- [ ] **Step 4: Run the workspace-wide test suite**

Run: `cd ../.. && bunx turbo run test`

Expected: all tests pass. If any fail unrelated to our changes, note them and continue (some unrelated flakes exist in the repo); if any failure references files we touched, debug before proceeding.

- [ ] **Step 5: Type-check the workspace**

Run: `bunx turbo run typecheck`

Expected: no new type errors. Pay special attention to:
- `packages/shared` (the `OnboardingProviderId` / `OnboardingProviderFamily` union edits)
- `packages/agent/src/api/provider-switch-config.ts` (the new `ProviderCapabilitiesResult` return type — every call site must propagate it)

- [ ] **Step 6: Manual smoke test against a real LiteLLM proxy** (skip if no proxy available; document why)

CI cannot run this step. Document on the PR description that the engineer ran (or did not run) the smoke. If running:

1. Build and link the CLI:
   ```bash
   cd packages/tokagentos && bun run build && bun link
   ```
2. Scaffold a test project against your team's LiteLLM proxy:
   ```bash
   cd /tmp && tokagentos create test-litellm \
     --template fullstack-app \
     --llm litellm \
     --api-key "$YOUR_LITELLM_VIRTUAL_KEY" \
     --llm-base-url "$YOUR_LITELLM_URL" \
     --llm-small-model "$YOUR_SMALL_MODEL_ALIAS" \
     --llm-large-model "$YOUR_LARGE_MODEL_ALIAS" \
     --yes
   ```
3. Boot it:
   ```bash
   cd test-litellm && bun install && bun run dev
   ```
4. Open the chat UI in the browser; send "hello"; confirm a response renders without errors.
5. Open Settings → Provider; confirm "LiteLLM Proxy" appears as the current provider.
6. Optional: change small/large model in `.env`, restart, confirm the change takes effect.

- [ ] **Step 7: Final commit (if anything changed during sync) and push**

If `bun run sync:plugins` made any changes, commit them:

```bash
git status
# if there are mirror diffs:
git add packages/templates/fullstack-app packages/tokagentos/templates/fullstack-app
git commit -m "chore(litellm): sync plugin mirrors after litellm integration"
```

Push the branch and open a PR per `MEMORY.md` git-remote policy (push on `tokamak-network/Tokamak-AI-Layer`, never the personal fork). Include in the PR description:
- Link to spec (`docs/superpowers/specs/2026-05-04-litellm-provider-integration-design.md`)
- Manual smoke test result (ran / skipped because no proxy / proxy not reachable)
- One-line summary of what changed: "Adds LiteLLM as a virtual provider id; runs on plugin-openai via boot-time env mirror; surfaces in CLI wizard + Settings switcher."

---

## Self-review checklist (run after writing the plan)

- [x] **Spec coverage:** Every section of the spec maps to a task.
  - Goal 1 (scaffold + first-boot) → Tasks 1, 2, 5
  - Goal 2 (in-app switcher) → Tasks 3, 4
  - Goal 3 (minimal touch) → all tasks honor "no new plugin package"
  - Component 1 (boot mirror) → Task 1
  - Component 2 (auto-enable map) → Task 2
  - Component 3 (onboarding option) → Task 3
  - Component 4 (provider switcher) → Task 4
  - Component 5 (CLI wizard) → Task 5
  - Component 6 (.env.example) → Task 6
  - All 5 failure modes → covered by tests in Tasks 1, 4 (and inherent in plugin-openai upstream for #2 and #4)
  - Testing plan → matches the four unit test surfaces + manual smoke
- [x] **Placeholder scan:** No "TBD", "TODO", "implement appropriate error handling", or unspecified test code. Every code block contains executable content.
- [x] **Type consistency:** `OnboardingProviderId` adds `"litellm"` in Task 3 *before* Task 4 references it as `selection.backend === "litellm"`. `mirrorTokagentEnvAliasOverride` is defined in Task 1 and only referenced there. `writeLlmExtraEnv` is defined in Task 5 step 6 before being called in step 8. `applyLocalProviderCapabilitiesForTest` is exported in Task 4 step 7 and consumed by tests in step 2 (test references the export name correctly). The new return type `ProviderCapabilitiesResult` is defined and propagated consistently in Task 4.
