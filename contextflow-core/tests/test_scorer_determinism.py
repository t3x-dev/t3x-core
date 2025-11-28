"""
Evidence scorer determinism tests - PENDING IMPLEMENTATION

These tests ensure the evidence scoring system produces deterministic results
for the same input. Critical for reproducible semantic extraction.

Required modules:
- core.evidence.scorer.EvidenceScorer: Evidence scoring engine
- core.evidence.weights.EvidenceWeights: Configurable scoring weights

Test coverage:
- Same input produces identical scores across multiple runs
- Role mapping defaults correctly for unknown roles
- Time decay calculation is deterministic

Status: Skipped until core.evidence module is implemented
Tracking: See docs/PHASE2_EXECUTION_PLAN.md for implementation timeline
"""
from __future__ import annotations

import pytest

# Skip entire module - core.evidence module not yet implemented
# TODO: Remove skip when core.evidence module is implemented
pytest.skip(
    "core.evidence module not yet implemented",
    allow_module_level=True
)

from datetime import datetime, timezone
from pathlib import Path

from core.evidence.scorer import EvidenceScorer
from core.evidence.weights import EvidenceWeights


def test_evidence_scorer_is_deterministic() -> None:
    weights = EvidenceWeights.load(Path("configs/weights.yaml"))
    scorer = EvidenceScorer(weights, half_life_hours=48.0)

    turn_ts = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
    now = datetime(2025, 1, 3, 12, 0, tzinfo=timezone.utc)

    components_first = scorer.compute_components(
        cosine=0.75,
        bm25_raw=1.2,
        turn_timestamp=turn_ts,
        now=now,
        role="user",
        expected_type="location",
        candidate_value="Osaka",
    )

    components_second = scorer.compute_components(
        cosine=0.75,
        bm25_raw=1.2,
        turn_timestamp=turn_ts,
        now=now,
        role="user",
        expected_type="location",
        candidate_value="Osaka",
    )

    assert components_first == components_second

    score_first = scorer.score(components_first)
    score_second = scorer.score(components_second)

    assert score_first == score_second


def test_role_mapping_defaults_to_zero() -> None:
    weights = EvidenceWeights.load(Path("configs/weights.yaml"))
    scorer = EvidenceScorer(weights)
    turn_ts = datetime(2025, 1, 1, tzinfo=timezone.utc)
    now = datetime(2025, 1, 1, 1, tzinfo=timezone.utc)
    components = scorer.compute_components(
        cosine=0.1,
        bm25_raw=0.0,
        turn_timestamp=turn_ts,
        now=now,
        role="unknown-role",
        expected_type=None,
        candidate_value="",
    )

    assert components.role == 0.0
