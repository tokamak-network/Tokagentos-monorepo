"""
Solana instruction discovery benchmark for TokagentOS.
Reward = unique (program_id, first_byte_of_instruction_data) pairs.

Verified: 236 reward in 15 deterministic steps (no LLM needed).
Previous best: 139 (Claude Sonnet 4 with raw CodeLoopExplorer).

Known constraints (empirically discovered):
  - Surfpool limits ~60 instructions per transaction (trace length cap)
  - Memo Program validates UTF-8: bytes 0-127 work as single-byte;
    bytes 128-193 and 245-255 are unreachable; 194-244 need multi-byte encoding
  - Transaction size limit is 1232 bytes (Solana protocol)
  - Bun resolves node_modules relative to the code file, not the subprocess cwd
  - surfpool_env._partial_sign_transaction signs only index 0 (fee payer position)

Modules:
  - tokagent_agent.py: Full TokagentOS runtime integration (AgentRuntime, Plugin,
    handle_message). Uses EXECUTE_CODE action and SOLANA_CONTEXT provider.
  - tokagent_explorer.py: Standalone LangChain-based explorer (legacy).
  - plugin/: TokagentOS plugin with EXECUTE_CODE action and SOLANA_CONTEXT provider.

Scope:
  - Phase 1 (deterministic templates): verified 236 reward, no LLM needed
  - Phase 2 (LLM-assisted): verified with Anthropic Claude Sonnet 4
  - tokagent_agent.py uses the full Tokagent runtime (Plugin, Action, Provider, handle_message)
  - tokagent_explorer.py is the legacy standalone version (no Tokagent integration)
  - Templates use @solana/web3.js directly (not plugin-solana)
  - Swap benchmark: works with ENVIRONMENT_CONFIG=voyager/environments/swap_env.json
"""
