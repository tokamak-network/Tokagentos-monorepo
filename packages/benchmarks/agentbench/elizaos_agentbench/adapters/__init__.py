"""
Environment adapters for AgentBench.

Each adapter interfaces between the TokagentOS runtime and a specific
AgentBench environment.
"""

from tokagentos_agentbench.adapters.base import EnvironmentAdapter
from tokagentos_agentbench.adapters.os_adapter import OSEnvironmentAdapter
from tokagentos_agentbench.adapters.db_adapter import DatabaseEnvironmentAdapter
from tokagentos_agentbench.adapters.webshop_adapter import WebShopEnvironmentAdapter
from tokagentos_agentbench.adapters.kg_adapter import KnowledgeGraphAdapter
from tokagentos_agentbench.adapters.lateral_thinking_adapter import LateralThinkingAdapter

__all__ = [
    "EnvironmentAdapter",
    "OSEnvironmentAdapter",
    "DatabaseEnvironmentAdapter",
    "WebShopEnvironmentAdapter",
    "KnowledgeGraphAdapter",
    "LateralThinkingAdapter",
]
