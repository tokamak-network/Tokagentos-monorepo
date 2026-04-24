# TokagentOS

Tokamak's autonomous DeFi agent framework. Runs on-chain strategies across HyperEVM (Hyperliquid perps), Polygon (Aave yield), and Polymarket via a web-based operator UI or in headless daemon mode.

Built on a fork of [elizaOS](https://github.com/elizaos/eliza) — see [NOTICE.md](./NOTICE.md) for attribution.

## Runtime modes

Select via `TOKAGENT_EXECUTION_MODE` in `.env`:

- **`daemon`** — headless; `StrategyRunnerService` ticks, actions sign via the operator private key in env. No UI served.
- **`operator`** — daemon + local React UI on `SERVER_PORT`. Four tabs: Chat / Automations / Wallet / Settings.

## Quick start

```bash
cd tokagentos
bun install
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, TOKAGENT_PRIVATE_KEY, TOKAGENT_VAULT_ADDRESS
bun run start
```

## Plugins

In-tree Tokagent plugins:
- `plugin-tokagent-strategy` — strategy engine + `StrategyRunnerService`
- `plugin-tokagent-perps` — Hyperliquid perpetuals on HyperEVM
- `plugin-tokagent-polymarket` — Polymarket prediction markets
- `plugin-tokagent-yield` — Aave v3 yield on Polygon
- `plugin-tokagent-shared` — shared vault bindings, chain config, wallet helpers

AI providers and messaging channels are env-gated — set the relevant API key to auto-enable.

## CLI

The `tokagentos` CLI scaffolds new projects from templates:

```bash
bunx @tokagent/tokagentos create my-agent --provider anthropic
```

See `packages/tokagentos/README.md` for full CLI usage.

## License

MIT, inherited from upstream elizaOS. See [LICENSE](./LICENSE).
