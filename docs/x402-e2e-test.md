# x402 End-to-End Test

Verifies the x402 rail from CLI scaffold to billed chat-tab usage. Target: `@tokagent/tokagentos@2.0.2`. Time: ~20 min.

## Prerequisites

- Install bun ≥ 1.3, node ≥ 22, git, docker, foundry, MetaMask
- Fund a Sepolia wallet with ≥ 0.05 ETH
- Get a Sepolia Alchemy/Infura RPC URL
- Get an OpenRouter API key

## Pre-deployed Sepolia contracts (paste straight into the wizard)

- TON: `0xa30fe40285B8f5c0457DbC3B7C8A280373c40044`
- PTON: `0xECb607340ddd64EbA1087ac2033EB48a7086d040`
- ClaudeVault: `0x16Ed61F72cBC5539f69606363c1466Fe12e8328C`

Operator of this vault is fixed (not you). End-user flows work; on-chain `consumeCredits` flush won't. Deploy your own vault (Appendix A) for full operator capability.

## Step 1 — Scaffold

- `cd /tmp`
- `bunx @tokagent/tokagentos@2.0.2 init my-x402-test`
- Pick `x402 only (can be configured from the gateway)` at the LLM provider prompt — no key requested
- `cd my-x402-test && bun install`

## Step 2 — Provision Postgres

- `docker run -d --name x402-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`
- `docker exec x402-pg pg_isready -U postgres`

## Step 3 — Boot

- `bun run dev`
- Wait for `Agent ready (...)` and `http://localhost:2138/`
- Confirm `BILLING_ENABLED=false — billing plugin running in no-op mode` in the log

## Step 4 — Run the setup wizard

- Open `http://localhost:2138/`
- Click **x402** in the sidebar
- Database: `postgresql://postgres:postgres@localhost:5432/postgres`
- Chain RPC URL: `https://eth-sepolia.g.alchemy.com/v2/<your-alchemy-key>`
- ClaudeVault: `<ClaudeVault address from your Sepolia deploy>`
- PTON: `<PTON address from your Sepolia deploy>`
- Operator private key: `<your-operator-private-key>` (0x-prefixed; the EOA that was granted `OPERATOR_ROLE` at deploy time)
- Auth secret: click **Generate**
- Submit

## Step 5 — Restart

- `Ctrl+C`, then `bun run dev`
- Confirm `billing plugin initialized — BILLING_ENABLED=true`
- Confirm `bridged BILLING_OPERATOR_PRIVATE_KEY → EVM_PRIVATE_KEY`
- Confirm `runtime.useModel wrapped — chat-tab LLM calls now bill operator wallet`

## Step 6 — Dashboard login

- Hard-refresh the browser (Cmd/Ctrl+Shift+R)
- Click **x402** → see BETA banner + login card
- Click **Connect wallet** → MetaMask popup on Sepolia → approve
- Click **Sign in** → sign the EIP-712 `LoginAuth` typed-data
- Confirm KPIs render with live TON/USD (~$0.5x, source `tokamak-api`)

## Step 7 — Mint test PTON

- Faucet section → amount `200` → **Mint test PTON**
- Approve MetaMask tx, wait ~20 s
- `cast call $PTON_ADDR "balanceOf(address)(uint256)" $DEPLOYER --rpc-url $RPC_URL` returns `200000000000000000000`

## Step 8 — Top up vault

- Top-up section → amount `15` → **Sign & deposit**
- Sign the EIP-712 `TransferWithAuthorization`, wait ~20 s
- `cast call $VAULT_ADDR "credits(address)(uint256)" $DEPLOYER --rpc-url $RPC_URL` returns `15000000000000000000`
- Dashboard shows Spendable balance `15 PTON`, Wallet PTON `185`

## Step 9 — Bill a chat-tab call

- Open the **Chat** tab
- Send: `What's 2+2?`
- Confirm dev log: `model call billed { modelId: TEXT_LARGE, inputTokens: ..., outputTokens: ..., costPton: ... }`
- Refresh **x402** → **Usage** view shows a new row
- Spendable balance decreases by the charged amount

## Step 10 — Mint and use an API key

- x402 → **Keys** → **Create key** → copy the `sk-...` (shown once)
- `curl -X POST http://localhost:31337/v1/messages -H "Authorization: Bearer sk-..." -H "Content-Type: application/json" -d '{"model":"claude-haiku-4-5","max_tokens":100,"messages":[{"role":"user","content":"Say hi"}]}'`
- Usage view shows a new row with the API key ID populated

## Pass criteria

- ✓ x402 tab loads with BETA banner, no header overlap
- ✓ Wizard activates billing
- ✓ SIWE login succeeds, live TON/USD visible
- ✓ Faucet mints 200 PTON
- ✓ Sign & deposit lands 15 PTON in `vault.credits`
- ✓ Chat-tab call accrues a billed row visible in Usage
- ✓ External API-key call also accrues a billed row

## Cleanup

- `Ctrl+C`
- `docker stop x402-pg && docker rm x402-pg`
- `rm -rf ~/.my-x402-test` (only if you want to re-run setup)

## Troubleshooting

| Symptom | Fix |
|---|---|
| x402 page is "Not Found" | Check log for `Failed to load core plugin @tokagent/plugin-tokagent-billing` |
| TON/USD shows `1.0000` forever | `sed -i '' '/^BILLING_FIXED_TON_USD/d' .env`, then restart |
| Sign-in: "invalid signature" | Restart `bun run dev`, re-sign |
| Faucet: "gas limit too high" | Confirm CLI is ≥ 2.0.0 |
| Sign & deposit: HTTP 402 | Confirm CLI is ≥ 2.0.0 |
| Wallet tab balances empty | Confirm log shows `bridged BILLING_OPERATOR_PRIVATE_KEY → EVM_PRIVATE_KEY` |
| Chat calls don't appear in Usage | Confirm log shows `runtime.useModel wrapped — ...` |

## Appendix A — Deploy your own contracts (optional)

Required if you want operator-level capability (on-chain `consumeCredits` flush).

- `git clone <gateway-repo> /tmp/llm-gw && cd /tmp/llm-gw/contracts && forge build`
- `export PRIVATE_KEY=<your-key>; export RPC_URL=<sepolia-rpc>; export DEPLOYER=$(cast wallet address --private-key $PRIVATE_KEY)`
- `forge create src/PTON.sol:PTON --private-key $PRIVATE_KEY --rpc-url $RPC_URL --broadcast --constructor-args 0xa30fe40285B8f5c0457DbC3B7C8A280373c40044 true` → record `$PTON_ADDR`
- `forge create src/ClaudeVault.sol:ClaudeVault --private-key $PRIVATE_KEY --rpc-url $RPC_URL --broadcast --constructor-args $PTON_ADDR $DEPLOYER $DEPLOYER` → record `$VAULT_ADDR`
- Use `$PTON_ADDR` and `$VAULT_ADDR` in Step 4 instead of the pre-deployed ones
