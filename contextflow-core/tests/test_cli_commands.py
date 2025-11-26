from __future__ import annotations

import json
from dataclasses import asdict, replace
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from cli.commands import explain, metrics, verify
from core.lineage import Commit, compute_commit_hash
from core.storage import JSONLConversationStore


def _create_turn_chain(path: Path) -> None:
    store = JSONLConversationStore(path)
    store.append("user", "First message", timestamp="2025-01-01T00:00:00Z", turn_id="turn-1")
    store.append("assistant", "Second message", timestamp="2025-01-01T00:00:10Z", turn_id="turn-2")


def _create_commits(path: Path, anchor_hash: str) -> None:
    commit = Commit(
        id="commit-1",
        parent=None,
        parents=[],
        anchor_turn_hash=anchor_hash,
        tree_hash="tree-hash",
        diff_hash="diff-hash",
        message="Initial commit",
        created_at="2025-01-01T00:01:00Z",
    )
    commit = replace(commit, hash=compute_commit_hash(commit))
    with open(path, "w", encoding="utf-8") as f:
        json.dump([asdict(commit)], f, ensure_ascii=False)


def test_verify_command_passes_for_valid_data() -> None:
    with TemporaryDirectory() as tmp:
        conv_path = Path(tmp) / "conv.jsonl"
        _create_turn_chain(conv_path)
        turns = JSONLConversationStore(conv_path).load_turns()

        commits_path = Path(tmp) / "commits.json"
        _create_commits(commits_path, turns[-1].hash)

        assert verify.run(conv_path, commits_path)


def test_metrics_command_runs() -> None:
    with TemporaryDirectory() as tmp:
        metrics_output = Path(tmp) / "metrics.json"
        latency_output = Path(tmp) / "latency.json"
        metrics.run(metrics_output=metrics_output, latency_output=latency_output)
        assert metrics_output.exists()
        assert latency_output.exists()


def test_explain_command_returns_component_breakdown() -> None:
    result = explain.run(
        cosine=0.8,
        bm25_raw=1.0,
        role="user",
        candidate_value="Osaka",
        expected_type="location",
        turn_timestamp=datetime(2025, 1, 1, tzinfo=timezone.utc),
        now=datetime(2025, 1, 2, tzinfo=timezone.utc),
    )
    assert "components" in result
    assert result["components"]["cosine"] == 0.8
