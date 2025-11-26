"""
SQLite 索引层

按照 STORAGE_ARCHITECTURE.md 规范实现：
- 仅用于查询加速、关联与缓存
- 可以从 JSONL 主账本完整重建
- 不作为唯一真相来源

核心表：
- projects: 项目元数据
- conversations: 对话容器
- turns: Turn 索引（指向 JSONL）
- drafts: Draft 索引
- commits: Commit 索引
- diffs: 语义 diff 缓存
"""

from .database import Database
from .schema import init_database, rebuild_from_ledger

__all__ = [
    "Database",
    "init_database",
    "rebuild_from_ledger",
]
