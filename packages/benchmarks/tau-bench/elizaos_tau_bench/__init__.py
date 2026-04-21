"""
TokagentOS Tau-bench - Tool-Agent-User Interaction Benchmark.

Tau-bench evaluates LLMs' ability to effectively utilize tools in real-world
customer service scenarios across multiple domains:

- Retail Domain: E-commerce customer support (orders, returns, refunds)
- Airline Domain: Flight booking and management (reservations, changes, cancellations)

Key metrics:
- Pass^k: Reliability metric measuring success across k independent trials
- Tool Call Accuracy: Correct tool selection and parameter extraction
- Policy Compliance: Adherence to domain-specific business rules
- Response Quality: Helpfulness and accuracy of final responses
"""

__version__ = "0.1.0"

from tokagentos_tau_bench.types import (
    TauDomain,
    ToolCallStatus,
    ToolDefinition,
    ToolCall,
    ToolResult,
    PolicyConstraint,
    TauBenchTask,
    TauBenchResult,
    TauBenchReport,
    TauBenchConfig,
    PassKMetrics,
)
from tokagentos_tau_bench.dataset import DataValidationError
from tokagentos_tau_bench.evaluator import TauBenchEvaluator
from tokagentos_tau_bench.agent import TauAgent  # Legacy mock agent
from tokagentos_tau_bench.tokagent_agent import (
    TokagentOSTauAgent,
    MockTauAgent,
    create_tau_agent,
    TOKAGENTOS_AVAILABLE,
)
from tokagentos_tau_bench.constants import LEADERBOARD_SCORES
from tokagentos_tau_bench.environments.base import DomainEnvironment
from tokagentos_tau_bench.environments.retail import RetailEnvironment
from tokagentos_tau_bench.environments.airline import AirlineEnvironment
from tokagentos_tau_bench.runner import TauBenchRunner

__all__ = [
    # Types
    "TauDomain",
    "ToolCallStatus",
    "ToolDefinition",
    "ToolCall",
    "ToolResult",
    "PolicyConstraint",
    "TauBenchTask",
    "TauBenchResult",
    "TauBenchReport",
    "TauBenchConfig",
    "PassKMetrics",
    # Core components
    "TauBenchRunner",
    "TauBenchEvaluator",
    "TauAgent",
    # TokagentOS-integrated agents
    "TokagentOSTauAgent",
    "MockTauAgent",
    "create_tau_agent",
    "TOKAGENTOS_AVAILABLE",
    # Environments
    "DomainEnvironment",
    "RetailEnvironment",
    "AirlineEnvironment",
    # Errors
    "DataValidationError",
    # Constants
    "LEADERBOARD_SCORES",
]
