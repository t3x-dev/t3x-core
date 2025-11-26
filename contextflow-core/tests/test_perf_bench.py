"""Smoke test for latency benchmark."""

from __future__ import annotations

from metrics.bench_facet_latency import run_benchmark


def test_run_benchmark_returns_expected_keys() -> None:
    report = run_benchmark(iterations=5)
    assert "latency_ms" in report
    assert "avg" in report["latency_ms"]
    assert "p95" in report["latency_ms"]
