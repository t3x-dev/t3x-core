"""
Health check endpoints

GET /health - For container liveness probes and load balancing
GET /api/v1/status - System status statistics
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
    Health check

    For container liveness probes and load balancers.
    Not under /api/v1 for direct access.
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
    Get system status and statistics

    Optional parameter project_id limits the statistics scope.
    """
    cursor = db.cursor()

    # Count records in each table
    if project_id:
        # Limit to specific project scope
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
        # Global statistics
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
