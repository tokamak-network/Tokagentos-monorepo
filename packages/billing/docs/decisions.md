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
