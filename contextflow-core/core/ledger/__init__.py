"""
JSONL 主账本（Ledger）模块

按照 STORAGE_ARCHITECTURE.md 规范实现：
- Turn Ledger: 对话轮次哈希链
- Commit Ledger: 语义快照 DAG
- Draft Ledger: 草稿生成记录（可选持久化）

所有记录采用 JCS 规范化 + SHA-256 哈希。
"""

from .turn_ledger import TurnLedger, TurnRecord
from .commit_ledger import CommitLedger, CommitRecord
from .draft_ledger import DraftLedger, DraftRecord
from .hash_utils import compute_jcs_hash, jcs_normalize

__all__ = [
    "TurnLedger",
    "TurnRecord",
    "CommitLedger",
    "CommitRecord",
    "DraftLedger",
    "DraftRecord",
    "compute_jcs_hash",
    "jcs_normalize",
]
