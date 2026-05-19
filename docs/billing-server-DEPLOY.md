# tokagent-billing-server — deploy runbook

A tokagentos deployment hosting a billing rail you control. **One** instance
runs with `BILLING_MODE=server`, holding the Postgres connection string and
the operator EOA. CLI users (your team, your customers) run tokagentos
locally with `BILLING_MODE=client` pointing at this URL.

Tokagent billing is self-hosted only. There is no shared hosted gateway —
every operator deploys their own billing server (Postgres + operator EOA).

This document is the operator runbook. The architectural rationale lives in
the conversation history that produced this code; this file is purely the
"what do I run when X happens" reference.

---

## 1. First-time setup

### 1.1 Procure secrets (your responsibility, NOT in any committed file)

| What | Where to get it |
|---|---|
| `BILLING_DATABASE_URL` | Your Postgres (Supabase, Railway, RDS, self-hosted, or any managed provider). If your provider offers a pooled connection endpoint, use it. |
| `BILLING_AUTH_SECRET` | `openssl rand -hex 32` |
| `BILLING_OPERATOR_PRIVATE_KEY` | `cast wallet new`; fund the EOA with ~0.1 ETH on mainnet; grant it `OPERATOR_ROLE` on `ClaudeVault` at `0x1072f70e7c490E460fA72AC4171F7aDD1ef2d79F` via the admin multisig |
| `BILLING_CHAIN_RPC_URL` + `BILLING_MAINNET_RPC_URL` | Alchemy or Infura mainnet API key (one project gives you both URLs) |
| `BILLING_LITELLM_API_KEY` | LiteLLM admin at `https://api.ai.tokamak.network/` |

### 1.2 Provision Postgres

```bash
# Pick any Postgres 14+ provider:
#   - Local dev: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
#   - Managed:   Supabase, Railway, AWS RDS, or any Postgres provider.
#
# If your provider offers a pooled connection endpoint (recommended for
# serverless / multi-machine deployments), use that — it caps the upstream
# connection count and avoids exhausting the DB connection limit.

# Apply migrations once before the first deploy:
cd tokagentos/packages/billing
DATABASE_URL='<your-postgres-url>' bun run drizzle-kit migrate
```

### 1.3 Create the Fly app + DNS

```bash
flyctl auth login
flyctl apps create tokagent-billing-server --region fra

# Push every secret in one batch:
cp tokagentos/scripts/billing-server/.env.prod.example tokagentos/scripts/billing-server/.env.prod
# (fill in the 6 <fill-in> values, then:)
bash tokagentos/scripts/billing-server/setup-secrets.sh

# DNS — point <your-billing-server-domain> at Fly's anycast:
flyctl ips allocate-v4 --app tokagent-billing-server
flyctl ips allocate-v6 --app tokagent-billing-server
flyctl ips list --app tokagent-billing-server   # copy the v4 + v6 addresses
# Then in your DNS provider:
#   A    <your-billing-server-domain> → <IPv4>
#   AAAA <your-billing-server-domain> → <IPv6>
# Wait for propagation (≤5 min), then:
flyctl certs add <your-billing-server-domain> --app tokagent-billing-server
```

### 1.4 GitHub Actions setup

In your GitHub repo (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `FLY_API_TOKEN` | `flyctl tokens create deploy` |
| `BILLING_DATABASE_URL` | Same value as the `BILLING_DATABASE_URL` Fly secret (the workflow uses it to run migrations) |

### 1.5 First deploy (manual sanity check before cutting CI loose)

```bash
flyctl deploy \
  --config tokagentos/apps/billing-server/fly.toml \
  --dockerfile tokagentos/apps/billing-server/Dockerfile \
  --remote-only \
  --strategy bluegreen \
  --app tokagent-billing-server
```

Then probe:

```bash
bun tokagentos/scripts/billing-server/check-readiness.ts \
  https://<your-billing-server-domain> \
  --full
```

All four checks (`agent_health`, `billing_status`, `price_endpoint`,
`auth_nonce`) must pass.

---

## 2. Routine deploy

```bash
# Cut the tag from master after typecheck-billing is green on the PR:
git checkout master && git pull
git tag billing-server-v$(date +%Y.%m.%d).0
git push origin billing-server-v$(date +%Y.%m.%d).0

# GH Actions takes over:
#   1. Typecheck billing surface
#   2. Run Drizzle migrations against PROD Postgres (idempotent)
#   3. flyctl deploy --strategy bluegreen
#   4. Wait 20 s, then run check-readiness.ts --full
# If ANY step fails, prod stays on the previous revision.
```

### Sequencing rule (R-8)

The hosted server MUST deploy BEFORE the CLI plugin v2.0.0 is published.
Otherwise every client-mode CLI 503s globally on every billed call.

The publish step for `@tokagent/plugin-tokagent-billing` is a separate
manual `npm publish` from `tokagentos/plugins/plugin-tokagent-billing/`.
Only publish after `check-readiness.ts --full` against this deploy returns
all-green.

---

## 3. Rollback

```bash
# List revisions:
flyctl releases --app tokagent-billing-server

# Roll back to a known-good version:
flyctl releases rollback <version-number> --app tokagent-billing-server
```

**DB rollback**: Drizzle migrations are FORWARD-ONLY. If a migration broke
prod, restore from your Postgres provider's point-in-time-recovery snapshot.
This is why the pre-deploy step runs migrations BEFORE the app deploys: a
broken migration aborts the deploy without ever touching the running app.

---

## 4. Incident playbooks

### R-1 — BILLING_AUTH_SECRET leak (Critical)

An attacker who learns this secret can forge JWTs for any wallet and
drain its deposited credits.

```bash
flyctl secrets set BILLING_AUTH_SECRET=$(openssl rand -hex 32) \
  --app tokagent-billing-server
```

The app restarts in ~30 s. All in-flight JWTs are immediately invalidated;
all SIWE-authenticated dashboard sessions must re-login. **Active
`sk-ai-*` API keys are NOT affected** (they're HMACed against the same
secret, but the lookup is by HMAC value, which changes — so every API key
also becomes invalid until users mint new ones via the dashboard).

Blast radius: every wallet with deposits.

### R-2 — Postgres outage (High)

```bash
# Check your Postgres provider's status page first.
#
# If the provider is up but our connection is failing, the issue is likely
# connection-limit exhaustion. Confirm we're using the pooled endpoint if
# one is available:
flyctl secrets list --app tokagent-billing-server | grep BILLING_DATABASE_URL
# (the value is redacted, but you can see if it's set)

# Switch to a read replica (if your provider supports it) by updating the URL:
flyctl secrets set BILLING_DATABASE_URL='<replica-url>' \
  --app tokagent-billing-server
```

While the DB is down, every `/v1/messages` call returns 503 from this
server, every client-mode CLI sees timeouts. Credits cannot be spent. This
is the same UX as a CEX during maintenance — accepted v1 behavior.

### R-3 — BILLING_OPERATOR_PRIVATE_KEY leak (Critical, on-chain $$ at risk)

The compromised EOA can call `vault.consumeCredits(any_wallet, MAX, batchId)`
draining everyone's deposit. Damage cap = current operator wallet ETH
balance (~0.05–0.1 ETH worth of gas, ~50 consume txs).

```bash
# 1. Mint a new EOA, fund it with 0.1 ETH:
cast wallet new
cast send <new-EOA> --value 0.1ether --private-key <funded-key> --rpc-url <RPC>

# 2. Transfer OPERATOR_ROLE on ClaudeVault to the new EOA (admin multisig):
cast send 0x1072f70e7c490E460fA72AC4171F7aDD1ef2d79F \
  'transferOperator(address)' <new-EOA> \
  --private-key <admin-key> --rpc-url <RPC>

# 3. Push the new key to Fly:
flyctl secrets set BILLING_OPERATOR_PRIVATE_KEY=0x<new-key> \
  --app tokagent-billing-server

# 4. (Optional) Drain the compromised EOA's remaining ETH back to a safe wallet:
cast send <safe-address> \
  --value $(cast balance <compromised-EOA> --rpc-url <RPC>) \
  --private-key <compromised-key> --rpc-url <RPC>
```

Weekly rotation cadence is the standing mitigation. Phase-2 plan: migrate
to AWS KMS or a Gnosis Safe multisig signer.

### R-4 — TWAP oracle wedges (Medium)

Symptoms: every `/v1/messages` returns 503, log shows
`oracle.ageMs > 600000` or `oracle snapshot stale`.

```bash
# Override TWAP with a fixed TON/USD price for incident response.
# (0.54 was the priced-into-the-mainnet-deploy value — adjust per current spot.)
flyctl secrets set BILLING_FIXED_TON_USD=0.54 \
  --app tokagent-billing-server

# Revert when the pool recovers:
flyctl secrets unset BILLING_FIXED_TON_USD \
  --app tokagent-billing-server
```

---

## 5. Health endpoints

| URL | Purpose | Expected |
|---|---|---|
| `https://<your-billing-server-domain>/api/health` | Liveness + readiness (one surface) | `{"ready":true,"database":"ok","agentState":"running"}` |
| `https://<your-billing-server-domain>/tokagent-billing/v1/billing/status` | Plugin is initialised and serving | `{"enabled":true}` |
| `https://<your-billing-server-domain>/tokagent-billing/v1/price` | Pricing surface live (returns 401 if AUTH_REQUIRED — that's still healthy) | 200 or 401 |

`check-readiness.ts --full` exercises all three plus a SIWE nonce shape check.

---

## 6. Logs

```bash
flyctl logs --app tokagent-billing-server               # tail
flyctl logs --app tokagent-billing-server --no-tail | gzip > logs.gz   # snapshot
```

Watch for:
- `[tokagent-api] Listening on http://0.0.0.0:8080`     — boot complete
- `consume worker completed`                            — on-chain settlements firing
- `twap primed (tonUsd=…)`                              — oracle alive
- `[PLUGIN:SQL] Failed query`                           — Postgres connectivity issue (paging signal)
