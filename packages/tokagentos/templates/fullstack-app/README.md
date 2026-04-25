# __APP_NAME__

A Milady-style fullstack app workspace built on [tokagentOS](https://github.com/elizaos/eliza).

## Layout

- `apps/app` — the branded React + Capacitor + Electrobun shell
- `tokagent` — upstream tokagentOS source, managed as a git submodule
- `test` — thin test helpers that re-export the upstream app-core harness

## First Run

```bash
bun install
bun run dev
```

If the `tokagent` submodule is missing, initialize it first:

```bash
git submodule update --init --remote tokagent
```

## Common Commands

```bash
# Web / control UI (this is the start command — there is no `bun run start`)
bun run dev

# Desktop shell
bun run dev:desktop

# App test suite
bun run test

# App package only
bun run --cwd apps/app build
```

> **Why no `bun run start`?** This template uses `bun run dev` as the
> single canonical entry point. It runs `scripts/ensure-plugin-builds.mjs`
> (compiling all plugins your scaffold imports) and then boots the agent
> + UI together. There is no separate "production" mode at the project
> root — for headless agent-only mode, run `cd tokagent && bun run start`,
> which boots the agent without the UI shell (useful for server
> deployments). For a built static UI, use `bun run build` and serve
> `apps/app/dist/`.

## Notes

- This template keeps the upstream tokagentOS source local because several `@elizaos/*` workspace packages used by the app are not published on npm.
- The generated project is meant to be its own repo, with `tokagent/` pinned independently through the submodule.
- The default brand kit is intentionally minimal. The source-of-truth files are `apps/app/public/favicon.svg` and `apps/app/public/splash-bg.svg`.
- `bun run --cwd apps/app brand:assets` regenerates the derived desktop assets: `public/splash-bg.jpg`, `electrobun/assets/appIcon.png`, `electrobun/assets/appIcon.ico`, and `electrobun/assets/appIcon.iconset/`.
- `apps/app/public/logos/*` is still required because `@elizaos/app-core` maps provider IDs to those fixed asset paths during onboarding and settings flows.

## Companion avatar

The default `tokagent-0` VRM bundled with your scaffolded project is a
**placeholder** — it's a recolor of an upstream character. The commissioned
Tokagent Pro Humanoid avatar ships in a later release as a file swap only
(drop the new `.vrm` into `tokagent/apps/app-companion/public/vrms/`), no
code changes required.

The scene behind the character (Aurora lime-on-dark) and the 6-emote set
(idle / thinking / speaking / acknowledge / alert / success) are final.
