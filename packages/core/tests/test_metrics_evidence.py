"""Tests for evidence_at_k metrics script."""

from __future__ import annotations

from metrics.evidence_at_k import SAMPLE_DATASET, compute_metrics, load_thresholds


def test_compute_metrics_with_sample_dataset() -> None:
    thresholds = load_thresholds()
    results = compute_metrics(SAMPLE_DATASET, thresholds)

    assert 0.0 <= results["evidence_at_1"] <= 1.0
    assert 0.0 <= results["evidence_at_3"] <= 1.0
    assert 0.0 <= results["auto_apply_rate"] <= 1.0
