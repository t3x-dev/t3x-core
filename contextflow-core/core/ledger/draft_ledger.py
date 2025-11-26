"""
Draft Ledger（草稿账本）

记录 Draft 生成记录（可选持久化）。

文件路径：`.contextflow/ledgers/drafts.jsonl`
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .hash_utils import compute_jcs_hash


def utc_now_iso() -> str:
    """返回 UTC 时间戳（ISO 8601 格式）"""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class DraftRecord:
    """
    Draft 记录（对应 STORAGE_ARCHITECTURE.md 中的 Draft Ledger 结构）
    """

    draft_id: str
    project_id: str
    base_commit_hash: Optional[str]  # 基准 commit
    turn_anchor_hash: Optional[str]  # 焦点 turn
    bridge_id: str  # Bridge 模式
    bridge_payload: Dict[str, Any]  # Bridge 配置快照
    must_have: List[str]  # Must-Have 列表
    mustnt_have: List[str]  # Mustn't-Have 列表
    llm_config: Dict[str, Any]  # LLM 配置
    text: str  # 生成的草稿文本
    status: str = "ephemeral"  # ephemeral | adopted | superseded
    created_at: str = None
    schema_version: str = "draft_v1"

    def __post_init__(self):
        if self.created_at is None:
            object.__setattr__(self, 'created_at', utc_now_iso())

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> DraftRecord:
        """从字典创建"""
        return cls(**data)


class DraftLedger:
    """
    Draft Ledger 管理器
    """

    def __init__(self, ledger_path: Path):
        """
        初始化 Draft Ledger

        Args:
            ledger_path: JSONL 文件路径（如 .contextflow/ledgers/drafts.jsonl）
        """
        self.ledger_path = ledger_path
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)

        if not self.ledger_path.exists():
            self.ledger_path.touch()

    def append(self, draft: DraftRecord) -> None:
        """追加新 draft 到账本"""
        with open(self.ledger_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(draft.to_dict(), ensure_ascii=False) + "\n")

    def read_all(self) -> List[DraftRecord]:
        """读取所有 draft 记录"""
        records = []
        with open(self.ledger_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    data = json.loads(line)
                    records.append(DraftRecord.from_dict(data))
        return records

    def get_by_id(self, draft_id: str) -> Optional[DraftRecord]:
        """根据 draft_id 查找"""
        all_drafts = self.read_all()
        for draft in all_drafts:
            if draft.draft_id == draft_id:
                return draft
        return None
