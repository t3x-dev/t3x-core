"""
Branch 管理端点

POST /api/v1/branches - 创建分支
GET /api/v1/branches - 查询分支列表
POST /api/v1/branches/switch - 切换分支
DELETE /api/v1/branches - 删除分支
GET /api/v1/branches/current - 获取当前分支
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query

from core_api.dependencies import get_db
from core_api.schemas import (
    BranchCreate,
    BranchSwitchRequest,
    BranchDeleteRequest,
    BranchResponse,
    BranchListItem,
    CurrentBranchResponse,
    APIResponse,
    PaginatedResponse,
    PaginationMeta,
)
from core_api.errors import (
    project_not_found,
    branch_not_found,
    branch_already_exists,
    cannot_delete_current_branch,
)


router = APIRouter()


def ensure_default_branch(cursor, project_id: str) -> None:
    """
    确保项目有默认的 main 分支

    如果项目没有任何分支，创建 main 分支作为默认分支。
    会查找现有的 commits 来设置正确的 head_commit_hash。
    """
    existing = cursor.execute(
        "SELECT 1 FROM branches WHERE project_id = ?", (project_id,)
    ).fetchone()

    if not existing:
        # 查找该项目在 main 分支上的最新 commit
        latest_commit = cursor.execute(
            """
            SELECT commit_hash FROM commits
            WHERE project_id = ? AND branch = 'main'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (project_id,)
        ).fetchone()

        now = datetime.now(timezone.utc).isoformat()
        branch_id = f"branch_{uuid.uuid4().hex[:8]}"
        cursor.execute(
            """
            INSERT INTO branches (
                branch_id, project_id, name, parent_branch, head_commit_hash,
                description, is_current, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                branch_id,
                project_id,
                "main",
                None,
                latest_commit["commit_hash"] if latest_commit else None,
                "Default branch",
                1,  # is_current = True
                now,
                now
            )
        )


@router.post("", response_model=APIResponse)
async def create_branch(
    request: BranchCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    创建新分支

    - 从指定分支或当前分支创建新分支
    - 继承父分支的 head_commit_hash
    - 可选择创建后立即切换
    """
    cursor = db.cursor()

    # 检查项目是否存在
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (request.project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(request.project_id)

    # 确保有默认分支
    ensure_default_branch(cursor, request.project_id)

    # 检查分支名是否已存在
    existing = cursor.execute(
        "SELECT 1 FROM branches WHERE project_id = ? AND name = ?",
        (request.project_id, request.name)
    ).fetchone()
    if existing:
        raise branch_already_exists(request.name)

    # 确定基础分支
    if request.from_branch:
        base_branch_row = cursor.execute(
            "SELECT name, head_commit_hash FROM branches WHERE project_id = ? AND name = ?",
            (request.project_id, request.from_branch)
        ).fetchone()
        if not base_branch_row:
            raise branch_not_found(request.from_branch)
        parent_branch = request.from_branch
        head_commit_hash = base_branch_row["head_commit_hash"]
    else:
        # 使用当前分支
        current_branch_row = cursor.execute(
            "SELECT name, head_commit_hash FROM branches WHERE project_id = ? AND is_current = 1",
            (request.project_id,)
        ).fetchone()
        if current_branch_row:
            parent_branch = current_branch_row["name"]
            head_commit_hash = current_branch_row["head_commit_hash"]
        else:
            parent_branch = "main"
            head_commit_hash = None

    # 创建新分支
    now = datetime.now(timezone.utc).isoformat()
    branch_id = f"branch_{uuid.uuid4().hex[:8]}"

    cursor.execute(
        """
        INSERT INTO branches (
            branch_id, project_id, name, parent_branch, head_commit_hash,
            description, is_current, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            branch_id,
            request.project_id,
            request.name,
            parent_branch,
            head_commit_hash,
            request.description,
            0,  # is_current = False (暂时)
            now,
            now
        )
    )

    # 如果 checkout=True，切换到新分支
    if request.checkout:
        # 取消所有分支的 is_current
        cursor.execute(
            "UPDATE branches SET is_current = 0 WHERE project_id = ?",
            (request.project_id,)
        )
        # 设置新分支为当前分支
        cursor.execute(
            "UPDATE branches SET is_current = 1, updated_at = ? WHERE branch_id = ?",
            (now, branch_id)
        )

    db.commit()

    return APIResponse(
        data=BranchResponse(
            branch_id=branch_id,
            project_id=request.project_id,
            name=request.name,
            parent_branch=parent_branch,
            head_commit_hash=head_commit_hash,
            description=request.description,
            is_current=request.checkout,
            created_at=now,
            updated_at=now
        )
    )


@router.get("", response_model=PaginatedResponse)
async def list_branches(
    project_id: str = Query(..., description="项目 ID（必需）"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    查询项目的分支列表
    """
    cursor = db.cursor()

    # 检查项目是否存在
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(project_id)

    # 确保有默认分支
    ensure_default_branch(cursor, project_id)
    db.commit()

    # 获取总数
    total = cursor.execute(
        "SELECT COUNT(*) FROM branches WHERE project_id = ?",
        (project_id,)
    ).fetchone()[0]

    # 获取分支列表
    rows = cursor.execute(
        """
        SELECT branch_id, name, parent_branch, head_commit_hash,
               description, is_current, created_at, updated_at
        FROM branches
        WHERE project_id = ?
        ORDER BY is_current DESC, name ASC
        LIMIT ? OFFSET ?
        """,
        (project_id, limit, offset)
    ).fetchall()

    branches = [
        BranchListItem(
            branch_id=row["branch_id"],
            name=row["name"],
            parent_branch=row["parent_branch"],
            head_commit_hash=row["head_commit_hash"],
            description=row["description"],
            is_current=bool(row["is_current"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )
        for row in rows
    ]

    return PaginatedResponse(
        data=branches,
        pagination=PaginationMeta(
            total=total,
            limit=limit,
            offset=offset,
            has_more=(offset + limit) < total
        )
    )


@router.post("/switch", response_model=APIResponse)
async def switch_branch(
    request: BranchSwitchRequest,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    切换到指定分支

    - 如果分支不存在且 create=True，则创建新分支
    """
    cursor = db.cursor()

    # 检查项目是否存在
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (request.project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(request.project_id)

    # 确保有默认分支
    ensure_default_branch(cursor, request.project_id)

    # 检查目标分支是否存在
    target_branch = cursor.execute(
        "SELECT branch_id, name, head_commit_hash, is_current FROM branches WHERE project_id = ? AND name = ?",
        (request.project_id, request.name)
    ).fetchone()

    now = datetime.now(timezone.utc).isoformat()

    if not target_branch:
        if request.create:
            # 创建新分支并切换
            # 确定基础分支
            if request.from_branch:
                base_branch_row = cursor.execute(
                    "SELECT name, head_commit_hash FROM branches WHERE project_id = ? AND name = ?",
                    (request.project_id, request.from_branch)
                ).fetchone()
                if not base_branch_row:
                    raise branch_not_found(request.from_branch)
                parent_branch = request.from_branch
                head_commit_hash = base_branch_row["head_commit_hash"]
            else:
                current_branch_row = cursor.execute(
                    "SELECT name, head_commit_hash FROM branches WHERE project_id = ? AND is_current = 1",
                    (request.project_id,)
                ).fetchone()
                if current_branch_row:
                    parent_branch = current_branch_row["name"]
                    head_commit_hash = current_branch_row["head_commit_hash"]
                else:
                    parent_branch = "main"
                    head_commit_hash = None

            # 创建新分支
            branch_id = f"branch_{uuid.uuid4().hex[:8]}"
            cursor.execute(
                """
                INSERT INTO branches (
                    branch_id, project_id, name, parent_branch, head_commit_hash,
                    description, is_current, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    branch_id,
                    request.project_id,
                    request.name,
                    parent_branch,
                    head_commit_hash,
                    request.description,
                    0,
                    now,
                    now
                )
            )

            target_branch = {
                "branch_id": branch_id,
                "name": request.name,
                "head_commit_hash": head_commit_hash,
                "is_current": 0
            }
        else:
            raise branch_not_found(request.name)

    # 如果已经是当前分支，直接返回
    if target_branch["is_current"]:
        db.commit()
        return APIResponse(
            data=CurrentBranchResponse(
                project_id=request.project_id,
                current_branch=request.name,
                head_commit_hash=target_branch["head_commit_hash"]
            )
        )

    # 切换分支
    cursor.execute(
        "UPDATE branches SET is_current = 0 WHERE project_id = ?",
        (request.project_id,)
    )
    cursor.execute(
        "UPDATE branches SET is_current = 1, updated_at = ? WHERE project_id = ? AND name = ?",
        (now, request.project_id, request.name)
    )

    db.commit()

    return APIResponse(
        data=CurrentBranchResponse(
            project_id=request.project_id,
            current_branch=request.name,
            head_commit_hash=target_branch["head_commit_hash"]
        )
    )


@router.delete("", response_model=APIResponse)
async def delete_branch(
    request: BranchDeleteRequest,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    删除分支

    - 不能删除当前分支
    - 需要 force=True 才能删除
    """
    cursor = db.cursor()

    # 检查项目是否存在
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (request.project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(request.project_id)

    # 检查分支是否存在
    branch_row = cursor.execute(
        "SELECT branch_id, is_current FROM branches WHERE project_id = ? AND name = ?",
        (request.project_id, request.name)
    ).fetchone()

    if not branch_row:
        raise branch_not_found(request.name)

    # 不能删除当前分支
    if branch_row["is_current"]:
        raise cannot_delete_current_branch(request.name)

    # 需要 force
    if not request.force:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Refusing to delete branch {request.name} without force=True"
        )

    # 删除分支
    cursor.execute(
        "DELETE FROM branches WHERE branch_id = ?",
        (branch_row["branch_id"],)
    )

    db.commit()

    return APIResponse(
        data={"deleted": request.name}
    )


@router.get("/current", response_model=APIResponse)
async def get_current_branch(
    project_id: str = Query(..., description="项目 ID（必需）"),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    获取项目的当前分支
    """
    cursor = db.cursor()

    # 检查项目是否存在
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(project_id)

    # 确保有默认分支
    ensure_default_branch(cursor, project_id)
    db.commit()

    # 获取当前分支
    current_branch = cursor.execute(
        "SELECT name, head_commit_hash FROM branches WHERE project_id = ? AND is_current = 1",
        (project_id,)
    ).fetchone()

    if not current_branch:
        # 应该不会发生，因为 ensure_default_branch 会创建 main
        return APIResponse(
            data=CurrentBranchResponse(
                project_id=project_id,
                current_branch="main",
                head_commit_hash=None
            )
        )

    return APIResponse(
        data=CurrentBranchResponse(
            project_id=project_id,
            current_branch=current_branch["name"],
            head_commit_hash=current_branch["head_commit_hash"]
        )
    )
