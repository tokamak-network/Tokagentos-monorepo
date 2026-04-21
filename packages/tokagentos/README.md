# tokagentOS CLI

Create and upgrade tokagentOS project templates.

## Installation

```bash
# Interactive home screen
npx tokagentos

# Or run a command directly
npx tokagentos create
```

## Commands

### `tokagentos create`

Create a new project from a packaged template.

```bash
# Interactive template selection
tokagentos create

# Create a fullstack app workspace
tokagentos create my-app --template fullstack-app

# Create a Rust plugin starter
tokagentos create plugin-foo --template plugin --language rust
```

### `tokagentos upgrade`

Upgrade the current generated project to the latest packaged template.

```bash
tokagentos upgrade
tokagentos upgrade --check
```

### `tokagentos info`

Show available templates and languages.

```bash
tokagentos info
tokagentos info --template fullstack-app
tokagentos info --language rust
```

## Templates

| Template | Description | Languages |
| --- | --- | --- |
| `plugin` | Plugin starter workspace | TypeScript, Python, Rust |
| `fullstack-app` | Milady-style app workspace backed by a local `tokagent` checkout | TypeScript |

## Development

```bash
bun run build
bun run test
bun run test:packaged
```
