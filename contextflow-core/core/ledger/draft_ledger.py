"""
Draft Ledger (draft ledger)

Records Draft generation records (optional persistence).

File path: `.contextflow/ledgers/drafts.jsonl`
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .hash_utils import compute_jcs_hash


def utc_now_iso() -> str:
    """Return UTC timestamp (ISO 8601 format)"""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class DraftRecord:
    """
    Draft record (corresponds to Draft Ledger structure in STORAGE_ARCHITECTURE.md)
    """

    draft_id: str
    project_id: str
    base_commit_hash: Optional[str]  # Base commit
    turn_anchor_hash: Optional[str]  # Focal turn
    bridge_id: str  # Bridge mode
    bridge_payload: Dict[str, Any]  # Bridge configuration snapshot
    must_have: List[str]  # Must-Have list
    mustnt_have: List[str]  # Mustn't-Have list
    llm_config: Dict[str, Any]  # LLM configuration
    text: str  # Generated draft text
    status: str = "ephemeral"  # ephemeral | adopted | superseded
    created_at: str = None
    schema_version: str = "draft_v1"

    def __post_init__(self):
        if self.created_at is None:
            object.__setattr__(self, 'created_at', utc_now_iso())

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> DraftRecord:
        """Create from dictionary"""
        return cls(**data)


class DraftLedger:
    """
    Draft Ledger manager
    """

    def __init__(self, ledger_path: Path):
        """
        Initialize Draft Ledger

        Args:
            ledger_path: JSONL file path (e.g., .contextflow/ledgers/drafts.jsonl)
        """
        self.ledger_path = ledger_path
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)

        if not self.ledger_path.exists():
            self.ledger_path.touch()

    def append(self, draft: DraftRecord) -> None:
        """Append new draft to ledger"""
        with open(self.ledger_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(draft.to_dict(), ensure_ascii=False) + "\n")

    def read_all(self) -> List[DraftRecord]:
        """Read all draft records"""
        records = []
        with open(self.ledger_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    data = json.loads(line)
                    records.append(DraftRecord.from_dict(data))
        return records

    def get_by_id(self, draft_id: str) -> Optional[DraftRecord]:
        """Find by draft_id"""
        all_drafts = self.read_all()
        for draft in all_drafts:
            if draft.draft_id == draft_id:
                return draft
        return None
