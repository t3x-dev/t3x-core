"""
项目管理端点

POST /api/v1/projects - 创建项目
GET /api/v1/projects - 列出项目
GET /api/v1/projects/{project_id} - 获取项目详情
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query

from core_api.dependencies import get_db
from core_api.schemas import (
    ProjectCreate,
    ProjectResponse,
    ProjectListItem,
    ProjectDetail,
    APIResponse,
    PaginatedResponse,
    PaginationMeta,
)
from core_api.errors import project_not_found


router = APIRouter()


def generate_project_id() -> str:
    """生成项目 ID"""
    return f"proj_{uuid.uuid4().hex[:8]}"


@router.post("", response_model=APIResponse)
async def create_project(
    project: ProjectCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    创建新项目
    """
    project_id = generate_project_id()
    created_at = datetime.now(timezone.utc).isoformat()

    cursor = db.cursor()
    cursor.execute(
        """
        INSERT INTO projects (project_id, name, metadata_json, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (
            project_id,
            project.name,
            json.dumps(project.metadata) if project.metadata else None,
            created_at
        )
    )
    db.commit()

    return APIResponse(
        data=ProjectResponse(
            project_id=project_id,
            name=project.name,
            created_at=created_at,
            metadata=project.metadata
        )
    )


@router.get("", response_model=PaginatedResponse)
async def list_projects(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    列出所有项目
    """
    cursor = db.cursor()

    # 获取总数
    total = cursor.execute("SELECT COUNT(*) FROM projects").fetchone()[0]

    # 获取项目列表
    rows = cursor.execute(
        """
        SELECT
            p.project_id,
            p.name,
            p.created_at,
            (SELECT COUNT(*) FROM conversations WHERE project_id = p.project_id) as conversations_count,
            (SELECT COUNT(*) FROM turns WHERE project_id = p.project_id) as turns_count
        FROM projects p
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset)
    ).fetchall()

    projects = [
        ProjectListItem(
            project_id=row["project_id"],
            name=row["name"],
            created_at=row["created_at"],
            conversations_count=row["conversations_count"],
            turns_count=row["turns_count"]
        )
        for row in rows
    ]

    return PaginatedResponse(
        data=projects,
        pagination=PaginationMeta(
            total=total,
            limit=limit,
            offset=offset,
            has_more=(offset + limit) < total
        )
    )


@router.get("/{project_id}", response_model=APIResponse)
async def get_project(
    project_id: str,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    获取项目详情
    """
    cursor = db.cursor()

    row = cursor.execute(
        "SELECT project_id, name, metadata_json, created_at FROM projects WHERE project_id = ?",
        (project_id,)
    ).fetchone()

    if not row:
        raise project_not_found(project_id)

    # 获取统计信息
    conversations_count = cursor.execute(
        "SELECT COUNT(*) FROM conversations WHERE project_id = ?", (project_id,)
    ).fetchone()[0]

    turns_count = cursor.execute(
        "SELECT COUNT(*) FROM turns WHERE project_id = ?", (project_id,)
    ).fetchone()[0]

    commits_count = cursor.execute(
        "SELECT COUNT(*) FROM commits WHERE project_id = ?", (project_id,)
    ).fetchone()[0]

    return APIResponse(
        data=ProjectDetail(
            project_id=row["project_id"],
            name=row["name"],
            created_at=row["created_at"],
            metadata=json.loads(row["metadata_json"]) if row["metadata_json"] else None,
            stats={
                "conversations_count": conversations_count,
                "turns_count": turns_count,
                "commits_count": commits_count
            }
        )
    )
