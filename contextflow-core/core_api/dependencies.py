"""
依赖注入 - 数据库连接和配置管理

提供 FastAPI 依赖注入的组件。
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Generator, Optional
from functools import lru_cache

from pydantic_settings import BaseSettings


# ============================================================================
# 配置
# ============================================================================

class Settings(BaseSettings):
    """应用配置"""
    # 数据库路径
    database_path: str = ".contextflow/contextflow.db"

    # JSONL Ledger 目录
    ledger_dir: str = ".contextflow/ledger"

    # 认证（可选）
    auth_enabled: bool = False
    auth_token: Optional[str] = None

    # 日志级别
    log_level: str = "info"

    class Config:
        env_prefix = "CF_"
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """获取应用配置（缓存）"""
    return Settings()


# ============================================================================
# 数据库连接
# ============================================================================

def get_db_path(settings: Optional[Settings] = None) -> Path:
    """获取数据库路径"""
    if settings is None:
        settings = get_settings()
    return Path(settings.database_path)


def get_ledger_dir(settings: Optional[Settings] = None) -> Path:
    """获取 Ledger 目录"""
    if settings is None:
        settings = get_settings()
    return Path(settings.ledger_dir)


def ensure_directories():
    """确保必要的目录存在"""
    settings = get_settings()

    # 创建数据库目录
    db_path = get_db_path(settings)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    # 创建 Ledger 目录
    ledger_dir = get_ledger_dir(settings)
    ledger_dir.mkdir(parents=True, exist_ok=True)


def get_db() -> Generator[sqlite3.Connection, None, None]:
    """
    获取数据库连接（FastAPI 依赖注入）

    使用方式：
        @router.get("/")
        async def list_items(db: sqlite3.Connection = Depends(get_db)):
            cursor = db.execute("SELECT * FROM items")
            ...
    """
    settings = get_settings()
    db_path = get_db_path(settings)

    # 确保目录存在
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row  # 返回字典式结果

    try:
        yield conn
    finally:
        conn.close()


# ============================================================================
# 启动时间追踪（用于 /health）
# ============================================================================

import time

_start_time: Optional[float] = None


def set_start_time():
    """设置启动时间"""
    global _start_time
    _start_time = time.time()


def get_uptime() -> int:
    """获取运行时间（秒）"""
    if _start_time is None:
        return 0
    return int(time.time() - _start_time)
