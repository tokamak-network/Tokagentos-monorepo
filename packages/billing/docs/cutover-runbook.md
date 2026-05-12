# Cutover Runbook — llm-api-gateway → tokagentos billing

**Audience**: operator(s) running the cutover.
**Reading time**: ~15 min.
**Execution time**: ~30 days (drain window) + 1 day active cutover.

---

## 0. Glossary

| Term | Definition |
|---|---|
| **Source** | `llm-api-gateway` — the Node/Hono proxy being decommissioned |
| **Target** | `tokagentos` monorepo with `BILLING_ENABLED=true` |
| **Drain** | 30-day window during which the source returns 410 Gone and customers migrate |
| **Operator** | The Ethereum address holding `BILLING_OPERATOR_PRIVATE_KEY`; the vault's registered operator |
| **T+0** | The moment the DNS/load-balancer is flipped; source stops serving production traffic |
| **T-N** | N calendar days before T+0 |
| **Vault** | The `ClaudeVault` contract; holds on-chain credits per wallet |
| **atto-PTON** | The smallest unit of PTON (1 PTON = 10^18 atto-PTON). All amounts in this doc are atto-PTON unless stated otherwise |
| **Consistency check** | The `check-ledger-consistency.ts` script (Section 6) |

---

## 1. Pre-cutover (T-30 days)

### 1.1 Inventory

List all customer-facing endpoints currently served by `llm-api-gateway`. The known set is:

```
POST /v1/messages            → LLM passthrough (billed)
GET  /v1/auth/nonce          → SIWE nonce issue
POST /v1/auth/login          → SIWE verify → session JWT
POST /v1/keys                → mint sk-ai-* API key
GET  /v1/keys                → list keys
DELETE /v1/keys/:id          → revoke key
GET  /v1/credits/me          → wallet balance
GET  /v1/topup/info          → EIP-712 domain info
POST /v1/topup/quote         → deposit quote
POST /v1/topup/settle        → EIP-3009 deposit
POST /v1/topup/preauth       → pre-signed batch slot
GET  /v1/topup/status        → quote status
POST /v1/topup/revoke        → revoke preauth slot
GET  /v1/usage/summary       → usage stats
GET  /v1/usage/calls         → paginated call log
GET  /v1/usage/keys          → key-level usage
POST /v1/estimate            → cost estimate
POST /v1/messages/count_tokens → token count
GET  /v1/price               → current TWAP snapshot
GET  /v1/billing/status      → billing plugin status (Phase 7 addition)
```

Confirm all routes above are operational in the target staging deployment before proceeding.

### 1.2 Customer comms — 30-day deprecation announcement

Send to all active customers (identified by `billing_api_keys.wallet` or from source's in-memory key store before restart):

```
Subject: llm-api-gateway migration — action required by [T+0 + 7 days]

We are migrating the LLM billing gateway to a new endpoint.

Old endpoint:  https://<source-host>/
New endpoint:  https://<target-host>/

Timeline:
  [T-30]  Old endpoint starts returning 410 Gone on /v1/messages.
           All other API routes continue to work for the drain window.
  [T+0]   Traffic fully on new endpoint.
  [T+7]   Old API keys (sk-ai-*) expire — MANDATORY RE-MINT required.
  [T+30]  Source permanently archived.

ACTION REQUIRED:
  1. Update your endpoint URL to the new host.
  2. Re-mint your API key at https://<target-host>/v1/keys (requires SIWE re-login).
     Old keys are INVALID on the new endpoint (different AUTH_SECRET — see Section 2.2).
  3. Existing PTON credits are fully preserved on-chain — no action needed.
```

### 1.3 Mandatory API key re-mint communication

The new deployment uses a fresh `BILLING_AUTH_SECRET` (different from the source's `AUTH_SECRET`). Consequences:

- All existing `sk-ai-*` keys issued by the source are **invalid on the target** — they are HMAC'd with a different secret.
- All existing SIWE JWTs from the source are **invalid on the target**.
- Customers must re-login via SIWE and re-mint their API keys.

This is documented in the integration plan §"Cutover & Decommission — Secrets migration" and Decision Z43 (OQ9). On-chain credit balances are **not affected** — they live in the vault contract, not in session state.

### 1.4 Validate target deployment in staging with `BILLING_ENABLED=true`

Deploy the target to a staging environment with:

```bash
BILLING_ENABLED=true
BILLING_AUTH_REQUIRED=true
BILLING_AUTH_SECRET=<staging-secret>
BILLING_VAULT_ADDRESS=<vault-address>
BILLING_PTON_ADDRESS=<pton-address>
BILLING_OPERATOR_PRIVATE_KEY=<operator-key>
BILLING_CHAIN_RPC_URL=<rpc-url>
BILLING_CHAIN_ID=<chain-id>
BILLING_MAINNET_RPC_URL=<mainnet-rpc-url>
BILLING_DATABASE_URL=postgres://user:pass@host:5432/billing_staging
```

Run the smoke test from Phase 7:

```bash
# 1. Get SIWE nonce
curl -s https://<staging-host>/v1/auth/nonce

# 2. Sign the nonce with a test wallet (cast or browser wallet)
# 3. POST to /v1/auth/login → get JWT

# 4. Mint API key
curl -X POST https://<staging-host>/v1/keys \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name": "staging-test"}'

# 5. Top-up via EIP-3009 (use the UI at /billing/topup or script)

# 6. Send a billed request
curl -X POST https://<staging-host>/v1/chat/completions \
  -H "x-api-key: sk-ai-..." \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-5-sonnet-20241022", "messages": [{"role": "user", "content": "hi"}]}'

# 7. Check usage appeared
curl https://<staging-host>/v1/usage/calls \
  -H "x-api-key: sk-ai-..."
```

**Gate**: all 7 steps succeed without errors.

### 1.5 Run ledger consistency check on staging — must pass

See Section 6 for the full script. On staging:

```bash
BILLING_DATABASE_URL=postgres://...staging... \
BILLING_VAULT_ADDRESS=<vault-address> \
BILLING_CHAIN_RPC_URL=<rpc-url> \
bun run --cwd packages/billing check-ledger
```

**Gate**: exit code 0, "Drift > tolerance: 0" in output.

---

## 2. Secrets migration (T-7 days)

Per integration plan §"Cutover & Decommission — Secrets migration":

### 2.1 Operator private key

```bash
# Source env variable name
OPERATOR_PRIVATE_KEY=<key>

# Target env variable name  
BILLING_OPERATOR_PRIVATE_KEY=<same key>
```

**Same key, new env var name.** No `setOperator` migration transaction required (Decision Z43, per OQ9). The vault's registered operator address is unchanged.

Verify by running this on both deployments before cutover:

```bash
# Source (Node)
node -e "const { Wallet } = require('ethers'); console.log(new Wallet(process.env.OPERATOR_PRIVATE_KEY).address)"

# Target (Bun)
bun -e "import { privateKeyToAccount } from 'viem/accounts'; console.log(privateKeyToAccount(process.env.BILLING_OPERATOR_PRIVATE_KEY).address)"
```

Both must print the same Ethereum address.

**If the team decides to rotate the operator key**: call `vault.setOperator(<new-address>)` before T+0. This is a one-time migration transaction. Update `BILLING_OPERATOR_PRIVATE_KEY` to the new key at the same time.

### 2.2 Auth secret

```bash
# Generate a fresh secret for the target — do NOT reuse the source's AUTH_SECRET
export BILLING_AUTH_SECRET=$(openssl rand -hex 32)
echo $BILLING_AUTH_SECRET  # save this to your secrets manager
```

This secret is used to sign SIWE session JWTs and to HMAC `sk-ai-*` API keys. It is **different** from the source's `AUTH_SECRET`. Existing source sessions and API keys are invalidated at cutover — this is the intended behavior (mandatory re-mint, see Section 1.3).

### 2.3 LiteLLM API key

```bash
# Reused verbatim if the upstream LiteLLM instance is unchanged
BILLING_LITELLM_API_KEY=<same as LITELLM_API_KEY in source>
BILLING_LITELLM_BASE_URL=<same as LITELLM_BASE_URL in source>
```

Verify upstream connectivity from the target before T+0:

```bash
curl -X POST $BILLING_LITELLM_BASE_URL/v1/chat/completions \
  -H "Authorization: Bearer $BILLING_LITELLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-5-sonnet-20241022", "messages": [{"role": "user", "content": "ping"}]}'
```

### 2.4 TWAP pool addresses

Same Uniswap V3 pool addresses on Ethereum mainnet — copy verbatim from source's config into target's environment. Addresses are in `packages/billing/src/chain/addresses.ts`:

```bash
BILLING_MAINNET_RPC_URL=<ethereum-mainnet-rpc-url>
# Pool addresses are hardcoded in addresses.ts per Decision Z5 — no env vars needed
```

Verify TWAP is working after target start:

```bash
curl https://<target-host>/v1/price
# Expected: { "tonUsd": <number>, "ts": <unix-ms>, "source": "twap" }
```

### 2.5 Operator address parity (Decision Z43 / OQ9)

Per Decision Z43: the operator address is **reused** at cutover. No `setOperator` transaction is needed unless the team explicitly decides to rotate. If a rotation is needed, perform it as a separate step in Section 3.1 before traffic is migrated.

### 2.6 Required vault state pre-checks

Run these read calls against the production vault before cutover:

```bash
# Check vault operator registration
cast call $BILLING_VAULT_ADDRESS "operator()(address)" --rpc-url $BILLING_CHAIN_RPC_URL

# Check current total outstanding credits (should match sum of source's in-memory balances)
cast call $BILLING_VAULT_ADDRESS "totalCreditsOutstanding()(uint256)" --rpc-url $BILLING_CHAIN_RPC_URL

# Spot-check a known wallet
cast call $BILLING_VAULT_ADDRESS "credits(address)(uint256)" $KNOWN_WALLET_ADDRESS --rpc-url $BILLING_CHAIN_RPC_URL
```

**Gate**: operator address matches `BILLING_OPERATOR_PRIVATE_KEY`'s derived address (Section 2.1).

---

## 3. Deploy target with `BILLING_ENABLED=true` (T-1 day)

### 3.1 Set all required env vars

Copy from `.env.example` at `packages/billing/src/config.ts` or from the template below:

```bash
# Core billing
BILLING_ENABLED=true
BILLING_AUTH_REQUIRED=true
BILLING_AUTH_SECRET=<generated in Section 2.2>
BILLING_DATABASE_URL=postgres://user:pass@host:5432/billing_production

# Chain — vault
BILLING_CHAIN_RPC_URL=<rpc-url>
BILLING_CHAIN_ID=<chain-id>
BILLING_VAULT_ADDRESS=<vault-address>
BILLING_PTON_ADDRESS=<pton-address>
BILLING_OPERATOR_PRIVATE_KEY=<key from Section 2.1>

# Chain — TWAP (Ethereum mainnet)
BILLING_MAINNET_RPC_URL=<eth-mainnet-rpc-url>

# Workers (safe defaults below; override if needed)
BILLING_CONSUME_BATCH_MIN_PTON=500000000000000000
BILLING_CONSUME_MAX_AGE_MS=300000
BILLING_CONSUME_SCAN_INTERVAL_MS=30000
BILLING_CONSUME_MAX_PER_CYCLE=10
BILLING_USAGE_RETENTION_DAYS=90
```

### 3.2 Deploy with plugin-tokagent-billing loaded

```bash
cd tokagentos
bun install
bun run build --filter=@tokagentos/billing
bun run build --filter=@tokagent/plugin-tokagent-billing
# Then start the agent runtime with billing plugin in runtime config
```

Drizzle migrations apply automatically during `Plugin.init` — no manual `drizzle-kit migrate` step is needed in production.

### 3.3 Verify Drizzle migrations applied

After first boot, confirm all billing tables exist:

```bash
psql $BILLING_DATABASE_URL -c "\dt billing_*"
# Expected: 8 tables: billing_api_keys, billing_auth_nonces, billing_call_log,
#   billing_consume_batches, billing_credit_state, billing_reservations,
#   billing_topup_preauth_slots, billing_topup_quotes
```

### 3.4 Health checks

Run each of the following and verify the expected response:

```bash
# 1. Billing plugin active
curl https://<target-host>/v1/billing/status
# Expected: { "enabled": true }

# 2. TWAP oracle running
curl https://<target-host>/v1/price
# Expected: { "tonUsd": <number>, "ts": <unix-ms>, "source": "twap" | "cache" }

# 3. Auth nonce endpoint working
curl https://<target-host>/v1/auth/nonce
# Expected: { "nonce": "<hex>", "domain": {...}, "message": {...} }

# 4. Credits endpoint returns sane data for a known test wallet
curl https://<target-host>/v1/credits/me \
  -H "Authorization: Bearer <valid-jwt>"
# Expected: { "balance": "<atto-pton>", "reserved": "0", "accrued": "0" }
```

**Gate**: all 4 checks return expected responses.

### 3.5 Shadow deployment — zero traffic on target

Keep the source proxy serving all production traffic. The target deployment receives zero live traffic at this point. This allows the soak test (Section 4) to proceed without customer impact.

---

## 4. Soak test (T-1 to T+0)

### 4.1 Synthetic load

Send ~100 test calls through the target with a dedicated test wallet:

```bash
# Use a test wallet whose credits have been pre-funded on staging/testnet
for i in $(seq 1 100); do
  curl -s -X POST https://<target-host>/v1/chat/completions \
    -H "x-api-key: sk-ai-<test-key>" \
    -H "Content-Type: application/json" \
    -d '{"model": "claude-3-haiku-20240307", "messages": [{"role": "user", "content": "hi '$i'"}]}' \
    > /dev/null
done
```

### 4.2 Verify call log rows appear

```bash
psql $BILLING_DATABASE_URL -c \
  "SELECT COUNT(*) FROM billing_call_log WHERE wallet = '<test-wallet>' AND ts > NOW() - INTERVAL '1 hour';"
# Expected: 100 (or close, depending on errors)
```

### 4.3 Verify accrued balance grows

```bash
psql $BILLING_DATABASE_URL -c \
  "SELECT wallet, balance, reserved, accrued FROM billing_credit_state WHERE wallet = '<test-wallet>';"
# Expected: accrued > 0
```

### 4.4 Worker check — observe consume worker flush

Wait for `BILLING_CONSUME_BATCH_MIN_PTON` threshold (default 0.5 PTON) or `BILLING_CONSUME_MAX_AGE_MS` (default 5 min) to trigger the consume worker. Watch the consume-worker log:

```
[ConsumeService] wallet=<test-wallet> amount=<atto-pton> batchId=<hex> — submitting vault.consumeCredits
[ConsumeService] wallet=<test-wallet> txHash=<hash> block=<N> — confirmed
```

Verify on-chain:

```bash
cast call $BILLING_VAULT_ADDRESS "credits(address)(uint256)" <test-wallet> --rpc-url $BILLING_CHAIN_RPC_URL
# Expected: decreased by the accrued amount
```

### 4.5 Ledger consistency check — must pass

```bash
BILLING_DATABASE_URL=<production-db> \
BILLING_VAULT_ADDRESS=<vault-address> \
BILLING_CHAIN_RPC_URL=<rpc-url> \
bun run --cwd packages/billing check-ledger
# Expected: exit 0, "Drift > tolerance: 0"
```

### 4.6 Soak gate

**If anything fails in steps 4.1–4.5: defer cutover.** Investigate and fix before proceeding to T+0. Common failure modes:

- Accrued balance not growing → billing gate not firing; check `BILLING_ENABLED=true` and middleware wiring at `BILLING_HOOK` seam.
- Consume worker not flushing → check `BILLING_CONSUME_BATCH_MIN_PTON` threshold relative to test call cost; lower it for testing.
- Ledger drift → check DB/chain sync; may indicate a Phase 4 bug; escalate before cutover.

---

## 5. Active cutover (T+0)

### 5.1 Stop accepting new traffic on source

On the source proxy (`llm-api-gateway`), update the `/v1/messages` handler to return:

```
HTTP 410 Gone
Deprecation: true
Sunset: <T+30 date in RFC 5322 format>
Content-Type: application/json

{"error": "This endpoint is deprecated. Please migrate to https://<target-host>/v1/messages"}
```

**This is a source-side change** — outside this monorepo. The source repo's `proxy/src/server.ts` needs to be updated. Do this BEFORE flipping DNS so in-flight requests complete naturally.

### 5.2 Drain in-flight requests on source

Wait ~5 minutes for any in-flight streaming requests to complete on the source.

```bash
# Monitor source access logs for active /v1/messages requests
tail -f /var/log/llm-api-gateway/access.log | grep "POST /v1/messages"
# Wait until no new 200 responses for 5 minutes
```

### 5.3 Flip DNS / load balancer to target

Update your DNS record or load-balancer target to point to the target host. The TTL should be low (60s recommended) for this operation.

```bash
# Example for a DNS-based flip (replace with your actual DNS tooling)
dns-cli set <api-hostname> <target-ip>

# Or for a load balancer
lb-cli switch --from <source-target> --to <target-target>
```

### 5.4 Source enters deprecation mode

The source proxy now returns 410 Gone on `/v1/messages`. Other routes (auth, keys, topup) may continue to work during the drain window so customers can query their old session data, but new LLM requests must use the target.

(This is a source-side operation — update `llm-api-gateway/proxy/src/server.ts` accordingly before archiving.)

### 5.5 Customer comms — cutover complete

```
Subject: Migration complete — re-mint your API key now

The llm-api-gateway has been successfully migrated to tokagentos.

Your PTON credits are fully intact on-chain.

ACTION REQUIRED: Re-mint your API key at https://<target-host>/v1/keys
  1. Visit https://<target-host>/ and log in with your wallet (SIWE)
  2. Go to Settings → API Keys → Create new key
  3. Replace your old sk-ai-* key in your application

Old keys from the previous gateway are NOT valid on the new endpoint.

Deadline: [T+7]
```

### 5.6 Post-cutover ledger consistency check

Run within 1 hour of the DNS flip:

```bash
BILLING_DATABASE_URL=<production-db> \
BILLING_VAULT_ADDRESS=<vault-address> \
BILLING_CHAIN_RPC_URL=<rpc-url> \
bun run --cwd packages/billing check-ledger
```

**Gate**: exit code 0, "Drift > tolerance: 0".

---

## 6. Ledger consistency validation

Run `bun run --cwd packages/billing check-ledger`. The script:

1. Reads `BILLING_DATABASE_URL`, `BILLING_VAULT_ADDRESS`, `BILLING_CHAIN_RPC_URL` from env.
2. For each wallet in `billing_credit_state`:
   - Reads on-chain `vault.credits(wallet)` via viem.
   - Computes expected: `db.balance + db.reserved + db.accrued`.
   - Reports drift if `|on-chain - expected| > tolerance_atto_pton` (default: 1,000,000 atto-PTON = 0.000001 PTON).
3. Exits 0 if all wallets are consistent; non-zero otherwise.

**Required env**:

```bash
BILLING_DATABASE_URL=postgres://user:pass@host:5432/db
BILLING_VAULT_ADDRESS=0x<vault-address>
BILLING_CHAIN_RPC_URL=https://...
```

**Optional flags**:

```bash
--tolerance-atto=1000000     # drift tolerance in atto-PTON (default: 1_000_000)
--max-rows=10000             # max wallets to check (default: 10_000)
--json                       # machine-readable JSON output
```

**Run schedule**:

| When | Required? | Gate |
|---|---|---|
| Pre-cutover staging (Section 1.5) | Yes | Must pass before proceeding |
| Post-cutover T+0 (Section 5.6) | Yes | Must pass within 1 hour of flip |
| Daily for first 7 days post-cutover | Yes | Alert on any non-zero exit |
| Weekly thereafter | Recommended | Operational hygiene |

**Interpreting output**:

```
Total wallets: 42
Consistent:    41
Drift > tolerance: 1
Largest drift: 0x1234...abcd  18500000000000 atto-PTON
Total drift:   18500000000000 atto-PTON
```

A single drifting wallet with small drift (< 10^15 atto-PTON = 0.001 PTON) may be a timing artifact from the consume worker mid-flush. Wait 60 seconds and re-run. Persistent drift indicates a bug — escalate to the billing team.

---

## 7. Drain window (T+0 to T+30)

### 7.1 Source proxy deprecation headers

The source proxy should be returning 410 Gone on `/v1/messages` (set in Section 5.1). Verify it is running and returning the correct headers:

```bash
curl -I https://<source-host>/v1/messages \
  -X POST -H "Content-Type: application/json" -d '{}'
# Expected: HTTP/1.1 410 Gone, Deprecation: true, Sunset: <date>
```

### 7.2 Monitor billing health metrics

Check daily during the drain window:

```bash
# OTel metric: total billed calls (should trend upward on target)
# Prometheus equivalent: tokagent_billing_calls_total

# Ledger consistency (must stay at 0 drift)
bun run --cwd packages/billing check-ledger

# Consume worker health — no stuck batches
psql $BILLING_DATABASE_URL -c \
  "SELECT state, COUNT(*) FROM billing_consume_batches GROUP BY state;"
# Expected: state='confirmed' most rows; dead_letter=0
```

### 7.3 Archive source call log (Decision Z44)

Per Decision Z44 (OQ6): the source's SQLite call log (`proxy/data/usage.db`) is archived only — not migrated.

```bash
# Backup the SQLite file alongside the source repo archive
sqlite3 /path/to/llm-api-gateway/proxy/data/usage.db ".dump" > usage_db_dump_$(date +%Y%m%d).sql
aws s3 cp usage_db_dump_$(date +%Y%m%d).sql s3://<archive-bucket>/llm-api-gateway/usage_db/
aws s3 cp /path/to/llm-api-gateway/proxy/data/usage.db s3://<archive-bucket>/llm-api-gateway/usage.db

# Tag with cutover date for future reference
aws s3api put-object-tagging \
  --bucket <archive-bucket> \
  --key llm-api-gateway/usage.db \
  --tagging 'TagSet=[{Key=cutover-date,Value='$(date +%Y%m%d)'}]'
```

Customers needing historical usage data can access it via:

```bash
sqlite3 usage.db "SELECT * FROM call_log WHERE wallet = '0x...' ORDER BY ts DESC LIMIT 100;"
```

### 7.4 Bond release watcher

The `WithdrawWatcherService` (Phase 5) continues to serve any pending withdrawals by flushing accrued credits before the vault processes a withdrawal. Confirm it is running:

```
# In application logs (source: billing:workers:withdraw-watcher):
[WithdrawWatcherService] started — watching vault <address> for WithdrawRequested events
```

If a customer's withdrawal is stuck during the drain window:

```bash
# Manually trigger a consume flush for that wallet
psql $BILLING_DATABASE_URL -c \
  "UPDATE billing_credit_state SET first_accrual_at = NOW() - INTERVAL '10 minutes' WHERE wallet = '0x...';"
# The consume worker picks this up on next scan (within BILLING_CONSUME_SCAN_INTERVAL_MS)
```

---

## 8. Decommission (T+30)

### 8.1 Plan validation gate

Confirm all of the following before archiving:

- [ ] Zero production requests to source `/v1/messages` for 7 consecutive days (check source access logs)
- [ ] `check-ledger` exits 0 on the most recent daily run
- [ ] No `billing_consume_batches` rows in `state='pending'` or `state='submitted'` older than 2 hours
- [ ] All known customers have confirmed their API key migration (or the customer deadline has passed)

### 8.2 Archive the llm-api-gateway repo

```bash
# Set the GitHub repo to read-only (archive)
gh repo archive <org>/llm-api-gateway
```

Alternatively, if using another git host: set the repository to "archived" in the host's UI.

**After this step, Section 9 (Rollback) becomes a full migration — the rollback window closes.**

### 8.3 Archive the SQLite call log to cold storage

Verify the archive was completed in Section 7.3. Tag the archive as permanent:

```bash
aws s3api put-object-tagging \
  --bucket <archive-bucket> \
  --key llm-api-gateway/usage.db \
  --tagging 'TagSet=[{Key=status,Value=permanent-archive},{Key=cutover-date,Value='$(date +%Y%m%d)'}]'
```

### 8.4 Update contract addresses if needed (Path A → move to parent tree)

If the Tokamak-AI-Layer parent contracts tree takes ownership of the `ClaudeVault` and `PTON` contracts after archiving:

```bash
# Update the addresses file in the billing package
vi packages/billing/src/chain/addresses.ts
# Update VAULT_ADDRESS and PTON_ADDRESS for each chain

# Rebuild
bun run build --filter=@tokagentos/billing
```

No data migration is needed — the contracts are unchanged; only the reference location of the source files moves.

### 8.5 Remove BILLING_ENABLED feature-flag treatment

Now that billing is the sole production mode, the env var transitions from optional to required:

```bash
# In packages/billing/src/config.ts — the billingEnabled field:
# Change default from false to true (or remove the default entirely and require explicit opt-in/opt-out)
# This is a minor code change; follow the Phase 9+ roadmap for whether to keep the gate at all
```

Update the `.env.example` templates (three-mirror rule — three files):
1. Root `.env.example`
2. `packages/templates/fullstack-app/.env.example`
3. `packages/tokagentos/templates/fullstack-app/.env.example`

Change the `BILLING_ENABLED=false` (commented out) to `BILLING_ENABLED=true` in the "production operations" section, with a note that it is now required for SaaS deployments.

### 8.6 Final cutover comms

```
Subject: Migration complete — llm-api-gateway permanently decommissioned

The llm-api-gateway has been permanently archived. The new tokagentos billing
endpoint is the only active endpoint. Historical usage data is available via
the archive at [link].

If you did not migrate your API key and need assistance, contact [support].
```

---

## 9. Rollback

**ROLLBACK WINDOW CLOSES at T+30** (when the source repo is archived — Section 8.2).

### Before T+30

If a critical issue is discovered before the archive:

**9.1** Un-archive `llm-api-gateway` repo:

```bash
gh repo unarchive <org>/llm-api-gateway
```

**9.2** Revert DNS to source:

```bash
dns-cli set <api-hostname> <source-ip>
```

**9.3** Customer API key compatibility warning

New API keys minted on the target (sk-ai-* keys with the new `BILLING_AUTH_SECRET`) are **invalid on the source**. Customers who already migrated will see 401 errors on the source until they re-mint on the source using their original SIWE session.

Communicate immediately:

```
URGENT: Migration reverting — your new API key from [target-host] will NOT work.
Please re-mint your key at https://<source-host>/v1/keys.
```

**9.4** Ledger state on target

The target's ledger (DB + accruals) is forfeited during rollback, OR manually reconciled:

- **Forfeiture path**: no action needed. Credits are still on-chain in the vault. The source's in-memory ledger will hydrate from the vault on first request (same as before).
- **Manual reconciliation path** (if significant credits were accrued on target but not yet flushed on-chain): export the target's `billing_credit_state` table and manually adjust balances on the source. This is complex and should be a last resort.

### After T+30 (rollback window closed)

Un-archiving the repo is possible but treating it as active production again requires:
- Restoring the source's in-memory state (lost permanently on archive).
- Resolving vault operator and credit state inconsistencies between the two periods.

This is equivalent to a new forward migration. Treat as a new project; allocate sprint capacity accordingly.

---

## 10. Risk register checkpoints

Mapped from plan §"Risk Register":

| Risk | ID | Mitigation in this runbook |
|---|---|---|
| In-memory ↔ DB ledger drift | R1 | Section 6 daily consistency check; Section 4.5 soak gate |
| EIP-3009 nonce / vault topupId reuse during drain | R2 | Section 5.1 fences source writes BEFORE target accepts deposits; the 410 mode prevents any new EIP-3009 flows on source |
| Operator hot-key in cloud profile | R7 | Section 2.1 verifies operator key derivation; cloud profile routes through `packages/agent/src/auth/credentials.ts` OS keychain per Decision Z (see plan Risk R7 mitigation) |
| TWAP staleness during RPC outage | R8 | Section 4.5 + Section 6 alert when `BILLING_MAX_PRICE_STALENESS_MS` exceeded; `tokagent_billing_twap_last_success_age_seconds` OTel meter |
| Existing tokagentos consumers broken by billing gate | R10 | `BILLING_ENABLED=false` remains the safe default; only operator-controlled deployments with explicit `BILLING_ENABLED=true` are affected |
| AUTH_SECRET rotation invalidates existing sessions | (cutover-specific) | Section 1.3 and 1.2 communicate mandatory re-mint window with ample lead time |

---

## Appendix A — Full env var reference

All `BILLING_*` environment variables with defaults and required-when:

| Variable | Default | Required when |
|---|---|---|
| `BILLING_ENABLED` | `false` | Set `true` for production |
| `BILLING_AUTH_REQUIRED` | `true` | `BILLING_ENABLED=true` |
| `BILLING_AUTH_SECRET` | — | `BILLING_ENABLED=true` |
| `BILLING_AUTH_SESSION_TTL_MS` | `86400000` | optional |
| `BILLING_AUTH_LOGIN_NONCE_TTL_MS` | `300000` | optional |
| `BILLING_DATABASE_URL` | — | `BILLING_ENABLED=true` |
| `BILLING_CHAIN_RPC_URL` | — | `BILLING_ENABLED=true` |
| `BILLING_CHAIN_ID` | `1` | optional |
| `BILLING_VAULT_ADDRESS` | — | `BILLING_ENABLED=true` |
| `BILLING_PTON_ADDRESS` | — | `BILLING_ENABLED=true` |
| `BILLING_OPERATOR_PRIVATE_KEY` | — | `BILLING_ENABLED=true` |
| `BILLING_MAINNET_RPC_URL` | — | TWAP oracle |
| `BILLING_TWAP_WINDOW_SECONDS` | `1800` | optional |
| `BILLING_PRICE_CACHE_MS` | `60000` | optional |
| `BILLING_MAX_PRICE_STALENESS_MS` | `600000` | optional |
| `BILLING_FIXED_TON_USD` | — | test override only |
| `BILLING_MARGIN_BPS` | `100` | optional |
| `BILLING_MARGIN_FLOOR_BPS` | — | optional |
| `BILLING_PROMOTION_DISCOUNT_BPS` | `0` | optional |
| `BILLING_TOPUP_AMOUNT_PTON` | `5000000000000000000` | optional |
| `BILLING_CONSUME_BATCH_MIN_PTON` | `500000000000000000` | optional |
| `BILLING_CONSUME_MAX_AGE_MS` | `300000` | optional |
| `BILLING_CONSUME_SCAN_INTERVAL_MS` | `30000` | optional |
| `BILLING_CONSUME_MAX_PER_CYCLE` | `10` | optional |
| `BILLING_RATE_LIMIT_ENABLED` | `true` | optional |
| `BILLING_RATE_LIMIT_QUOTE_PER_MIN` | `60` | optional |
| `BILLING_RATE_LIMIT_SETTLE_PER_MIN` | `30` | optional |
| `BILLING_USAGE_RETENTION_DAYS` | `90` | optional |
| `BILLING_USAGE_CLEANUP_INTERVAL_MS` | `86400000` | optional |
| `BILLING_PRICE_REFRESH_INTERVAL_MS` | `60000` | optional |
| `BILLING_LITELLM_BASE_URL` | — | optional (if separate from LITELLM_BASE_URL) |
| `BILLING_LITELLM_API_KEY` | — | optional |
