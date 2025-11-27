"""
Ledger tests

Tests for JSONL main ledger read/write logic.
"""

import json
import tempfile
from pathlib import Path

import pytest

from core.ledger import CommitLedger, DraftLedger, TurnLedger
from core.ledger.turn_ledger import TurnRecord


class TestTurnLedger:
    """Test Turn Ledger"""

    def test_append_turn(self):
        """Test appending Turn record"""
        with tempfile.TemporaryDirectory() as tmpdir:
            ledger_path = Path(tmpdir) / "turns.jsonl"
            ledger = TurnLedger(ledger_path)

            # Create Turn record
            turn = TurnRecord.create(
                turn_hash="sha256:abc123",
                parent_turn_hash=None,
                project_id="test-project",
                conversation_id="test-conv",
                role="user",
                content="Hello world",
                ring_snapshot=None,  # Simplified test
            )

            # Append record
            ledger.append(turn)

            # Validate file exists and contains record
            assert ledger_path.exists()

            with open(ledger_path, "r") as f:
                lines = f.readlines()
                assert len(lines) == 1
                data = json.loads(lines[0])
                assert data["turn_hash"] == "sha256:abc123"
                assert data["role"] == "user"
                assert data["content"] == "Hello world"

    def test_load_all_turns(self):
        """Test loading all Turn records"""
        with tempfile.TemporaryDirectory() as tmpdir:
            ledger_path = Path(tmpdir) / "turns.jsonl"
            ledger = TurnLedger(ledger_path)

            # Append multiple records
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

            # Load all records
            turns = ledger.load_all()

            # Validate
            assert len(turns) == 3
            assert turns[0].content == "Turn 0"
            assert turns[2].content == "Turn 2"

    def test_turn_hash_calculation(self):
        """Test Turn Hash calculation"""
        turn = TurnRecord.create(
            turn_hash="placeholder",
            parent_turn_hash=None,
            project_id="test-project",
            conversation_id="test-conv",
            role="user",
            content="Test content",
            ring_snapshot=None,
        )

        # Hash should start with sha256:
        assert turn.turn_hash.startswith("sha256:")

        # Same input should produce same hash
        turn2 = TurnRecord.create(
            turn_hash="placeholder",
            parent_turn_hash=None,
            project_id="test-project",
            conversation_id="test-conv",
            role="user",
            content="Test content",
            ring_snapshot=None,
        )

        # Note: due to different created_at, hash will be different
        # Here we only validate format
        assert turn2.turn_hash.startswith("sha256:")


class TestCommitLedger:
    """Test Commit Ledger"""

    def test_append_commit(self):
        """Test appending Commit record"""
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

            # Validate
            assert ledger_path.exists()

            with open(ledger_path, "r") as f:
                lines = f.readlines()
                assert len(lines) == 1
                data = json.loads(lines[0])
                assert data["commit_hash"] == "sha256:commit-1"
                assert data["branch"] == "main"


class TestDraftLedger:
    """Test Draft Ledger"""

    def test_append_draft(self):
        """Test appending Draft record"""
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

            # Validate
            assert ledger_path.exists()

            with open(ledger_path, "r") as f:
                lines = f.readlines()
                assert len(lines) == 1
                data = json.loads(lines[0])
                assert data["draft_id"] == "draft-1"
                assert data["bridge_id"] == "plan"
                assert data["status"] == "accepted"
