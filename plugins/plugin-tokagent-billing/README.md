# @tokagent/plugin-tokagent-billing

elizaOS plugin: Web3 credit-billing routes and middleware for the tokagentos LLM gateway.

## Status

Phase 1 scaffold — the plugin shape is wired but no actions, providers, or routes are registered yet.
Business logic lands starting in Phase 6 of the integration plan.

## Design

See [`../../packages/billing/README.md`](../../packages/billing/README.md) for the billing library architecture and the integration plan at `docs/superpowers/specs/2026-05-11-llm-api-gateway-integration-plan.md`.

## Installation

```bash
bun add @tokagent/plugin-tokagent-billing
```

## Usage

```ts
import { tokagentBillingPlugin } from '@tokagent/plugin-tokagent-billing';
```

Register with your elizaOS agent in Phase 6 once routes and middleware are implemented.

## License

MIT
