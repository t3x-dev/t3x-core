"""
SQLite Schema 初始化与重建

按照 STORAGE_ARCHITECTURE.md 规范实现。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from .database import Database


def init_database(db_path: Path, schema_path: Optional[Path] = None) -> Database:
    """
    初始化 SQLite 数据库

    Args:
        db_path: 数据库文件路径
        schema_path: schema.sql 文件路径（默认使用内置 schema）

    Returns:
        Database 实例
    """
    # 使用内置 schema.sql
    if schema_path is None:
        schema_path = Path(__file__).parent / "schema.sql"

    # 读取 schema
    with open(schema_path, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    # 创建数据库连接
    db = Database(db_path)

    # 执行 schema
    conn = db.connect()
    conn.executescript(schema_sql)
    db.commit()

    return db


def rebuild_from_ledger(
    db: Database,
    ledger_dir: Path,
) -> None:
    """
    从 JSONL 主账本重建 SQLite 索引

    按照 STORAGE_ARCHITECTURE.md 的要求，SQLite 可以从 JSONL 完整重建。

    Args:
        db: Database 实例
        ledger_dir: JSONL 主账本目录（如 .contextflow/ledgers/）
    """
    # 清空现有索引
    _clear_index(db)

    # 重建 Turn 索引
    _rebuild_turns_index(db, ledger_dir / "turns.jsonl")

    # 重建 Commit 索引
    _rebuild_commits_index(db, ledger_dir / "commits.jsonl")

    # 重建 Draft 索引
    _rebuild_drafts_index(db, ledger_dir / "drafts.jsonl")

    db.commit()


def _clear_index(db: Database):
    """清空所有索引表"""
    tables = ["diffs", "commits", "drafts", "turns", "conversations", "projects"]
    for table in tables:
        db.execute(f"DELETE FROM {table}")


def _rebuild_turns_index(db: Database, turns_ledger: Path):
    """
    从 Turn Ledger 重建 turns 表索引

    Args:
        db: Database 实例
        turns_ledger: turns.jsonl 文件路径
    """
    if not turns_ledger.exists():
        return

    projects_seen = set()
    conversations_seen = set()

    with open(turns_ledger, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            if not line.strip():
                continue

            turn_data = json.loads(line)

            # 确保 project 存在
            project_id = turn_data["project_id"]
            if project_id not in projects_seen:
                db.execute(
                    """
                    INSERT OR IGNORE INTO projects (project_id, name, created_at)
                    VALUES (?, ?, ?)
                    """,
                    (project_id, project_id, turn_data["created_at"]),
                )
                projects_seen.add(project_id)

            # 确保 conversation 存在
            conversation_id = turn_data["conversation_id"]
            if conversation_id not in conversations_seen:
                db.execute(
                    """
                    INSERT OR IGNORE INTO conversations (conversation_id, project_id, created_at)
                    VALUES (?, ?, ?)
                    """,
                    (conversation_id, project_id, turn_data["created_at"]),
                )
                conversations_seen.add(conversation_id)

            # 插入 turn 索引
            db.execute(
                """
                INSERT INTO turns (
                    turn_hash, parent_turn_hash, project_id, conversation_id,
                    role, created_at, ledger_file, ledger_offset
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    turn_data["turn_hash"],
                    turn_data.get("parent_turn_hash"),
                    project_id,
                    conversation_id,
                    turn_data["role"],
                    turn_data["created_at"],
                    str(turns_ledger),
                    line_num,
                ),
            )


def _rebuild_commits_index(db: Database, commits_ledger: Path):
    """
    从 Commit Ledger 重建 commits 表索引

    Args:
        db: Database 实例
        commits_ledger: commits.jsonl 文件路径
    """
    if not commits_ledger.exists():
        return

    projects_seen = set()

    with open(commits_ledger, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue

            commit_data = json.loads(line)

            # 确保 project 存在（避免外键约束失败）
            project_id = commit_data["project_id"]
            if project_id not in projects_seen:
                db.execute(
                    """
                    INSERT OR IGNORE INTO projects (project_id, name, created_at)
                    VALUES (?, ?, ?)
                    """,
                    (project_id, project_id, commit_data["created_at"]),
                )
                projects_seen.add(project_id)

            db.execute(
                """
                INSERT INTO commits (
                    commit_hash, project_id, branch, parents_json,
                    turn_window_start_hash, turn_window_end_hash,
                    facet_snapshot_json, pipeline_config_json,
                    draft_id, draft_text_hash,
                    signature_key_id, signature_value,
                    created_at, schema_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    commit_data["commit_hash"],
                    commit_data["project_id"],
                    commit_data["branch"],
                    json.dumps(commit_data["parent_hashes"]),
                    commit_data.get("turn_window", {}).get("start_turn_hash"),
                    commit_data.get("turn_window", {}).get("end_turn_hash"),
                    json.dumps(commit_data["facet_snapshot"]),
                    json.dumps(commit_data["pipeline_config"]),
                    commit_data.get("draft_ref", {}).get("draft_id") if commit_data.get("draft_ref") else None,
                    commit_data.get("draft_ref", {}).get("text_hash") if commit_data.get("draft_ref") else None,
                    commit_data.get("signature", {}).get("key_id") if commit_data.get("signature") else None,
                    commit_data.get("signature", {}).get("value") if commit_data.get("signature") else None,
                    commit_data["created_at"],
                    commit_data["schema_version"],
                ),
            )


def _rebuild_drafts_index(db: Database, drafts_ledger: Path):
    """
    从 Draft Ledger 重建 drafts 表索引

    Args:
        db: Database 实例
        drafts_ledger: drafts.jsonl 文件路径
    """
    if not drafts_ledger.exists():
        return

    projects_seen = set()

    with open(drafts_ledger, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue

            draft_data = json.loads(line)

            # 确保 project 存在（避免外键约束失败）
            project_id = draft_data["project_id"]
            if project_id not in projects_seen:
                db.execute(
                    """
                    INSERT OR IGNORE INTO projects (project_id, name, created_at)
                    VALUES (?, ?, ?)
                    """,
                    (project_id, project_id, draft_data["created_at"]),
                )
                projects_seen.add(project_id)

            db.execute(
                """
                INSERT INTO drafts (
                    draft_id, project_id, base_commit_hash, turn_anchor_hash,
                    bridge_id, bridge_payload_json,
                    must_have_json, mustnt_have_json,
                    llm_config_json, text, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    draft_data["draft_id"],
                    draft_data["project_id"],
                    draft_data.get("base_commit_hash"),
                    draft_data.get("turn_anchor_hash"),
                    draft_data["bridge_id"],
                    json.dumps(draft_data["bridge_payload"]),
                    json.dumps(draft_data["must_have"]),
                    json.dumps(draft_data["mustnt_have"]),
                    json.dumps(draft_data["llm_config"]),
                    draft_data["text"],
                    draft_data["status"],
                    draft_data["created_at"],
                ),
            )
