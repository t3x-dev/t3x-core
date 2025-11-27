"""
Storage tests

Tests for SQLite index layer and database operations.
"""

import tempfile
from pathlib import Path

import pytest

from core.storage import Database, init_database, rebuild_from_ledger


class TestDatabase:
    """Test database connection management"""

    def test_database_connection(self):
        """Test database connection"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = Database(db_path)

            # Connect to database
            conn = db.connect()
            assert conn is not None

            # Close database
            db.close()
            assert db.conn is None

    def test_execute_query(self):
        """Test executing SQL query"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = Database(db_path)

            # Create tables
            db.execute("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
            db.commit()

            # Insert data
            db.execute("INSERT INTO test (name) VALUES (?)", ("Alice",))
            db.commit()

            # Query data
            row = db.fetchone("SELECT * FROM test WHERE name = ?", ("Alice",))
            assert row is not None
            assert row["name"] == "Alice"

            db.close()

    def test_context_manager(self):
        """Test context manager"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"

            with Database(db_path) as db:
                db.execute("CREATE TABLE test (id INTEGER PRIMARY KEY)")
                # Automatically commit and close


class TestInitDatabase:
    """Test database initialization"""

    def test_init_database(self):
        """Test initializing database"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "contextflow.db"

            # Initialize database
            db = init_database(db_path)

            # Validate tables exist
            tables = db.fetchall(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
            table_names = [t["name"] for t in tables]

            assert "projects" in table_names
            assert "conversations" in table_names
            assert "turns" in table_names
            assert "drafts" in table_names
            assert "commits" in table_names
            assert "diffs" in table_names

            db.close()


class TestRebuildFromLedger:
    """Test rebuilding indexes from JSONL"""

    def test_rebuild_turns_index(self):
        """Test rebuilding Turns index"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "contextflow.db"
            ledger_dir = Path(tmpdir) / "ledgers"
            ledger_dir.mkdir()

            # Create turns.jsonl
            turns_ledger = ledger_dir / "turns.jsonl"
            with open(turns_ledger, "w") as f:
                f.write('{"turn_hash": "sha256:turn-1", "parent_turn_hash": null, "project_id": "test-project", "conversation_id": "test-conv", "role": "user", "content": "Hello", "created_at": "2025-01-01T00:00:00Z", "schema_version": "turn_v1"}\n')

            # Initialize database
            db = init_database(db_path)

            # Rebuild indexes
            rebuild_from_ledger(db, ledger_dir)

            # Validate data
            turns = db.fetchall("SELECT * FROM turns")
            assert len(turns) == 1
            assert turns[0]["turn_hash"] == "sha256:turn-1"
            assert turns[0]["role"] == "user"

            # Validate project and conversation auto-created
            projects = db.fetchall("SELECT * FROM projects")
            assert len(projects) == 1

            conversations = db.fetchall("SELECT * FROM conversations")
            assert len(conversations) == 1

            db.close()

    def test_rebuild_commits_index(self):
        """Test rebuilding Commits index"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "contextflow.db"
            ledger_dir = Path(tmpdir) / "ledgers"
            ledger_dir.mkdir()

            # Create commits.jsonl (with draft_ref)
            commits_ledger = ledger_dir / "commits.jsonl"
            with open(commits_ledger, "w") as f:
                f.write('{"commit_hash": "sha256:commit-1", "project_id": "test-project", "branch": "main", "parent_hashes": [], "turn_window": {"start_turn_hash": "sha256:turn-1", "end_turn_hash": "sha256:turn-2"}, "facet_snapshot": {}, "pipeline_config": {}, "draft_ref": {"draft_id": "draft-1", "text_hash": "sha256:abc123"}, "created_at": "2025-01-01T00:00:00Z", "schema_version": "commit_v1"}\n')

            # Initialize database
            db = init_database(db_path)

            # Rebuild indexes
            rebuild_from_ledger(db, ledger_dir)

            # Validate data
            commits = db.fetchall("SELECT * FROM commits")
            assert len(commits) == 1
            assert commits[0]["commit_hash"] == "sha256:commit-1"
            assert commits[0]["branch"] == "main"
            assert commits[0]["draft_id"] == "draft-1"
            assert commits[0]["draft_text_hash"] == "sha256:abc123"

            db.close()

    def test_rebuild_commits_without_turns(self):
        """Test rebuilding with only commits.jsonl (no turns.jsonl)"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "contextflow.db"
            ledger_dir = Path(tmpdir) / "ledgers"
            ledger_dir.mkdir()

            # Only create commits.jsonl, don't create turns.jsonl
            commits_ledger = ledger_dir / "commits.jsonl"
            with open(commits_ledger, "w") as f:
                f.write('{"commit_hash": "sha256:commit-1", "project_id": "test-project", "branch": "main", "parent_hashes": [], "turn_window": {"start_turn_hash": "sha256:turn-1", "end_turn_hash": "sha256:turn-2"}, "facet_snapshot": {}, "pipeline_config": {}, "created_at": "2025-01-01T00:00:00Z", "schema_version": "commit_v1"}\n')

            # Initialize database
            db = init_database(db_path)

            # Rebuild indexes (should not fail due to foreign key constraints)
            rebuild_from_ledger(db, ledger_dir)

            # Validate commit insert succeeded
            commits = db.fetchall("SELECT * FROM commits")
            assert len(commits) == 1
            assert commits[0]["commit_hash"] == "sha256:commit-1"

            # Validate project auto-created
            projects = db.fetchall("SELECT * FROM projects")
            assert len(projects) == 1
            assert projects[0]["project_id"] == "test-project"

            db.close()

    def test_rebuild_drafts_index(self):
        """Test rebuilding Drafts index"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "contextflow.db"
            ledger_dir = Path(tmpdir) / "ledgers"
            ledger_dir.mkdir()

            # Create drafts.jsonl
            drafts_ledger = ledger_dir / "drafts.jsonl"
            with open(drafts_ledger, "w") as f:
                f.write('{"draft_id": "draft-1", "project_id": "test-project", "base_commit_hash": "sha256:commit-1", "turn_anchor_hash": "sha256:turn-10", "bridge_id": "plan", "bridge_payload": {}, "must_have": [], "mustnt_have": [], "llm_config": {}, "text": "Draft text", "status": "accepted", "created_at": "2025-01-01T00:00:00Z"}\n')

            # Initialize database
            db = init_database(db_path)

            # Rebuild indexes
            rebuild_from_ledger(db, ledger_dir)

            # Validate data
            drafts = db.fetchall("SELECT * FROM drafts")
            assert len(drafts) == 1
            assert drafts[0]["draft_id"] == "draft-1"
            assert drafts[0]["bridge_id"] == "plan"

            db.close()
