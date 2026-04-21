# TokagentOS

> A fork of [elizaOS](https://github.com/elizaos/eliza), restyled for Tokamak.

TokagentOS is the Tokamak Network's fork of the elizaOS agent framework and CLI. It preserves the upstream codebase's structure and functionality, renamed throughout and restyled to match the Tokamak visual identity.

## Install the CLI

Once published to npm, users install the CLI globally:

```bash
bun install -g tokagentos
tokagentos --help
```

Or run it one-off without installing:

```bash
bunx tokagentos create
```

### Before the first publish (dev install)

Until the package is on npm, build and link from this repo:

```bash
cd tokagentos
bun install
cd packages/tokagentos
bun run build
bun link                    # registers `tokagentos` globally
tokagentos --help           # now available anywhere on $PATH
```

To uninstall the link later: `bun unlink tokagentos`.

### Install from a local tarball

Useful for testing a release candidate without publishing:

```bash
cd tokagentos/packages/tokagentos
bun run build
bun pm pack                 # produces tokagentos-<version>.tgz
bun install -g ./tokagentos-<version>.tgz
```

## Publish to npm

The maintainer publishes from `packages/tokagentos/`:

```bash
cd tokagentos/packages/tokagentos
bun run build               # prepublishOnly also runs this
bun publish                 # or: npm publish --access public
```

The package.json is already publish-ready: `name: tokagentos`, `bin: { tokagentos: ./dist/cli.js }`, `files: [dist, templates, templates-manifest.json, README.md]`, and `prepublishOnly: bun run build`.

If the `tokagentos` name is taken on npm, switch to a scope before publishing. Edit `packages/tokagentos/package.json`:

```json
{
  "name": "@tokamak-network/tokagentos",
  "publishConfig": { "access": "public" }
}
```

Users then install with `bun install -g @tokamak-network/tokagentos`.

## What changed from upstream

- Product and package namespace renamed (`@elizaos/*` → `@tokagentos/*` for packages maintained in this fork)
- CLI binary renamed (`elizaos` → `tokagentos`)
- CLI visual output restyled (gradient banner, TAL palette)
- Plugin submodules still reference upstream `github.com/elizaos-plugins/*` and are not modified by this fork

## Attribution

See [`NOTICE.md`](./NOTICE.md) and [`LICENSE`](./LICENSE).

## License

MIT, inherited from upstream elizaOS.
