# @tokagent/plugin-tokagent-polymarket

elizaOS plugin for reading Polymarket prediction market positions and odds.

## What it does

Provides an AI agent with Polymarket data: the vault's open positions with current prices (injected as a provider on every turn), and on-demand market lookups by slug, search phrase, or condition ID.

This plugin is read-only — it does not place bets. All data comes from Polymarket's public APIs.

## Required Setup

### Configure environment variables

| Variable | Required | Description |
|---|---|---|
| `TOKAGENT_VAULT_ADDRESS_137` | Yes (for positions) | Address of the vault on Polygon (chain 137), used as the Polymarket account for position lookups |
| `POLYMARKET_GAMMA_URL` | No | Override the Gamma API base URL (default: `https://gamma-api.polymarket.com`) |
| `POLYMARKET_DATA_URL` | No | Override the Data API base URL (default: `https://data-api.polymarket.com`) |

No private key is required — this plugin only reads public data.

## Providers

### `polymarketPositions`

Returns open Polymarket positions for the vault on Polygon. Injected into the agent's context on every turn when `TOKAGENT_VAULT_ADDRESS_137` is configured.

**Example output:**
```
Polymarket: 2 open positions totaling $82.50 notional.
  "Will BTC hit $100k by end of 2025?" → Yes: 65.0% ($65.00)
  "Will ETH 2.0 launch in Q1?" → No: 35.0% ($17.50)
```

## Actions

### `DESCRIBE_POLYMARKET_MARKET`

Fetches current odds, liquidity, volume, and metadata for any Polymarket prediction market.

**Parameters:**
- `query` (required) — a search phrase, Polymarket slug, or 0x condition ID

**Example prompts:**
- "What are the odds on the 2025 US election Polymarket?"
- "Show me Polymarket odds for Bitcoin hitting $100k"
- "Polymarket market btc-100k-2025"
- "Describe Polymarket 0xabc...def"

**Example output:**
```
Market: Will BTC hit $100k by end of 2025?
  Yes: 65.0%
  No: 35.0%
Liquidity: $500,000, Volume: $2,000,000, Resolves: Dec 31, 2025
```

## API Endpoints Used

| Endpoint | Purpose |
|---|---|
| `GET ${POLYMARKET_DATA_URL}/positions?user={vault}&sizeThreshold=0.01` | Vault positions |
| `GET ${POLYMARKET_GAMMA_URL}/markets?condition_ids={id}` | Lookup by condition ID |
| `GET ${POLYMARKET_GAMMA_URL}/markets?slug={slug}` | Lookup by slug |
| `GET ${POLYMARKET_GAMMA_URL}/markets?search={phrase}` | Text search fallback |

All requests use a 10-second timeout.
