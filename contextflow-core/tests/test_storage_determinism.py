"""
JSONL storage determinism tests - PENDING IMPLEMENTATION

These tests ensure the JSONL conversation storage produces byte-identical output
for the same input sequence. Critical for hash chain integrity.

Required modules:
- core.storage.JSONLConversationStore: JSONL-based conversation persistence
- core.storage.Turn: Turn data structure with hash

Test coverage:
- Same message sequence produces identical hashes
- Same message sequence produces byte-identical JSONL files
- prev_hash correctly links to prior turn

Status: Skipped until JSONLConversationStore is implemented in core.storage
Tracking: See docs/PHASE2_EXECUTION_PLAN.md for implementation timeline
"""
from __future__ import annotations

import pytest

# Skip entire module - JSONLConversationStore not yet implemented in core.storage
# TODO: Remove skip when JSONLConversationStore is implemented
pytest.skip(
    "JSONLConversationStore not yet implemented in core.storage",
    allow_module_level=True
)

from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Iterable, List, Tuple

from core.storage import JSONLConversationStore, Turn


def _append_sequence(
    store: JSONLConversationStore,
    sequence: Iterable[Tuple[str, str]],
) -> List[Turn]:
    turns: List[Turn] = []
    for index, (role, content) in enumerate(sequence, start=1):
        turn_id = f"turn-{index}"
        timestamp = f"2025-01-01T00:00:{index:02d}Z"
        turns.append(
            store.append(
                role,
                content,
                timestamp=timestamp,
                turn_id=turn_id,
            )
        )
    return turns


def test_same_sequence_produces_identical_hashes() -> None:
    sequence = [
        ("user", "Let's plan a trip to Osaka."),
        ("assistant", "Great! When would you like to travel?"),
        ("user", "Late November, budget around $2000."),
    ]

    with TemporaryDirectory() as tmp:
        path_a = Path(tmp) / "conversation_a.jsonl"
        path_b = Path(tmp) / "conversation_b.jsonl"

        store_a = JSONLConversationStore(path_a)
        turns_a = _append_sequence(store_a, sequence)

        store_b = JSONLConversationStore(path_b)
        turns_b = _append_sequence(store_b, sequence)

        hashes_a = [turn.hash for turn in turns_a]
        hashes_b = [turn.hash for turn in turns_b]
        prev_hashes_a = [turn.prev_turn_hash for turn in turns_a]
        prev_hashes_b = [turn.prev_turn_hash for turn in turns_b]

        assert hashes_a == hashes_b
        assert prev_hashes_a == prev_hashes_b

        # Ensure JSONL files are byte-identical.
        content_a = path_a.read_bytes()
        content_b = path_b.read_bytes()
        assert content_a == content_b


def test_prev_hash_links_to_prior_turn() -> None:
    sequence = [
        ("user", "First message"),
        ("assistant", "Second message"),
        ("user", "Third message"),
    ]

    with TemporaryDirectory() as tmp:
        path = Path(tmp) / "conversation.jsonl"
        store = JSONLConversationStore(path)
        turns = _append_sequence(store, sequence)

        assert turns[0].prev_turn_hash is None
        for current, previous in zip(turns[1:], turns[:-1]):
            assert current.prev_turn_hash == previous.hash
