"""
Storage 测试

测试 SQLite 索引层和数据库操作。
"""

import tempfile
from pathlib import Path

import pytest

from core.storage import Database, init_database, rebuild_from_ledger


class TestDatabase:
    """测试数据库连接管理"""

    def test_database_connection(self):
        """测试数据库连接"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = Database(db_path)

            # 连接数据库
            conn = db.connect()
            assert conn is not None

            # 关闭数据库
            db.close()
            assert db.conn is None

    def test_execute_query(self):
        """测试执行 SQL 查询"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = Database(db_path)

            # 创建表
            db.execute("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")
            db.commit()

            # 插入数据
            db.execute("INSERT INTO test (name) VALUES (?)", ("Alice",))
            db.commit()

            # 查询数据
            row = db.fetchone("SELECT * FROM test WHERE name = ?", ("Alice",))
            assert row is not None
            assert row["name"] == "Alice"

            db.close()

    def test_context_manager(self):
        """测试上下文管理器"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"

            with Database(db_path) as db:
                db.execute("CREATE TABLE test (id INTEGER PRIMARY KEY)")
                # 自动 commit 和 close


class TestInitDatabase:
    """测试数据库初始化"""

    def test_init_database(self):
        """测试初始化数据库"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "contextflow.db"

            # 初始化数据库
            db = init_database(db_path)

            # 验证表存在
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
    """测试从 JSONL 重建索引"""

    def test_rebuild_turns_index(self):
        """测试重建 Turns 索引"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "contextflow.db"
            ledger_dir = Path(tmpdir) / "ledgers"
            ledger_dir.mkdir()

            # 创建 turns.jsonl
            turns_ledger = ledger_dir / "turns.jsonl"
            with open(turns_ledger, "w") as f:
                f.write('{"turn_hash": "sha256:turn-1", "parent_turn_hash": null, "project_id": "test-project", "conversation_id": "test-conv", "role": "user", "content": "Hello", "created_at": "2025-01-01T00:00:00Z", "schema_version": "turn_v1"}\n')

            # 初始化数据库
            db = init_database(db_path)

            # 重建索引
            rebuild_from_ledger(db, ledger_dir)

            # 验证数据
            turns = db.fetchall("SELECT * FROM turns")
            assert len(turns) == 1
            assert turns[0]["turn_hash"] == "sha256:turn-1"
            assert turns[0]["role"] == "user"

            # 验证 project 和 conversation 自动创建
            projects = db.fetchall("SELECT * FROM projects")
            assert len(projects) == 1

            conversations = db.fetchall("SELECT * FROM conversations")
            assert len(conversations) == 1

            db.close()

    def test_rebuild_commits_index(self):
        """测试重建 Commits 索引"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "contextflow.db"
            ledger_dir = Path(tmpdir) / "ledgers"
            ledger_dir.mkdir()

            # 创建 commits.jsonl（包含 draft_ref）
            commits_ledger = ledger_dir / "commits.jsonl"
            with open(commits_ledger, "w") as f:
                f.write('{"commit_hash": "sha256:commit-1", "project_id": "test-project", "branch": "main", "parent_hashes": [], "turn_window": {"start_turn_hash": "sha256:turn-1", "end_turn_hash": "sha256:turn-2"}, "facet_snapshot": {}, "pipeline_config": {}, "draft_ref": {"draft_id": "draft-1", "text_hash": "sha256:abc123"}, "created_at": "2025-01-01T00:00:00Z", "schema_version": "commit_v1"}\n')

            # 初始化数据库
            db = init_database(db_path)

            # 重建索引
            rebuild_from_ledger(db, ledger_dir)

            # 验证数据
            commits = db.fetchall("SELECT * FROM commits")
            assert len(commits) == 1
            assert commits[0]["commit_hash"] == "sha256:commit-1"
            assert commits[0]["branch"] == "main"
            assert commits[0]["draft_id"] == "draft-1"
            assert commits[0]["draft_text_hash"] == "sha256:abc123"

            db.close()

    def test_rebuild_commits_without_turns(self):
        """测试仅有 commits.jsonl 时的重建（无 turns.jsonl）"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "contextflow.db"
            ledger_dir = Path(tmpdir) / "ledgers"
            ledger_dir.mkdir()

            # 只创建 commits.jsonl，不创建 turns.jsonl
            commits_ledger = ledger_dir / "commits.jsonl"
            with open(commits_ledger, "w") as f:
                f.write('{"commit_hash": "sha256:commit-1", "project_id": "test-project", "branch": "main", "parent_hashes": [], "turn_window": {"start_turn_hash": "sha256:turn-1", "end_turn_hash": "sha256:turn-2"}, "facet_snapshot": {}, "pipeline_config": {}, "created_at": "2025-01-01T00:00:00Z", "schema_version": "commit_v1"}\n')

            # 初始化数据库
            db = init_database(db_path)

            # 重建索引（应该不会因为外键约束失败）
            rebuild_from_ledger(db, ledger_dir)

            # 验证 commit 插入成功
            commits = db.fetchall("SELECT * FROM commits")
            assert len(commits) == 1
            assert commits[0]["commit_hash"] == "sha256:commit-1"

            # 验证 project 自动创建
            projects = db.fetchall("SELECT * FROM projects")
            assert len(projects) == 1
            assert projects[0]["project_id"] == "test-project"

            db.close()

    def test_rebuild_drafts_index(self):
        """测试重建 Drafts 索引"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "contextflow.db"
            ledger_dir = Path(tmpdir) / "ledgers"
            ledger_dir.mkdir()

            # 创建 drafts.jsonl
            drafts_ledger = ledger_dir / "drafts.jsonl"
            with open(drafts_ledger, "w") as f:
                f.write('{"draft_id": "draft-1", "project_id": "test-project", "base_commit_hash": "sha256:commit-1", "turn_anchor_hash": "sha256:turn-10", "bridge_id": "plan", "bridge_payload": {}, "must_have": [], "mustnt_have": [], "llm_config": {}, "text": "Draft text", "status": "accepted", "created_at": "2025-01-01T00:00:00Z"}\n')

            # 初始化数据库
            db = init_database(db_path)

            # 重建索引
            rebuild_from_ledger(db, ledger_dir)

            # 验证数据
            drafts = db.fetchall("SELECT * FROM drafts")
            assert len(drafts) == 1
            assert drafts[0]["draft_id"] == "draft-1"
            assert drafts[0]["bridge_id"] == "plan"

            db.close()
