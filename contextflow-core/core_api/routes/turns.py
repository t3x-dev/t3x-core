"""
Turn management endpoints

POST /api/v1/turns - create Turn
GET /api/v1/turns - query Turn list
GET /api/v1/turns/{turn_hash} - get Turn details
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query

from core_api.dependencies import get_db
from core.ledger.hash_utils import compute_jcs_hash
from core_api.schemas import (
    TurnCreate,
    TurnResponse,
    TurnDetailResponse,
    Rings,
    Ring1,
    Ring2,
    Ring3,
    Entity,
    PreferenceKeyword,
    Segment,
    APIResponse,
    PaginatedResponse,
    PaginationMeta,
)
from core_api.errors import (
    project_not_found,
    conversation_not_found,
    turn_not_found,
    extractor_unavailable,
)

# Try to load core.extractors
_spacy_extractor = None
_jieba_extractor = None
USE_SPACY_EXTRACTOR = False
USE_JIEBA_EXTRACTOR = False

try:
    from core.extractors import RingExtractor, ExtractorConfig
    _spacy_extractor = RingExtractor(ExtractorConfig(plugin="spacy", model="en_core_web_sm", language="en"))
    USE_SPACY_EXTRACTOR = True
except (ImportError, RuntimeError):
    pass

try:
    from core.extractors import JiebaExtractor, ExtractorConfig, JIEBA_AVAILABLE
    if JIEBA_AVAILABLE:
        _jieba_extractor = JiebaExtractor(ExtractorConfig(plugin="jieba", language="zh"))
        USE_JIEBA_EXTRACTOR = True
except (ImportError, RuntimeError):
    pass


def detect_language(text: str) -> str:
    """
    Simple language detection: detect if text contains Chinese characters

    Returns:
        "zh" if contains Chinese characters, otherwise "en"
    """
    # Count Chinese characters
    chinese_chars = sum(1 for char in text if '\u4e00' <= char <= '\u9fff')
    # If Chinese characters exceed 10%, consider it Chinese
    if len(text) > 0 and chinese_chars / len(text) > 0.1:
        return "zh"
    return "en"


router = APIRouter()


def compute_turn_hash(turn_data: dict) -> str:
    """
    Compute Turn hash

    Uses JCS (JSON Canonicalization Scheme) normalization then computes SHA-256.
    """
    return compute_jcs_hash(turn_data)


def _ring_output_to_dict(ring_output) -> dict:
    """
    Convert RingOutput to API format dictionary
    """
    return {
        "ring1": {
            "keywords": [kw.lemma for kw in ring_output.ring1.keywords],
            "entities": [
                {"text": kw.text, "type": kw.entity_type, "start": None, "end": None}
                for kw in ring_output.ring1.keywords if kw.entity_type
            ],
            "time_anchor": ring_output.ring1.time_anchor,
            "preference_keywords": [
                {"keyword": kw.text, "polarity": "positive" if kw.polarity > 0 else "negative" if kw.polarity < 0 else "neutral", "lemma": kw.lemma}
                for kw in ring_output.ring1.preference_keywords
            ]
        },
        "ring2": {
            "intent_seed": next((f.value for f in ring_output.ring2.facets if f.facet_type == "intent_seed"), None),
            "time_window": next((f.value for f in ring_output.ring2.facets if f.facet_type == "time_window"), None),
            "preference_soft": [f.value for f in ring_output.ring2.facets if f.facet_type == "preference_soft"],
            "unknown_slot": [f.value for f in ring_output.ring2.facets if f.facet_type == "unknown_slot"],
            "facets": [f.key for f in ring_output.ring2.facets]
        },
        "ring3": {
            "segments": [
                {"id": seg.segment_id, "text": seg.text}
                for seg in ring_output.ring3.segments
            ]
        }
    }


def _fallback_extract(content: str) -> dict:
    """
    Simplified fallback implementation: extract keywords and segments based on simple rules
    """
    words = content.split()
    keywords = [w.strip('.,!?') for w in words if len(w) > 3][:10]

    return {
        "ring1": {
            "keywords": keywords,
            "entities": [],
            "time_anchor": None,
            "preference_keywords": []
        },
        "ring2": {
            "intent_seed": None,
            "time_window": None,
            "preference_soft": [],
            "unknown_slot": [],
            "facets": []
        },
        "ring3": {
            "segments": [
                {"id": "s-1", "text": content}
            ]
        }
    }


def extract_rings(turn_hash: str, content: str, language: str = None) -> dict:
    """
    Extract Ring 1/2/3

    Args:
        turn_hash: Turn hash
        content: Text content
        language: Language selection
            - "zh": Force use Chinese (jieba), raise error if unavailable
            - "en": Force use English (spaCy), raise error if unavailable
            - "auto" or None: Auto-detect, degrade by availability

    Returns:
        Ring 1/2/3 dictionary

    Raises:
        extractor_unavailable: When user-specified extractor is unavailable
    """
    # Determine actual language to use
    if language == "zh":
        # User explicitly specified Chinese, must have jieba
        if not USE_JIEBA_EXTRACTOR or not _jieba_extractor:
            raise extractor_unavailable("zh", "jieba")
        ring_output = _jieba_extractor.extract(turn_hash, content)
        return _ring_output_to_dict(ring_output)

    elif language == "en":
        # User explicitly specified English, must have spaCy
        if not USE_SPACY_EXTRACTOR or not _spacy_extractor:
            raise extractor_unavailable("en", "spaCy")
        ring_output = _spacy_extractor.extract(turn_hash, content)
        return _ring_output_to_dict(ring_output)

    else:
        # auto or None: auto-detect, can degrade
        lang = detect_language(content)

        # Chinese prefers jieba
        if lang == "zh" and USE_JIEBA_EXTRACTOR and _jieba_extractor:
            ring_output = _jieba_extractor.extract(turn_hash, content)
            return _ring_output_to_dict(ring_output)

        # English or jieba unavailable, use spaCy
        if USE_SPACY_EXTRACTOR and _spacy_extractor:
            ring_output = _spacy_extractor.extract(turn_hash, content)
            return _ring_output_to_dict(ring_output)

        # All unavailable, use fallback
        return _fallback_extract(content)


@router.post("", response_model=APIResponse)
async def create_turn(
    turn: TurnCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Create new conversation Turn

    Important constraints:
    - Server automatically determines parent_turn_hash (latest Turn in this conversation)
    - Client must not specify parent_turn_hash
    """
    cursor = db.cursor()

    # Check if project exists
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (turn.project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(turn.project_id)

    # Check if conversation exists and belongs to this project
    conversation_row = cursor.execute(
        "SELECT project_id FROM conversations WHERE conversation_id = ?", (turn.conversation_id,)
    ).fetchone()
    if not conversation_row:
        raise conversation_not_found(turn.conversation_id)
    if conversation_row["project_id"] != turn.project_id:
        raise conversation_not_found(f"{turn.conversation_id} (not in project {turn.project_id})")

    # Get latest Turn in this conversation (automatically determine parent pointer)
    last_turn = cursor.execute(
        """
        SELECT turn_hash FROM turns
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (turn.conversation_id,)
    ).fetchone()

    parent_turn_hash = last_turn["turn_hash"] if last_turn else None

    # Generate timestamp
    created_at = datetime.now(timezone.utc).isoformat()

    # Compute Turn hash (includes language to ensure reproducibility)
    turn_data = {
        "project_id": turn.project_id,
        "conversation_id": turn.conversation_id,
        "role": turn.role,
        "content": turn.content,
        "parent_turn_hash": parent_turn_hash,
        "language": turn.language,  # Participates in hash, ensures same input + same config → same output
        "created_at": created_at
    }
    turn_hash = compute_turn_hash(turn_data)

    # Extract Rings (use turn_hash as ID, support user-specified language)
    rings = extract_rings(turn_hash, turn.content, turn.language)

    # Save to database (includes language to ensure reproducibility)
    cursor.execute(
        """
        INSERT INTO turns (
            turn_hash, parent_turn_hash, project_id, conversation_id,
            role, content, language, rings_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            turn_hash,
            parent_turn_hash,
            turn.project_id,
            turn.conversation_id,
            turn.role,
            turn.content,
            turn.language,  # Store user-specified language for subsequent replay/reproduction
            json.dumps(rings),
            created_at
        )
    )
    db.commit()

    return APIResponse(
        data=TurnResponse(
            turn_hash=turn_hash,
            project_id=turn.project_id,
            conversation_id=turn.conversation_id,
            role=turn.role,
            content=turn.content,
            parent_turn_hash=parent_turn_hash,
            language=turn.language,
            created_at=created_at
        )
    )


@router.get("", response_model=PaginatedResponse)
async def list_turns(
    project_id: str = Query(..., description="project ID(required)"),
    conversation_id: Optional[str] = Query(None, description="conversation ID(optional)"),
    role: Optional[str] = Query(None, description="role filter (optional)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Query Turn list

    Note: List query does not return rings field to reduce bandwidth.
    """
    cursor = db.cursor()

    # Build query conditions
    conditions = ["project_id = ?"]
    params = [project_id]

    if conversation_id:
        conditions.append("conversation_id = ?")
        params.append(conversation_id)

    if role:
        conditions.append("role = ?")
        params.append(role)

    where_clause = " AND ".join(conditions)

    # Get total count
    total = cursor.execute(
        f"SELECT COUNT(*) FROM turns WHERE {where_clause}",
        params
    ).fetchone()[0]

    # Get Turn list
    rows = cursor.execute(
        f"""
        SELECT turn_hash, parent_turn_hash, project_id, conversation_id,
               role, content, language, created_at
        FROM turns
        WHERE {where_clause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        params + [limit, offset]
    ).fetchall()

    turns = [
        TurnResponse(
            turn_hash=row["turn_hash"],
            project_id=row["project_id"],
            conversation_id=row["conversation_id"],
            role=row["role"],
            content=row["content"],
            parent_turn_hash=row["parent_turn_hash"],
            language=row["language"],
            created_at=row["created_at"]
        )
        for row in rows
    ]

    return PaginatedResponse(
        data=turns,
        pagination=PaginationMeta(
            total=total,
            limit=limit,
            offset=offset,
            has_more=(offset + limit) < total
        )
    )


@router.get("/{turn_hash}", response_model=APIResponse)
async def get_turn(
    turn_hash: str,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Get single Turn details (including complete Rings)

    Important constraints:
    - Do not expose embedding_vector
    - Only return reproducible semantic fields
    """
    cursor = db.cursor()

    row = cursor.execute(
        """
        SELECT turn_hash, parent_turn_hash, project_id, conversation_id,
               role, content, language, rings_json, created_at
        FROM turns
        WHERE turn_hash = ?
        """,
        (turn_hash,)
    ).fetchone()

    if not row:
        raise turn_not_found(turn_hash)

    # Parse Rings
    rings_data = json.loads(row["rings_json"]) if row["rings_json"] else None

    if rings_data:
        rings = Rings(
            ring1=Ring1(
                keywords=rings_data.get("ring1", {}).get("keywords", []),
                entities=[
                    Entity(**e) for e in rings_data.get("ring1", {}).get("entities", [])
                ],
                time_anchor=rings_data.get("ring1", {}).get("time_anchor"),
                preference_keywords=[
                    PreferenceKeyword(**pk)
                    for pk in rings_data.get("ring1", {}).get("preference_keywords", [])
                ]
            ),
            ring2=Ring2(
                intent_seed=rings_data.get("ring2", {}).get("intent_seed"),
                time_window=rings_data.get("ring2", {}).get("time_window"),
                preference_soft=rings_data.get("ring2", {}).get("preference_soft", []),
                unknown_slot=rings_data.get("ring2", {}).get("unknown_slot", []),
                facets=rings_data.get("ring2", {}).get("facets", [])
            ),
            ring3=Ring3(
                segments=[
                    Segment(**s) for s in rings_data.get("ring3", {}).get("segments", [])
                ]
            )
        )
    else:
        # Default empty Rings
        rings = Rings(
            ring1=Ring1(),
            ring2=Ring2(),
            ring3=Ring3()
        )

    return APIResponse(
        data=TurnDetailResponse(
            turn_hash=row["turn_hash"],
            project_id=row["project_id"],
            conversation_id=row["conversation_id"],
            role=row["role"],
            content=row["content"],
            parent_turn_hash=row["parent_turn_hash"],
            language=row["language"],
            created_at=row["created_at"],
            rings=rings
        )
    )
