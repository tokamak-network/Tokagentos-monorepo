# Rust Examples

Pure Rust examples using the native tokagentOS Rust implementation.

## Examples

| Directory                    | Description                                         |
| ---------------------------- | --------------------------------------------------- |
| `standalone-cli-chat/`       | Interactive CLI chat with an AI agent               |
| `standalone-adventure-game/` | Text adventure game with AI-powered decision making |

## Prerequisites

- Rust 1.70 or later
- Set `OPENAI_API_KEY` environment variable

## Run

### Chat

```bash
cd examples/rust/standalone-cli-chat
cargo run
```

### Adventure Game

```bash
cd examples/rust/standalone-adventure-game
cargo run
```

## Environment Variables

| Variable             | Default                     | Description    |
| -------------------- | --------------------------- | -------------- |
| `OPENAI_API_KEY`     | (required)                  | OpenAI API key |
| `OPENAI_BASE_URL`    | `https://api.openai.com/v1` | API base URL   |
| `OPENAI_SMALL_MODEL` | `gpt-5-mini`                | Small model    |
| `OPENAI_LARGE_MODEL` | `gpt-5`                     | Large model    |

## API Usage

### Chat Example

```rust
use tokagentos::{
    runtime::{AgentRuntime, RuntimeOptions},
    types::{Bio, Character, ChannelType, Content, Memory, UUID},
};
use tokagentos_plugin_openai::create_openai_tokagentos_plugin;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Create character and runtime
    let character = Character {
        name: "Tokagent".to_string(),
        bio: Bio::Single("A helpful AI assistant.".to_string()),
        ..Default::default()
    };

    let runtime = AgentRuntime::new(RuntimeOptions {
        character: Some(character),
        plugins: vec![create_openai_tokagentos_plugin()?],
        ..Default::default()
    }).await?;

    runtime.initialize().await?;

    // Handle messages
    let mut message = Memory {
        entity_id: UUID::new_v4(),
        room_id: UUID::new_v4(),
        content: Content {
            text: Some("Hello!".to_string()),
            source: Some("cli".to_string()),
            channel_type: Some(ChannelType::Dm),
            ..Default::default()
        },
        ..Default::default()
    };

    let result = runtime
        .message_service()
        .handle_message(&runtime, &mut message, None, None)
        .await?;

    if let Some(response) = result.response_content {
        println!("{}", response.text.unwrap_or_default());
    }

    // Cleanup
    runtime.stop().await?;
    Ok(())
}
```

### Adventure Game Example

```rust
use tokagentos::runtime::AgentRuntime;
use tokagentos::types::{ChannelType, Content, Memory, UUID};
use tokagentos::IMessageService;

// Route through the full message pipeline (planning/actions/providers/memory)
let content = Content {
    text: Some("Choose an action...".to_string()),
    source: Some("game".to_string()),
    channel_type: Some(ChannelType::Dm),
    ..Default::default()
};

let mut message = Memory::new(UUID::new_v4(), UUID::new_v4(), content);
let result = runtime
    .message_service()
    .handle_message(&runtime, &mut message, None, None)
    .await?;
let chosen_action = result
    .response_content
    .and_then(|c| c.text)
    .unwrap_or_default();
```

## Building

### Debug Build

```bash
cd examples/rust/standalone-cli-chat
cargo build

cd examples/rust/standalone-adventure-game
cargo build
```

### Release Build

```bash
cd examples/rust/standalone-cli-chat
cargo build --release

cd examples/rust/standalone-adventure-game
cargo build --release
```

## Project Structure

```
examples/rust/
├── standalone-cli-chat/
│   ├── Cargo.toml
│   └── src/
│       └── main.rs
└── standalone-adventure-game/
    ├── Cargo.toml
    └── src/
        └── main.rs
```

Both examples use:

- `tokagentos` - Core runtime and types
- `tokagentos-plugin-openai` - OpenAI integration
- `tokio` - Async runtime
- `anyhow` - Error handling
