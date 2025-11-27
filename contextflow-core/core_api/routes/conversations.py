"""
Conversation management endpoints

POST /api/v1/conversations - create conversation
GET /api/v1/conversations - list conversations
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query

from core_api.dependencies import get_db
from core_api.schemas import (
    ConversationCreate,
    ConversationResponse,
    ConversationListItem,
    APIResponse,
    PaginatedResponse,
    PaginationMeta,
)
from core_api.errors import project_not_found


router = APIRouter()


def generate_conversation_id() -> str:
    """Generate conversation ID"""
    return f"conv_{uuid.uuid4().hex[:8]}"


@router.post("", response_model=APIResponse)
async def create_conversation(
    conversation: ConversationCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Create new conversation
    """
    cursor = db.cursor()

    # Check if project exists
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (conversation.project_id,)
    ).fetchone()

    if not project_exists:
        raise project_not_found(conversation.project_id)

    conversation_id = generate_conversation_id()
    created_at = datetime.now(timezone.utc).isoformat()

    cursor.execute(
        """
        INSERT INTO conversations (conversation_id, project_id, title, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            conversation_id,
            conversation.project_id,
            conversation.title,
            json.dumps(conversation.metadata) if conversation.metadata else None,
            created_at
        )
    )
    db.commit()

    return APIResponse(
        data=ConversationResponse(
            conversation_id=conversation_id,
            project_id=conversation.project_id,
            title=conversation.title,
            created_at=created_at
        )
    )


@router.get("", response_model=PaginatedResponse)
async def list_conversations(
    project_id: str = Query(..., description="project ID(required)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    List conversations
    """
    cursor = db.cursor()

    # Check if project exists
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()

    if not project_exists:
        raise project_not_found(project_id)

    # Get total count
    total = cursor.execute(
        "SELECT COUNT(*) FROM conversations WHERE project_id = ?", (project_id,)
    ).fetchone()[0]

    # Get conversation list
    rows = cursor.execute(
        """
        SELECT
            c.conversation_id,
            c.project_id,
            c.title,
            c.created_at,
            (SELECT COUNT(*) FROM turns WHERE conversation_id = c.conversation_id) as turns_count
        FROM conversations c
        WHERE c.project_id = ?
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
        """,
        (project_id, limit, offset)
    ).fetchall()

    conversations = [
        ConversationListItem(
            conversation_id=row["conversation_id"],
            project_id=row["project_id"],
            title=row["title"],
            created_at=row["created_at"],
            turns_count=row["turns_count"]
        )
        for row in rows
    ]

    return PaginatedResponse(
        data=conversations,
        pagination=PaginationMeta(
            total=total,
            limit=limit,
            offset=offset,
            has_more=(offset + limit) < total
        )
    )
