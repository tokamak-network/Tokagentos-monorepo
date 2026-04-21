"""
TokagentOS Integration for ART Training

Full integration with the TokagentOS agent runtime:
- Uses REAL AgentRuntime with character and plugins
- Message processing through message_service.handle_message
- Actions registered and invoked properly
- Providers supplying context
- basicCapabilities enabled by default

Integrates with TokagentOS plugins:
- plugin-trajectory-logger: Trajectory capture and export
- plugin-local-ai: Local GGUF model inference
- plugin-localdb: Persistent storage for trajectories and checkpoints
"""

from tokagentos_art.tokagent_integration.runtime_integration import (
    ARTRuntime,
    ARTRuntimeConfig,
    create_art_plugin,
    create_art_runtime,
    create_game_action,
    create_game_state_provider,
)
from tokagentos_art.tokagent_integration.storage_adapter import (
    TokagentStorageAdapter,
    TrajectoryStore,
)
from tokagentos_art.tokagent_integration.trajectory_adapter import (
    TokagentEnvironmentState,
    TokagentLLMCall,
    TokagentTrajectoryLogger,
    convert_to_tokagent_trajectory,
)
from tokagentos_art.tokagent_integration.local_ai_adapter import (
    TokagentLocalAIProvider,
    LocalModelConfig,
    MockLocalAIProvider,
)
from tokagentos_art.tokagent_integration.export import (
    export_trajectories_art_format,
    export_trajectories_jsonl,
)

__all__ = [
    # Core Runtime
    "ARTRuntime",
    "ARTRuntimeConfig",
    "create_art_runtime",
    # Plugin creation
    "create_art_plugin",
    "create_game_action",
    "create_game_state_provider",
    # Trajectory logging
    "TokagentTrajectoryLogger",
    "TokagentLLMCall",
    "TokagentEnvironmentState",
    "convert_to_tokagent_trajectory",
    # Local AI
    "TokagentLocalAIProvider",
    "LocalModelConfig",
    "MockLocalAIProvider",
    # Storage
    "TokagentStorageAdapter",
    "TrajectoryStore",
    # Export
    "export_trajectories_art_format",
    "export_trajectories_jsonl",
]
