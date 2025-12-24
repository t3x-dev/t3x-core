"""
Performance benchmark tests - PENDING IMPLEMENTATION

These tests validate the latency benchmarking infrastructure for facet extraction.
Requires the core.evidence module which provides deterministic evidence scoring.

Required modules:
- core.evidence.scorer.EvidenceScorer: Evidence scoring engine
- metrics.bench_facet_latency: Latency benchmark runner

Status: Skipped until core.evidence module is implemented
Tracking: See docs/PHASE2_EXECUTION_PLAN.md for implementation timeline
"""
from __future__ import annotations

import pytest

# Skip entire module - core.evidence module not yet implemented
# TODO: Remove skip when core.evidence module is implemented
pytest.skip(
    "core.evidence module not yet implemented - required by bench_facet_latency",
    allow_module_level=True
)

from metrics.bench_facet_latency import run_benchmark


def test_run_benchmark_returns_expected_keys() -> None:
    report = run_benchmark(iterations=5)
    assert "latency_ms" in report
    assert "avg" in report["latency_ms"]
    assert "p95" in report["latency_ms"]
