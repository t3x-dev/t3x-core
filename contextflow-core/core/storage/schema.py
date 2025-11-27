"""
SQLite Schema initialization and rebuild

Implemented per STORAGE_ARCHITECTURE.md specification.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from .database import Database


def init_database(db_path: Path, schema_path: Optional[Path] = None) -> Database:
    """
    Initialize SQLite database

    Args:
        db_path: Database file path
        schema_path: schema.sql file path (default uses built-in schema)

    Returns:
        Database instance
    """
    # Use built-in schema.sql
    if schema_path is None:
        schema_path = Path(__file__).parent / "schema.sql"

    # Read schema
    with open(schema_path, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    # Create database connection
    db = Database(db_path)

    # Execute schema
    conn = db.connect()
    conn.executescript(schema_sql)
    db.commit()

    return db


def rebuild_from_ledger(
    db: Database,
    ledger_dir: Path,
) -> None:
    """
    Rebuild SQLite indexes from JSONL master ledger

    Per STORAGE_ARCHITECTURE.md requirements, SQLite can be fully rebuilt from JSONL.

    Args:
        db: Database instance
        ledger_dir: JSONL master ledger directory (e.g., .contextflow/ledgers/)
    """
    # Clear existing indexes
    _clear_index(db)

    # Rebuild Turn indexes
    _rebuild_turns_index(db, ledger_dir / "turns.jsonl")

    # Rebuild Commit indexes
    _rebuild_commits_index(db, ledger_dir / "commits.jsonl")

    # Rebuild Draft indexes
    _rebuild_drafts_index(db, ledger_dir / "drafts.jsonl")

    db.commit()


def _clear_index(db: Database):
    """Clear all index tables"""
    tables = ["diffs", "commits", "drafts", "turns", "conversations", "projects"]
    for table in tables:
        db.execute(f"DELETE FROM {table}")


def _rebuild_turns_index(db: Database, turns_ledger: Path):
    """
    Rebuild turns table index from Turn Ledger

    Args:
        db: Database instance
        turns_ledger: turns.jsonl file path
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

            # Ensure project exists
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

            # Ensure conversation exists
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

            # Insert turn index
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
    Rebuild commits table index from Commit Ledger

    Args:
        db: Database instance
        commits_ledger: commits.jsonl file path
    """
    if not commits_ledger.exists():
        return

    projects_seen = set()

    with open(commits_ledger, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue

            commit_data = json.loads(line)

            # Ensure project exists (avoid foreign key constraint failure)
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
    Rebuild drafts table index from Draft Ledger

    Args:
        db: Database instance
        drafts_ledger: drafts.jsonl file path
    """
    if not drafts_ledger.exists():
        return

    projects_seen = set()

    with open(drafts_ledger, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue

            draft_data = json.loads(line)

            # Ensure project exists (avoid foreign key constraint failure)
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
