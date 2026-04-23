# @tokagent/plugin-tokagent-yield

elizaOS plugin for yield generation via Aave v3 on Polygon through the Tokagent vault.

## What it does

Provides an AI agent with the ability to deposit USDC into Aave v3 on Polygon to earn yield, and withdraw it back to the vault — all executed through the agent-controlled `TokagentVault` contract. A provider surfaces the current aUSDC balance on every turn.

## Required Setup

### 1. Deploy a Tokagent vault with the Aave pack

```bash
tokagentos deploy --kind tokagent --pack aave-v3-polygon --chain 137
```

This deploys a vault pre-allowlisted for Aave v3 `Pool.supply` and `Pool.withdraw`.

### 2. Configure environment variables

| Variable | Required | Description |
|---|---|---|
| `TOKAGENT_VAULT_ADDRESS_137` | Yes | Address of the deployed TokagentVault on Polygon (chain 137) |
| `TOKAGENT_PRIVATE_KEY` | Yes | 0x-prefixed 32-byte hex private key for the vault operator wallet |
| `POLYGON_RPC_URL` | No | Override the default public Polygon RPC |

## Actions

### `DEPOSIT_TO_AAVE`

Deposits USDC from the vault into Aave v3 on Polygon.

**Parameters:**
- `amount` (required) — USDC amount in human units (e.g. `100` for 100 USDC)
- `chain` (optional, default: `"polygon"`) — only Polygon is supported currently

**Example prompts:**
- "Deposit 500 USDC to Aave"
- "Supply 1000 USDC to Aave on Polygon"
- "Earn yield on 250 USDC via Aave"

### `WITHDRAW_FROM_AAVE`

Withdraws USDC from Aave v3 back to the vault.

**Parameters:**
- `amount` (required) — USDC amount in human units, or `"all"` / `"max"` to withdraw everything

**Example prompts:**
- "Withdraw 200 USDC from Aave"
- "Pull all my funds from Aave"
- "Take everything out of Aave"

## Providers

### `aavePositions`

Returns the vault's current aUSDC balance on Aave v3 Polygon. Injected into the agent's context on every turn when the Polygon vault is configured.

**Example output:**
```
Vault holds 142.35 aUSDC on Aave Polygon (≈ $142.35 earning variable APY).
```

## Contract Addresses (Polygon)

| Contract | Address |
|---|---|
| Aave v3 Pool | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| USDC.e | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |
| aUSDC.e | `0x625E7708f30cA75bfd92586e17077590C60eb4cD` |
