---
name: tokagent-app-development
description: "Use when building or changing an tokagentOS-based application in this repository. Covers tokagent app architecture, monorepo layout, local versus remote versus cloud routing, where to edit features, and non-negotiable runtime constraints. Tokagent is the product name of this particular tokagent app checkout."
---

# tokagent app development

This repository is an **tokagentOS application**: a local-first assistant with CLI, dashboard, Electrobun desktop shell, connectors, and Tokagent Cloud integration. **Tokagent** is this app’s product and CLI name—not a separate platform from tokagentOS.

## Read These References First

- `references/repo-map.md` for layout, edit targets, and common commands
- `references/runtime-and-cloud.md` for runtime flow, onboarding, service routing, skills, and Tokagent Cloud behavior

## Editing Heuristics

- Prefer `packages/app-core/` for app shell behavior (API, CLI, onboarding, config).
- Prefer `packages/agent/` for agent providers, services, and runtime glue around tokagentOS.
- Prefer `apps/app/` for UI and Electrobun work.
- Treat `tokagent/cloud/` as the Tokagent Cloud product and backend surface.
- Treat `tokagent/` as upstream tokagentOS. Edit it only when the bug or feature is genuinely upstream.

## Hard Constraints

- Do not remove `NODE_PATH` setup.
- Do not remove the Bun exports patch.
- Do not remove Electrobun startup error guards.
- Keep Node and Bun paths working.

## Repo Workflow

```bash
bun install
bun run verify
bun run test
```

Narrower commands when useful:

```bash
bun run tokagent ...
bun run dev
bun run dev:desktop
bun run test:e2e
```

## Where to Look First

- Product and runtime behavior: `packages/app-core/src/`
- Prompt, provider, and skill plumbing: `packages/agent/src/`
- Onboarding and routing: `packages/app-core/src/onboarding/` and `packages/app-core/src/runtime/`
- Shipped default skills: bundled in `@tokagentos/skills`, seeded into the state-dir skills folder by `scripts/ensure-skills.mjs`
- Tokagent Cloud backend or monetization: `tokagent/cloud/` and the shipped `tokagent-cloud` skill

## Cloud Default

If the task involves building an app and Tokagent Cloud is enabled, linked, or explicitly requested, treat Cloud as the default managed backend before inventing custom auth, billing, analytics, or hosting. Use the `tokagent-cloud` skill for app, monetization, and container details.

## Related Skills

- `tokagentos` — core runtime abstractions and upstream plugin patterns
- `tokagent-cloud` — apps, billing, monetization, auth, containers
