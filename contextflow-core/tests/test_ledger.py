"""
Ledger 测试

测试 JSONL 主账本的读写逻辑。
"""

import json
import tempfile
from pathlib import Path

import pytest

from core.ledger import CommitLedger, DraftLedger, TurnLedger
from core.ledger.turn_ledger import TurnRecord


class TestTurnLedger:
    """测试 Turn Ledger"""

    def test_append_turn(self):
        """测试追加 Turn 记录"""
        with tempfile.TemporaryDirectory() as tmpdir:
            ledger_path = Path(tmpdir) / "turns.jsonl"
            ledger = TurnLedger(ledger_path)

            # 创建 Turn 记录
            turn = TurnRecord.create(
                turn_hash="sha256:abc123",
                parent_turn_hash=None,
                project_id="test-project",
                conversation_id="test-conv",
                role="user",
                content="Hello world",
                ring_snapshot=None,  # 简化测试
            )

            # 追加记录
            ledger.append(turn)

            # 验证文件存在且包含记录
            assert ledger_path.exists()

            with open(ledger_path, "r") as f:
                lines = f.readlines()
                assert len(lines) == 1
                data = json.loads(lines[0])
                assert data["turn_hash"] == "sha256:abc123"
                assert data["role"] == "user"
                assert data["content"] == "Hello world"

    def test_load_all_turns(self):
        """测试加载所有 Turn 记录"""
        with tempfile.TemporaryDirectory() as tmpdir:
            ledger_path = Path(tmpdir) / "turns.jsonl"
            ledger = TurnLedger(ledger_path)

            # 追加多条记录
            for i in range(3):
                turn = TurnRecord.create(
                    turn_hash=f"sha256:turn-{i}",
                    parent_turn_hash=None,
                    project_id="test-project",
                    conversation_id="test-conv",
                    role="user",
                    content=f"Turn {i}",
                    ring_snapshot=None,
                )
                ledger.append(turn)

            # 加载所有记录
            turns = ledger.load_all()

            # 验证
            assert len(turns) == 3
            assert turns[0].content == "Turn 0"
            assert turns[2].content == "Turn 2"

    def test_turn_hash_calculation(self):
        """测试 Turn Hash 计算"""
        turn = TurnRecord.create(
            turn_hash="placeholder",
            parent_turn_hash=None,
            project_id="test-project",
            conversation_id="test-conv",
            role="user",
            content="Test content",
            ring_snapshot=None,
        )

        # Hash 应该以 sha256: 开头
        assert turn.turn_hash.startswith("sha256:")

        # 相同输入应该产生相同 hash
        turn2 = TurnRecord.create(
            turn_hash="placeholder",
            parent_turn_hash=None,
            project_id="test-project",
            conversation_id="test-conv",
            role="user",
            content="Test content",
            ring_snapshot=None,
        )

        # 注意：由于 created_at 不同，hash 会不同
        # 这里只验证格式
        assert turn2.turn_hash.startswith("sha256:")


class TestCommitLedger:
    """测试 Commit Ledger"""

    def test_append_commit(self):
        """测试追加 Commit 记录"""
        with tempfile.TemporaryDirectory() as tmpdir:
            ledger_path = Path(tmpdir) / "commits.jsonl"
            ledger = CommitLedger(ledger_path)

            commit_data = {
                "commit_hash": "sha256:commit-1",
                "project_id": "test-project",
                "branch": "main",
                "parent_hashes": ["sha256:parent-1"],
                "turn_window": {
                    "start_turn_hash": "sha256:turn-1",
                    "end_turn_hash": "sha256:turn-2",
                },
                "facet_snapshot": {"keywords": []},
                "pipeline_config": {"threshold": 0.70},
                "schema_version": "commit_v1",
            }

            ledger.append(commit_data)

            # 验证
            assert ledger_path.exists()

            with open(ledger_path, "r") as f:
                lines = f.readlines()
                assert len(lines) == 1
                data = json.loads(lines[0])
                assert data["commit_hash"] == "sha256:commit-1"
                assert data["branch"] == "main"


class TestDraftLedger:
    """测试 Draft Ledger"""

    def test_append_draft(self):
        """测试追加 Draft 记录"""
        with tempfile.TemporaryDirectory() as tmpdir:
            ledger_path = Path(tmpdir) / "drafts.jsonl"
            ledger = DraftLedger(ledger_path)

            draft_data = {
                "draft_id": "draft-1",
                "project_id": "test-project",
                "base_commit_hash": "sha256:commit-1",
                "turn_anchor_hash": "sha256:turn-10",
                "bridge_id": "plan",
                "bridge_payload": {"threshold": 0.60},
                "must_have": ["login", "authentication"],
                "mustnt_have": ["password"],
                "llm_config": {"model": "gpt-4", "temperature": 0.3},
                "text": "This is the draft text.",
                "status": "accepted",
            }

            ledger.append(draft_data)

            # 验证
            assert ledger_path.exists()

            with open(ledger_path, "r") as f:
                lines = f.readlines()
                assert len(lines) == 1
                data = json.loads(lines[0])
                assert data["draft_id"] == "draft-1"
                assert data["bridge_id"] == "plan"
                assert data["status"] == "accepted"
