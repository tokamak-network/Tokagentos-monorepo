# @tokagentos/frontend

Marketing landing page for **tokagentOS**. Built with Next.js 15 (App Router) + TypeScript + Tailwind CSS v4.

## Develop

```bash
# From the monorepo root
bun install                                  # one-time
bun run --cwd frontend dev                   # http://localhost:3000
```

## Verify

```bash
bun run --cwd frontend typecheck             # tsc --noEmit
bun run --cwd frontend lint:check            # biome check
bun run --cwd frontend build                 # next build (static export-ready)
```

## Notes

- Server-component-first. The only client components are `QuickStartTabs` and `CopyButton` (they need browser APIs / state).
- Brand tokens are defined as CSS custom properties in `src/app/globals.css` under Tailwind v4's `@theme {}` directive — change them there and every utility class picks up the new value.
- `globals.css` is excluded from biome at the repo root (`biome.json`) because biome's CSS parser doesn't yet understand Tailwind v4's `@theme` at-rule.
- Fonts: Inter (sans) + JetBrains Mono (mono), loaded via `next/font/google` for self-hosting.
