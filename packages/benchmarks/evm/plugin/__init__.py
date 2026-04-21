"""
TokagentOS Plugin for the EVM Benchmark.

This plugin provides canonical TokagentOS actions and providers for EVM
exploration during benchmarking.  It enables the agent to interact with
an Anvil node through the standard TokagentOS action system.

Actions:
    EXECUTE_CODE — Write TypeScript, run via Bun, get reward feedback.

Providers:
    EVM_CONTEXT — Inject discovery state, contract catalog, chain info.
"""

from tokagentos.types import Plugin

from .actions import EVM_ACTIONS
from .providers import EVM_PROVIDERS

__all__ = ["evm_bench_plugin", "create_evm_bench_plugin"]


def create_evm_bench_plugin() -> Plugin:
    """Create the EVM Benchmark plugin with all actions and providers."""
    return Plugin(
        name="evm-bench",
        description=(
            "EVM Benchmark plugin for TokagentOS — provides the EXECUTE_CODE action "
            "for running TypeScript skills on an EVM chain and the EVM_CONTEXT "
            "provider for injecting discovery state and contract catalog."
        ),
        config={},
        actions=EVM_ACTIONS,
        providers=EVM_PROVIDERS,
        evaluators=[],
        services=[],
    )


evm_bench_plugin = create_evm_bench_plugin()
