"""
Commit Ledger（语义快照账本）

记录不可变的语义快照及其 DAG 结构。

文件路径：`.contextflow/ledgers/commits.jsonl`
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .hash_utils import compute_jcs_hash


def utc_now_iso() -> str:
    """返回 UTC 时间戳（ISO 8601 格式）"""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class CommitRecord:
    """
    Commit 记录（对应 STORAGE_ARCHITECTURE.md 中的 Commit Ledger 结构）
    """

    commit_hash: str  # SHA-256 哈希
    parent_hashes: List[str]  # 父 commit 列表（Merge 时可能多个）
    project_id: str
    branch: str  # 分支名（如 "main", "feature/..."）

    # Turn 窗口
    turn_window: Dict[str, str]  # {"start_turn_hash": "...", "end_turn_hash": "..."}

    # Facet 快照（Ring 1/2/3 聚合后的语义面）
    facet_snapshot: List[Dict[str, Any]]

    # Pipeline 配置（extractor / aggregator / 权重等）
    pipeline_config: Dict[str, Any]

    # Draft 引用
    draft_ref: Optional[Dict[str, str]] = None  # {"draft_id": "...", "text_hash": "..."}

    # 签名
    signature: Optional[Dict[str, str]] = None  # {"key_id": "...", "algo": "...", "value": "..."}

    created_at: str = None
    schema_version: str = "commit_v1"

    def __post_init__(self):
        if self.created_at is None:
            object.__setattr__(self, 'created_at', utc_now_iso())

    @classmethod
    def create(
        cls,
        project_id: str,
        branch: str,
        parent_hashes: List[str],
        turn_window: Dict[str, str],
        facet_snapshot: List[Dict[str, Any]],
        pipeline_config: Dict[str, Any],
        draft_ref: Optional[Dict[str, str]] = None,
        signature: Optional[Dict[str, str]] = None,
    ) -> CommitRecord:
        """
        创建新的 Commit 记录（自动计算哈希）
        """
        payload = {
            "parent_hashes": parent_hashes,
            "project_id": project_id,
            "branch": branch,
            "turn_window": turn_window,
            "facet_snapshot": facet_snapshot,
            "pipeline_config": pipeline_config,
            "draft_ref": draft_ref,
            "signature": signature,
            "created_at": utc_now_iso(),
            "schema_version": "commit_v1",
        }

        commit_hash = compute_jcs_hash(payload)

        return cls(
            commit_hash=commit_hash,
            parent_hashes=parent_hashes,
            project_id=project_id,
            branch=branch,
            turn_window=turn_window,
            facet_snapshot=facet_snapshot,
            pipeline_config=pipeline_config,
            draft_ref=draft_ref,
            signature=signature,
            created_at=payload["created_at"],
            schema_version="commit_v1",
        )

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> CommitRecord:
        """从字典创建"""
        return cls(**data)


class CommitLedger:
    """
    Commit Ledger 管理器
    """

    def __init__(self, ledger_path: Path):
        """
        初始化 Commit Ledger

        Args:
            ledger_path: JSONL 文件路径（如 .contextflow/ledgers/commits.jsonl）
        """
        self.ledger_path = ledger_path
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)

        if not self.ledger_path.exists():
            self.ledger_path.touch()

    def append(self, commit: CommitRecord) -> None:
        """追加新 commit 到账本"""
        with open(self.ledger_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(commit.to_dict(), ensure_ascii=False) + "\n")

    def read_all(self) -> List[CommitRecord]:
        """读取所有 commit 记录"""
        records = []
        with open(self.ledger_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    data = json.loads(line)
                    records.append(CommitRecord.from_dict(data))
        return records

    def read_by_branch(self, branch: str) -> List[CommitRecord]:
        """读取指定分支的所有 commit"""
        all_commits = self.read_all()
        return [c for c in all_commits if c.branch == branch]

    def get_by_hash(self, commit_hash: str) -> Optional[CommitRecord]:
        """根据哈希查找 commit"""
        all_commits = self.read_all()
        for commit in all_commits:
            if commit.commit_hash == commit_hash:
                return commit
        return None
