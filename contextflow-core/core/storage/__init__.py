"""
SQLite Index layer

Implements according to STORAGE_ARCHITECTURE.md specification:
- Used only for query acceleration, associations, and caching
- Can be fully rebuilt from JSONL master ledgers
- Not the single source of truth

Core tables:
- projects: Project metadata
- conversations: Conversation containers
- turns: Turn indexes (point to JSONL)
- drafts: Draft indexes
- commits: Commit indexes
- diffs: Semantic diff cache
"""

from .database import Database
from .schema import init_database, rebuild_from_ledger

__all__ = [
    "Database",
    "init_database",
    "rebuild_from_ledger",
]
