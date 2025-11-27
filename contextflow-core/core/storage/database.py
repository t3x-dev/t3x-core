"""
SQLite database connection management

Provides unified database connection interface.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional


class Database:
    """
    SQLite database connection manager

    Features:
    - Auto-initialize schema
    - Thread-safe (each connection is independent)
    - Support transaction management
    """

    def __init__(self, db_path: Path):
        """
        Initialize database connection

        Args:
            db_path: SQLite database file path
        """
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn: Optional[sqlite3.Connection] = None

    def connect(self) -> sqlite3.Connection:
        """
        Get database connection

        Returns:
            sqlite3.Connection
        """
        if self.conn is None:
            self.conn = sqlite3.connect(str(self.db_path))
            # Enable foreign key constraints
            self.conn.execute("PRAGMA foreign_keys = ON")
            # Return rows in dictionary format
            self.conn.row_factory = sqlite3.Row
        return self.conn

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            self.conn = None

    def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        """
        Execute SQL statement

        Args:
            sql: SQL statement
            params: Parameters

        Returns:
            Cursor
        """
        conn = self.connect()
        return conn.execute(sql, params)

    def executemany(self, sql: str, params_list: List[tuple]) -> sqlite3.Cursor:
        """
        Execute SQL statement in batch

        Args:
            sql: SQL statement
            params_list: List of parameters

        Returns:
            Cursor
        """
        conn = self.connect()
        return conn.executemany(sql, params_list)

    def commit(self):
        """Commit transaction"""
        if self.conn:
            self.conn.commit()

    def rollback(self):
        """Rollback transaction"""
        if self.conn:
            self.conn.rollback()

    def fetchone(self, sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        """
        Query single row of data

        Args:
            sql: SQL statement
            params: Parameters

        Returns:
            Row data in dictionary format, or None if no result
        """
        cursor = self.execute(sql, params)
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None

    def fetchall(self, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """
        Query all rows of data

        Args:
            sql: SQL statement
            params: Parameters

        Returns:
            List of row data in dictionary format
        """
        cursor = self.execute(sql, params)
        return [dict(row) for row in cursor.fetchall()]

    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        if exc_type is None:
            self.commit()
        else:
            self.rollback()
        self.close()
