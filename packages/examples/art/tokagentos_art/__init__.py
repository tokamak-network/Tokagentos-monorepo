"""
TokagentOS ART (Adaptive Reinforcement Training) Package

Continuous reinforcement learning system for training local LLMs
using OpenPipe's ART framework with GRPO.

Integrates with TokagentOS plugins:
- plugin-trajectory-logger: Trajectory capture and export
- plugin-local-ai: Local GGUF model inference
- plugin-localdb: Persistent storage
"""

from tokagentos_art.base import (
    Action,
    BaseAgent,
    BaseEnvironment,
    EpisodeResult,
    State,
    TrainingConfig,
    TrainingMetrics,
    Trajectory,
)

__version__ = "1.0.0"

__all__ = [
    # Base classes
    "BaseEnvironment",
    "BaseAgent",
    "State",
    "Action",
    "EpisodeResult",
    "Trajectory",
    # Training
    "TrainingConfig",
    "TrainingMetrics",
]


# Lazy import TokagentOS integration to avoid import errors when not installed
def __getattr__(name: str):
    """Lazy load TokagentOS integration components."""
    tokagent_exports = {
        "TokagentTrajectoryLogger",
        "TokagentLocalAIProvider",
        "TokagentStorageAdapter",
        "ARTRuntime",
        "ARTRuntimeConfig",
        "create_art_runtime",
        "LocalModelConfig",
        "TrajectoryStore",
    }

    if name in tokagent_exports:
        from tokagentos_art import tokagent_integration

        return getattr(tokagent_integration, name)

    if name in {"GRPOTrainer", "RulerScorer"}:
        # Avoid importing heavy training deps (openpipe-art, torch, etc.) unless needed.
        from tokagentos_art.trainer import GRPOTrainer, RulerScorer

        return GRPOTrainer if name == "GRPOTrainer" else RulerScorer

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
