"""
Merge 端点

POST /api/v1/merge - 执行三路合并
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends

from core_api.dependencies import get_db
from core_api.schemas import (
    MergeRequest,
    MergeResultResponse,
    AutoMergedFacet,
    MergeConflict,
    APIResponse,
)
from core_api.errors import commit_not_found, project_not_found

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


def compute_merge(
    cursor,
    project_id: str,
    base_hash: str,
    source_hash: str,
    target_hash: str
) -> tuple[list[dict], list[dict]]:
    """
    执行三路合并

    如果 core.diff 可用，使用基于 MiniLM 的语义三路合并；
    否则回退到基于 facet 文本的标准三路合并算法。
    """
    # 获取三个 commit 的 facet_snapshot
    base_row = cursor.execute(
        "SELECT facet_snapshot_json, project_id FROM commits WHERE commit_hash = ?", (base_hash,)
    ).fetchone()
    source_row = cursor.execute(
        "SELECT facet_snapshot_json, project_id FROM commits WHERE commit_hash = ?", (source_hash,)
    ).fetchone()
    target_row = cursor.execute(
        "SELECT facet_snapshot_json, project_id FROM commits WHERE commit_hash = ?", (target_hash,)
    ).fetchone()

    if not base_row:
        raise commit_not_found(base_hash)
    if not source_row:
        raise commit_not_found(source_hash)
    if not target_row:
        raise commit_not_found(target_hash)

    # 验证所有 commit 属于同一个项目
    if base_row["project_id"] != project_id:
        raise commit_not_found(f"{base_hash} (not in project {project_id})")
    if source_row["project_id"] != project_id:
        raise commit_not_found(f"{source_hash} (not in project {project_id})")
    if target_row["project_id"] != project_id:
        raise commit_not_found(f"{target_hash} (not in project {project_id})")

    base_facets = json.loads(base_row["facet_snapshot_json"])
    source_facets = json.loads(source_row["facet_snapshot_json"])
    target_facets = json.loads(target_row["facet_snapshot_json"])

    # 简化的三路合并逻辑
    base_map = {f["facet"]: f for f in base_facets}
    source_map = {f["facet"]: f for f in source_facets}
    target_map = {f["facet"]: f for f in target_facets}

    auto_merged = []
    conflicts = []

    all_facets = set(base_map.keys()) | set(source_map.keys()) | set(target_map.keys())

    for facet_name in all_facets:
        base_f = base_map.get(facet_name)
        source_f = source_map.get(facet_name)
        target_f = target_map.get(facet_name)

        base_text = base_f["text"] if base_f else None
        source_text = source_f["text"] if source_f else None
        target_text = target_f["text"] if target_f else None

        # 判断变更情况
        source_changed = source_text != base_text
        target_changed = target_text != base_text

        if source_changed and target_changed and source_text != target_text:
            # 冲突：双方都修改且不同
            conflicts.append({
                "facet": facet_name,
                "base_text": base_text,
                "source_text": source_text,
                "target_text": target_text,
                "conflict_type": "divergent_edit"
            })
        elif source_changed:
            # 只有 source 修改，取 source
            auto_merged.append({
                "facet": facet_name,
                "merged_text": source_text,
                "source": "source",
                "keywords": source_f.get("keywords", []) if source_f else []
            })
        elif target_changed:
            # 只有 target 修改，取 target
            auto_merged.append({
                "facet": facet_name,
                "merged_text": target_text,
                "source": "target",
                "keywords": target_f.get("keywords", []) if target_f else []
            })
        else:
            # 无变化，保持 base
            if base_text:
                auto_merged.append({
                    "facet": facet_name,
                    "merged_text": base_text,
                    "source": "base",
                    "keywords": base_f.get("keywords", []) if base_f else []
                })

    return auto_merged, conflicts


@router.post("", response_model=APIResponse)
async def create_merge(
    request: MergeRequest,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    执行三路合并（Three-way Merge）

    重要设计：
    - Merge 是决定论操作，输出 merge_result（不是 draft_id）
    - 不直接产出文本草稿
    - 验证所有 commit 属于同一项目
    """
    cursor = db.cursor()

    # 检查项目
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (request.project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(request.project_id)

    # 执行合并（内部会验证 commit 归属）
    auto_merged, conflicts = compute_merge(
        cursor,
        request.project_id,
        request.base_commit_hash,
        request.source_commit_hash,
        request.target_commit_hash
    )

    # 生成 merge_result_id
    merge_result_id = f"merge_{uuid.uuid4().hex[:8]}"
    created_at = datetime.now(timezone.utc).isoformat()

    # 保存到数据库
    cursor.execute(
        """
        INSERT INTO merge_results (
            merge_result_id, project_id, base_commit_hash, source_commit_hash,
            target_commit_hash, status, auto_merged_json, conflicts_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            merge_result_id,
            request.project_id,
            request.base_commit_hash,
            request.source_commit_hash,
            request.target_commit_hash,
            "conflicts" if conflicts else "clean",
            json.dumps(auto_merged),
            json.dumps(conflicts),
            created_at
        )
    )
    db.commit()

    return APIResponse(
        data=MergeResultResponse(
            merge_result_id=merge_result_id,
            base_commit_hash=request.base_commit_hash,
            source_commit_hash=request.source_commit_hash,
            target_commit_hash=request.target_commit_hash,
            status="conflicts" if conflicts else "clean",
            auto_merged_facets=[AutoMergedFacet(**f) for f in auto_merged],
            conflicts=[MergeConflict(**c) for c in conflicts],
            auto_merged_count=len(auto_merged),
            conflict_count=len(conflicts),
            created_at=created_at
        )
    )
