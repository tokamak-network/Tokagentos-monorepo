"""
Terminal-Bench Benchmark for TokagentOS

A benchmark evaluating AI agents' proficiency in performing complex tasks
within terminal environments, including code compilation, system administration,
and machine learning model training.

Two agent modes are available:
- TokagentTerminalAgent: Full TokagentOS runtime with message_service.handle_message(),
  actions, providers, and evaluators (canonical usage)
- TerminalAgent: Standalone agent with direct OpenAI API calls (for testing)
"""

from tokagentos_terminal_bench.types import (
    TaskCategory,
    TaskDifficulty,
    TerminalTask,
    TerminalCommand,
    TerminalSession,
    TerminalBenchResult,
    TerminalBenchReport,
    TerminalBenchConfig,
    LEADERBOARD_SCORES,
)
from tokagentos_terminal_bench.dataset import TerminalBenchDataset
from tokagentos_terminal_bench.environment import TerminalEnvironment
from tokagentos_terminal_bench.agent import TerminalAgent
from tokagentos_terminal_bench.tokagent_agent import TokagentTerminalAgent
from tokagentos_terminal_bench.evaluator import TerminalBenchEvaluator
from tokagentos_terminal_bench.runner import TerminalBenchRunner
from tokagentos_terminal_bench.plugin import terminal_bench_plugin

__version__ = "0.1.0"

__all__ = [
    # Types
    "TaskCategory",
    "TaskDifficulty",
    "TerminalTask",
    "TerminalCommand",
    "TerminalSession",
    "TerminalBenchResult",
    "TerminalBenchReport",
    "TerminalBenchConfig",
    "LEADERBOARD_SCORES",
    # Core classes
    "TerminalBenchDataset",
    "TerminalEnvironment",
    "TerminalAgent",
    "TokagentTerminalAgent",
    "TerminalBenchEvaluator",
    "TerminalBenchRunner",
    # Plugin
    "terminal_bench_plugin",
]
