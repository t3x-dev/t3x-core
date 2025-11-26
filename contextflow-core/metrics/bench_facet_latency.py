#!/usr/bin/env python3
"""Simple latency benchmark for the evidence scorer."""

from __future__ import annotations

import json
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path

from core.evidence.scorer import EvidenceScorer
from core.evidence.weights import EvidenceWeights

DEFAULT_OUTPUT_PATH = Path("metrics/latency_report.json")
DEFAULT_ITERATIONS = 200


def run_benchmark(iterations: int = DEFAULT_ITERATIONS) -> dict:
    weights = EvidenceWeights.load(Path("configs/weights.yaml"))
    thresholds = json.loads(Path("configs/thresholds.yaml").read_text())
    scorer = EvidenceScorer(weights, half_life_hours=thresholds["half_life_hours"])

    turn_ts = datetime(2025, 1, 1, 12, tzinfo=timezone.utc)
    now = datetime(2025, 1, 3, 12, tzinfo=timezone.utc)

    timings = []
    for _ in range(iterations):
        start = time.perf_counter()
        components = scorer.compute_components(
            cosine=0.78,
            bm25_raw=1.5,
            turn_timestamp=turn_ts,
            now=now,
            role="user",
            expected_type="location",
            candidate_value="Osaka",
        )
        scorer.score(components)
        end = time.perf_counter()
        timings.append((end - start) * 1000)  # milliseconds

    avg = statistics.mean(timings)
    p95 = statistics.quantiles(timings, n=100)[94] if len(timings) >= 20 else max(timings)

    return {
        "latency_ms": {
            "avg": avg,
            "p95": p95,
            "iterations": iterations,
        },
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def main(output_path: Path | None = None) -> None:
    report = run_benchmark()
    target = output_path or DEFAULT_OUTPUT_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
