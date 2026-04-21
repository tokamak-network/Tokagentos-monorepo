# TokagentOS

> A fork of [elizaOS](https://github.com/elizaos/eliza), restyled for Tokamak.

TokagentOS is the Tokamak Network's fork of the elizaOS agent framework and CLI. It preserves the upstream codebase's structure and functionality, renamed throughout and restyled to match the Tokamak visual identity.

## Install the CLI

Published as [`@tokagent/tokagentos`](https://www.npmjs.com/package/@tokagent/tokagentos) on npm. Install globally:

```bash
bun install -g @tokagent/tokagentos@alpha
tokagentos --help
```

Or pin an exact version:

```bash
bun install -g @tokagent/tokagentos@2.0.0-alpha.224
```

Or run it one-off without installing:

```bash
bunx @tokagent/tokagentos create
```

The npm package is `@tokagent/tokagentos`; the CLI binary it installs is `tokagentos`.

### Dev install (from this repo)

```bash
cd tokagentos
bun install
cd packages/tokagentos
bun run build
bun link                    # registers `tokagentos` on $PATH
tokagentos --help
```

To remove the link later: `bun unlink tokagentos`.

### Install from a local tarball

Useful for testing a release candidate without publishing:

```bash
cd tokagentos/packages/tokagentos
bun run build
bun pm pack                 # produces @tokagent-tokagentos-<version>.tgz
bun install -g ./@tokagent-tokagentos-<version>.tgz
```

## Publish a new version

```bash
cd tokagentos/packages/tokagentos
npm version <2.0.0-alpha.N> --no-git-tag-version    # or --preid alpha
npm publish --access public --tag alpha              # prepublishOnly runs `bun run build`
```

Installs by end users then pull the new version:

```bash
bun install -g @tokagent/tokagentos@alpha
```

## What changed from upstream

- Product and package namespace renamed (`@elizaos/*` → `@tokagentos/*` for packages maintained in this fork; CLI itself publishes as `@tokagent/tokagentos`)
- CLI binary renamed (`elizaos` → `tokagentos`)
- CLI visual output restyled (gradient banner, TAL palette)
- Plugin submodules still reference upstream `github.com/elizaos-plugins/*` and are not modified by this fork

## Attribution

See [`NOTICE.md`](./NOTICE.md) and [`LICENSE`](./LICENSE).

## License

MIT, inherited from upstream elizaOS.
