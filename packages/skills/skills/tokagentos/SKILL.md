---
name: tokagentos
description: "Use when the task involves tokagentOS core runtime concepts, plugins, actions, providers, evaluators, services, memories, state composition, or upstream tokagentOS development. Covers the main abstractions and the TypeScript runtime mental model."
---

# tokagentOS

tokagentOS is the plugin-based agent runtime that Tokagent builds on top of.

## Read These References First

- `references/core-abstractions.md` for the runtime mental model and message flow
- `references/plugin-development.md` for plugin extension points and implementation patterns

## Use This Skill When

- a change touches `tokagent/`
- you need to reason about `AgentRuntime`
- you are implementing or debugging actions, providers, evaluators, services, or model handlers
- you need the correct plugin lifecycle instead of guessing from Tokagent wrappers

## Working Rules

- Treat the TypeScript runtime in `tokagent/packages/typescript/src/` as the primary reference implementation.
- Prefer tokagentOS-native abstractions over product-specific wrappers when reasoning about upstream behavior.
- Remember the split between persistent `Memory` and ephemeral `State`.
- Remember that plugins are the main composition mechanism.
