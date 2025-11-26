"""
健康检查端点

GET /health - 用于容器存活探针和负载均衡
GET /api/v1/status - 系统状态统计
"""

from __future__ import annotations

import sqlite3
from typing import Optional
from fastapi import APIRouter, Depends

from core_api import __version__
from core_api.dependencies import get_db, get_uptime
from core_api.schemas import HealthResponse, StatusResponse, StorageStats, APIResponse
from core_api.database import get_database_size, get_ledger_files_count


router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    健康检查

    用于容器存活探针和负载均衡器。
    不挂在 /api/v1 下，便于直接访问。
    """
    return HealthResponse(
        status="ok",
        version=__version__,
        uptime=get_uptime()
    )


@router.get("/api/v1/status", response_model=APIResponse)
async def get_status(
    project_id: Optional[str] = None,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    获取系统状态和统计信息

    可选参数 project_id 限定统计范围。
    """
    cursor = db.cursor()

    # 统计各表数量
    if project_id:
        # 限定项目范围
        projects_count = 1 if cursor.execute(
            "SELECT 1 FROM projects WHERE project_id = ?", (project_id,)
        ).fetchone() else 0

        conversations_count = cursor.execute(
            "SELECT COUNT(*) FROM conversations WHERE project_id = ?", (project_id,)
        ).fetchone()[0]

        turns_count = cursor.execute(
            "SELECT COUNT(*) FROM turns WHERE project_id = ?", (project_id,)
        ).fetchone()[0]

        commits_count = cursor.execute(
            "SELECT COUNT(*) FROM commits WHERE project_id = ?", (project_id,)
        ).fetchone()[0]
    else:
        # 全局统计
        projects_count = cursor.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
        conversations_count = cursor.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
        turns_count = cursor.execute("SELECT COUNT(*) FROM turns").fetchone()[0]
        commits_count = cursor.execute("SELECT COUNT(*) FROM commits").fetchone()[0]

    return APIResponse(
        data=StatusResponse(
            projects_count=projects_count,
            conversations_count=conversations_count,
            turns_count=turns_count,
            commits_count=commits_count,
            storage=StorageStats(
                database_size_bytes=get_database_size(),
                ledger_files_count=get_ledger_files_count()
            )
        )
    )
