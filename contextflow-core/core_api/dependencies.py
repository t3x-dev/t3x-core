"""
Dependency injection - Database connections and configuration management

Provides dependency injection components for FastAPI.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Generator, Optional
from functools import lru_cache

from pydantic_settings import BaseSettings


# ============================================================================
# Configuration
# ============================================================================

class Settings(BaseSettings):
    """Application configuration"""
    # Database path
    database_path: str = ".contextflow/contextflow.db"

    # JSONL Ledger directory
    ledger_dir: str = ".contextflow/ledger"

    # Authentication (optional)
    auth_enabled: bool = False
    auth_token: Optional[str] = None

    # Log level
    log_level: str = "info"

    class Config:
        env_prefix = "CF_"
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get application configuration (cached)"""
    return Settings()


# ============================================================================
# Database connections
# ============================================================================

def get_db_path(settings: Optional[Settings] = None) -> Path:
    """Get database path"""
    if settings is None:
        settings = get_settings()
    return Path(settings.database_path)


def get_ledger_dir(settings: Optional[Settings] = None) -> Path:
    """Get ledger directory"""
    if settings is None:
        settings = get_settings()
    return Path(settings.ledger_dir)


def ensure_directories():
    """Ensure required directories exist"""
    settings = get_settings()

    # Create database directory
    db_path = get_db_path(settings)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    # Create ledger directory
    ledger_dir = get_ledger_dir(settings)
    ledger_dir.mkdir(parents=True, exist_ok=True)


def get_db() -> Generator[sqlite3.Connection, None, None]:
    """
    Get database connection (FastAPI dependency injection)

    Usage:
        @router.get("/")
        async def list_items(db: sqlite3.Connection = Depends(get_db)):
            cursor = db.execute("SELECT * FROM items")
            ...
    """
    settings = get_settings()
    db_path = get_db_path(settings)

    # Ensure directory exists
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row  # Return dict-style results

    try:
        yield conn
    finally:
        conn.close()


# ============================================================================
# Startup time tracking (for /health endpoint)
# ============================================================================

import time

_start_time: Optional[float] = None


def set_start_time():
    """Set startup time"""
    global _start_time
    _start_time = time.time()


def get_uptime() -> int:
    """Get runtime in seconds"""
    if _start_time is None:
        return 0
    return int(time.time() - _start_time)
