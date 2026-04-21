# tokagentOS Cross-Language Interop Examples

This directory demonstrates how **any runtime** can load **any plugin** regardless of what language it was written in.

## Interop Matrix

| Host Runtime | Plugin Language | Method | Description                   |
| ------------ | --------------- | ------ | ----------------------------- |
| TypeScript   | Rust            | WASM   | High performance, sandboxed   |
| TypeScript   | Python          | IPC    | Subprocess JSON-RPC           |
| Python       | Rust            | FFI    | Native performance via ctypes |
| Python       | TypeScript      | IPC    | Subprocess JSON-RPC           |
| Rust         | TypeScript      | IPC    | Subprocess JSON-RPC           |
| Rust         | Python          | IPC    | Subprocess JSON-RPC           |

## Quick Start

### 1. TypeScript Loading Rust Plugin (WASM)

```typescript
import { loadWasmPlugin } from "@tokagentos/interop";

// Load the compiled WASM module
const plugin = await loadWasmPlugin("./tokagent_classic.wasm");

console.log("Plugin:", plugin.name);
console.log(
  "Actions:",
  plugin.actions.map((a) => a.name),
);

// Use the action
const result = await plugin.actions[0].handler(
  runtime,
  { content: { text: "I am feeling sad" } },
  state,
  {},
);
console.log("Response:", result.text);
```

### 2. TypeScript Loading Python Plugin (IPC)

```typescript
import { loadPythonPlugin } from "@tokagentos/interop";

// Load Python plugin via subprocess
const plugin = await loadPythonPlugin("./python_plugin.py");

// Use normally - IPC is transparent
const result = await plugin.actions[0].handler(runtime, memory, state, {});
```

### 3. Python Loading Rust Plugin (FFI)

```python
from tokagentos.interop import load_rust_plugin

# Load the shared library
plugin = load_rust_plugin('./libtokagentos_plugin_tokagent_classic.so')

print(f'Plugin: {plugin.name}')
print(f'Actions: {[a.name for a in plugin.actions]}')

# Use the action
result = await plugin.actions[0].handler(
    runtime,
    {'content': {'text': 'I am feeling sad'}},
    state,
    {}
)
print(f'Response: {result.text}')
```

### 4. Python Loading TypeScript Plugin (IPC)

```python
from tokagentos.interop import load_ts_plugin

# Load TypeScript plugin via subprocess
plugin = load_ts_plugin('./typescript_plugin.ts')

# Use normally - IPC is transparent
result = await plugin.actions[0].handler(runtime, memory, state, {})
```

### 5. Rust Loading TypeScript Plugin (IPC)

```rust
use tokagentos::interop::TypeScriptPluginLoader;

let loader = TypeScriptPluginLoader::new();
let plugin = loader.load("./typescript_plugin.ts")?;

// Invoke action via IPC
let result = plugin.invoke_action("generate-response", &memory, &state, &options)?;
```

### 6. Rust Loading Python Plugin (IPC)

```rust
use tokagentos::interop::PythonPluginLoader;

let loader = PythonPluginLoader::new();
let plugin = loader.load("./python_plugin.py")?;

// Invoke action via IPC
let result = plugin.invoke_action("generate-response", &memory, &state, &options)?;
```

## Building Plugins for Interop

### Rust Plugin (WASM + FFI)

```bash
cd plugins/plugin-tokagent-classic/rust

# Build for WASM (TypeScript interop)
cargo build --release --target wasm32-unknown-unknown --features wasm
wasm-bindgen target/wasm32-unknown-unknown/release/tokagentos_plugin_tokagent_classic.wasm --out-dir ./pkg

# Build for FFI (Python interop)
cargo build --release --features ffi
# Result: target/release/libtokagentos_plugin_tokagent_classic.so

# Build IPC server (any language)
cargo build --release --features ipc --bin tokagent-classic-ipc
# Result: target/release/tokagent-classic-ipc
```

### Python Plugin (IPC)

Python plugins use the bridge server for IPC:

```python
# my_plugin/__init__.py
from tokagentos import Plugin, Action

async def my_handler(runtime, memory, state, options):
    return {"success": True, "text": "Hello from Python!"}

plugin = Plugin(
    name="my-python-plugin",
    actions=[
        Action(
            name="my-action",
            handler=my_handler,
            validate=lambda r, m, s: True,
        )
    ]
)
```

Run as IPC server:

```bash
python -m tokagentos.interop.bridge_server my_plugin
```

### TypeScript Plugin (IPC)

TypeScript plugins use a similar bridge pattern:

```typescript
// my-plugin/index.ts
import { Plugin, Action } from "@tokagentos/core";

export const plugin: Plugin = {
  name: "my-ts-plugin",
  actions: [
    {
      name: "my-action",
      handler: async (runtime, memory, state, options) => {
        return { success: true, text: "Hello from TypeScript!" };
      },
      validate: async () => true,
    },
  ],
};
```

## Protocol Details

### IPC Protocol (JSON-RPC over stdin/stdout)

Request format:

```json
{
  "id": 1,
  "method": "invokeAction",
  "params": {
    "name": "generate-response",
    "memory": { "content": { "text": "Hello" } },
    "state": {},
    "options": {}
  }
}
```

Response format:

```json
{
  "id": 1,
  "result": {
    "success": true,
    "text": "How do you do. Please state your problem."
  }
}
```

Supported methods:

- `getManifest` - Get plugin metadata
- `init` - Initialize plugin with config
- `validateAction` - Check if action can run
- `invokeAction` - Execute an action
- `getProvider` - Get provider data
- `validateEvaluator` - Check if evaluator can run
- `invokeEvaluator` - Execute an evaluator

### WASM Exports

Rust WASM plugins export these functions:

- `get_manifest() -> String`
- `init(config: &str)`
- `wasm_validate_action(name, memory, state) -> bool`
- `wasm_invoke_action(name, memory, state, options) -> String`
- `wasm_get_provider(name, memory, state) -> String`
- `wasm_validate_evaluator(name, memory, state) -> bool`
- `wasm_invoke_evaluator(name, memory, state) -> String`

### FFI Exports

Rust FFI plugins export these C functions:

- `tokagentos_get_manifest() -> *mut c_char`
- `tokagentos_init(config: *const c_char) -> c_int`
- `tokagentos_validate_action(name, memory, state) -> c_int`
- `tokagentos_invoke_action(name, memory, state, options) -> *mut c_char`
- `tokagentos_get_provider(name, memory, state) -> *mut c_char`
- `tokagentos_validate_evaluator(name, memory, state) -> c_int`
- `tokagentos_invoke_evaluator(name, memory, state) -> *mut c_char`
- `tokagentos_free_string(ptr: *mut c_char)` - Free returned strings

## Performance Considerations

| Method | Latency | Throughput | Sandboxing | Setup Cost |
| ------ | ------- | ---------- | ---------- | ---------- |
| WASM   | ~1μs    | High       | Yes        | Medium     |
| FFI    | ~10ns   | Highest    | No         | Low        |
| IPC    | ~1ms    | Medium     | Yes        | High       |

**Recommendations:**

- Use **WASM** for TypeScript ↔ Rust when you need sandboxing
- Use **FFI** for Python ↔ Rust when you need maximum performance
- Use **IPC** when simplicity and isolation are priorities

## Example: Full Integration Test

See `/packages/interop/typescript/__tests__/cross-language.test.ts` and `/packages/interop/python/tests/test_interop.py` for complete integration tests that exercise all interop paths.



