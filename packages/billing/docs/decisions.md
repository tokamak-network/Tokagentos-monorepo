> **Phase 0 decisions** — committed answers to the integration plan's Open Questions.
> Reversal requires a new plan amendment and is tracked in the project changelog.

# Integration Plan — Open Questions: Committed Decisions

Source: `docs/superpowers/specs/2026-05-11-llm-api-gateway-integration-plan.md` §Open Questions

---

## OQ1 — Smart Contracts Location

**Question**: Path A (keep contracts in `llm-api-gateway/` source repo after archiving, or move to parent Tokamak-AI-Layer contracts tree) vs Path B (new sibling `contracts/` workspace in the tokagentos parent repo)?

**Decision**: **Path A** — contracts remain in `llm-api-gateway/contracts/` after the source repo is archived, or are moved to the parent Tokamak-AI-Layer contracts tree. They are **not** moved into the `tokagentos` monorepo. The integration only imports the deployed addresses (via `packages/billing/src/chain/addresses.ts`) and the ABIs (generated from `forge build` artifacts and committed to `packages/billing/src/chain/abi/`).

**Reasoning**: The contracts are static deployment artifacts that do not require the tokagentos build pipeline. Moving them into the monorepo adds a Foundry workspace dependency and complicates the Bun/turbo build graph without benefit. The existing precedent — `plugins/plugin-tokagent-shared/src/contracts/abis/` stores ABIs separately from any Foundry workspace — confirms this pattern. This decision unblocks Phase 0 (addresses staging) and Phase 3 (chain layer). See plan §"Smart contracts — out of scope".

**Reversibility**: Trivial — the contracts can be added as a sibling workspace later if deployment tooling requires it. No data migration needed; only ABI references change.

**Owner-type**: Tech-lead

---

## OQ2 — Per-Tenant or Per-Key Quotas

**Question**: Should per-tenant or per-API-key quotas (spending caps, rate limits beyond token-bucket) be added during this integration?

**Decision**: **Defer.** No quotas in this integration. The `billing_api_keys` table schema (Phase 4) includes an unused `quota_pton` column placeholder to enable this as a Phase 9+ extension without a schema migration. Document the extension point in `packages/billing/src/ledger/schema.ts`.

**Reasoning**: Source has no quota system. Target has no quota system. Adding one now is scope creep that would extend Phase 6 by at least one sprint and introduces product decisions (quota reset cadence, grace periods, over-quota UX) that have not been scoped. The deferral is low-risk because quotas are additive — no existing behavior changes. This blocks nothing in the current phase plan.

**Reversibility**: Trivial — quotas are additive. Adding them later requires a schema migration (`ALTER TABLE billing_api_keys ADD COLUMN ...`) and a new middleware check, but no destructive changes.

**Owner-type**: Product

---

## OQ3 — Cloud Profile Operator Key Handling

**Question**: Does Tokagent Cloud (`cloud/cloud-proxy.ts`) host the operator private key per-tenant or per-deployment?

**Decision**: **Per-deployment.** A single cloud-resident operator key is used per deployment. The cloud bridge issues scoped per-tenant SIWE sessions against this shared operator. Individual tenants do not get their own operator key. This matches the source architecture (single `OPERATOR_PRIVATE_KEY` per proxy instance).

**Reasoning**: Per-tenant operator keys would require vault-level contract changes (per-tenant vault deployment) or a proxy pattern that multiplexes vault calls. Neither is scoped for this integration. The per-deployment model reduces key management surface and is consistent with how the source already runs. The risk (R7: operator key in env var incompatible with cloud-managed deployment) is mitigated in Phase 6 by routing `BILLING_OPERATOR_PRIVATE_KEY` through `packages/agent/src/auth/credentials.ts:43-134` for the cloud profile. This decision unblocks Phase 6 cloud wiring.

**Reversibility**: Requires migration — moving to per-tenant operator keys requires vault contract changes and per-tenant key provisioning infrastructure. Not trivial.

**Owner-type**: Security eng / Smart-contract eng

---

## OQ4 — JWT vs HMAC Sessions

**Question**: Should the source's hand-rolled `base64url(payload).hex(hmac)` session format be replaced with standard JWT (using `jose`)?

**Decision**: **Yes — JWT with 24-hour TTL**, signed via the `BILLING_AUTH_SECRET` (derived using the same approach as `AUTH_SECRET` in the source). Use the `jose` library (already a transitive dependency candidate via the viem ecosystem; verify before adding explicitly).

**Reasoning**: The source's HMAC format is 30 lines of non-standard code that any new engineer must learn. JWT is an industry standard with built-in expiry, payload verification, and tooling. The migration cost is ~30 LOC and one dependency. The 24h TTL matches the source's session lifetime. Existing SIWE sessions from the source are invalidated at cutover (Phase 8) as part of the mandatory secret rotation, so there is no backward compatibility burden. This unblocks Phase 6 auth implementation.

**Reversibility**: Requires migration if reverted — existing issued JWTs would be invalidated on rollback. Practically irreversible post-Phase 6 without customer comms (all active sessions expire).

**Owner-type**: Backend eng

---

## OQ5 — Auto-Enable Billing in Scaffold

**Question**: Should `BILLING_ENABLED=true` propagate to scaffolded projects via the `core-plugins.ts` overlay in Phase 6?

**Decision**: **No.** Billing is opt-in per deployment. Scaffolded projects start with `BILLING_ENABLED=false`. The `BILLING_*` env vars are added to all three mirror locations (root `.env.example`, `packages/templates/fullstack-app/.env.example`, `packages/tokagentos/templates/fullstack-app/.env.example`) with commented-out values and a `# Web3 billing — opt in per deployment` header. `@tokagentos/billing` and `plugin-tokagent-billing` are **not** added to `core-plugins.ts`.

**Reasoning**: The tokagentos README explicitly positions the product as "local-first" (`README.md:14-22`). Forcing billing on scaffolded projects breaks local-first UX for the self-hosted majority. Operators who want billing explicitly set `BILLING_ENABLED=true` and configure the vault. The three-mirror rule still applies for the env var documentation — it just ships with values commented out. This unblocks Phase 6 scaffold-patches work (plan §Phase 6, §Three-mirror rule).

**Reversibility**: Trivial — adding billing to `core-plugins.ts` later is a one-line change. No data migration.

**Owner-type**: DX eng / Product

---

## OQ6 — SQLite Call Log Historical Migration

**Question**: Path A (archive the source's `proxy/data/usage.db` alongside the repo; no migration) vs Path B (write a one-shot `bun run migrate:billing-import-sqlite` script)?

**Decision**: **Path A** — archive only. The SQLite file is preserved alongside the archived `llm-api-gateway` repo. Users needing historical usage data access it via a one-shot SQLite dump using standard tools. No import script is written unless customers explicitly request it.

**Reasoning**: The source's in-memory API key store (`apiKeys.ts:13-16`) already documented that all non-SQLite state is intentionally ephemeral — lost on every restart. The SQLite usage log is the only durable state. Migration effort (~0.5 day per plan) is not justified without a confirmed customer request. The data format (call log rows) is straightforward to import manually if needed later. This decision unblocks Phase 8 cutover planning.

**Reversibility**: Trivial — the migration script can be written at any time as long as the SQLite file is preserved. No structural lock-in.

**Owner-type**: Backend eng / Product

---

## OQ7 — Multi-Instance / Horizontal Scaling

**Question**: Does Phase 4's Drizzle + Postgres persistence unlock horizontal scaling? Should multi-instance support be advertised?

**Decision**: **Phase 4 structurally unblocks multi-instance.** Drizzle + Postgres replaces the single-process Map state with shared DB state. The plan's `SERIALIZABLE` transaction requirement (plan §C4) ensures correctness under concurrent writers. However, **do not advertise multi-instance in Phase 4 acceptance** — the consume worker's flush loop and the withdraw watcher are singletons (one consumer per deployment). A leader-election mechanism (e.g., Postgres advisory lock on the worker loop) is needed before multi-instance can be safely claimed. Document this as a Phase 5b extension in the worker service comments.

**Reasoning**: The Postgres backing is necessary but not sufficient for horizontal scaling. Claiming multi-instance support before workers are leader-election-safe risks double-consume (charging a wallet twice for the same accrual). Running two billing instances before Phase 5b will cause double-consume — the on-chain `consumeCredits` call is not idempotent. The Phase 5b Postgres advisory lock is the hard gate, not just a communication boundary. The conservative framing is correct: Phase 4 is the prerequisite, Phase 5b (worker leader election) is the actual unlock. This blocks nothing in the core path.

**Reversibility**: N/A — this is a documentation/communication decision. No code change required.

**Owner-type**: Backend eng / SRE

---

## OQ8 — Embedding Routing Through Billing

**Question**: Should embedding model calls be routed through the billing gate?

**Decision**: **No — keep embeddings out of billing scope.** The billing gate applies only to `/v1/chat/completions`, `/v1/messages*`, and `/v1/topup/settle`. Embedding calls (routed via `@elizaos/plugin-local-embedding` or local model runners) are not billable under this integration. Revisit if and when embeddings are routed through paid external providers (e.g., OpenAI Ada, Cohere).

**Reasoning**: The source's LiteLLM design doc explicitly scoped out embeddings. `@elizaos/plugin-local-embedding` runs locally and has no per-token cost. Routing local embeddings through the on-chain billing system would charge users for free compute and break the local-first guarantee. The trigger for re-scoping this is: any embedding provider that incurs real USD cost is added to tokagentos's default plugin set.

**Reversibility**: Trivial — adding the embedding routes to the billing gate is a middleware config change.

**Owner-type**: Product

---

## OQ9 — Operator Address Parity at Cutover

**Question**: Reuse the source's operator address at cutover, or rotate to a new operator key?

**Decision**: **Reuse the same operator address** (same `OPERATOR_PRIVATE_KEY` / `BILLING_OPERATOR_PRIVATE_KEY` value). If and only if the operator key is rotated as part of the cutover (for security hygiene), batch a `ClaudeVault.setOperator(newAddress)` transaction into the cutover runbook as a mandatory step before enabling `BILLING_ENABLED=true`.

**Reasoning**: Reusing the key avoids a ClaudeVault transaction at cutover, reducing the number of on-chain actions in an already-complex cutover sequence. The risk (R2 in the plan) is addressed not by key rotation but by the write fence: source proxy is set to rejection mode before tokagentos writes any deposit, preventing parallel operator writes. Key rotation is a separate security hygiene decision, orthogonal to the cutover sequence. If rotation is chosen, the vault's `setOperator` function is already implemented (`ClaudeVault.sol` is confirmed to have this method per plan §Cutover). This unblocks Phase 8 runbook.

**Reversibility**: Trivial if no rotation occurred. Requires customer comms if rotation occurred (existing topup batch preauths signed by the old key are invalidated, since they reference the old operator's vault authorization).

**Owner-type**: Smart-contract eng / Security eng

---

## OQ10 — Allow-List Union for Billable Models

**Question**: The source's `SUPPORTED_MODELS` allowlist includes `glm-4.7` (test entry) and Claude/GPT/Gemini families. Target's plugin layer accepts whatever the loaded provider plugin advertises. How should the union be handled?

**Decision**: **Billing's allowlist gates which models are billable.** Under `BILLING_ENABLED=true`, a request for a model not on the billing allowlist is rejected with a 400 (`billing_error: model_not_billable`). The billing allowlist is a strict subset of the models the plugin layer accepts. Non-allowlisted models remain accessible when `BILLING_ENABLED=false`. The source's `glm-4.7` test entry is removed from the production allowlist; it can be re-added via `BILLING_ADDITIONAL_MODELS` config for local testing. Document this asymmetry prominently in `packages/billing/docs/errors.md`.

**Reasoning**: Allowing requests through for models with no billing rate entry creates silent zero-charge calls — revenue leakage. Rejecting early is safer than a silent pass-through. The asymmetry (billing enabled → model subset; billing disabled → all plugin models) is intentional and aligns with the opt-in deployment model. The `glm-4.7` entry is a test artifact that has no business being in a production allowlist. This decision unblocks Phase 2 (pricing tables must enumerate the billable allowlist definitively).

**Reversibility**: Trivial — the allowlist is config-driven (`rates.ts`). Adding models is a non-breaking config change.

**Owner-type**: Backend eng / Product

---

## Z1 — Zod v4 Schema Validation

**Question (Phase 2)**: Use Zod v3 (current most-widespread) or Zod v4 (already used in `@tokagentos/shared`) for the `BillingConfig` schema and any future billing schemas?

**Decision**: **Zod v4** (`^4.3.6`). Matches the version already declared in `@tokagentos/shared`. Uses `z.string().min(1)` (not the deprecated `z.string().nonempty()`). Uses `.optional().default(...)` (Zod v4 chaining). The inferred type is exposed as `BillingConfig = ReturnType<typeof loadBillingConfig>` (preferred over `z.output<typeof Schema>` because the loader applies post-parse defaults and cross-validations that the raw Zod output type does not capture; for a parsed-only consumer the two forms are equivalent). The TYPE name is intentionally phase-neutral — Phase 3+ will extend the same `BillingConfig` shape via Zod schema composition (`.extend()`) rather than introducing `BillingConfigPhase3` etc.

**Reasoning**: Aligning on one Zod major version across the monorepo eliminates runtime version conflicts when packages share Zod-annotated types. `@tokagentos/shared` already locked v4, so the decision was already made. Using v3 here would create a peer-dep split that would surface confusingly as "two Zod objects aren't equal" type errors down the line.

**Reversibility**: Low effort — Zod v3→v4 migration is well-documented. No data migration needed; only schema call syntax changes.

**Owner-type**: Backend eng

---

## Z2 — Logger Injection Pattern

**Question (Phase 2)**: Use the source's module-level `console.*` calls, a module-level singleton logger, or an injected logger for all new billing modules?

**Decision**: **Module-level `logger.child({ src: 'billing' })`** imported from `@tokagentos/core`. No per-call injection; one child logger is created at module load time and reused. The `src` tag allows log filtering across billing submodules without per-module child proliferation.

**Reasoning**: The source used bare `console.*` throughout — acceptable in a standalone proxy but inconsistent with the tokagentos structured-logging convention. A per-call injected logger (e.g., `readCompositeTwap(client, oracle, logger)`) adds parameter noise to every public function signature in Phase 2. Since the billing package is not a library consumed by external callers with arbitrary loggers, a module-level child is the right balance. Per-function injection is deferred to Phase 3 (chain-write layer) where callers need explicit control over log context.

**Reversibility**: Medium effort — switching to per-function injection later requires updating all function signatures and call sites. Not trivial if many callers exist, but contained within `packages/billing/`.

**Owner-type**: Backend eng

---

## Z3 — PublicClient Explicit Injection

**Question (Phase 2)**: The source used ES Proxy lazy-initialization inside `TonPriceOracle` to create the `PublicClient` from env config. Should the billing package follow the same pattern or require explicit client injection?

**Decision**: **Explicit `PublicClient` injection**. All functions that require chain reads (`readCompositeTwap`, `getCachedTonUsd`) take a `client: PublicClient` parameter. No module-level singleton client. No lazy initialization. The caller (Phase 3/5 workers, Phase 6 route handlers) constructs and owns the `PublicClient` instance.

**Reasoning**: The ES Proxy lazy-init pattern is untestable without mocking environment variables and importing the module in a specific order. Explicit injection allows `vi.fn()`-based mock clients in tests without any module-level side effects. It also makes the dependency on a viem transport explicit and composable — different callers can inject clients with different transports (e.g., HTTP vs WebSocket, different RPC URLs, different cache settings). Phase 2's test suite depends on this: all 14 oracle tests use a mock `PublicClient` without touching `process.env`.

**Reversibility**: Trivial in the additive direction (wrapper functions can create a singleton around the injected pattern). Reversing back to implicit initialization would require removing all test infrastructure that depends on injection.

**Owner-type**: Backend eng

---

## Z4 — Environment Variable Namespace Prefix

**Question (Phase 2)**: Use the source's unprefixed env var names (`TWAP_POOL_WTON_WETH`, `MARGIN_BPS`, `NODE_ENV`) or prefix them to avoid collisions with the tokagentos host environment?

**Decision**: **`BILLING_` prefix** for all billing-owned env vars. Examples: `BILLING_TWAP_POOL_WTON_WETH`, `BILLING_MARGIN_BPS`, `BILLING_OPERATOR_PRIVATE_KEY`. `NODE_ENV` is read as-is (it is a standard Node.js convention owned by the runtime, not the billing package). The Phase 2 config loads only TWAP + margin vars; chain-write, auth, rate-limit, and usage tracking vars are deferred to later phases.

**Reasoning**: The source ran as an isolated proxy process where env var collisions were not a concern. Inside the tokagentos monorepo, billing runs alongside several other packages that also read from the process environment. Unprefixed names like `MARGIN_BPS` or `TWAP_WINDOW_SECONDS` are high collision risk with any future plugin or runtime config. The `BILLING_` prefix is the same convention used by `DATABASE_URL` (runtime), `OPENAI_API_KEY` (provider plugins), and `ANTHROPIC_API_KEY` — namespace-per-concern is the established monorepo pattern.

**Reversibility**: Trivial for new deployments (rename env vars in deployment config). Breaking for existing `llm-api-gateway` deployments until they rename their env vars — documented in the Phase 8 cutover runbook as a mandatory env var rename checklist item.

**Owner-type**: Backend eng / DevOps

---

## Implementation decisions (added during phases 2+)

---

## Z5 — Do NOT reuse `plugin-tokagent-shared` wallet helpers

**Question (Phase 3)**: Should `packages/billing/src/chain/clients.ts` reuse `plugin-tokagent-shared/src/wallet.ts:getPublicClient/getWalletClient` for creating viem clients, or implement its own factory?

**Decision**: **Duplicate intentionally.** `chain/clients.ts` defines its own `createBillingClients(cfg)` factory. The shared helpers are not used.

**Reasoning**: `plugin-tokagent-shared/src/wallet.ts:getPublicClient(chainId, rpcOverride?)` resolves the RPC URL via `getChainConfig(chainId)` — the tokagent general-purpose chain registry. The billing module has a narrower chain set: (1) Ethereum mainnet for TWAP reads, via `BILLING_MAINNET_RPC_URL`, and (2) one configurable L2 for vault reads/writes, via `BILLING_CHAIN_RPC_URL` + `BILLING_CHAIN_ID`. Mapping these two distinct config slots through the shared chain registry would require wiring the full tokagent chain registry into `@tokagentos/billing`, creating a coupling that doesn't belong at the billing library layer. The integration plan explicitly notes "otherwise duplicate intentionally — the billing layer's chain set is narrower than tokagent's general purpose" (plan §Phase 3). The explicit `createBillingClients(cfg)` factory also satisfies Decision Z3 (explicit injection) and Decision Z6 (no Proxy lazy-init).

**Reversibility**: Trivial in the additive direction — a future unification could delegate to the shared helper once the chain registry is queryable by config key rather than chainId. No data migration needed; only the factory implementation changes.

**Owner-type**: Backend eng

---

## Z6 — Drop ES Proxy backward-compat exports from chain layer

**Question (Phase 3)**: Should the ported `chain/clients.ts` preserve the source's ES `Proxy`-based lazy-init pattern (`mainnetClient`, `publicClient`, `walletClient` as module-level Proxy exports) for backward compatibility?

**Decision**: **Discard entirely.** No ES Proxy exports, no module-level client state, no lazy init. All chain functions take explicit `BillingClients` parameters.

**Reasoning**: The source's ES Proxy pattern was a convenience for `server.ts` + `withdrawWatcher.ts` which import `mainnetClient` at module scope and expect it to work without explicit construction. In the billing package there is no such legacy consumer — Phase 3 is the first write. The Proxy pattern is untestable without careful import ordering or `setClientsForTest` side-channel injection. It also creates hidden coupling between `config.ts` (reads env at init time) and `clients.ts` (constructs transport using that config). Dropping it in favor of explicit injection completes the pattern established in Decision Z3 for Phase 2 TWAP functions: every chain-reading function in the billing layer takes an explicit client parameter. Phase 2 already dropped the TWAP-side mainnet Proxy; Phase 3 finishes the job.

**Reversibility**: Trivial in the additive direction — a convenience singleton wrapper can be added on top of `createBillingClients` without changing the underlying factory.

**Owner-type**: Backend eng

---

## Z7 — Anvil harness: env-gated, not always-on

**Question (Phase 3)**: Should chain-layer integration tests (`vault.integration.test.ts`) run in CI by default, or be gated behind an environment variable?

**Decision**: **Env-gated.** Integration tests run only when `BILLING_TEST_ANVIL=1`. Unit tests (EIP-3009 offline verify, typed-data shape) always run. The integration suite uses `describe.skipIf(!process.env.BILLING_TEST_ANVIL)`.

**Reasoning**: Anvil cold start is 5–15s; a CI job without foundry installed would fail every run. The unit tests for `verifyEip3009Signature` and typed-data helpers cover the cryptographic correctness path without requiring a node. The integration tests provide mechanical proof of the contract round-trip (plan validation gate: "vault.depositX402 + vault.consumeCredits round-trip on Anvil"). Running them once manually with `BILLING_TEST_ANVIL=1` satisfies the gate. Future Phase 8 cutover task will add a CI matrix entry installing foundry and setting the flag; that is not Phase 3 scope. Foundry binaries are confirmed present at `~/.foundry/bin/` on the development machine.

**Reversibility**: Trivial — remove the `skipIf` guard to make tests always-on. Requires foundry in the CI base image first.

**Owner-type**: Backend eng / DevOps

---

## Z8 — `chain/typed-data.ts` extracted from `chain/abi/pton.ts`

**Question (Phase 3)**: Should `TRANSFER_WITH_AUTH_TYPES`, `LOGIN_AUTH_TYPES`, and EIP-712 domain helpers live in `chain/abi/pton.ts` alongside the PTON ABI, or in a dedicated `chain/typed-data.ts`?

**Decision**: **Dedicated `chain/typed-data.ts`.** The two typed-data constants and two domain helper functions (`ptonDomain`, `loginAuthDomain`) are extracted from `chain/abi/pton.ts` into the new file. `chain/abi/pton.ts` retains only `PTON_ABI` (ABI fragments for viem `readContract`/`writeContract` calls).

**Reasoning**: EIP-712 typed-data constants are domain shape data — they describe the structure of a message to be signed. ABI fragments describe the on-chain function/event interface. The two serve different consumers: typed-data is used by `chain/pton.ts:verifyEip3009Signature` and Phase 6 auth routes; ABI fragments are used by `chain/vault.ts` and `chain/pton.ts:ptonBalance`. Co-locating them in the ABI file conflated two distinct concerns and made `abi/pton.ts` the sole import target for consumers that only needed one. The separation was noted by the Phase 2.1 reviewer ("EIP-712 typed-data constants are domain shape data, not ABIs"). Moving them to `typed-data.ts` gives Phase 6 auth routes a clean import target without pulling in the ABI.

**Reversibility**: Trivial — merge the two files if the separation turns out to be unnecessary overhead. Internal-to-`packages/billing` only; no external consumers yet.

**Owner-type**: Backend eng

---

## Z9 — One commit, one logical unit (Phase 3)

**Question (Phase 3)**: Should Phase 3 land as a single commit or in atomic sub-commits per file group?

**Decision**: **Single commit** — `feat(billing): phase 3 — chain layer (clients, vault, pton, EIP-3009 verify)`. If post-review fixups are needed, those become a `fix(billing): phase 3.1 — ...` commit.

**Reasoning**: Phase 3 is a cohesive port of five tightly coupled files (`typed-data.ts`, `clients.ts`, `pton.ts`, `vault.ts`, `config.ts` extension). Sub-commits would require each intermediate state to typecheck cleanly, adding friction without meaningful reviewability gain — the entire diff is presented in one PR review regardless. This matches the Phase 2 convention ("one big port").

**Reversibility**: N/A — git history decision; rebasing to split later is always possible if the team changes convention.

**Owner-type**: Backend eng

---

## Z10 — `loadBillingConfig` extends, doesn't fork (Phase 3)

**Question (Phase 3)**: Should the five new chain envs (`BILLING_CHAIN_RPC_URL`, `BILLING_CHAIN_ID`, `BILLING_VAULT_ADDRESS`, `BILLING_PTON_ADDRESS`, `BILLING_OPERATOR_PRIVATE_KEY`) be added to the existing `BillingConfigSchema` in `config.ts`, or defined in a separate `BillingChainConfig` type?

**Decision**: **Extend the existing schema inline, required-at-boot.** The five envs are added directly to `BillingConfigSchema` in `config.ts` without `.optional()`. No separate type is introduced. The `BillingConfig` type (derived via `ReturnType<typeof loadBillingConfig>`) grows automatically and the chain fields are non-nullable.

**Reasoning**: Z10 extends the Phase 2 `BillingConfig` Zod schema with the five chain envs (`BILLING_CHAIN_RPC_URL`, `BILLING_CHAIN_ID`, `BILLING_VAULT_ADDRESS`, `BILLING_PTON_ADDRESS`, `BILLING_OPERATOR_PRIVATE_KEY`) marked required. Required-at-boot validation catches misconfiguration early — the chain layer can assume non-null values without per-call guards. When Phase 6 adds the `BILLING_ENABLED` toggle, the gate will be applied at `loadBillingConfig`'s outer wrapper (skip chain validation when disabled), not by per-field `.optional()`. Introducing a separate `BillingChainConfig` type would require consumers to call two loaders and combine them, or introduce a composition wrapper that adds complexity without value. The single `BillingConfig` shape with incremental field additions per phase is simpler: callers do `loadBillingConfig(process.env)` once and get everything. This matches Decision Z1 ("the TYPE name is intentionally phase-neutral — Phase 3+ will extend the same BillingConfig shape via Zod schema composition rather than introducing `BillingConfigPhase3` etc.").

**Reversibility**: Trivial — splitting into sub-schemas is always possible; it only affects callers that import `BillingConfig` directly. Loosening required-ness back to `.optional()` is also trivial but reintroduces the misconfiguration-at-boot risk this decision is designed to prevent.

**Owner-type**: Backend eng

**Phase 3.1 amendment (2026-05-11)**: Original implementation set the five envs to `.optional()` with the intent of deferring required-ness to Phase 6's `BILLING_ENABLED` toggle. Spec reviewer flagged this as contradicting the Phase 3 prompt's explicit instruction ("mark them required in the schema — Phase 3 doesn't have to support 'billing-disabled mode' yet"). Required-ness restored in commit `chore(billing): phase 3.1 — make chain envs required per spec`.

---

## Z11 — No DB singleton; explicit `BillingDatabase` parameter (Phase 4)

**Question (Phase 4)**: Should `@tokagentos/billing` maintain a module-level `db` singleton (like the source's in-memory Maps), or pass an explicit `db: BillingDatabase` parameter to every public function?

**Decision**: **Explicit parameter.** Every public function in `ledger.ts`, `preauth.ts`, `nonces.ts`, `api-keys.ts`, and `quotes.ts` takes an explicit `db: BillingDatabase` as its first argument. No module-level singleton. No `initDb()` side-effecting setup function.

**Reasoning**: The source's in-memory Maps were necessarily singletons — they lived at module scope. Drizzle databases are connection-pool objects that carry their own lifecycle. Injecting the `db` parameter makes each function independently testable (the PGLite harness simply passes a fresh in-memory DB), composable (callers can wrap multiple ledger calls inside their own transaction boundary), and free of hidden global state. This matches Decision Z3 (explicit injection for chain clients) and Decision Z6 (no module-level lazy init) — the same principle applied to the DB layer. The type `BillingDatabase = NodePgDatabase<Schema> | PgliteDatabase<Schema>` allows the same function signatures to work against both production Postgres and PGLite in tests without any environment flag or conditional import.

**Reversibility**: Trivial in the additive direction — a singleton convenience wrapper `getBillingDb()` can be layered on top of the explicit functions at any time. Reversing to pure singletons would require removing the parameter from all call sites.

**Owner-type**: Backend eng

---

## Z12 — Migrations under `drizzle/migrations/`; applied via `migrate()` in tests (Phase 4)

**Question (Phase 4)**: Where should Drizzle migration files live, and how are they applied in the test harness?

**Decision**: **`packages/billing/drizzle/migrations/`**, generated by `bunx drizzle-kit generate --config drizzle.config.ts`. The test harness (`src/ledger/__tests__/db-harness.ts`) calls `migrate(db, { migrationsFolder: "./drizzle/migrations" })` against each fresh PGLite instance. Migrations are committed to the repository alongside source. The `drizzle.config.ts` is at the package root.

**Reasoning**: Committing migration files is the standard Drizzle practice for tracking schema history. The `drizzle/migrations/` path matches the `drizzle-kit` default `out` option and avoids mixing generated artifacts with source files. Applying migrations in the test harness (not in test setup hooks) ensures every test starts from the same guaranteed schema state without needing to recreate tables manually. PGLite supports the full Postgres DDL that `drizzle-kit` generates, including `CREATE TYPE`, `REFERENCES`, and `CREATE INDEX`. Plugin.schemas wiring (Decision D12) is deferred to Phase 6; Phase 4 only needs `drizzle.config.ts`.

**Reversibility**: Trivial — migration files are additive. Removing or consolidating migrations requires a `drizzle-kit` squash operation that is always optional.

**Owner-type**: Backend eng

---

## Z13 — PGLite for tests; always-on, no env flag (Phase 4)

**Question (Phase 4)**: Should the Phase 4 persistence tests use a real Postgres instance (behind an env flag like `BILLING_TEST_ANVIL`), or an in-process PGLite instance that runs in every CI environment?

**Decision**: **PGLite, always-on.** The test harness uses `@electric-sql/pglite` (v0.3.16). No env flag. No docker-compose. No external process. PGLite is added as a `devDependency` in `packages/billing/package.json`. Tests run on every `bun run test` invocation.

**Reasoning**: PGLite is a WASM build of Postgres that supports the same SERIALIZABLE isolation semantics, the same SQL dialect, and the same `drizzle-kit`-generated DDL as a full Postgres server. The concurrency stress test (100 iterations by default, 10k with `BILLING_STRESS_FULL=1`) runs in ~1s against PGLite — no external service startup cost. The alternative (requiring a Postgres container for CI) would add ~10–20s of setup time and a dependency on Docker availability in the CI environment. Since PGLite gives full Postgres semantics at zero infrastructure cost, the tradeoff is clearly favorable for a test-layer decision. The `BILLING_STRESS_FULL=1` flag extends the iteration count for the full validation gate without requiring a different database backend.

**Reversibility**: Trivial — replacing the test harness `new PGlite()` with a real connection string is a one-file change (`db-harness.ts`). Any test that passes on PGLite also passes on Postgres (PGLite is a strict subset of Postgres behavior for DDL + DML; the reverse is not guaranteed).

**Owner-type**: Backend eng

---

## Z14 — SERIALIZABLE isolation with retry on code 40001 (Phase 4)

**Question (Phase 4)**: What isolation level should the ledger transactions use, and how should serialization failures be handled?

**Decision**: **SERIALIZABLE isolation with automatic retry.** All mutating ledger operations (`reserve`, `release`, `commit`, `hydrate`, `flushAccrued`) run inside `db.transaction(op, { isolationLevel: "serializable" })`. The `withSerializableRetry<T>(db, op, opts?)` helper retries the entire transaction on Postgres error code `40001` (`serialization_failure`). Default: max 5 attempts, 10ms base delay, ±50% jitter, exponential backoff.

**Reasoning**: The balance invariant (`onChainCredits == balance + reserved + accrued`) must hold under concurrent callers. READ COMMITTED isolation (Postgres default) would allow two concurrent `reserve()` calls to both read the same balance, both pass the `balance >= amount` check, and both decrement — resulting in a double-spend. SERIALIZABLE isolation serializes the concurrent transactions: one succeeds, the other receives error `40001` and retries. The retry loop is necessary because `40001` is a recoverable error — the transaction did not commit, so retrying is safe. Max 5 attempts with exponential backoff caps the retry cost while tolerating transient contention peaks. The concurrency stress test (10 concurrent reserves, 10k iterations, Decision Z13) validates that the implementation produces exactly 5/10 successes with zero race conditions.

**Reversibility**: Lowering to READ COMMITTED would require adding explicit advisory locks (`SELECT ... FOR UPDATE`) on the `billing_credit_state` row — more code, same isolation guarantee. SERIALIZABLE is the simpler and more correct approach.

**Owner-type**: Backend eng

---

## Z15 — `numericBigint` custom type: `numeric(78,0) ↔ bigint` (Phase 4)

**Question (Phase 4)**: How should atto-PTON amounts (up to 10^27, far exceeding JavaScript's `Number.MAX_SAFE_INTEGER`) be stored in Postgres and mapped in TypeScript?

**Decision**: **`numeric(78, 0)` Postgres column type, mapped to TypeScript `bigint` via a Drizzle `customType`.** The `numericBigint` helper is defined in `src/ledger/schema.ts` using `customType<{ data: bigint; driverData: string }>()` with `dataType: () => "numeric(78, 0)"`, `fromDriver: (v) => BigInt(v)`, `toDriver: (v) => v.toString()`. Column defaults use `sql\`'0'\`` (SQL string literal) rather than `0n` (BigInt literal), because `drizzle-kit` cannot serialize BigInt during migration generation.

**Reasoning**: JavaScript `number` cannot represent atto-PTON values without loss — atto-PTON amounts are integers up to approximately 10^27 (10^9 TON × 10^18 atto). TypeScript `bigint` has arbitrary precision. Postgres `numeric(78, 0)` stores up to 78-digit integers without rounding. The driver roundtrip is `bigint → string (toDriver) → numeric(78,0) (postgres) → string (fromDriver) → bigint` — exact at every step. The `sql\`'0'\`` default workaround is specific to `drizzle-kit`'s code-generation path; runtime Drizzle query builders handle `bigint` natively via the `toDriver` callback. The 78-digit bound was chosen as 2× the expected maximum (27 digits) with ample headroom for future denomination changes.

**Reversibility**: Trivial in the additive direction — widening `numeric(78,0)` to `numeric(100,0)` requires a migration `ALTER COLUMN ... TYPE numeric(100,0)`. Changing the TypeScript mapping is a one-function change in `schema.ts`. The `fromDriver`/`toDriver` pattern makes this the only place that needs updating.

**Owner-type**: Backend eng

---

## Z16 — `.returning()` no-arg form across all union-typed DB calls (Phase 4)

**Question (Phase 4)**: When `.returning()` is needed after `INSERT` or `UPDATE` operations, should field selectors be passed (e.g., `.returning({ id: reservations.id })`) or should the no-arg form be used?

**Decision**: **No-arg `.returning()` everywhere.** All `INSERT ... RETURNING` and `UPDATE ... RETURNING` calls in Phase 4 use `.returning()` with no arguments. Row counts are obtained via `result.length`. Specific columns are accessed as properties on the returned full row objects (e.g., `inserted[0]!.id`).

**Reasoning**: TypeScript's union type `BillingDatabase = NodePgDatabase<Schema> | PgliteDatabase<Schema>` resolves the `.returning()` overload by intersecting the two databases' overload sets. The resulting intersection picks the 0-argument overload (the stricter form), making `.returning({ id: ... })` a compile-time error (`TS2554: Expected 0 arguments, but got 1`). The pragmatic fix — no-arg `.returning()` — slightly over-fetches columns (all columns instead of 1–2) but keeps the union type coherent without unsafe casts or type-narrowing hacks. The performance impact is negligible: ledger rows are small (8–12 columns, all scalar), and `.returning()` is called only on write paths, not on read-heavy hot paths. If single-column narrowing becomes important in a future phase, the union type can be replaced with a typed interface or a conditional type that preserves the overloads.

**Reversibility**: Trivial — replacing `.returning()` with `.returning({ id: table.id })` at any call site is a two-character addition once the union type constraint is resolved. No data or behavior change.

**Owner-type**: Backend eng

---

## Z17 — `text` instead of `bytea` for hex binary columns (Phase 4)

**Question (Phase 4)**: The plan's Data Model specifies `bytea` for binary columns (`batch_id`, `tx_hash`, preauth `nonce`/`r`/`s`, api key `hash`). Should the implementation match the plan literally, or adapt the storage type to the actual access pattern?

**Decision**: **Five binary columns specified as `bytea` in the plan's Data Model are implemented as `text` storing hex strings.** Affected columns: `billing_consume_batches.batch_id`, `billing_consume_batches.tx_hash`, `billing_topup_preauth_slots.nonce`, `billing_topup_preauth_slots.r`, `billing_topup_preauth_slots.s`, `billing_api_keys.hash`.

**Reasoning**: Every consumer compares these by string equality (hex-vs-hex). `bytea` would require `\x` prefix syntax or `decode(col, 'hex')` wrappers on every value comparison. The byte-vs-text storage choice is opaque to the application as long as the encoding is consistent on both write and read. Hex text is slightly larger on disk (~2x) but is human-readable in `psql` and never requires encoding gymnastics. The plan's `bytea` specification was prescriptive, not motivated — a portability+ergonomics swap. Drizzle's `drizzle-orm/pg-core` does not export a `bytea` column helper out of the box, so taking the `text`-with-hex path also avoids a custom-type wrapper for what is effectively the same on-the-wire representation viem already produces.

**Reversibility**: Requires a migration `ALTER TABLE ... ALTER COLUMN ... TYPE bytea USING decode(col, 'hex')` per column. Mechanically simple but not zero-downtime; we'd want a maintenance window. Phase 4.x or later if the trade-off no longer holds.

**Owner-type**: Backend eng

---

## Z18 — Two-layer worker/service split (Phase 5)

**Question (Phase 5)**: Should lifecycle management (timers, viem subscriptions) live in the same module as the flush/sweep logic, or be separated?

**Decision**: **Two layers.** Pure worker functions live in `packages/billing/src/workers/` — stateless, no `setInterval`, no global state, testable with PGLite alone. elizaOS Service wrappers live in `plugins/plugin-tokagent-billing/src/services/` — they own timers and subscriptions, inject deps from runtime settings, and delegate all business logic to the worker layer.

**Reasoning**: Mixing lifecycle ownership into business logic makes worker tests require a full elizaOS runtime mock. The separation allows PGLite-only worker tests (fast, always-on) and lightweight lifecycle tests (just spy on the interval/subscription). This directly mirrors how elizaOS itself separates `Service` from underlying handler functions. The split also means the worker layer can be composed into arbitrary orchestrators (e.g. a standalone CLI) without pulling in the elizaOS runtime.

**Reversibility**: Trivial — the layers are independent modules. Collapsing them would be a code-movement refactor with no schema or API changes.

**Owner-type**: Backend eng

---

## Z19 — Service deps injection via `runtime.getSetting(...)`, not constructor params (Phase 5)

**Question (Phase 5)**: How should billing services receive their configuration (`BILLING_*` envs, DB URL, chain clients)?

**Decision**: **Via `runtime.getSetting(key)` inside `resolveBillingRuntime(runtime)`.** All four services call `resolveBillingRuntime(this.runtime)` at start time. The resolver reads every `BILLING_*` key from the runtime settings bag, validates via `loadBillingConfig`, and constructs the `pg.Pool` + Drizzle DB + viem clients in one shot.

**Reasoning**: elizaOS's `Service.start(runtime)` contract passes only the runtime — there is no constructor injection point for arbitrary config. Injecting through `getSetting` is the elizaOS-idiomatic pattern used by all other plugins. It also makes test doubles trivial: mock `getSetting` to return test values, and the full start/stop lifecycle can be exercised without real infrastructure.

**Reversibility**: Trivial — the resolver is a thin adapter; swapping to constructor injection would be a signature change with no behavioral impact.

**Owner-type**: Backend eng

---

## Z20 — Two-tier test coverage: PGLite workers + mock-runtime services (Phase 5)

**Question (Phase 5)**: How should Phase 5 tests be structured given the two-layer split?

**Decision**: **Two tiers, each tested separately.** (1) Worker-layer tests (`packages/billing/src/workers/__tests__/`) use PGLite and always run — no external dependencies. (2) Service-layer tests (`plugins/plugin-tokagent-billing/src/__tests__/services-*.test.ts`) mock `resolveBillingRuntime` and worker functions via `vi.mock`, proving lifecycle wiring only. The Anvil integration test (`consume-worker.integration.test.ts`) is gated by `BILLING_TEST_ANVIL=1`.

**Reasoning**: Worker correctness (SQL, state machine, batch ID) is best tested with a real DB. Lifecycle correctness (interval scheduling, unwatch calls, clearInterval on stop) is best tested with fake timers and mocked worker functions. Conflating the two would require Anvil + real DB in all service tests, making the plugin test suite 15–20× slower with no coverage benefit.

**Reversibility**: Trivial — test architecture changes impose no runtime constraints.

**Owner-type**: Backend eng

---

## Z21 — consumeWorker semantics preserved verbatim from source (Phase 5)

**Question (Phase 5)**: Should the consume worker's flush semantics (OR triggers, deterministic batchId, retry logic) be changed during migration?

**Decision**: **Semantics preserved verbatim.** The two OR triggers (size threshold `consumeBatchMinPton` OR idle age `consumeMaxAgeMs`), the deterministic `batchId = keccak256("consume:{wallet}:{firstAccrualAt.getTime()}:{amount}")`, the `MAX_ATTEMPTS = 3` dead-letter policy, and the priority-wallet override are all copied exactly from source `proxy/src/consumeWorker.ts`. One implementation difference: dead-letter entries persist in `billing_consume_batches.state = 'dead_letter'` instead of an in-process array, providing durability and observability.

**Reasoning**: Semantic parity with the source is required during the migration phase (Risk R9: source is authoritative). Behavioral changes would require product sign-off and are deferred to Phase 9.

**Reversibility**: Behavioral changes to flush semantics require product sign-off and migration of any in-flight `dead_letter` rows. Non-trivial.

**Owner-type**: Backend eng / Product

---

## Z22 — Config envs: 7 new BILLING_* vars for Phase 5 workers (Phase 5)

**Question (Phase 5)**: How should the worker tuning parameters be exposed?

**Decision**: **7 new `BILLING_*` environment variables**, all with defaults, added to `packages/billing/src/config.ts`:

| Env | Default | Purpose |
|---|---|---|
| `BILLING_CONSUME_BATCH_MIN_PTON` | 500000000000000000 (0.5 PTON) | Size threshold for consume flush |
| `BILLING_CONSUME_MAX_AGE_MS` | 300000 (5 min) | Idle age threshold for consume flush |
| `BILLING_CONSUME_SCAN_INTERVAL_MS` | 30000 (30 s) | Consume worker tick cadence |
| `BILLING_CONSUME_MAX_PER_CYCLE` | 10 | Max wallets flushed per scan |
| `BILLING_USAGE_RETENTION_DAYS` | 90 | call_log retention window |
| `BILLING_USAGE_CLEANUP_INTERVAL_MS` | 86400000 (24 h) | Cleanup worker tick cadence |
| `BILLING_PRICE_REFRESH_INTERVAL_MS` | 60000 (60 s) | TWAP refresh tick cadence |

All have safe defaults so the billing package boots without any Phase 5 env vars set. Production deployments should override `BILLING_CONSUME_BATCH_MIN_PTON` and `BILLING_CONSUME_SCAN_INTERVAL_MS` based on expected throughput.

**Reversibility**: Additive — removing any of these would break existing deployments that override them. Non-trivial if operators have configured custom values.

**Owner-type**: DevOps / Backend eng

---

## Z23 — DB connection acquisition: Option 2 — `pg.Pool` from `BILLING_DATABASE_URL` (Phase 5)

**Question (Phase 5)**: How should billing services acquire a `BillingDatabase` (Drizzle) connection? Option 1: read from `@elizaos/plugin-sql`'s internal `getDb()`. Option 2: construct a `node-postgres` (`pg`) Pool from `BILLING_DATABASE_URL` at service start time.

**Decision**: **Option 2.** `resolveBillingRuntime` constructs `new Pool({ connectionString: dbUrl })` and wraps it with `drizzle(pool, { schema })`. Each service start creates its own pool; each service stop calls `pool.end()`.

**Reasoning**: `@elizaos/plugin-sql` does not expose a public typed surface that billing can consume — its internal `getDb()` is bound to the plugin-sql schema (`AgentStore`/`MemoryStore`), not the billing schema. Inspecting the plugin-sql JS bundle confirms only internal classes call `ctx.getDb()`. A direct `pg.Pool` avoids an undocumented dependency on plugin-sql internals and works with any Postgres-compatible backend (Postgres 15+, Neon, Supabase). The per-service pool is an acknowledged temporary design (see TODO in `_runtime-deps.ts`): Phase 6 plugin.init should provide a single shared pool via migrations, and all services should receive it rather than constructing independent pools.

**Reversibility**: Phase 6 refactor — replace per-service pool construction with a shared pool passed through plugin.init. No schema changes; only connection lifecycle changes.

**Owner-type**: Backend eng

---

## Z24 — Anvil harness: `pkill -9 -f anvil` at startup (Phase 5.1)

**Question (Phase 5.1)**: How should the Anvil integration harness handle stale Anvil processes left over from previously-aborted test runs?

**Decision**: Anvil harness runs `pkill -9 -f anvil` (best-effort, ignoring ENOENT) before spawning a fresh process. A 1-second sleep follows to let the OS release the port.

**Reasoning**: Without cleanup, a stale Anvil from a Ctrl-C'd previous test holds port 8545. The next `forge script Deploy.s.sol --broadcast` then targets the existing chain (different block height than expected), producing "nonce too low" deploy errors that look like test bugs. Random-port selection would require propagating the port into every hardcoded `8545` reference (deploy script env vars, downstream test fixtures, README docs) — heavier than this fix and reverted in Phase 8 prep.

**Caveats**: `pkill -9 -f anvil` matches any process with "anvil" in argv on the machine. In a CI matrix with parallel workers, this can kill sibling jobs. Mitigated by container/VM isolation in production CI. Local-dev users running an unrelated Anvil should pause it before running the integration test.

**Reversibility**: Trivial — remove the `pkill` and replace with port-bind detection, or implement random-port selection in Phase 8.

**Owner-type**: Backend eng / DevOps

---

## Z25 — `BILLING_DATABASE_URL` is Zod-validated config, not a separate runtime probe (Phase 5.2)

**Question (Phase 5.2)**: `BILLING_DATABASE_URL` was read via `runtime.getSetting()` with a manual null check, bypassing `BillingConfig`. Should it be folded into the validated Zod schema?

**Decision**: **Yes.** `BILLING_DATABASE_URL` is now declared in `BillingConfigSchema` as `z.string().url()` and surfaced as `config.databaseUrl`. The runtime resolver reads from `config.databaseUrl`, not a separate `runtime.getSetting` call. The plugin services additionally trigger an eager `SELECT 1` probe at start time to surface DB connectivity errors in milliseconds rather than waiting up to `consumeScanIntervalMs` for the first scheduled tick.

**Reasoning**: Typos like `BILLING_DATABSE_URL` previously produced a runtime throw at the first service start — far away from the boot path where a `BillingConfigError` would have caught it. Zod validation is the existing pattern for every other `BILLING_*` env (Decision Z10). The probe makes "Postgres is down" / "wrong credentials" / "wrong port" failures immediate and explicit rather than a 30-second silent wait.

**Reversibility**: Trivial — `databaseUrl` is just another field on `BillingConfig`.

**Owner-type**: Backend eng

---

## Z26 — Consume worker stuck-`submitted` recovery + `BatchAlreadyUsed` sync (Phase 5.2)

**Question (Phase 5.2)**: The original consume worker had two crash-safety gaps. (a) If the process crashed between the chain call and the DB update, the row was stuck in `state='submitted'` forever (same batchId regenerates from unchanged inputs, Step 1 skips, wallet frozen). (b) If the chain reverted with `BatchAlreadyUsed()` (meaning another worker / a restart already consumed this batchId), the worker treated it as a generic failure and incremented attempts toward dead-letter.

**Decision**: **Add two recovery paths in `flushOne`.**
1. **Stale-submitted recovery**: when `row.state === 'submitted'` and `lastAttemptAt` is older than `SUBMITTED_TIMEOUT_MS` (5 min), the worker queries the chain via `wasConsumedOnChain(clients, vaultAddress, batchId)`. If an on-chain `Consumed` event exists, the row is transitioned to `confirmed` and `flushAccrued` is called. Otherwise the row is reset to `pending` and re-attempted on the same tick.
2. **`BatchAlreadyUsed` sync**: when `consumeCredits` rejects with an error message containing `BatchAlreadyUsed` or `AlreadyConsumed`, the worker syncs the DB to `confirmed` immediately (no retry, no dead-letter) and calls `flushAccrued`. Match is on the decoded custom-error name from `ClaudeVault.sol:84`.

**Reasoning**: The first gap is a silent stuck state — no error, no metric, just a wallet that stops flushing. The second was masquerading the correct outcome (chain says "already done, sync up") as a retryable failure. Both are now self-healing.

**Reversibility**: Trivial — both code paths are additive. Reverting them restores the original behavior (with both gaps).

**Owner-type**: Backend eng

---

## Z27 — Single shared `pg.Pool` via `Plugin.init` (Phase 6a)

**Question (Phase 6a)**: Each of the four Phase 5 services constructs its own `pg.Pool` (4 separate TCP pools to the same Postgres). Routes and middleware also need DB access. Should all of them share one pool?

**Decision**: **Yes. One shared `pg.Pool` constructed at `Plugin.init` time.** `initBillingPlugin(runtime)` reads all `BILLING_*` settings, creates the pool, probes connectivity, runs migrations, and stores the pool + db + clients + config in a module-level singleton (`state.ts`). Services, routes, and middleware all consume state via `getBillingState()` at call time — never at import time. If `Plugin.init` has not run (Phase 5 standalone mode), services fall back to constructing their own per-service pool (Phase 5 backwards-compat path in `_runtime-deps.ts`).

**Reasoning**: 4 pools × 5 services × `max=10` each = up to 50 simultaneous connections for one agent instance. A single shared pool with `max=10` is sufficient for all billing traffic and avoids Postgres connection exhaustion.

**Reversibility**: The fallback path (`isBillingStateInitialized() → false`) keeps Phase 5 tests working without `Plugin.init`.

**Owner-type**: Backend eng

---

## Z28 — Module-level singleton for billing plugin state (Phase 6a)

**Question (Phase 6a)**: elizaOS `Service.start(runtime)` receives only a runtime reference — no constructor injection. How do services, routes, and middleware share `db`, `clients`, and `config` without reconstructing them on every request?

**Decision**: **Module-level singleton in `state.ts`.** A single `_state: BillingPluginState | null` variable is set once by `Plugin.init` (via `setBillingState`) and cleared by `Plugin.dispose` (via `clearBillingState`). All consumers call `getBillingState()` at request/tick time — never at import time. Circular-dep risk is eliminated because `state.ts` imports only from `@tokagentos/billing` (external) and from `node:*` — no plugin-internal cross-imports.

**Reasoning**: The alternative (passing state through `IAgentRuntime.settings` as serialized strings) loses type safety. The singleton is scoped to the plugin module; two concurrently loaded agents each get their own module scope (Node ESM module isolation).

**Reversibility**: Swap `getBillingState()` calls for explicit argument passing in a future refactor.

**Owner-type**: Backend eng

---

## Z29 — HS256 JWT via `jose` (Phase 6a)

**Question (Phase 6a)**: The source (`llm-api-gateway/proxy/src/auth.ts`) used a hand-rolled HMAC-SHA256 token (base64url payload + hex(HMAC-SHA256)). Should we keep that or use a standard JWT library?

**Decision**: **Replace with `jose` HS256 JWT.** `issueSession` signs with `SignJWT`, `verifySession` uses `jwtVerify`. Both are in `packages/billing/src/auth/siwe.ts`. `jose` is added as an explicit dependency of `@tokagentos/billing` because it is not a transitive dep of anything else in the monorepo.

**Reasoning**: Standard JWT has built-in expiry (`exp` claim), algorithm header (`alg`), and broad ecosystem support. The hand-rolled token requires manual expiry and parsing logic. `jose` is the de-facto JWT library in the Node.js ecosystem (used by Auth.js, Cloudflare Workers, etc.) and is audited.

**Reversibility**: `issueSession` and `verifySession` are the only call sites. Swapping the implementation does not affect callers.

**Owner-type**: Backend eng

---

## Z30 — Phase 6 config envs (Phase 6a)

**Question (Phase 6a)**: Which new environment variables does Phase 6 add, and what are their defaults/validation rules?

**Decision**: **Eleven new envs added to `BillingConfigSchema`:**

| Env | Type | Default | Notes |
|-----|------|---------|-------|
| `BILLING_ENABLED` | bool | `false` | Master gate; disables all billing when false |
| `BILLING_AUTH_REQUIRED` | bool | `true` | When false: dev x-dev-wallet escape active |
| `BILLING_AUTH_SECRET` | string | — | Required when ENABLED && AUTH_REQUIRED |
| `BILLING_AUTH_SESSION_TTL_MS` | ms | 86400000 (24h) | JWT lifetime |
| `BILLING_AUTH_LOGIN_NONCE_TTL_MS` | ms | 300000 (5min) | SIWE nonce TTL |
| `BILLING_RATE_LIMIT_ENABLED` | bool | `true` | Token-bucket gate |
| `BILLING_RATE_LIMIT_QUOTE_PER_MIN` | int | 60 | Nonce/quote bucket capacity |
| `BILLING_RATE_LIMIT_SETTLE_PER_MIN` | int | 30 | Settle/commit bucket capacity |
| `BILLING_TOPUP_AMOUNT_PTON` | bigint | 5e18 | Default top-up in atto-PTON |
| `BILLING_LITELLM_BASE_URL` | url | — | Optional LiteLLM proxy URL |
| `BILLING_LITELLM_API_KEY` | string | — | LiteLLM auth key |

Cross-validation rule: `BILLING_ENABLED=true && BILLING_AUTH_REQUIRED=true → BILLING_AUTH_SECRET required`. Enforced in `loadBillingConfig` after Zod parse. Chain-write fields (`BILLING_CHAIN_RPC_URL`, etc.) are also cross-validated as required when `BILLING_ENABLED=true`.

**Reasoning**: Moving `BILLING_ENABLED` into Zod eliminates the cast workaround in `initBillingPlugin`. All 11 new fields follow the existing `numFromEnv` / bool-transform patterns.

**Reversibility**: Additive — removing BILLING_ENABLED just restores the always-enabled behaviour.

**Owner-type**: Backend eng

---

## Z31 — BILLING_ENABLED=false is a silent no-op (Phase 6a)

**Question (Phase 6a)**: When `BILLING_ENABLED=false` (the default), what happens?

**Decision**: **All billing infrastructure is skipped.** `Plugin.init` returns early without constructing a pool, running migrations, or calling `setBillingState`. Services still register (they check `isBillingStateInitialized()` via the `_runtime-deps.ts` fallback and construct a per-service pool only if called directly), but routes return 503. The BILLING_HOOK seam in server.ts passes through when `state.billingMiddleware` is null (the default).

**Reasoning**: An agent that doesn't set `BILLING_ENABLED=true` should not need a Postgres database at all. The zero-config path must work. The 503 on auth routes communicates to the operator that billing is not configured rather than returning unexpected errors.

**Reversibility**: Trivial.

**Owner-type**: Backend eng

---

## Z32 — Routes use `rawPath: true` (Phase 6a)

**Question (Phase 6a)**: elizaOS plugin routes default to mounting at `/<plugin-name>/<path>`. The billing routes need to be at `/v1/auth/*` and `/v1/keys`. How?

**Decision**: **All billing routes set `rawPath: true`.** This tells `tryHandleRuntimePluginRoute` to mount at the exact `path` string without prepending the plugin name. Auth routes and key routes both use this flag.

**Reasoning**: The `/v1/` path prefix is the established API contract for the LLM gateway. Changing it would break clients. `rawPath: true` is documented in the `BaseRoute` interface and is already used by other plugins (e.g., Telegram setup).

**Reversibility**: Remove the flag to revert to prefixed paths.

**Owner-type**: Backend eng

---

## Z33 — BillingMiddlewareService: late-bind via runtime service registry (Phase 6b)

**Question (Phase 6b)**: How does `packages/agent/src/api/server.ts` get the `applyBillingMiddleware` function to populate `state.billingMiddleware` for the BILLING_HOOK seam, without creating a hard circular import from `plugin-tokagent-billing` into `@tokagentos/agent`?

**Decision**: **Service registry late-bind.** `BillingMiddlewareService` (serviceType = `"tokagent-billing-middleware"`) is registered as an elizaOS Service in `tokagentBillingPlugin.services`. After the runtime loads, `server.ts` calls `runtime.getService("tokagent-billing-middleware")` and reads `.middleware` to populate `state.billingMiddleware`. No hard import from `plugin-tokagent-billing` into `@tokagentos/agent`.

**Where the bind happens**: `bindBillingMiddleware(runtime, state)` is called in three places in server.ts:
1. At initial boot, after the `wireCoordinatorBridgesWhenReady` block (when `opts.runtime` is present).
2. Inside `updateRuntime()` (hot-swap / restart via external runtime manager).
3. Inside `restartRuntime()` (inline restart triggered by plugin manager).

**Reasoning**: The service registry is the standard elizaOS decoupling mechanism between plugins and the agent server. A hard import would create a circular dependency (`@tokagentos/agent` → `plugin-tokagent-billing` → `@tokagentos/core` → `@tokagentos/agent`). The late-bind approach is consistent with how other server-side services (plugin_manager, core_manager, coding-agent bridges) are resolved.

**Reversibility**: Remove `BillingMiddlewareService` and replace with a direct `state.billingMiddleware` assignment in `initBillingPlugin`. Requires a hard import but eliminates one service registration.

**Owner-type**: Backend eng

---

## Z34 — commit/release forwarding to chat-routes (Phase 6b)

**Question (Phase 6b)**: The BILLING_HOOK gate (server.ts, Decision Z27) returns `gate.commit` and `gate.release` closures. These must be called after the LLM response is sent (commit) or after a failure (release). How are they forwarded to the `/v1/messages` and `/v1/chat/completions` handlers in `chat-routes.ts`?

**Decision**: **Extend `ChatRouteContext`** (the per-request arg struct, not the shared `ChatRouteState`) with optional `billingCommit?` and `billingRelease?` fields. In server.ts, after the BILLING_HOOK check, the closures are stored in `_billingCommit` / `_billingRelease` locals and passed into the `handleChatRoutes({...})` call. Inside `chat-routes.ts`, all four LLM dispatch code paths (streaming success, streaming error, non-streaming success, non-streaming error) call `billingCommit(0)` or `billingRelease(outcome)`.

**Why `ChatRouteContext` not `ChatRouteState`**: `ChatRouteState` is shared across concurrent requests — mutating it per-request would create race conditions. `ChatRouteContext` is constructed fresh per-request and is the natural per-request scope.

**Reasoning**: This is the minimal change that avoids concurrency issues, requires no WeakMap or socket annotation, and keeps the billing calls colocated with the LLM dispatch logic where they semantically belong.

**Reversibility**: Remove the `billingCommit`/`billingRelease` fields from `ChatRouteContext` and the call sites in `chat-routes.ts`. The server.ts captures become no-ops.

**Owner-type**: Backend eng

---

## Z35 — Route tests: gate-level, no full agent boot (Phase 6b)

**Question (Phase 6b)**: How should the billing route handlers be tested, given that the agent runtime is not available in the billing plugin test suite?

**Decision**: **Direct handler invocation via PGLite test harness.** Route handler functions are called directly (bypassing the elizaOS plugin route dispatch) with a `makeRes()` stub. The billing state is seeded via `setBillingState()` with a PGLite database (from `createTestDb()`). Auth is mocked via `x-dev-wallet` with `authRequired: false` (dev mode). Chain calls (settle, preauth settle) are tested at the 400/404 boundary only — no actual EVM transactions.

**Reasoning**: A full agent boot requires the runtime, Postgres, and chain clients. The handler functions are pure enough to test in isolation once billing state is seeded. The PGLite harness already exists from Phase 5 tests and provides the full schema. Gate-level tests (auth, validation, not-found) give high confidence without infrastructure complexity.

**Reversibility**: Replace with integration tests that spin up a real server if higher fidelity is required.

**Owner-type**: Backend eng

---

## Z36 — No new envs in Phase 6b (Phase 6b)

**Question (Phase 6b)**: Does Phase 6b introduce any new environment variables?

**Decision**: **No new envs.** All environment variables required by Phase 6b routes were already introduced in Phase 6a (Z30): `BILLING_RATE_LIMIT_SETTLE_PER_MIN` covers the settle rate limiter; chain envs cover the topup settle path; `BILLING_TOPUP_AMOUNT_PTON` and `BILLING_FIXED_TON_USD` cover the quote/estimate paths. The `BillingMiddlewareService` and `commit`/`release` wiring add no new configuration surface.

**Reasoning**: All Phase 6b functionality was anticipated when designing Phase 6a's config schema. Adding new envs mid-phase would require revisiting the Zod schema, documentation, and all deployment checklists. The existing envs are sufficient.

**Reversibility**: N/A — no env additions to revert.

**Owner-type**: Backend eng

---

## Z37 — Forward pre-parsed body via `ChatRouteContext.prefetchedBody` (Phase 6c)

**Question (Phase 6c)**: The BILLING_HOOK in `server.ts` consumes the request body via `await readJsonBody(req, res)` to feed it to the gate. The downstream chat-routes handlers call `readJsonBody(req, res)` again for the same `IncomingMessage`. Reading a Node `IncomingMessage` stream twice attaches `data`/`end` listeners to a stream that has already finished emitting — the second `readJsonBody` Promise never resolves, hanging every billed request. How is this fixed?

**Decision**: **Forward the pre-parsed body through `ChatRouteContext.prefetchedBody`.** The seam in `server.ts` captures the body once (`_billingBody = await readJsonBody(req, res)`) and forwards it as an additional field on the `handleChatRoutes` argument object. Inside both `/v1/chat/completions` and `/v1/messages` handlers, the body is read via `(prefetchedBody as Record<string, unknown> | undefined) ?? await readJsonBody(...)` — using the pre-parsed value when present, falling back to a fresh read when the seam did not run (e.g., billing disabled).

**Alternatives considered and rejected**:
1. **Cache on the `IncomingMessage`** via a symbol property — monkey-patches an internal Node object; conflicts with framework helpers; hard to test.
2. **`http-helpers.ts` body cache by request id** — adds a global side-effect map that needs eviction on close/error; trickier to reason about than a single per-request handoff.
3. **Re-stream the body** by buffering it server-side and creating a new readable for chat-routes — adds memory pressure and code complexity for zero functional benefit.

**Reasoning**: The explicit forwarding model keeps the body lifetime tied to the per-request `ChatRouteContext` object, which is naturally garbage-collected when the request ends. No global state, no monkey-patching, no extra reads. The change is local to two files (`server.ts` and `chat-routes.ts`) and is type-safe via the new `prefetchedBody?: unknown` field on `ChatRouteContext`.

**Reversibility**: Remove the `prefetchedBody` field from `ChatRouteContext`, restore double-read at chat-routes call sites — but doing so reintroduces the production hang bug; reversal would require eliminating the BILLING_HOOK seam entirely.

**Owner-type**: Backend eng

---

## Z38 — `commit(actualUsd, params)` extended signature for call_log writing (Phase 6c)

**Question (Phase 6c)**: `billing_call_log` exists in the schema since Phase 4 but has zero writers. Where should the writer live: in `chat-routes.ts` directly (requires importing schema/db into the agent package), in the plugin's commit closure (cleanly encapsulated but changes the public commit signature), or as a separate service the route handler calls?

**Decision**: **Extend the `commit` closure signature to accept optional usage params.** The new signature is `commit(actualUsd: number, params?: BillingCommitParams) => Promise<void>`. When `params` is provided, the gate (in `plugin-tokagent-billing`) writes a `billing_call_log` row alongside the ledger commit. When omitted (backward-compatible default), the commit still applies but no audit row is created.

**Params shape**: `{ inputTokens?, outputTokens?, cacheInputTokens?, cacheCreationTokens?, model?, status? }`. Chat-routes maps from `ChatGenerationResult.usage` (which has `promptTokens`/`completionTokens` OpenAI-style aliases) into this shape and runs the result through `computeActualCostUsd()` before passing it to the closure.

**Failure mode**: If the `callLog.insert` fails after the ledger commit succeeded, the gate logs a warning but does NOT roll back the commit. The reservation is already committed; refunding it because an audit row failed to write would be worse than missing a single audit row. Operators who care about completeness can grep logs for the warning and reconcile manually.

**Alternatives considered and rejected**:
1. **Direct insert in `chat-routes.ts`** — requires importing `callLog` schema and `db` into the agent package; mixes data-access concerns into the HTTP layer; and complicates the test surface (chat-routes tests would need a real billing DB).
2. **Separate `recordCallLog()` service** — adds a third closure to thread through, doubles the number of round-trips chat-routes must make.
3. **Auto-derive usage from runtime telemetry** — runtime doesn't have per-request usage hooks, so this would require new infrastructure outside scope.

**Module boundary**: This decision also formalizes `@tokagentos/billing` as a runtime dependency of `@tokagentos/agent` (added to `packages/agent/package.json`). The agent imports `computeActualCostUsd` to convert the runtime's character-count usage estimates into USD before calling `commit(actualUsd, params)`. The plan's §"Module-boundary rationale" anticipated this: billing is a pure library, the agent consumes its public API.

**Reasoning**: The commit closure is the only code path that already has the full request context (wallet, requestId, model, reservationId). Extending it with optional usage params is the smallest change that gives the gate everything it needs to write a complete call_log row. The optionality preserves the existing test suite (147 tests on the gate continue to pass without changes).

**Reversibility**: Drop the `params` parameter from the commit signature — backward-compatible removal. The `billing_call_log` table would no longer be populated, but no schema changes are needed.

**Owner-type**: Backend eng

---

## Z39 — View location and signing library for Phase 7 UI (Phase 7)

**Question (Phase 7)**: Should the four billing React views live under `views/billing/` (matching a hypothetical future convention) or `components/pages/billing/` (matching the existing app-core pattern)? And should EIP-3009 signing use wagmi/viem or ethers v6?

**Decision**: **`components/pages/billing/`** — matches every other page-level view in app-core (SettingsView, InventoryView, etc.). Creating a `views/` directory for billing only would introduce an inconsistency. **ethers v6** (`signer.signTypedData`) — already listed in `packages/app-core/package.json` as both a runtime and dev dependency; no new deps needed. wagmi/viem are not available in app-core.

**Alternatives considered and rejected**:
1. `views/billing/` — no existing precedent in app-core; would require updating all import paths.
2. wagmi — not installed in app-core; would add a heavy runtime dependency.
3. Manual `eth_signTypedData_v4` — verbose, error-prone, unmaintainable compared to the ethers typed-data API.

**Reversibility**: Move files to `views/billing/` — update index.ts barrel and App.tsx imports.

**Owner-type**: Frontend eng

---

## Z40 — Unauthenticated `GET /v1/billing/status` endpoint (Phase 7)

**Question (Phase 7)**: The frontend needs to know whether the billing plugin is active before rendering the Billing nav tab. How should the app-core discover this at boot without a logged-in user?

**Decision**: **Add `GET /v1/billing/status` as a public (unauthenticated) endpoint** in `auth-routes.ts`. The handler returns `{ enabled: false }` if `isBillingStateInitialized()` is falsy, or `{ enabled: config.enabled }` otherwise. The route is registered with `rawPath: true` and `public: true` so it bypasses JWT middleware. App.tsx fetches this once after mount and sets local `billingEnabled` state; the billing nav tab only appears when `billingEnabled === true`.

**Alternatives considered and rejected**:
1. **Include in the existing `/api/health` or `/api/status` endpoint** — that endpoint is in a different package and doesn't have access to billing plugin state.
2. **Gate via a VITE build-time flag** — the billing plugin can be installed/uninstalled at runtime; a build-time flag would require rebuilding the frontend on each change.
3. **Always show the billing tab** — would show an empty/broken tab when billing is not installed.

**Reversibility**: Remove the route and the `billingEnabled` state in AppContext.tsx; hide the Billing tab group from ALL_TAB_GROUPS.

**Owner-type**: Backend + Frontend eng

---

## Z41 — ethers v6 typed-data signing method for EIP-3009 (Phase 7)

**Question (Phase 7)**: ethers v6 has two typed-data signing paths: `signer._signTypedData` (deprecated) and `signer.signTypedData`. Which should be used, and how should the 65-byte output signature be decomposed into `{v, r, s}` for the backend?

**Decision**: **`signer.signTypedData(domain, types, message)`** — the public stable API in ethers v6. The returned hex string is 0x-prefixed, 132 chars (65 bytes): `r` (bytes 0–31), `s` (bytes 32–63), `v` (byte 64). The `decomposeSignature()` helper in `eip712-utils.ts` performs this split. The domain is taken directly from the `POST /v1/topup/quote` response (which already includes `chainId` and `verifyingContract`), so the frontend does not need a separate info endpoint.

**Wire-format compatibility**: Verified against the backend's `verifyEip3009Signature()` (viem). ethers v6 and viem both produce DER-normalized ECDSA signatures; the `{v, r, s}` decomposition is identical.

**Alternatives considered and rejected**:
1. `signer._signTypedData` — deprecated since ethers v5 interop shim; will be removed.
2. Manual `eth_signTypedData_v4` JSON-RPC call — bypasses ethers validation, requires manual domain serialisation.

**Reversibility**: Replace with viem `signTypedData` if viem is added as a dependency in the future.

**Owner-type**: Frontend eng

---

## Z42 — Test framework for Phase 7 billing views (Phase 7)

**Question (Phase 7)**: The billing views use `fetch()` for all data. Should tests use MSW (mock service worker), a custom fetch stub, or `vi.mock` on the fetch global?

**Decision**: **`vi.stubGlobal("fetch", vi.fn(...))` per test** — the simplest approach that works with vitest (the test runner already used in app-core). MSW adds a dependency and Service Worker setup that is unnecessary for unit-level view tests. The views have no internal fetch abstraction, so module-level `vi.mock` is not applicable. The `@testing-library/react` + vitest combination (already in package.json) is sufficient.

**Test scope**: Each view has one test file covering: loading skeleton, data display, error states (401/network), and key user interactions. `eip712-utils.test.ts` covers pure utility functions independently.

**Alternatives considered and rejected**:
1. **MSW** — adds `msw` as a dev dependency; requires a browser environment setup; overkill for 4 view files.
2. **Wrapping fetch in a module** — would require refactoring all four view files; no other views use this pattern.

**Reversibility**: Replace `vi.stubGlobal` calls with MSW handlers if integration-level testing is desired.

**Owner-type**: Frontend eng
