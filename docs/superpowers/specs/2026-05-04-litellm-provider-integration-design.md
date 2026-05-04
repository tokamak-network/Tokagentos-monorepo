# LiteLLM Provider Integration — Design

**Date**: 2026-05-04
**Status**: Approved (brainstorming complete; awaiting implementation plan)
**Owner**: tokagentos

---

## Context

A teammate using a self-hosted LiteLLM proxy asked whether tokagentos can talk to it. Today the project requires a per-vendor API key (Anthropic, OpenAI, Gemini, Groq, OpenRouter, Ollama) at scaffold time, which is a barrier when a team has already centralized LLM access behind a single shared proxy.

LiteLLM Proxy speaks an OpenAI-compatible REST API in front of N upstream vendors. From tokagentos's perspective, a LiteLLM proxy looks identical to OpenAI — only the base URL and the API key change. The runtime already plumbs `OPENAI_BASE_URL` (see `packages/typescript/src/features/knowledge/llm.ts:209`), and the OpenAI SDK respects it natively.

### Honest framing

The original feedback also mentioned "subscription-based" usage as a motivation. **LiteLLM does not bridge consumer chat subscriptions** (ChatGPT Plus, Claude Pro). It only routes API-tier credentials. The real entry-barrier this integration removes is *"each teammate needs their own per-vendor API key"* — replaced with *"one shared LiteLLM endpoint funded by the team"*.

The codebase has separate `anthropic-subscription` / `openai-codex` paths (see `onboarding-provider-defaults.js`) that genuinely use subscriptions via Claude Code CLI / Codex CLI OAuth. Those are per-user (not shareable) and orthogonal to this work.

## Goals

1. Let a team scaffold a tokagentos project and immediately have it talk to their LiteLLM proxy with one shared virtual key.
2. Surface "LiteLLM" as a first-class option in the CLI wizard and in-app provider switcher (Settings → Provider).
3. Touch as few files as possible. No new plugin package, no new runtime model code.

## Non-goals

- Consumer-subscription bridging (ChatGPT Plus / Claude Pro). LiteLLM cannot do this.
- Anthropic-format passthrough. LiteLLM exposes both OpenAI and Anthropic-format endpoints; v1 only uses the OpenAI-format endpoint, so Anthropic-specific features (prompt caching headers, native tool-use shapes) are not preserved through the proxy.
- Embedding routing through LiteLLM. The agent stays on `@elizaos/plugin-local-embedding` (the always-on default in `core-plugins.ts`). Plumbing embeddings through the proxy is a separate, larger concern.
- A base-URL form field in the in-app provider switcher. v1 treats the URL as a per-deployment constant managed in `.env`. The switcher disables the LiteLLM entry with a hint if `LITELLM_BASE_URL` is missing.
- Validating the URL format, pinging the proxy, or probing for available models at scaffold time. The wizard takes input on trust; the first chat turn is the integration test.

## Approach

A **virtual provider** named `litellm`: own UI/wizard/onboarding identity, but actually runs on `@elizaos/plugin-openai`. The runtime never sees a "LiteLLM plugin" — it sees plugin-openai pointed at a custom base URL. Everything else (UI label, env knobs, model defaults, switcher entry) is metadata.

This is the hybrid approach (option C in the brainstorming dialogue), with scaffold + in-app switcher coverage (scope B), four-prompt wizard (scope B in section 3 of the dialogue).

### User-facing env knobs

| Variable | Purpose | Mirrored to |
|---|---|---|
| `LITELLM_API_KEY` | Virtual key issued by the proxy | `OPENAI_API_KEY` |
| `LITELLM_BASE_URL` | Proxy endpoint (e.g., `https://litellm.company.com`) | `OPENAI_BASE_URL` |
| `LITELLM_SMALL_MODEL` | Model alias for `useModel(TEXT_SMALL)` | `OPENAI_SMALL_MODEL` |
| `LITELLM_LARGE_MODEL` | Model alias for `useModel(TEXT_LARGE)` | `OPENAI_LARGE_MODEL` |

The mirror runs **once at module load** (in the `core-plugins.ts` overlay) and uses **override** semantics: if a user has both `LITELLM_*` and `OPENAI_*` set, LiteLLM wins, and a single `[tokagent] LITELLM_* env vars detected; overriding OPENAI_*` warning is logged.

### Stored id vs. plugin id

| Surface | Identifier |
|---|---|
| Onboarding state (`~/.eliza/<project>.json` → `serviceRouting.llmText.backend`) | `"litellm"` |
| Runtime allowlist (config.plugins.allow) | `"@elizaos/plugin-openai"` and short id `"litellm"` |
| `pluginName` in `DEFAULT_ONBOARDING_PROVIDER_OPTIONS` | `"@elizaos/plugin-openai"` |

The `getStoredOnboardingProviderId` indirection in `provider-switch-config.js` already handles split id ↔ plugin mappings (see the existing `anthropic-subscription` → `anthropic` mapping). No new infrastructure required.

## Components

Six touch points. Each is small and additive; no file is being rewritten.

### 1. Boot-time env mirror

**File**: `packages/tokagentos/scaffold-patches/packages/agent/src/runtime/core-plugins.ts`

Add four override-mirroring calls:

```ts
mirrorTokagentEnvAliasOverride("LITELLM_API_KEY", "OPENAI_API_KEY");
mirrorTokagentEnvAliasOverride("LITELLM_BASE_URL", "OPENAI_BASE_URL");
mirrorTokagentEnvAliasOverride("LITELLM_SMALL_MODEL", "OPENAI_SMALL_MODEL");
mirrorTokagentEnvAliasOverride("LITELLM_LARGE_MODEL", "OPENAI_LARGE_MODEL");
```

`mirrorTokagentEnvAliasOverride` is a new helper alongside the existing `mirrorTokagentEnvAlias`. It overrides the destination unconditionally when the source is set, and logs a single warning the first time it overrides any of the four keys.

**Coupled validation**: if `LITELLM_API_KEY` is set without `LITELLM_BASE_URL` (or vice-versa), suppress *all* mirroring for the litellm group and log a clear warning. The user gets a clean "no provider configured" state instead of a confusing 401 against the real OpenAI endpoint.

### 2. Auto-enable map

**File**: `packages/agent/src/config/plugin-auto-enable.ts`

```ts
// In PROVIDER_PLUGINS:
litellm: "@elizaos/plugin-openai",

// In AUTH_PROVIDER_PLUGINS:
LITELLM_API_KEY: "@elizaos/plugin-openai",
```

`addToAllowlist`'s short-id derivation slices `@elizaos/plugin-openai` to `"openai"`, which is wrong here — we want the config allowlist to record `"litellm"` so the in-app switcher's "current provider" lookup matches the stored id. The fix: in the env-key loop in `applyPluginAutoEnable`, pass an explicit short id (`"litellm"`) when the trigger is `LITELLM_API_KEY`, instead of relying on derivation. Same pattern when the auth profile resolves through `PROVIDER_PLUGINS["litellm"]`.

### 3. Onboarding provider option

**File**: `packages/agent/src/contracts/onboarding-provider-defaults.ts`

Append entry:

```ts
{
  id: "litellm",
  name: "LiteLLM Proxy",
  envKey: "LITELLM_API_KEY",
  pluginName: "@elizaos/plugin-openai",
  keyPrefix: null,
  description: "OpenAI-compatible self-hosted or hosted LiteLLM proxy. Set LITELLM_BASE_URL in .env first.",
  family: "litellm",
  authMode: "api-key",
  group: "local",
  order: 75,
}
```

`order: 75` slots it between OpenRouter (70) and Gemini (80) in the existing dialog. `family: "litellm"` is a new family identifier; downstream code that switches on family (e.g., for icon/label rendering) treats unknown families as plain api-key providers, so this is safe.

### 4. Provider switcher integration

**File**: `packages/agent/src/api/provider-switch-config.ts` (source — never edit dist)

Two changes:

**a. Add to `PROVIDER_DEFAULT_MODELS`:**

```ts
litellm: {
  smallKey: "OPENAI_SMALL_MODEL",
  smallVal: "gpt-4o-mini",
  largeKey: "OPENAI_LARGE_MODEL",
  largeVal: "gpt-4o",
},
```

The `*Key` fields point at the OpenAI env names so `applyDefaultModelNames` writes the right keys. The `*Val` defaults are deliberately conservative; users override via the wizard or `.env`.

**b. Extend `applyLocalProviderCapabilities` for the `litellm` branch:**

When `selection.backend === "litellm"`:

1. Read `LITELLM_BASE_URL` from the effective env. If missing → return rejection `{ ok: false, reason: "missing_litellm_base_url", message: "Set LITELLM_BASE_URL in .env first" }`. Do not write any other config values.
2. Otherwise: write **both** `LITELLM_API_KEY` and `OPENAI_API_KEY` to the same value, write `OPENAI_BASE_URL` from `LITELLM_BASE_URL`, call `applyDefaultModelNames(config, "litellm")`, call `setPrimaryModel(config, "@elizaos/plugin-openai")`.

Writing both pairs ensures (a) the live runtime updates take effect immediately for the running plugin-openai instance and (b) a project restart re-enters the same configured state via the boot-time mirror.

### 5. CLI wizard

**File**: `packages/tokagentos/src/commands/create.ts`

Add to `LLM_PROVIDERS`:

```ts
{
  id: "litellm",
  label: "LiteLLM Proxy (OpenAI-compatible)",
  envVar: "LITELLM_API_KEY",
  hint: "lt-...",
}
```

Special-case the prompt flow:

- After the standard `promptApiKey` for `LITELLM_API_KEY`, prompt for `LITELLM_BASE_URL` (required, free-text, no validation), `LITELLM_SMALL_MODEL` (default `gpt-4o-mini`), `LITELLM_LARGE_MODEL` (default `gpt-4o`).
- `--yes` mode requires four flags: `--api-key`, `--llm-base-url`, `--llm-small-model`, `--llm-large-model`. Missing any → `clack.cancel` with a message listing required flags. (Existing yes-mode-required-key pattern; copy & extend it.)
- The post-prompt write to `.env` writes all four `LITELLM_*` lines via the existing `writeLlmEnvFile`, then patches the file to also write the three additional keys (`*_BASE_URL`, `*_SMALL_MODEL`, `*_LARGE_MODEL`). A small helper `writeLlmExtraEnv(projectRoot, entries)` will keep this code DRY.
- `preCompleteOnboarding` writes `serviceRouting.llmText.backend = "litellm"` (matches the stored id).
- The CLI's success message includes: *"Configured. Test the connection: cd <project> && bun run dev, then send any chat message."*

### 6. .env.example documentation

**File**: `.env.example` (root) — and the two mirrors per `PLUGINS.md` §10.1: `packages/templates/fullstack-app/.env.example`, `packages/tokagentos/templates/fullstack-app/.env.example`.

Add a new commented section:

```
# LiteLLM (OpenAI-compatible proxy). Set all four to route through a self-hosted
# or hosted LiteLLM proxy. When set, these override OPENAI_* at runtime; a
# tokagent boot warning is logged so the active backend is unambiguous.
LITELLM_BASE_URL=
LITELLM_API_KEY=
LITELLM_SMALL_MODEL=
LITELLM_LARGE_MODEL=
```

Place this alongside the existing AI Provider section, between OPENROUTER_API_KEY and OLLAMA_API_ENDPOINT.

## Data flow

### Path A — fresh scaffold (`tokagentos create`)

```
user picks "LiteLLM" in wizard
        ↓
prompts: virtual key, base URL, small model, large model
        ↓
write to <project>/.env: LITELLM_{API_KEY,BASE_URL,SMALL_MODEL,LARGE_MODEL}
        ↓
preCompleteOnboarding writes ~/.eliza/<project>.json:
  serviceRouting.llmText.backend = "litellm"
        ↓
bun run dev
        ↓
core-plugins.ts module load: LITELLM_* → OPENAI_* (override)
        ↓
plugin-auto-enable.ts: AUTH_PROVIDER_PLUGINS["LITELLM_API_KEY"]
  → allowlist.add("@elizaos/plugin-openai")
        ↓
@elizaos/plugin-openai initializes with mirrored env values
        ↓
runtime.useModel(TEXT_LARGE) → OpenAI SDK → company LiteLLM proxy → vendor of choice
```

### Path B — in-app provider switcher (Settings tab)

```
existing project; .env already contains LITELLM_BASE_URL
        ↓
user opens Settings → Provider, sees "LiteLLM Proxy" entry
        ↓
clicks switch → submits virtual key (+ optional small/large model overrides)
        ↓
provider-switch-config.applyLocalProviderCapabilities("litellm", {apiKey, primaryModel?}):
  - reads existing LITELLM_BASE_URL from env (rejects with hint if missing)
  - setEnvValue(config, "LITELLM_API_KEY", apiKey)        ← writes BOTH
  - setEnvValue(config, "OPENAI_API_KEY", apiKey)         ← so live runtime picks up immediately
  - setEnvValue(config, "OPENAI_BASE_URL", LITELLM_BASE_URL)
  - applyDefaultModelNames("litellm")  → sets OPENAI_SMALL_MODEL/LARGE_MODEL if not user-overridden
  - setPrimaryModel("@elizaos/plugin-openai")
        ↓
runtime hot-reloads model handlers; next useModel() goes through the proxy
```

## Failure modes

| # | Scenario | Behavior | Source |
|---|---|---|---|
| 1 | Both `OPENAI_API_KEY` and `LITELLM_API_KEY` set | Override mirror; LiteLLM wins; single boot warning logged | core-plugins.ts |
| 2 | LiteLLM proxy unreachable on first chat turn | plugin-openai's existing error path surfaces `fetch failed` to chat. No custom handling | plugin-openai (upstream) |
| 3 | `LITELLM_API_KEY` set without `LITELLM_BASE_URL` (or reverse) | Suppress all litellm-group mirroring; log warning; agent runs in "no provider configured" state | core-plugins.ts |
| 4 | Model name doesn't exist on the proxy | First `useModel()` returns 404 from LiteLLM; surfaces in chat. No additional handling | plugin-openai (upstream) |
| 5 | In-app switcher: pick LiteLLM but `LITELLM_BASE_URL` not in `.env` | `applyLocalProviderCapabilities` returns `{ ok: false, reason: "missing_litellm_base_url" }`; Settings UI uses existing rejected-switch affordance | provider-switch-config.ts |

## Testing

### Unit tests

**1. Boot-time env mirror** — extend `packages/tokagentos/src/__tests__/scaffold-patches.test.ts`:

- Mirror happens when `LITELLM_*` set, `OPENAI_*` empty.
- Mirror **overrides** when both `LITELLM_*` and `OPENAI_*` are set.
- Mirror is suppressed when `LITELLM_API_KEY` is set without `LITELLM_BASE_URL`.
- Mirror is suppressed when `LITELLM_BASE_URL` is set without `LITELLM_API_KEY`.

**2. Auto-enable map** — extend or add `packages/agent/src/config/__tests__/plugin-auto-enable.test.ts`:

- Env: `LITELLM_API_KEY=K` → `@elizaos/plugin-openai` in allowlist with reason `env: LITELLM_API_KEY`.
- Auth profile `provider: "litellm"` → `@elizaos/plugin-openai` in allowlist with reason `auth profile: <key>`.
- The litellm short id (`"litellm"`) and the package name (`"@elizaos/plugin-openai"`) both end up in the allowlist.

**3. CLI wizard** — extend `packages/tokagentos/src/__tests__/create.test.ts`:

- `--llm litellm --api-key K --llm-base-url U --llm-small-model S --llm-large-model L --yes` produces a `.env` containing all four `LITELLM_*` lines and no active `OPENAI_API_KEY` line.
- `--llm litellm --api-key K --yes` (missing flags) exits with a message listing the required flags.
- Interactive flow with `litellm` selection prompts for all four values in order.

**4. Provider switcher** — extend `packages/agent/src/api/__tests__/provider-switch-config.test.ts`:

- `applyLocalProviderCapabilities("litellm", {apiKey: "K"})` with `LITELLM_BASE_URL` in env writes `OPENAI_API_KEY`, `OPENAI_BASE_URL`, sets default models, sets primary model to plugin-openai.
- Same call without `LITELLM_BASE_URL` returns rejection with `reason: "missing_litellm_base_url"`.

### Manual smoke test (release checklist)

CI doesn't have a LiteLLM proxy, so a manual smoke runs once per release alongside the `PLUGINS.md` §10.3 publish steps:

1. `bun run sync:plugins && bun run build` from `tokagentos/`.
2. `cd /tmp && bunx tokagentos@local create test-litellm --llm litellm --api-key … --llm-base-url … --llm-small-model … --llm-large-model … --yes`.
3. `cd test-litellm && bun install && bun run dev`.
4. Open chat UI, send "hello", confirm a response renders.
5. Open Settings → Provider, confirm "LiteLLM Proxy" entry is shown and current.

## Out of scope (revisit later)

- Embedding routing through LiteLLM. Requires touching the embedding-plugin selection in `core-plugins.ts` and the `@elizaos/plugin-local-embedding` always-on assumption.
- Anthropic-format passthrough (LiteLLM's `/anthropic/v1/messages` endpoint). Would let `@elizaos/plugin-anthropic` route through LiteLLM and preserve Anthropic-specific features (prompt caching, native tool-use). Doubles the integration surface.
- In-app form field for `LITELLM_BASE_URL`. Lets users edit the URL from Settings without touching `.env`. Requires extending the `provider-switch-routes` schema and a chunk of Settings UI.
- A standalone `@tokagent/plugin-litellm` package. The hybrid approach (this design) reuses `@elizaos/plugin-openai` and adds zero plugin code. A standalone plugin would only be necessary if we needed Anthropic-format passthrough or LiteLLM-specific features (e.g., LiteLLM's `/v1/budget` admin API for per-user spend tracking).

## Constraints worth remembering

- The runtime has an `normalizeOpenAiCompatibleProviderConfig` heuristic (`packages/agent/src/runtime/tokagent.ts`) that strips `OPENAI_BASE_URL` when it detects Groq's host pattern. Self-hosted LiteLLM URLs do not match — the heuristic is a no-op for us. If LiteLLM ever publishes a default Cloud URL we adopt, double-check this function doesn't false-positive on it.
- The plugin tree is mirrored across three locations (`PLUGINS.md` §10.1). The CLI scaffold and `.env.example` changes need to land in the canonical and both mirror locations. The existing `bun run sync:plugins` script handles this when run from `packages/tokagentos`.
- Env writers already exist for both code paths and we do not need a new one. Scaffold-time `.env` writes go through `writeLlmEnvFile` in `packages/tokagentos/src/commands/create.ts` (we'll add a small `writeLlmExtraEnv` helper alongside it for the multi-key litellm case). Runtime writes go through `setEnvValue` in `provider-switch-config.ts` and `upsertEnvLine` in `plugins/plugin-tokagent-shared/src/env-persistence.ts`. Both preserve comments and ordering.
