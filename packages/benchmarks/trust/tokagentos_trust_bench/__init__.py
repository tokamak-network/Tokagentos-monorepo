"""Agent trust & security benchmark for TokagentOS."""

from tokagentos_trust_bench.baselines import PerfectHandler, RandomHandler
from tokagentos_trust_bench.corpus import TEST_CORPUS, get_corpus
from tokagentos_trust_bench.runner import TrustBenchmarkRunner
from tokagentos_trust_bench.scorer import score_results
from tokagentos_trust_bench.types import (
    BenchmarkConfig,
    BenchmarkResult,
    CategoryScore,
    DetectionResult,
    Difficulty,
    ThreatCategory,
    TrustHandler,
    TrustTestCase,
)

# TokagentTrustHandler is optional — requires tokagentos + tokagentos-plugin-openai
try:
    from tokagentos_trust_bench.tokagent_handler import TokagentTrustHandler
except ImportError:
    TokagentTrustHandler = None  # type: ignore[misc, assignment]

__all__ = [
    "BenchmarkConfig",
    "BenchmarkResult",
    "CategoryScore",
    "DetectionResult",
    "Difficulty",
    "TokagentTrustHandler",
    "PerfectHandler",
    "RandomHandler",
    "TEST_CORPUS",
    "ThreatCategory",
    "TrustBenchmarkRunner",
    "TrustHandler",
    "TrustTestCase",
    "get_corpus",
    "score_results",
]
