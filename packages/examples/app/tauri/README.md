# TokagentOS Chat (Tauri example)

This example runs an tokagentOS **Rust AgentRuntime** inside the Tauri backend and exposes chat over `tauri::command` calls.

- **Backend**: Rust (tokagentOS runtime)
- **Frontend**: Vite + React
- **Providers**: `tokagentClassic` (offline) plus `openai` and `xai` (Grok) in this template
- **Persistence**: chat history stored in `appData/chat_history.json` (app-level persistence)

## Run (dev)

### One-time monorepo setup

From the repo root:

```bash
bun install
```

Terminal A (frontend):

```bash
cd examples/app/tauri/frontend
bun install
bun run dev
```

Terminal B (Tauri):

```bash
cd examples/app/tauri
bun install
bunx tauri dev
```

The Tauri window will load `http://localhost:5178` in dev mode.

## Notes

- If you pick `openai` or `xai` without a key, the backend falls back to **TOKAGENT classic**.
- The Rust backend uses the tokagentOS message service and registers model handlers:
  - `tokagentClassic` always available
  - OpenAI / xAI handlers are registered when configured

## Deploy

```bash
cd examples/app/tauri
bun run build:frontend
CI=false bunx tauri build
```

If your environment exports `CI=1`, Tauri v2 expects a boolean string. Use `CI=false` (or `CI=true`) to avoid parsing errors.

