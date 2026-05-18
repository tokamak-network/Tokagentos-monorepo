# x402 End-to-End Test Guide

Verifies the x402 payment rail integration in a freshly-scaffolded tokagentos app, from CLI install through funded LLM consumption with on-chain settlement.

**Target version**: `@tokagent/tokagentos@2.0.0` (the first stable release including x402).

**Estimated time**: 30–45 minutes (most of it waiting on contract deployment, npm install, and the 30 s consume cycle).

---

## Prerequisites

| Requirement | Why | Verify |
|---|---|---|
| `bun` ≥ 1.3 | Scaffold runtime + workspace manager | `bun --version` |
| `node` ≥ 22 | Some plugin build steps | `node --version` |
| `git` | Scaffold initializes a submodule | `git --version` |
| `docker` (or local Postgres ≥ 14) | Billing ledger storage | `docker --version` |
| `foundry` (`forge`, `cast`) | Contract deployment + on-chain checks | `forge --version` |
| MetaMask (or any EIP-1193 wallet) | SIWE login + EIP-3009 sig | Installed in your browser |
| Sepolia ETH funded on the operator wallet | Contract deploys + faucet gas | ≥ 0.05 ETH |
| Sepolia Alchemy/Infura RPC URL | Chain reads + provider key bridge | URL in hand |
| LLM provider key (Anthropic, OpenAI, OpenRouter, etc.) | Actual inference; PTON is bookkeeping | API key in hand |

---

## Step 1 — Scaffold the app

```bash
cd /tmp                          # or wherever you want the project
bunx @tokagent/tokagentos@2.0.0 init my-x402-test
cd my-x402-test
bun install
```

**Expected**:
- `bun install` finishes with workspace-dependency warnings (storybook, eslint peer mismatches — ignorable).
- Directory tree contains `apps/`, `plugins/plugin-tokagent-*`, `tokagent/packages/billing/`, `tokagent/packages/app-core/`, `.env`, `package.json`.

**Sanity check**:
```bash
ls plugins/plugin-tokagent-billing/dist/index.js              # plugin pre-built
ls tokagent/packages/billing/drizzle/migrations/0000_*.sql    # migrations bundled
grep "@tokagent/tokagentos" package.json | head -1            # depends on stable 2.0.0
```

---

## Step 2 — Deploy contracts to Sepolia

You need three contracts: a TON token (use the live Sepolia deployment if you have one, otherwise deploy `MockERC20`), `PTON` wrapping TON, and `ClaudeVault` referencing `PTON`.

The contract source lives in `llm-api-gateway/contracts/src/` from the upstream gateway repo. Clone it if you don't have it:

```bash
git clone https://github.com/tokamak-network/llm-api-gateway.git /tmp/llm-gw   # adjust to your fork
cd /tmp/llm-gw/contracts
forge build
```

**Set env**:
```bash
export PRIVATE_KEY=<your-operator-key>           # 0x-prefixed, funded with Sepolia ETH
export RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-alchemy-key>
export DEPLOYER=$(cast wallet address --private-key $PRIVATE_KEY)
```

**A. (Optional) Mock TON if you don't have a real Sepolia TON**:
```bash
forge create test/mocks/MockERC20.sol:MockERC20 \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL --broadcast \
  --constructor-args "Tokamak" "TON" 18
export TON_ADDR=<deployed-address-from-output>
```
Or reuse the live Tokamak Sepolia TON:
```bash
export TON_ADDR=0xa30fe40285B8f5c0457DbC3B7C8A280373c40044
```

**B. PTON wrapping TON, with faucet enabled** (so you can self-mint test PTON):
```bash
forge create src/PTON.sol:PTON \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL --broadcast \
  --constructor-args $TON_ADDR true
export PTON_ADDR=<deployed-address>
```

**C. ClaudeVault**:
```bash
forge create src/ClaudeVault.sol:ClaudeVault \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL --broadcast \
  --constructor-args $PTON_ADDR $DEPLOYER $DEPLOYER
export VAULT_ADDR=<deployed-address>
```

**Verify wiring**:
```bash
cast call $VAULT_ADDR  "pton()(address)"      --rpc-url $RPC_URL   # → PTON_ADDR
cast call $PTON_ADDR   "ton()(address)"       --rpc-url $RPC_URL   # → TON_ADDR
cast call $VAULT_ADDR  "admin()(address)"     --rpc-url $RPC_URL   # → DEPLOYER
cast call $PTON_ADDR   "faucetEnabled()(bool)" --rpc-url $RPC_URL  # → true
```

Record the three addresses — you'll paste them into the setup wizard.

---

## Step 3 — Provision Postgres

```bash
docker run -d --name x402-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
# Wait ~3 s for boot
docker exec x402-pg pg_isready -U postgres
# Should print "/var/run/postgresql:5432 - accepting connections"
```

Connection string: `postgresql://postgres:postgres@localhost:5432/postgres`.

---

## Step 4 — Configure the LLM provider

Before booting the app, drop your provider key in `.env`:

```bash
cd /tmp/my-x402-test
echo "OPENROUTER_API_KEY=sk-or-v1-..." >> .env       # or OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.
```

The x402 entry in the provider list dispatches through OpenRouter, so an OpenRouter key gives you the broadest model coverage.

---

## Step 5 — Boot the agent

```bash
bun run dev
```

**Wait** until you see:
```
[my-x402-test] Agent ready (... s)
[my-x402-test] http://localhost:2138/
```

**Boot-log checks** (search the dev output):
- `Pre-registering core plugin: @tokagent/plugin-tokagent-billing...` ✓ plugin loaded
- `BILLING_ENABLED=false — billing plugin running in no-op mode` ✓ correct (you haven't configured yet)

Open `http://localhost:2138/` in your browser.

---

## Step 6 — Run the setup wizard

1. Click **x402** in the sidebar. Because `BILLING_ENABLED=false`, the iframe loads the **setup-panel HTML wizard** (not the dashboard).
2. Fill the form:
   - **Database**: `postgresql://postgres:postgres@localhost:5432/postgres`
   - **Chain RPC URL**: your Sepolia Alchemy/Infura URL. Tab out — **Chain ID** auto-detects as `11155111`.
   - **ClaudeVault address**: `$VAULT_ADDR`
   - **PTON address**: `$PTON_ADDR`
   - **Operator private key**: `$PRIVATE_KEY`
   - **Auth secret**: click **Generate**.
3. Submit. Wait for success: *"Billing is now active. Reload your Tokagent app tab in the browser (Cmd/Ctrl+Shift+R) to make the Billing tab appear in the sidebar."*

**Verify on disk**:
```bash
grep ^BILLING_ENABLED .env                       # → BILLING_ENABLED=true
grep ^BILLING_VAULT_ADDRESS .env                 # → your $VAULT_ADDR
grep ^BILLING_OPERATOR_PRIVATE_KEY .env          # → present
ls ~/.my-x402-test/config.env 2>/dev/null \
  || ls ~/.tokagent/config.env                   # same values mirrored here
```

---

## Step 7 — Restart and verify activation

1. **Stop** the dev server (`Ctrl+C` in the terminal).
2. `bun run dev` again.

**Boot-log checks**:
- `billing plugin initializing`
- `billing migrations applied (migrationsFolder=...drizzle/migrations)`
- `bridged BILLING_OPERATOR_PRIVATE_KEY → EVM_PRIVATE_KEY ...`
- `bridged billing RPC API key into ALCHEMY_API_KEY ...` (if you used Alchemy)
- `billing plugin initialized — BILLING_ENABLED=true`
- `ConsumeService started (intervalMs=30000, minBatchPton=...)`
- `WithdrawWatcherService started ...`
- `TwapRefreshService started ...`
- `runtime.useModel wrapped — chat-tab LLM calls now bill operator wallet`

**Probe the API**:
```bash
curl -s http://localhost:31337/v1/billing/status
# → {"enabled":true}
curl -s http://localhost:2138/v1/billing/status        # via Vite proxy
# → {"enabled":true}
```

---

## Step 8 — Verify the x402 dashboard

In your browser, hard-refresh (`Cmd/Ctrl+Shift+R`), click **x402** in the sidebar.

**Expected**:
- BETA banner across the top: *"The x402 rail is in active development — expect rapid iteration."*
- Dashboard "Sign in with your wallet" login card.
- No double-headers — only the parent app header is sticky.

**Sign in**:
1. Click **Connect wallet**. MetaMask popup — approve. Make sure MetaMask is on **Sepolia**.
2. Click **Sign in**. MetaMask popup with EIP-712 typed-data (`LoginAuth`). Sign.
3. Dashboard switches to the app view with three KPIs:
   - **Spendable balance**: `0 PTON` (haven't deposited yet)
   - **TON / USD**: live price ~`$0.5x` (sourced from `tokamak.network/api/price`)
   - **Calls (last 30d)**: `0`

If the TON/USD card shows `—`, give it 30 s (the refresh worker ticks) and reload. The card source should read `tokamak-api`.

---

## Step 9 — Mint test PTON

In the **Test PTON faucet** section:
1. Set amount to `200`.
2. Click **Mint test PTON**. MetaMask popup → approve.
3. Wait ~15–20 s for the tx to confirm.

**Verify on-chain**:
```bash
cast call $PTON_ADDR "balanceOf(address)(uint256)" $DEPLOYER --rpc-url $RPC_URL
# → 200000000000000000000  (200 PTON, 18 decimals)
```

**In the dashboard**: the "Wallet" line in the Spendable-balance card should now show `Wallet 200 PTON · X.XXX ETH`. (You may need to click **Refresh** if it doesn't auto-update.)

---

## Step 10 — Top up credits

In the **Top up credits** section:
1. Set amount to `15` PTON (or use a preset).
2. Click **Sign & deposit**. MetaMask popup with EIP-712 typed-data (`TransferWithAuthorization`). Sign.
3. Wait 15–20 s for the agent's `depositX402` tx to confirm on-chain.

**Expected flow** (visible in the agent's dev log):
- `POST /v1/topup/quote` → 200 (single-use `topupId` issued)
- `POST /v1/topup/settle` with X-PAYMENT header → 200 (sig verified, `depositX402` called)
- `tx confirmed: depositX402 …` (the agent's relay tx)

**Verify on-chain**:
```bash
cast call $VAULT_ADDR "credits(address)(uint256)" $DEPLOYER --rpc-url $RPC_URL
# → 15000000000000000000  (15 PTON locked in vault)
cast call $PTON_ADDR "balanceOf(address)(uint256)" $DEPLOYER --rpc-url $RPC_URL
# → 185000000000000000000  (200 - 15 = 185 PTON remaining in wallet)
```

**In the dashboard**:
- Spendable balance: `15 PTON`
- Wallet PTON: `185 PTON`

---

## Step 11 — Exercise chat-tab billing

Open the **Chat** tab. Make sure the active LLM provider is set (Settings → AI Model). If you set `OPENROUTER_API_KEY`, switch the provider to **x402 only (can be configured from the gateway)** (top of the list).

Send a chat message:
> "What's 2+2?"

After the agent replies, **observe the dev log**:
- `model call billed { wallet: ..., modelId: TEXT_LARGE, inputTokens: ..., outputTokens: ..., costPton: ... }`

**Return to x402 tab** → **Usage** view (or `Calls` section). You should see:
- A new row with model, input/output tokens (approximate, chars ÷ 4), USD + PTON cost, status `ok`.
- KPI strip: `Calls (last 30d)` increments to `1`.

**Verify ledger debit**:
- `Spendable balance` ticks down by `cost_pton`.
- "Pending consume" (the second sub-line on the balance card) shows the accrued local debit not yet flushed on-chain.

Send a few more messages to accumulate accrued debit.

---

## Step 12 — Trigger an on-chain consume

The `ConsumeService` flushes accrued debits to `vault.consumeCredits()` every 30 s, but only when accrued ≥ `consumeBatchMinPton` (default 0.5 PTON) OR `consumeMaxAgeMs` elapsed (default 5 min).

To force a flush sooner, exercise the chat tab enough to accrue > 0.5 PTON worth of debt (typically 4–6 longer messages on Claude Haiku/GPT-4o-mini).

**Watch the dev log** for:
- `consume batch flushed tx=0x... walletsConsumed=1 totalPton=...`

**Verify on-chain**:
```bash
cast call $VAULT_ADDR "credits(address)(uint256)" $DEPLOYER --rpc-url $RPC_URL
# → less than 15000000000000000000 (debited)
```

**In the dashboard**:
- Spendable balance drops correspondingly.
- "Pending consume" returns to 0.

---

## Step 13 — Mint and use an API key

1. In the dashboard, **API Keys** section → **Create key**.
2. Copy the `sk-...` string (shown ONCE).
3. From your terminal:
   ```bash
   curl -X POST http://localhost:31337/v1/messages \
     -H "Authorization: Bearer sk-..." \
     -H "Content-Type: application/json" \
     -d '{
       "model":"claude-haiku-4-5",
       "max_tokens":100,
       "messages":[{"role":"user","content":"Say hi in 5 words"}]
     }'
   ```
4. Check the **Usage** view: a new row with the **API key ID** column populated (instead of `—`).

---

## Step 14 — Test withdrawal pre-emption

The `WithdrawWatcherService` subscribes to `WithdrawRequested` events and force-flushes accrued before the user can pull funds.

```bash
# Request a small withdraw
cast send $VAULT_ADDR "requestWithdraw(uint256)" 1000000000000000000 \
  --private-key $PRIVATE_KEY --rpc-url $RPC_URL
```

**Watch dev log**:
- `withdraw requested → forcing priority consume flush ...`
- `priority consume flush completed`

The vault's `lockedBalance` should now show the requested amount, and any accrued local debit was flushed before the lock took effect.

---

## Step 15 — Cleanup

When you're done:
```bash
# Stop dev server
Ctrl+C

# Optional — stop Postgres
docker stop x402-pg && docker rm x402-pg

# Optional — clear the project state dir
rm -rf ~/.my-x402-test          # adjust to whatever ELIZA_NAMESPACE you used
```

To preserve the test scaffold for future runs, leave `~/.my-x402-test/config.env` in place. Next `bun run dev` will boot with billing already enabled and skip the wizard.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `x402` tab loads to "Not Found" 404 | Plugin failed to register routes | Check dev log for `Failed to load core plugin @tokagent/plugin-tokagent-billing` |
| Setup wizard submits but `BILLING_ENABLED` stays `false` | Older plugin (pre-alpha.275); writer not mirroring to `.env` | Verify CLI version is ≥ 2.0.0; restart dev after submit |
| `/v1/billing/status` returns 404 via :2138 (works on :31337) | Vite proxy not routing `/v1/*` | Ensure CLI version is ≥ 2.0.0-alpha.276 |
| "Sign in failed: invalid signature" | Stored nonce envelope mismatch | Verify CLI version is ≥ 2.0.0-alpha.281; restart and re-sign |
| "Mint test PTON" → "gas limit too high" | `info.vault`/`info.asset` undefined | Verify CLI version is ≥ 2.0.0-alpha.283 |
| Sign & deposit → HTTP 402 | Server-reconstructed authorization mismatch | Verify CLI version is ≥ 2.0.0-alpha.284 |
| TON/USD shows `1.0000` or `—` forever | Stale `BILLING_FIXED_TON_USD=1` env or live API down | `sed -i '' '/^BILLING_FIXED_TON_USD/d' .env`; restart |
| Wallet tab can't fetch balances | `EVM_PRIVATE_KEY` not bridged | Verify CLI version is ≥ 2.0.0-alpha.288; check boot log for "bridged BILLING_OPERATOR_PRIVATE_KEY → EVM_PRIVATE_KEY" |
| Chat tab calls don't show up in Usage | `runtime.useModel` not wrapped | Verify CLI version is ≥ 2.0.0; check boot log for "runtime.useModel wrapped — chat-tab LLM calls now bill operator wallet" |

---

## Reference — known-working Sepolia contracts

If you don't want to deploy your own, these addresses are pre-deployed and wired:

| Contract | Address |
|---|---|
| TON (Tokamak Sepolia) | `0xa30fe40285B8f5c0457DbC3B7C8A280373c40044` |
| PTON | `0xECb607340ddd64EbA1087ac2033EB48a7086d040` |
| ClaudeVault | `0x16Ed61F72cBC5539f69606363c1466Fe12e8328C` |

`faucetEnabled=true` on PTON, so the dashboard's faucet works against this PTON. `admin()` and `operator()` both equal the deployer who set up the first integration — you'd need to deploy your own vault to be its admin.

---

## What "passing" looks like

A successful end-to-end run produces:

- ✓ x402 tab loads with BETA banner, no header overlap
- ✓ Setup wizard activates billing without dev restart
- ✓ Dashboard SIWE login succeeds, KPIs render with live TON/USD
- ✓ Faucet mints 200 PTON to the wallet
- ✓ Sign & deposit lands 15 PTON in `vault.credits`
- ✓ Chat-tab message accrues PTON debit visible in Usage
- ✓ `ConsumeService` flushes accrued to `vault.consumeCredits` within 5 min
- ✓ External API key call also accrues a billed row
- ✓ Withdraw request triggers priority flush

If all nine pass, the x402 rail is fully integrated end-to-end.
