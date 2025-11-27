"""
Branch management endpoints

POST /api/v1/branches - create branch
GET /api/v1/branches - query branch list
POST /api/v1/branches/switch - switch branch
DELETE /api/v1/branches - delete branch
GET /api/v1/branches/current - get current branch
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
    Ensure project has default main branch

    If project has no branches, create main branch as default branch.
    Will find existing commits to set the correct head_commit_hash.
    """
    existing = cursor.execute(
        "SELECT 1 FROM branches WHERE project_id = ?", (project_id,)
    ).fetchone()

    if not existing:
        # Find the latest commit on the main branch for this project
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
    Create new branch

    - Create new branch from specified branch or current branch
    - Inherit head_commit_hash from parent branch
    - Optionally switch to new branch immediately after creation
    """
    cursor = db.cursor()

    # Check if project exists
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (request.project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(request.project_id)

    # Ensure default branch exists
    ensure_default_branch(cursor, request.project_id)

    # Check if branch name already exists
    existing = cursor.execute(
        "SELECT 1 FROM branches WHERE project_id = ? AND name = ?",
        (request.project_id, request.name)
    ).fetchone()
    if existing:
        raise branch_already_exists(request.name)

    # Determine base branch
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
        # Use current branch
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

    # Create new branch
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
            0,  # is_current = False (temporarily)
            now,
            now
        )
    )

    # If checkout=True, switch to new branch
    if request.checkout:
        # Clear is_current flag for all branches
        cursor.execute(
            "UPDATE branches SET is_current = 0 WHERE project_id = ?",
            (request.project_id,)
        )
        # Set new branch as current branch
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
    project_id: str = Query(..., description="project ID(required)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Query branch list for project
    """
    cursor = db.cursor()

    # Check if project exists
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(project_id)

    # Ensure default branch exists
    ensure_default_branch(cursor, project_id)
    db.commit()

    # Get total count
    total = cursor.execute(
        "SELECT COUNT(*) FROM branches WHERE project_id = ?",
        (project_id,)
    ).fetchone()[0]

    # Get branch list
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
    Switch to specified branch

    - If branch does not exist and create=True, then create new branch
    """
    cursor = db.cursor()

    # Check if project exists
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (request.project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(request.project_id)

    # Ensure default branch exists
    ensure_default_branch(cursor, request.project_id)

    # Check if target branch exists
    target_branch = cursor.execute(
        "SELECT branch_id, name, head_commit_hash, is_current FROM branches WHERE project_id = ? AND name = ?",
        (request.project_id, request.name)
    ).fetchone()

    now = datetime.now(timezone.utc).isoformat()

    if not target_branch:
        if request.create:
            # Create new branch and switch
            # Determine base branch
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

            # Create new branch
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

    # If already current branch, return directly
    if target_branch["is_current"]:
        db.commit()
        return APIResponse(
            data=CurrentBranchResponse(
                project_id=request.project_id,
                current_branch=request.name,
                head_commit_hash=target_branch["head_commit_hash"]
            )
        )

    # Switch branch
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
    Delete branch

    - Cannot delete current branch
    - Requires force=True to delete
    """
    cursor = db.cursor()

    # Check if project exists
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (request.project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(request.project_id)

    # Check if branch exists
    branch_row = cursor.execute(
        "SELECT branch_id, is_current FROM branches WHERE project_id = ? AND name = ?",
        (request.project_id, request.name)
    ).fetchone()

    if not branch_row:
        raise branch_not_found(request.name)

    # Cannot delete current branch
    if branch_row["is_current"]:
        raise cannot_delete_current_branch(request.name)

    # Requires force flag
    if not request.force:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Refusing to delete branch {request.name} without force=True"
        )

    # Delete branch
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
    project_id: str = Query(..., description="project ID(required)"),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Get current branch for project
    """
    cursor = db.cursor()

    # Check if project exists
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(project_id)

    # Ensure default branch exists
    ensure_default_branch(cursor, project_id)
    db.commit()

    # Get current branch
    current_branch = cursor.execute(
        "SELECT name, head_commit_hash FROM branches WHERE project_id = ? AND is_current = 1",
        (project_id,)
    ).fetchone()

    if not current_branch:
        # Should not happen, as ensure_default_branch will create main
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
