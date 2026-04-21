# tokagentOS Python Plugin Starter

A template for creating tokagentOS plugins in Python that can be loaded by both the Python and TypeScript runtimes.

## Features

- 🐍 **Native Python** with full async/await support
- 📦 **Pydantic models** for type-safe data handling
- 🔄 **IPC bridge** for TypeScript runtime compatibility
- 🧪 **pytest** testing setup included

## Installation

### For Development

```bash
# From the plugin directory
pip install -e ".[dev]"
```

### For Production

```bash
pip install tokagentos-plugin-starter
```

## Usage

### In Python Runtime

```python
from tokagentos_plugin_starter import plugin

# Register with runtime
await runtime.register_plugin(plugin)

# The HELLO_PYTHON action is now available
```

### In TypeScript Runtime

The TypeScript runtime can load Python plugins via IPC:

```typescript
import { loadPythonPlugin } from "@tokagentos/interop";

const plugin = await loadPythonPlugin({
  moduleName: "tokagentos_plugin_starter",
  pythonPath: "python3",
});

await runtime.registerPlugin(plugin);
```

## Plugin Structure

```
python-plugin-starter/
├── pyproject.toml                    # Python package configuration
├── tokagentos_plugin_starter/
│   ├── __init__.py                   # Package exports
│   └── plugin.py                     # Main plugin implementation
├── tests/
│   └── test_plugin.py               # Unit tests
└── README.md
```

## Creating Your Own Plugin

### 1. Define Actions

```python
from tokagentos.types.components import Action, ActionResult

async def my_action_validate(runtime, message, state):
    """Decide if this action should run."""
    # Check message content, state, etc.
    return True

async def my_action_handler(runtime, message, state, options, callback, responses):
    """Execute the action."""
    # Your action logic here
    result = do_something_cool()

    return ActionResult(
        success=True,
        text="Action completed!",
        data={"result": result},
    )

my_action = Action(
    name="MY_ACTION",
    description="Does something cool",
    validate=my_action_validate,
    handler=my_action_handler,
)
```

### 2. Define Providers

```python
from tokagentos.types.components import Provider, ProviderResult

async def my_provider_get(runtime, message, state):
    """Provide context data."""
    return ProviderResult(
        text="Context for the LLM prompt",
        values={"key": "value"},
        data={"structured": "data"},
    )

my_provider = Provider(
    name="MY_PROVIDER",
    description="Provides useful context",
    get=my_provider_get,
)
```

### 3. Define Services

```python
from tokagentos.types.service import Service

class MyService(Service):
    service_type = "my-service"

    def __init__(self, runtime):
        super().__init__(runtime)
        self.initialized = False

    @classmethod
    async def start(cls, runtime):
        service = cls(runtime)
        service.initialized = True
        return service

    async def stop(self):
        self.initialized = False
```

### 4. Create the Plugin

```python
from tokagentos.types.plugin import Plugin

plugin = Plugin(
    name="my-python-plugin",
    description="My awesome plugin",
    actions=[my_action],
    providers=[my_provider],
    services=[MyService],
)
```

## Testing

```bash
# Run tests
pytest

# Run with coverage
pytest --cov=tokagentos_plugin_starter

# Type checking
mypy tokagentos_plugin_starter
```

## API Reference

### ActionResult

```python
# Success
ActionResult(success=True, text="Done!")

# Success with data
ActionResult(
    success=True,
    text="Result",
    data={"key": "value"},
    values={"template_var": "value"},
)

# Failure
ActionResult(success=False, error="Something went wrong")
```

### ProviderResult

```python
ProviderResult(
    text="Human-readable context for LLM",
    values={"variable": "for template substitution"},
    data={"structured": {"data": "for programmatic access"}},
)
```

## Environment Variables

| Variable                  | Description                    | Required |
| ------------------------- | ------------------------------ | -------- |
| `EXAMPLE_PLUGIN_VARIABLE` | Example configuration variable | No       |

## License

MIT
