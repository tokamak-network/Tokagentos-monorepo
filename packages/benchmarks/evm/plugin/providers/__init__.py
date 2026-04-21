"""EVM Benchmark Providers for TokagentOS."""

from .evm_context import evm_context_provider

__all__ = [
    "evm_context_provider",
    "EVM_PROVIDERS",
]

EVM_PROVIDERS = [
    evm_context_provider,
]
