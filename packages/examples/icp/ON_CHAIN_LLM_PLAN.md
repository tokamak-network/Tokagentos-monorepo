# On-Chain LLM Integration Plan for tokagentOS ICP

## Overview

This document outlines the plan to support three inference modes in the tokagentOS ICP canister:

1. **TOKAGENT Classic** - Pattern-based Rogerian psychotherapist (no external deps)
2. **OpenAI** - HTTP outcalls to api.openai.com (current implementation)
3. **On-Chain LLM** - Inter-canister calls to llama_cpp_canister (fully decentralized)

## Research Findings

### llama_cpp_canister (onicai)

The most mature on-chain LLM solution for ICP:
- **Repository**: https://github.com/onicai/llama_cpp_canister
- **74 stars**, actively maintained
- Supports GGUF format models
- Prompt caching for efficiency
- Tested with various model sizes

### Model Performance on ICP

| Model | Size | Quantization | Tokens/Update |
|-------|------|--------------|---------------|
| SmolLM2-135M | 0.15 GB | q8_0 | 40 |
| Qwen2.5-0.5B | 0.68 GB | q8_0 | 12 |
| Qwen2.5-0.5B | 0.49 GB | q4_k_m | 14 |
| Llama-3.2-1B | 0.81 GB | q4_k_m | 4 |
| Qwen2.5-1.5B | 1.10 GB | q4_k_m | 3 |
| DeepSeek-R1-1.5B | varies | q4_k_m | 3 |

### Qwen2.5-3B-Instruct GGUF Sizes

| Quantization | File Size | Quality |
|--------------|-----------|---------|
| Q2_K | 1.38 GB | Lower |
| Q3_K_M | 1.72 GB | Moderate |
| Q4_0 | 2.00 GB | Good |
| Q4_K_M | 2.10 GB | Good |
| Q8_0 | 3.62 GB | Best |

**Challenge**: A 3B model with Q4 quantization likely won't fit in ICP's instruction limits.
**Recommendation**: Use **Qwen2.5-1.5B** (q4_k_m) or **Qwen2.5-0.5B** (q8_0) for reliable on-chain inference.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    tokagentOS ICP Canister                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   InferenceRouter                          │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │  │
│  │  │TOKAGENT Classic│ │  OpenAI     │ │  On-Chain LLM       │  │  │
│  │  │ (Built-in)  │ │ (HTTP Out)  │ │ (Inter-canister)    │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Memory & Conversation State                   │  │
│  │              (Stable Memory + VetKeys)                     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│ Pattern Match   │  │  api.openai.com │  │ llama_cpp_canister  │
│ (No network)    │  │  (HTTP Outcall) │  │ (Same subnet)       │
└─────────────────┘  └─────────────────┘  └─────────────────────┘
```

## Implementation Plan

### Phase 1: Add Inference Mode Enum and Router

Add to `types.rs`:
```rust
#[derive(Debug, Clone, CandidType, Serialize, Deserialize, Default)]
pub enum InferenceMode {
    #[default]
    TokagentClassic,    // Pattern-based, instant, free
    OpenAI,          // HTTP outcalls, fast, costs cycles + API key
    OnChainLLM,      // Inter-canister, slow, costs cycles only
}

#[derive(Debug, Clone, CandidType, Serialize, Deserialize)]
pub struct OnChainLLMConfig {
    pub canister_id: Principal,    // llama_cpp_canister ID
    pub model_name: String,        // e.g., "qwen2.5-0.5b"
    pub max_tokens: u32,           // Max tokens per response
    pub temperature: f32,
    pub system_prompt: Option<String>,
}
```

### Phase 2: Create llama_cpp_canister Interface

Create `src/tokagent_icp_backend/src/onchain_llm.rs`:
```rust
use candid::{CandidType, Principal};
use ic_cdk::api::call::call;

/// Interface to llama_cpp_canister
pub struct OnChainLLMClient {
    canister_id: Principal,
}

impl OnChainLLMClient {
    pub fn new(canister_id: Principal) -> Self {
        Self { canister_id }
    }

    /// Start a new chat session
    pub async fn new_chat(&self) -> Result<(), String> {
        let args = NewChatArgs {
            args: vec![
                "--prompt-cache".into(), "prompt.cache".into(),
                "--cache-type-k".into(), "q8_0".into(),
            ],
        };
        call::<_, ()>(self.canister_id, "new_chat", (args,))
            .await
            .map_err(|(_, e)| e)?;
        Ok(())
    }

    /// Generate response (may need multiple calls)
    pub async fn run_update(&self, prompt: &str, max_tokens: u32) -> Result<String, String> {
        // Implementation with prompt ingestion + generation loop
        // ...
    }
}
```

### Phase 3: Update Inference Router

Modify `generate_response_with_context()` in `lib.rs`:
```rust
async fn generate_response_with_context(
    character: &CharacterConfig,
    user_message: &str,
    recent_memories: &[Value],
    agent_id: &str,
) -> String {
    // Get current inference mode
    let mode = INFERENCE_MODE.with(|m| m.borrow().clone());
    
    match mode {
        InferenceMode::OpenAI => {
            // Existing OpenAI implementation
            try_openai_response(character, user_message, recent_memories, agent_id).await
        }
        InferenceMode::OnChainLLM => {
            // New on-chain LLM implementation
            try_onchain_llm_response(character, user_message, recent_memories, agent_id).await
        }
        InferenceMode::TokagentClassic => {
            // Existing TOKAGENT Classic fallback
            generate_pattern_response(user_message)
        }
    }
}
```

### Phase 4: Deploy llama_cpp_canister

1. Clone llama_cpp_canister repo
2. Build WASM (requires Mac)
3. Deploy to local network
4. Upload Qwen2.5-0.5B or 1.5B model
5. Configure inter-canister communication

### Phase 5: Add Configuration API

New canister methods:
```candid
// Set inference mode
set_inference_mode: (InferenceMode) -> (variant { Ok; Err: CanisterError });

// Configure on-chain LLM
configure_onchain_llm: (OnChainLLMConfig) -> (variant { Ok; Err: CanisterError });

// Get current inference status
get_inference_status: () -> (record {
    mode: InferenceMode;
    openai_configured: bool;
    onchain_llm_configured: bool;
    onchain_llm_ready: bool;
}) query;
```

## Deployment Options

### Option A: Qwen2.5-0.5B (Recommended for Testing)
- **Size**: 0.68 GB (q8_0)
- **Tokens/update**: 12
- **Quality**: Good for simple tasks
- **Latency**: ~1-2 sec per response

### Option B: Qwen2.5-1.5B (Best Balance)
- **Size**: 1.10 GB (q4_k_m)
- **Tokens/update**: 3
- **Quality**: Better reasoning
- **Latency**: ~5-10 sec per response

### Option C: DeepSeek-R1-Distill-Qwen-1.5B (Reasoning Focus)
- **Size**: 1.12-1.46 GB
- **Tokens/update**: 3
- **Quality**: Strong reasoning
- **Latency**: ~5-10 sec per response

## Cost Comparison

| Mode | Cycles/Message | Latency | Decentralization |
|------|---------------|---------|------------------|
| TOKAGENT Classic | ~10K | <100ms | Full |
| OpenAI | ~500M | 1-5s | Partial (HTTP out) |
| On-Chain LLM | ~2-5B | 5-30s | Full |

## Frontend Integration

Update `app.js` to show inference mode:
```javascript
const modelBadge = {
    'TokagentClassic': '(Classic)',
    'OpenAI': '(GPT-4o)',
    'OnChainLLM': '(On-Chain Qwen)'
}[inferenceMode];

statusText.textContent = `${agentName} Online ${modelBadge}`;
```

## Timeline

1. **Phase 1-2**: Types + LLM client interface (2 hours)
2. **Phase 3**: Inference router updates (1 hour)
3. **Phase 4**: Deploy llama_cpp_canister (2-3 hours)
4. **Phase 5**: Configuration API (1 hour)
5. **Testing & Integration**: 2-3 hours

## Open Questions

1. Should we support hot-swapping models in llama_cpp_canister?
2. Do we want to cache prompts across users for common system prompts?
3. Should inference mode be per-user or global canister setting?
4. How to handle long responses that exceed token limits?

## References

- [llama_cpp_canister](https://github.com/onicai/llama_cpp_canister)
- [yllama.rs](https://github.com/gip/yllama.rs) / [yllama.oc](https://github.com/gip/yllama.oc)
- [Qwen2.5-3B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF)
- [DFINITY Forum: Llama 3 8B on-chain](https://forum.dfinity.org/t/llama-3-8b-is-running-on-chain/33037)
