"""
Turn 管理端点

POST /api/v1/turns - 创建 Turn
GET /api/v1/turns - 查询 Turn 列表
GET /api/v1/turns/{turn_hash} - 获取 Turn 详情
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

# 尝试加载 core.extractors
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
    简单的语言检测：检测文本是否包含中文字符

    Returns:
        "zh" 如果包含中文字符，否则 "en"
    """
    # 统计中文字符数量
    chinese_chars = sum(1 for char in text if '\u4e00' <= char <= '\u9fff')
    # 如果中文字符占比超过 10%，认为是中文
    if len(text) > 0 and chinese_chars / len(text) > 0.1:
        return "zh"
    return "en"


router = APIRouter()


def compute_turn_hash(turn_data: dict) -> str:
    """
    计算 Turn 哈希

    使用 JCS（JSON Canonicalization Scheme）规范化后计算 SHA-256。
    """
    return compute_jcs_hash(turn_data)


def _ring_output_to_dict(ring_output) -> dict:
    """
    将 RingOutput 转换为 API 格式的字典
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
    简化的 fallback 实现：基于简单规则提取关键词和分句
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
    提取 Ring 1/2/3

    Args:
        turn_hash: Turn 哈希
        content: 文本内容
        language: 语言选择
            - "zh": 强制使用中文(jieba)，如果不可用则报错
            - "en": 强制使用英文(spaCy)，如果不可用则报错
            - "auto" 或 None: 自动检测，按可用性降级

    Returns:
        Ring 1/2/3 字典

    Raises:
        extractor_unavailable: 当用户指定的提取器不可用时
    """
    # 确定实际使用的语言
    if language == "zh":
        # 用户明确指定中文，必须有 jieba
        if not USE_JIEBA_EXTRACTOR or not _jieba_extractor:
            raise extractor_unavailable("zh", "jieba")
        ring_output = _jieba_extractor.extract(turn_hash, content)
        return _ring_output_to_dict(ring_output)

    elif language == "en":
        # 用户明确指定英文，必须有 spaCy
        if not USE_SPACY_EXTRACTOR or not _spacy_extractor:
            raise extractor_unavailable("en", "spaCy")
        ring_output = _spacy_extractor.extract(turn_hash, content)
        return _ring_output_to_dict(ring_output)

    else:
        # auto 或 None：自动检测，可以降级
        lang = detect_language(content)

        # 中文优先使用 jieba
        if lang == "zh" and USE_JIEBA_EXTRACTOR and _jieba_extractor:
            ring_output = _jieba_extractor.extract(turn_hash, content)
            return _ring_output_to_dict(ring_output)

        # 英文或 jieba 不可用时使用 spaCy
        if USE_SPACY_EXTRACTOR and _spacy_extractor:
            ring_output = _spacy_extractor.extract(turn_hash, content)
            return _ring_output_to_dict(ring_output)

        # 都不可用，使用 fallback
        return _fallback_extract(content)


@router.post("", response_model=APIResponse)
async def create_turn(
    turn: TurnCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    创建新的对话 Turn

    重要约束：
    - 服务端自动确定 parent_turn_hash（该对话的最新 Turn）
    - 客户端不得指定 parent_turn_hash
    """
    cursor = db.cursor()

    # 检查项目是否存在
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (turn.project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(turn.project_id)

    # 检查对话是否存在且属于该项目
    conversation_row = cursor.execute(
        "SELECT project_id FROM conversations WHERE conversation_id = ?", (turn.conversation_id,)
    ).fetchone()
    if not conversation_row:
        raise conversation_not_found(turn.conversation_id)
    if conversation_row["project_id"] != turn.project_id:
        raise conversation_not_found(f"{turn.conversation_id} (not in project {turn.project_id})")

    # 获取该对话的最新 Turn（自动确定父指针）
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

    # 生成时间戳
    created_at = datetime.now(timezone.utc).isoformat()

    # 计算 Turn 哈希（包含 language 以确保可复现性）
    turn_data = {
        "project_id": turn.project_id,
        "conversation_id": turn.conversation_id,
        "role": turn.role,
        "content": turn.content,
        "parent_turn_hash": parent_turn_hash,
        "language": turn.language,  # 参与哈希，确保同输入+同配置→同输出
        "created_at": created_at
    }
    turn_hash = compute_turn_hash(turn_data)

    # 提取 Rings（使用 turn_hash 作为 ID，支持用户指定语言）
    rings = extract_rings(turn_hash, turn.content, turn.language)

    # 保存到数据库（包含 language 以确保可复现性）
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
            turn.language,  # 存储用户指定的语言，用于后续重放/复现
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
    project_id: str = Query(..., description="项目 ID（必需）"),
    conversation_id: Optional[str] = Query(None, description="对话 ID（可选）"),
    role: Optional[str] = Query(None, description="角色过滤（可选）"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    查询 Turn 列表

    注意：列表查询不返回 rings 字段，减轻带宽负担。
    """
    cursor = db.cursor()

    # 构建查询条件
    conditions = ["project_id = ?"]
    params = [project_id]

    if conversation_id:
        conditions.append("conversation_id = ?")
        params.append(conversation_id)

    if role:
        conditions.append("role = ?")
        params.append(role)

    where_clause = " AND ".join(conditions)

    # 获取总数
    total = cursor.execute(
        f"SELECT COUNT(*) FROM turns WHERE {where_clause}",
        params
    ).fetchone()[0]

    # 获取 Turn 列表
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
    获取单个 Turn 详情（包含完整 Rings）

    重要约束：
    - 不暴露 embedding_vector
    - 仅返回可复现的语义字段
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

    # 解析 Rings
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
        # 默认空 Rings
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
