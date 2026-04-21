# TokagentOS

> A fork of [elizaOS](https://github.com/elizaos/eliza), restyled for Tokamak.

TokagentOS is the Tokamak Network's fork of the elizaOS agent framework and CLI. It preserves the upstream codebase's structure and functionality, renamed throughout and restyled to match the Tokamak visual identity.

## Getting started

```bash
bun install
bun run build
./packages/tokagentos/dist/cli.js --help
```

## What changed from upstream

- Product and package namespace renamed (`@elizaos/*` → `@tokagentos/*` for packages maintained in this fork)
- CLI binary renamed (`elizaos` → `tokagentos`)
- CLI visual output restyled (gradient banner, TAL palette)
- Plugin submodules still reference upstream `github.com/elizaos-plugins/*` and are not modified by this fork

## Attribution

See [`NOTICE.md`](./NOTICE.md) and [`LICENSE`](./LICENSE).

## License

MIT, inherited from upstream elizaOS.
