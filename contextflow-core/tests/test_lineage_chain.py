"""Tests for commit and turn chain validation."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from core.lineage import (
    Commit,
    TurnValidationError,
    CommitValidationError,
    compute_commit_hash,
    validate_commit_chain,
    validate_turn_chain,
)
from core.storage import JSONLConversationStore


def _build_turns():
    sequence = [
        ("user", "Turn one"),
        ("assistant", "Turn two"),
        ("user", "Turn three"),
    ]
    with TemporaryDirectory() as tmp:
        path = Path(tmp) / "turns.jsonl"
        store = JSONLConversationStore(path)
        turns = []
        for idx, (role, content) in enumerate(sequence, start=1):
            turns.append(
                store.append(
                    role,
                    content,
                    timestamp=f"2025-01-01T00:00:{idx:02d}Z",
                    turn_id=f"turn-{idx}",
                )
            )
        # load again to decouple from TemporaryDirectory lifetime
        final_turns = store.load_turns()
    return final_turns


def _build_commits(turns):
    first_commit_payload = Commit(
        id="commit-1",
        parent=None,
        parents=[],
        anchor_turn_hash=turns[-1].hash,
        tree_hash="tree-hash-1",
        diff_hash="diff-hash-1",
        message="Initial commit",
        created_at="2025-01-01T00:01:00Z",
        commit_hash="",
    )
    first_commit = replace(
        first_commit_payload,
        commit_hash=compute_commit_hash(first_commit_payload),
    )

    second_commit_payload = Commit(
        id="commit-2",
        parent=first_commit.commit_hash,
        parents=[],
        anchor_turn_hash=turns[-1].hash,
        tree_hash="tree-hash-2",
        diff_hash="diff-hash-2",
        message="Second commit",
        created_at="2025-01-01T00:02:00Z",
        commit_hash="",
    )
    second_commit = replace(
        second_commit_payload,
        commit_hash=compute_commit_hash(second_commit_payload),
    )

    return [first_commit, second_commit]


def test_turn_chain_validation_passes_for_valid_chain():
    turns = _build_turns()
    validate_turn_chain(turns)


def test_turn_chain_validation_detects_tamper():
    turns = _build_turns()
    tampered = list(turns)
    tampered[1] = replace(tampered[1], content="Tampered content")

    with pytest.raises(TurnValidationError):
        validate_turn_chain(tampered)


def test_commit_chain_validation_passes_for_valid_chain():
    turns = _build_turns()
    commits = _build_commits(turns)
    validate_commit_chain(commits)


def test_commit_chain_validation_detects_bad_parent():
    turns = _build_turns()
    commits = _build_commits(turns)
    bad_second = replace(commits[1], parent="unknown-parent")
    with pytest.raises(CommitValidationError):
        validate_commit_chain([commits[0], bad_second])


def test_commit_chain_validation_detects_bad_hash():
    turns = _build_turns()
    commits = _build_commits(turns)
    tampered = replace(commits[1], commit_hash="deadbeef")
    with pytest.raises(CommitValidationError):
        validate_commit_chain([commits[0], tampered])
