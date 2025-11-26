"""
端到端集成测试

这些测试不会真正调用 OpenAI 或 sentence-transformers，而是通过
Stub Embedding / LLM Provider 来验证“Turn → Ledger → Diff → Merge →
Storage 重建”这条链路是否按照架构文档运行。
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
    """简单的嵌入提供者，使用文本长度做余弦近似。"""

    def encode(self, texts):
        return [[len(t)] for t in texts]

    def similarity(self, vec_a, vec_b):
        a = vec_a[0]
        b = vec_b[0]
        if a == 0 or b == 0:
            return 0.0
        return 1.0 - abs(a - b) / max(a, b)


def _make_ring_snapshot(turn_id: str, text: str) -> dict:
    """构造最小的 Ring 快照，避免依赖 spaCy。"""
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
    """TurnLedger + CommitLedger + SQLite 重建的完整流程。"""
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
    """验证 DiffEngine + MergeAgent 可以在 stub embedding 下运行。"""
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
    assert diff_result.conflict_count == 1  # 双方都改了 s1
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
    # 同时保留 source/target 的新增段落
    merged_texts = {seg["text"] for seg in merge_result.merged_segments}
    assert "Add remember me option." in merged_texts
    assert any("CONFLICT" in seg["text"] for seg in merge_result.merged_segments)
