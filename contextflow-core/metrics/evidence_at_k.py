#!/usr/bin/env python3
"""Compute Evidence@K, auto-apply rate, and determinism metadata."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence

DEFAULT_THRESHOLDS_PATH = Path("configs/thresholds.yaml")


@dataclass
class EvidenceExample:
    facet_id: str
    ranked_evidence: Sequence[str]
    ground_truth: Sequence[str]
    confidence: float
    margin: float


SAMPLE_DATASET: List[EvidenceExample] = [
    EvidenceExample(
        facet_id="destination",
        ranked_evidence=["turn-3", "turn-2", "turn-1"],
        ground_truth=["turn-3"],
        confidence=0.82,
        margin=0.12,
    ),
    EvidenceExample(
        facet_id="budget",
        ranked_evidence=["turn-5", "turn-4", "turn-3"],
        ground_truth=["turn-4"],
        confidence=0.76,
        margin=0.05,
    ),
    EvidenceExample(
        facet_id="date",
        ranked_evidence=["turn-6", "turn-5", "turn-3"],
        ground_truth=["turn-6", "turn-7"],
        confidence=0.90,
        margin=0.15,
    ),
]


def load_thresholds(path: Path = DEFAULT_THRESHOLDS_PATH) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data


def evidence_at_k(dataset: Iterable[EvidenceExample], k: int) -> float:
    total = 0
    hits = 0
    for example in dataset:
        total += 1
        top_k = example.ranked_evidence[:k]
        if any(ev in example.ground_truth for ev in top_k):
            hits += 1
    return hits / total if total else 0.0


def auto_apply_rate(
    dataset: Iterable[EvidenceExample],
    *,
    confidence_threshold: float,
    margin_threshold: float,
) -> float:
    eligible = 0
    auto_applied = 0

    for example in dataset:
        eligible += 1
        if (
            example.confidence >= confidence_threshold
            and example.margin >= margin_threshold
        ):
            auto_applied += 1

    return auto_applied / eligible if eligible else 0.0


def compute_metrics(
    dataset: Iterable[EvidenceExample],
    thresholds: dict,
) -> dict:
    data_list = list(dataset)
    e1 = evidence_at_k(data_list, 1)
    e3 = evidence_at_k(data_list, 3)
    auto_rate = auto_apply_rate(
        data_list,
        confidence_threshold=thresholds["confidence_threshold"],
        margin_threshold=thresholds["margin_threshold"],
    )

    return {
        "evidence_at_1": e1,
        "evidence_at_3": e3,
        "auto_apply_rate": auto_rate,
        "thresholds": {
            "tau": thresholds["confidence_threshold"],
            "delta": thresholds["margin_threshold"],
        },
    }


def main(dataset_path: Path | None = None, output_path: Path | None = None) -> None:
    thresholds = load_thresholds()

    dataset = SAMPLE_DATASET
    if dataset_path:
        dataset = [
            EvidenceExample(**entry)
            for entry in json.loads(Path(dataset_path).read_text(encoding="utf-8"))
        ]

    results = compute_metrics(dataset, thresholds)

    if output_path:
        Path(output_path).write_text(json.dumps(results, indent=2), encoding="utf-8")
    else:
        print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
