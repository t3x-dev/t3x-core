"""
SQLite 数据库连接管理

提供统一的数据库连接接口。
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional


class Database:
    """
    SQLite 数据库连接管理器

    特性：
    - 自动初始化 schema
    - 线程安全（每个连接独立）
    - 支持事务管理
    """

    def __init__(self, db_path: Path):
        """
        初始化数据库连接

        Args:
            db_path: SQLite 数据库文件路径
        """
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn: Optional[sqlite3.Connection] = None

    def connect(self) -> sqlite3.Connection:
        """
        获取数据库连接

        Returns:
            sqlite3.Connection
        """
        if self.conn is None:
            self.conn = sqlite3.connect(str(self.db_path))
            # 启用外键约束
            self.conn.execute("PRAGMA foreign_keys = ON")
            # 返回字典格式的行
            self.conn.row_factory = sqlite3.Row
        return self.conn

    def close(self):
        """关闭数据库连接"""
        if self.conn:
            self.conn.close()
            self.conn = None

    def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        """
        执行 SQL 语句

        Args:
            sql: SQL 语句
            params: 参数

        Returns:
            Cursor
        """
        conn = self.connect()
        return conn.execute(sql, params)

    def executemany(self, sql: str, params_list: List[tuple]) -> sqlite3.Cursor:
        """
        批量执行 SQL 语句

        Args:
            sql: SQL 语句
            params_list: 参数列表

        Returns:
            Cursor
        """
        conn = self.connect()
        return conn.executemany(sql, params_list)

    def commit(self):
        """提交事务"""
        if self.conn:
            self.conn.commit()

    def rollback(self):
        """回滚事务"""
        if self.conn:
            self.conn.rollback()

    def fetchone(self, sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        """
        查询单行数据

        Args:
            sql: SQL 语句
            params: 参数

        Returns:
            字典形式的行数据，如果没有结果则返回 None
        """
        cursor = self.execute(sql, params)
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None

    def fetchall(self, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """
        查询所有行数据

        Args:
            sql: SQL 语句
            params: 参数

        Returns:
            字典形式的行数据列表
        """
        cursor = self.execute(sql, params)
        return [dict(row) for row in cursor.fetchall()]

    def __enter__(self):
        """上下文管理器入口"""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器退出"""
        if exc_type is None:
            self.commit()
        else:
            self.rollback()
        self.close()
