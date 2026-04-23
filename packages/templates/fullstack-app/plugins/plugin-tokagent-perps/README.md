# @tokagent/plugin-tokagent-perps

elizaOS plugin for reading Hyperliquid perpetuals positions and market data.

## What it does

Provides an AI agent with real-time Hyperliquid perpetuals data: the vault's open positions with equity and PnL (injected as a provider on every turn), and on-demand market info (mark price, funding rate, 24h volume) for any listed perpetual.

This plugin is read-only — it does not place orders. All data comes from Hyperliquid's public REST API.

## Required Setup

### Configure environment variables

| Variable | Required | Description |
|---|---|---|
| `TOKAGENT_VAULT_ADDRESS_999` | Yes (for positions) | Address of the vault on HyperEVM (chain 999), used as the HyperCore account for lookups |
| `HYPERLIQUID_API_URL` | No | Override the default Hyperliquid API base URL (default: `https://api.hyperliquid.xyz`) |

No private key is required — this plugin only reads public data.

## Providers

### `hyperliquidPositions`

Returns open perpetual positions for the vault's HyperCore account. Injected into the agent's context on every turn when `TOKAGENT_VAULT_ADDRESS_999` is configured.

**Example output:**
```
Hyperliquid: $5,234.12 USD equity across 2 positions.
  BTC LONG 0.5 @ $60,000.00, PnL: $250.00
  ETH SHORT 2.0 @ $3,000.00, PnL: -$50.00
```

## Actions

### `GET_PERPS_MARKET_INFO`

Fetches the current mark price, funding rate, and 24h volume for a Hyperliquid perpetual market.

**Parameters:**
- `symbol` (required) — the asset symbol to look up (e.g. "BTC", "ETH", "SOL", "ARB")

**Example prompts:**
- "What's the BTC perp mark price?"
- "ETH funding rate on Hyperliquid"
- "SOL perp market info"
- "Show me ARB Hyperliquid market"

**Example output:**
```
BTC perp:
  Mark: $65,000.00
  Funding: 0.0100%/hr
  24h Volume: $500.0M
```

## API Endpoints Used

All calls go to `POST ${HYPERLIQUID_API_URL}/info` with a 10-second timeout.

| Request type | Purpose |
|---|---|
| `clearinghouseState` | Vault equity and open positions |
| `meta` | Asset universe (symbol index lookup) |
| `metaAndAssetCtxs` | Mark price, funding rate, 24h volume |
