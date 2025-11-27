"""
End-to-end integration tests

These tests don't actually call OpenAI or sentence-transformers, but instead
use Stub Embedding / LLM Provider to validate that the "Turn → Ledger → Diff → Merge →
Storage rebuild" pipeline runs according to the Architecture Documentation.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from core.agents import MergeAgent
from core.diff import DiffEngine, DiffType
from core.ledger.commit_ledger import CommitLedger, CommitRecord
from core.ledger.turn_ledger import TurnLedger, TurnRecord
from core.storage import init_database, rebuild_from_ledger


class StubEmbeddingProvider:
    """Simple embedding provider, using text length for cosine approximation."""

    def encode(self, texts):
        return [[len(t)] for t in texts]

    def similarity(self, vec_a, vec_b):
        a = vec_a[0]
        b = vec_b[0]
        if a == 0 or b == 0:
            return 0.0
        return 1.0 - abs(a - b) / max(a, b)


def _make_ring_snapshot(turn_id: str, text: str) -> dict:
    """Construct minimal Ring snapshot, avoiding dependency on spaCy."""
    return {
        "turn_id": turn_id,
        "ring1": {
            "keywords": [
                {"text": text, "lemma": text.lower(), "polarity": 1, "pos": "NOUN", "entity_type": None, "confidence": 1.0}
            ],
            "time_anchor": None,
            "topic": None,
        },
        "ring2": {"facets": []},
        "ring3": {"segments": [{"segment_id": f"{turn_id}-s1", "text": text}]},
    }


def test_turn_commit_storage_roundtrip(tmp_path: Path):
    """Complete flow of TurnLedger + CommitLedger + SQLite rebuild."""
    ledger_dir = tmp_path / "ledgers"
    ledger_dir.mkdir()

    turn_ledger = TurnLedger(ledger_dir / "turns.jsonl")
    commit_ledger = CommitLedger(ledger_dir / "commits.jsonl")

    turn1 = TurnRecord.create(
        project_id="proj",
        conversation_id="conv",
        role="user",
        content="I want to visit Japan.",
        ring_snapshot=_make_ring_snapshot("turn-1", "visit japan"),
    )
    turn2 = TurnRecord.create(
        project_id="proj",
        conversation_id="conv",
        role="assistant",
        content="Sure, let's plan a trip.",
        parent_turn_hash=turn1.turn_hash,
        ring_snapshot=_make_ring_snapshot("turn-2", "plan trip"),
    )
    turn_ledger.append(turn1)
    turn_ledger.append(turn2)

    commit = CommitRecord.create(
        project_id="proj",
        branch="main",
        parent_hashes=[],
        turn_window={
            "start_turn_hash": turn1.turn_hash,
            "end_turn_hash": turn2.turn_hash,
        },
        facet_snapshot=[{"facet": "goal", "text": "Plan Japan trip"}],
        pipeline_config={"extractor": "ring-default"},
        draft_ref={
            "draft_id": "draft-1",
            "text_hash": "sha256:draft-text",
        },
    )
    commit_ledger.append(commit)

    db = init_database(tmp_path / "contextflow.db")
    rebuild_from_ledger(db, ledger_dir)

    stored_turns = db.fetchall("SELECT * FROM turns")
    stored_commits = db.fetchall("SELECT * FROM commits")

    assert len(stored_turns) == 2
    assert stored_turns[0]["turn_hash"] == turn1.turn_hash
    assert stored_turns[1]["parent_turn_hash"] == turn1.turn_hash

    assert len(stored_commits) == 1
    assert stored_commits[0]["draft_id"] == "draft-1"
    assert stored_commits[0]["draft_text_hash"] == "sha256:draft-text"

    db.close()


def test_diff_and_merge_with_stub_embedding():
    """Validate that DiffEngine + MergeAgent can run with stub embedding."""
    embedding = StubEmbeddingProvider()
    diff_engine = DiffEngine(embedding_provider=embedding, threshold=0.5)
    merge_agent = MergeAgent(diff_engine=diff_engine)

    base_segments = [
        {"segment_id": "s1", "text": "Support email login."},
    ]
    source_segments = [
        {"segment_id": "s1", "text": "Support email and phone login."},
        {"segment_id": "s2", "text": "Add remember me option."},
    ]
    target_segments = [
        {"segment_id": "s1", "text": "Support email and WeChat login."},
        {"segment_id": "s3", "text": "Add captcha verification."},
    ]

    diff_result = diff_engine.diff_three_way(
        base_id="base",
        base_segments=base_segments,
        source_id="source",
        source_segments=source_segments,
        target_id="target",
        target_segments=target_segments,
    )

    assert diff_result.base_id == "base"
    assert diff_result.source_id == "source"
    assert diff_result.target_id == "target"
    assert diff_result.conflict_count == 1  # Both sides modified s1
    assert any(diff.diff_type == DiffType.ADDED for diff in diff_result.segment_diffs)

    merge_result = merge_agent.merge(
        base_id="base",
        base_segments=base_segments,
        source_id="source",
        source_segments=source_segments,
        target_id="target",
        target_segments=target_segments,
    )

    assert merge_result.conflict_count == 1
    assert merge_result.base_id == "base"
    assert merge_result.source_id == "source"
    assert merge_result.target_id == "target"
    # Keep both source/target added segments
    merged_texts = {seg["text"] for seg in merge_result.merged_segments}
    assert "Add remember me option." in merged_texts
    assert any("CONFLICT" in seg["text"] for seg in merge_result.merged_segments)
