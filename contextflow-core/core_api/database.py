"""
数据库初始化和 Schema 管理

基于 STORAGE_ARCHITECTURE.md 定义的 SQLite 索引层。
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from core_api.dependencies import get_db_path, get_settings


def init_database():
    """初始化数据库 Schema"""
    db_path = get_db_path()

    # 确保目录存在
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # 创建表
    cursor.executescript("""
    -- Projects 表
    CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
    );

    -- Conversations 表
    CREATE TABLE IF NOT EXISTS conversations (
        conversation_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
    );

    -- Turns 表（索引层，完整数据在 JSONL Ledger）
    CREATE TABLE IF NOT EXISTS turns (
        turn_hash TEXT PRIMARY KEY,
        parent_turn_hash TEXT,
        project_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        language TEXT,  -- zh | en | auto | NULL，用于可复现性
        rings_json TEXT,
        created_at TEXT NOT NULL,
        ledger_file TEXT,
        ledger_offset INTEGER,
        FOREIGN KEY (project_id) REFERENCES projects(project_id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
    );

    -- Commits 表
    CREATE TABLE IF NOT EXISTS commits (
        commit_hash TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        branch TEXT NOT NULL,
        message TEXT,
        parents_json TEXT NOT NULL,
        turn_window_json TEXT NOT NULL,
        facet_snapshot_json TEXT NOT NULL,
        pipeline_config_json TEXT,
        draft_id TEXT,
        draft_text_hash TEXT,
        signature_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
    );

    -- Drafts 表（用于 Agentic Layer）
    CREATE TABLE IF NOT EXISTS drafts (
        draft_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        base_commit_hash TEXT,
        turn_anchor_hash TEXT,
        bridge_id TEXT,
        bridge_payload_json TEXT,
        must_have_json TEXT,
        mustnt_have_json TEXT,
        llm_config_json TEXT,
        text TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(project_id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
    );

    -- Diffs 缓存表
    CREATE TABLE IF NOT EXISTS diffs (
        base_commit_hash TEXT NOT NULL,
        target_commit_hash TEXT NOT NULL,
        algo_version TEXT NOT NULL,
        diff_json TEXT NOT NULL,
        computed_at TEXT NOT NULL,
        PRIMARY KEY (base_commit_hash, target_commit_hash, algo_version)
    );

    -- Merge Results 表
    CREATE TABLE IF NOT EXISTS merge_results (
        merge_result_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        base_commit_hash TEXT NOT NULL,
        source_commit_hash TEXT NOT NULL,
        target_commit_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        auto_merged_json TEXT NOT NULL,
        conflicts_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
    );

    -- Branches 表
    CREATE TABLE IF NOT EXISTS branches (
        branch_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        parent_branch TEXT,
        head_commit_hash TEXT,
        description TEXT,
        is_current INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(project_id),
        UNIQUE(project_id, name)
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
    CREATE INDEX IF NOT EXISTS idx_turns_conversation ON turns(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_turns_project ON turns(project_id);
    CREATE INDEX IF NOT EXISTS idx_commits_project ON commits(project_id);
    CREATE INDEX IF NOT EXISTS idx_commits_branch ON commits(branch);
    CREATE INDEX IF NOT EXISTS idx_branches_project ON branches(project_id);
    """)

    conn.commit()

    # 迁移：为现有 turns 表添加 language 列（如果不存在）
    _migrate_add_language_column(conn)

    conn.close()


def _migrate_add_language_column(conn: sqlite3.Connection):
    """
    迁移：为 turns 表添加 language 列

    用于升级现有数据库，避免 sqlite3.OperationalError。
    """
    cursor = conn.cursor()

    # 检查 language 列是否存在
    cursor.execute("PRAGMA table_info(turns)")
    columns = [row[1] for row in cursor.fetchall()]

    if "language" not in columns:
        cursor.execute("ALTER TABLE turns ADD COLUMN language TEXT")
        conn.commit()


def get_database_size() -> int:
    """获取数据库文件大小（字节）"""
    db_path = get_db_path()
    if db_path.exists():
        return db_path.stat().st_size
    return 0


def get_ledger_files_count() -> int:
    """获取 Ledger 文件数量"""
    from core_api.dependencies import get_ledger_dir
    ledger_dir = get_ledger_dir()
    if ledger_dir.exists():
        return len(list(ledger_dir.glob("*.jsonl")))
    return 0
