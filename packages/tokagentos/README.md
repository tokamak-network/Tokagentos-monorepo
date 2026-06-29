# tokagentOS CLI

Create a tokagentOS project in two steps.

## Usage

```bash
npx @tokagent/tokagentos@latest
```

You will be asked for:

1. **Project name**
2. **LLM provider** — then that provider's API key (LiteLLM also asks for a base
   URL and small/large model aliases). Choose **x402** to configure billing from
   the in-app x402 tab instead of supplying a key.

The CLI scaffolds a fullstack-app workspace backed by a local `tokagent`
checkout, writes your provider key to `.env`, and pre-completes onboarding so the
app boots ready. Then:

```bash
cd <project>
bun install
bun run dev
```

`bun run dev` launches the UI, the API server, and the headless agent runtime.

## Help & version

```bash
tokagentos --help      # usage
tokagentos -v          # version
```

## Development

```bash
bun run build
bun run test
bun run test:packaged
```
