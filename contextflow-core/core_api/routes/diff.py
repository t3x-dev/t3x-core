"""
Diff 端点

POST /api/v1/diff - 计算语义 Diff
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from fastapi import APIRouter, Depends

from core_api.dependencies import get_db
from core_api.schemas import (
    DiffRequest,
    DiffResponse,
    DiffResult,
    FacetChange,
    SegmentChange,
    APIResponse,
)
from core_api.errors import commit_not_found

# 尝试加载 core.diff 和 core.embedding，如果失败则使用简化实现
try:
    from core.diff import DiffEngine, DiffType
    from core.embedding import MiniLMEmbeddingProvider

    _embedding_provider = MiniLMEmbeddingProvider()
    _diff_engine = DiffEngine(_embedding_provider, threshold=0.70)
    USE_CORE_DIFF = True
except (ImportError, RuntimeError) as e:
    # sentence-transformers 未安装，使用简化实现
    _diff_engine = None
    USE_CORE_DIFF = False


router = APIRouter()


def compute_diff(cursor, base_hash: str, target_hash: str) -> DiffResult:
    """
    计算两个 Commit 之间的语义 Diff

    如果 core.diff 可用，使用基于 MiniLM 的语义相似度；
    否则回退到简化的文本比较实现。
    """
    # 获取两个 commit 的数据
    base_row = cursor.execute(
        "SELECT facet_snapshot_json FROM commits WHERE commit_hash = ?", (base_hash,)
    ).fetchone()
    target_row = cursor.execute(
        "SELECT facet_snapshot_json FROM commits WHERE commit_hash = ?", (target_hash,)
    ).fetchone()

    if not base_row:
        raise commit_not_found(base_hash)
    if not target_row:
        raise commit_not_found(target_hash)

    base_facets = json.loads(base_row["facet_snapshot_json"])
    target_facets = json.loads(target_row["facet_snapshot_json"])

    # 比较 facet
    base_facet_map = {f["facet"]: f for f in base_facets}
    target_facet_map = {f["facet"]: f for f in target_facets}

    facet_changes = []

    # 检查修改和删除
    for facet_name, base_f in base_facet_map.items():
        if facet_name in target_facet_map:
            target_f = target_facet_map[facet_name]
            if base_f["text"] != target_f["text"]:
                # Modified
                base_kw = set(base_f.get("keywords", []))
                target_kw = set(target_f.get("keywords", []))
                facet_changes.append(FacetChange(
                    facet=facet_name,
                    change_type="modified",
                    base_text=base_f["text"],
                    target_text=target_f["text"],
                    added_keywords=list(target_kw - base_kw),
                    removed_keywords=list(base_kw - target_kw)
                ))
        else:
            # Removed
            facet_changes.append(FacetChange(
                facet=facet_name,
                change_type="removed",
                base_text=base_f["text"],
                target_text=None,
                removed_keywords=base_f.get("keywords", [])
            ))

    # 检查新增
    for facet_name, target_f in target_facet_map.items():
        if facet_name not in base_facet_map:
            facet_changes.append(FacetChange(
                facet=facet_name,
                change_type="added",
                base_text=None,
                target_text=target_f["text"],
                added_keywords=target_f.get("keywords", [])
            ))

    # 使用 core.diff 进行句级语义 diff
    segment_changes = []
    if USE_CORE_DIFF and _diff_engine:
        # 从 turns 获取 Ring 3 segments 进行语义 diff
        # 需要从 commit 的 turn_window 获取 segments
        base_turn_row = cursor.execute(
            "SELECT turn_window_json FROM commits WHERE commit_hash = ?", (base_hash,)
        ).fetchone()
        target_turn_row = cursor.execute(
            "SELECT turn_window_json FROM commits WHERE commit_hash = ?", (target_hash,)
        ).fetchone()

        if base_turn_row and target_turn_row:
            base_turn_window = json.loads(base_turn_row["turn_window_json"])
            target_turn_window = json.loads(target_turn_row["turn_window_json"])

            # 获取 end_turn 的 segments
            base_turn = cursor.execute(
                "SELECT rings_json FROM turns WHERE turn_hash = ?",
                (base_turn_window["end_turn_hash"],)
            ).fetchone()
            target_turn = cursor.execute(
                "SELECT rings_json FROM turns WHERE turn_hash = ?",
                (target_turn_window["end_turn_hash"],)
            ).fetchone()

            if base_turn and target_turn and base_turn["rings_json"] and target_turn["rings_json"]:
                base_rings = json.loads(base_turn["rings_json"])
                target_rings = json.loads(target_turn["rings_json"])

                base_segments = [
                    {"segment_id": s["id"], "text": s["text"]}
                    for s in base_rings.get("ring3", {}).get("segments", [])
                ]
                target_segments = [
                    {"segment_id": s["id"], "text": s["text"]}
                    for s in target_rings.get("ring3", {}).get("segments", [])
                ]

                if base_segments and target_segments:
                    diff_result = _diff_engine.diff_two_way(
                        base_hash, base_segments,
                        target_hash, target_segments
                    )

                    # 转换为 API 格式
                    for seg_diff in diff_result.segment_diffs:
                        segment_changes.append(SegmentChange(
                            segment_id=seg_diff.segment_id,
                            change_type=seg_diff.diff_type.value,
                            text=seg_diff.matched_text if seg_diff.matched_text else seg_diff.text,
                            similarity_to_base=seg_diff.similarity
                        ))

    return DiffResult(
        facet_changes=facet_changes,
        segment_changes=segment_changes
    )


@router.post("", response_model=APIResponse)
async def create_diff(
    request: DiffRequest,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    计算两个 Commit 之间的语义 Diff
    """
    cursor = db.cursor()

    # 计算 diff
    diff_result = compute_diff(
        cursor,
        request.base_commit_hash,
        request.target_commit_hash
    )

    return APIResponse(
        data=DiffResponse(
            base_commit_hash=request.base_commit_hash,
            target_commit_hash=request.target_commit_hash,
            diff=diff_result,
            computed_at=datetime.now(timezone.utc).isoformat()
        )
    )
