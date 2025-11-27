"""
Turn Ledger (conversation turn ledger)

Records raw conversation turns and their hash chain.

File path: `.contextflow/ledgers/turns.jsonl`
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, TextIO

from .hash_utils import compute_jcs_hash


def utc_now_iso() -> str:
    """Return UTC timestamp (ISO 8601 format)"""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class TurnRecord:
    """
    Turn record (corresponds to Turn Ledger structure in STORAGE_ARCHITECTURE.md)

    ⚠️ Important: According to docs/ARCHITECTURE.zh.md:45-55, Turn Ledger must save Ring 1/2/3 snapshots
    to enable semantic replay during Draft Workflow, Diff, and Merge, ensuring reproducibility.

    All fields participate in hashing (except turn_hash itself).
    """

    turn_hash: str  # SHA-256 hash (JCS normalized)
    parent_turn_hash: Optional[str]  # Previous turn_hash; null for root turn
    project_id: str
    conversation_id: str
    role: str  # "user" | "assistant" | "system" | "tool"
    content: str  # Raw text

    # Ring 1/2/3 snapshot (must be persisted per documentation requirements)
    ring_snapshot: Optional[Dict[str, Any]] = None  # Serialized form of Ring 1/2/3 output

    metadata: Optional[Dict[str, Any]] = None  # Optional metadata (e.g., model name)
    created_at: str = None  # ISO 8601 timestamp
    schema_version: str = "turn_v1"

    def __post_init__(self):
        if self.created_at is None:
            object.__setattr__(self, 'created_at', utc_now_iso())

    @classmethod
    def create(
        cls,
        project_id: str,
        conversation_id: str,
        role: str,
        content: str,
        parent_turn_hash: Optional[str] = None,
        ring_snapshot: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> TurnRecord:
        """
        Create a new Turn record (automatically computes hash)

        Args:
            project_id: Project ID
            conversation_id: Conversation ID
            role: Role
            content: Content
            parent_turn_hash: Parent turn hash
            ring_snapshot: Ring 1/2/3 snapshot (must be persisted for Draft/Diff/Merge)
            metadata: Metadata

        Returns:
            TurnRecord
        """
        # Construct payload to be hashed (excluding turn_hash)
        payload = {
            "parent_turn_hash": parent_turn_hash,
            "project_id": project_id,
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "ring_snapshot": ring_snapshot,  # Ring snapshot participates in hash
            "metadata": metadata,
            "created_at": utc_now_iso(),
            "schema_version": "turn_v1",
        }

        # Compute hash
        turn_hash = compute_jcs_hash(payload)

        return cls(
            turn_hash=turn_hash,
            parent_turn_hash=parent_turn_hash,
            project_id=project_id,
            conversation_id=conversation_id,
            role=role,
            content=content,
            ring_snapshot=ring_snapshot,  # Include Ring snapshot
            metadata=metadata,
            created_at=payload["created_at"],
            schema_version="turn_v1",
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary (for serialization)"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> TurnRecord:
        """Create from dictionary"""
        return cls(**data)

    @staticmethod
    def serialize_ring_output(ring_output) -> Dict[str, Any]:
        """
        Serialize RingOutput to ring_snapshot

        Args:
            ring_output: RingOutput instance (from core/extractors/base.py)

        Returns:
            Serializable dictionary
        """
        return {
            "turn_id": ring_output.turn_id,
            "ring1": {
                "keywords": [
                    {
                        "text": kw.text,
                        "lemma": kw.lemma,
                        "polarity": kw.polarity,
                        "pos": kw.pos,
                        "entity_type": kw.entity_type,
                        "confidence": kw.confidence,
                    }
                    for kw in ring_output.ring1.keywords
                ],
                "time_anchor": ring_output.ring1.time_anchor,
                "topic": ring_output.ring1.topic,
            },
            "ring2": {
                "facets": [
                    {
                        "facet_type": facet.facet_type,
                        "key": facet.key,
                        "value": facet.value,
                        "confidence": facet.confidence,
                    }
                    for facet in ring_output.ring2.facets
                ]
            },
            "ring3": {
                "segments": [
                    {
                        "segment_id": seg.segment_id,
                        "text": seg.text,
                        "start_char": seg.start_char,
                        "end_char": seg.end_char,
                    }
                    for seg in ring_output.ring3.segments
                ]
            },
        }


class TurnLedger:
    """
    Turn Ledger manager

    Responsibilities:
    1. Append new turns to JSONL
    2. Validate hash chain
    3. Read historical turns
    """

    def __init__(self, ledger_path: Path):
        """
        Initialize Turn Ledger

        Args:
            ledger_path: JSONL file path (e.g., .contextflow/ledgers/turns.jsonl)
        """
        self.ledger_path = ledger_path
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)

        # Ensure file exists
        if not self.ledger_path.exists():
            self.ledger_path.touch()

    def append(self, turn: TurnRecord) -> None:
        """
        Append new turn to ledger

        Args:
            turn: Turn record
        """
        # Validate hash (optional, ensures data integrity)
        self._verify_hash(turn)

        # Append to JSONL
        with open(self.ledger_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(turn.to_dict(), ensure_ascii=False) + "\n")

    def read_all(self) -> List[TurnRecord]:
        """
        Read all turn records

        Returns:
            List of TurnRecords
        """
        records = []
        with open(self.ledger_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    data = json.loads(line)
                    records.append(TurnRecord.from_dict(data))
        return records

    def read_by_conversation(self, conversation_id: str) -> List[TurnRecord]:
        """
        Read all turns for a specific conversation

        Args:
            conversation_id: Conversation ID

        Returns:
            List of TurnRecords (in order)
        """
        all_turns = self.read_all()
        conversation_turns = [
            turn for turn in all_turns
            if turn.conversation_id == conversation_id
        ]
        # Sort by created_at
        conversation_turns.sort(key=lambda t: t.created_at)
        return conversation_turns

    def get_last_turn(self, conversation_id: str) -> Optional[TurnRecord]:
        """
        Get the last turn for a specific conversation

        Args:
            conversation_id: Conversation ID

        Returns:
            TurnRecord or None
        """
        turns = self.read_by_conversation(conversation_id)
        return turns[-1] if turns else None

    def _verify_hash(self, turn: TurnRecord) -> None:
        """
        Validate that the turn's hash is correct

        Args:
            turn: Turn record

        Raises:
            ValueError: If hash doesn't match
        """
        payload = turn.to_dict()
        del payload["turn_hash"]

        expected_hash = compute_jcs_hash(payload)
        if turn.turn_hash != expected_hash:
            raise ValueError(
                f"Turn hash mismatch: expected {expected_hash}, got {turn.turn_hash}"
            )
