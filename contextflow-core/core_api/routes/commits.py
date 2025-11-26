"""
Commit 管理端点

POST /api/v1/commits - 创建 Commit
GET /api/v1/commits - 查询 Commit 列表
GET /api/v1/commits/{commit_hash} - 获取 Commit 详情
"""

from __future__ import annotations

import json
import sqlite3
import hashlib
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query

from core_api.dependencies import get_db
from core.ledger.hash_utils import compute_jcs_hash
from core_api.schemas import (
    CommitCreate,
    CommitResponse,
    CommitListItem,
    CommitDetail,
    TurnWindow,
    DraftRef,
    FacetSnapshot,
    PipelineConfig,
    EvidenceRef,
    APIResponse,
    PaginatedResponse,
    PaginationMeta,
)
from core_api.errors import (
    project_not_found,
    commit_not_found,
    turn_not_found,
    ValidationError,
    ErrorCode,
)

# 尝试加载 core.embedding 用于计算 evidence 相似度
try:
    from core.embedding import MiniLMEmbeddingProvider
    _embedding_provider = MiniLMEmbeddingProvider()
    USE_CORE_EMBEDDING = True
except (ImportError, RuntimeError) as e:
    _embedding_provider = None
    USE_CORE_EMBEDDING = False


router = APIRouter()


def ensure_branch_exists(cursor, project_id: str, branch_name: str) -> None:
    """
    确保分支存在，如果不存在则创建

    - 如果分支表中没有任何分支，创建 main 作为默认分支
    - 如果目标分支不存在，从当前分支创建
    - 新创建的分支会继承现有 commit 链作为 head
    """
    now = datetime.now(timezone.utc).isoformat()

    # 检查是否有任何分支
    any_branch = cursor.execute(
        "SELECT 1 FROM branches WHERE project_id = ?", (project_id,)
    ).fetchone()

    if not any_branch:
        # 创建 main 分支
        # 查找该项目在该分支上的最新 commit
        latest_commit = cursor.execute(
            """
            SELECT commit_hash FROM commits
            WHERE project_id = ? AND branch = 'main'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (project_id,)
        ).fetchone()

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

    # 检查目标分支是否存在
    target_branch = cursor.execute(
        "SELECT branch_id FROM branches WHERE project_id = ? AND name = ?",
        (project_id, branch_name)
    ).fetchone()

    if not target_branch:
        # 从当前分支创建目标分支
        current_branch = cursor.execute(
            "SELECT name, head_commit_hash FROM branches WHERE project_id = ? AND is_current = 1",
            (project_id,)
        ).fetchone()

        # 查找该分支上的最新 commit
        latest_commit = cursor.execute(
            """
            SELECT commit_hash FROM commits
            WHERE project_id = ? AND branch = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (project_id, branch_name)
        ).fetchone()

        parent_branch = current_branch["name"] if current_branch else "main"
        head_hash = latest_commit["commit_hash"] if latest_commit else (current_branch["head_commit_hash"] if current_branch else None)

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
                branch_name,
                parent_branch,
                head_hash,
                None,
                0,  # is_current = False
                now,
                now
            )
        )


def update_branch_head(cursor, project_id: str, branch_name: str, commit_hash: str) -> None:
    """
    更新分支的 head_commit_hash
    """
    now = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        """
        UPDATE branches
        SET head_commit_hash = ?, updated_at = ?
        WHERE project_id = ? AND name = ?
        """,
        (commit_hash, now, project_id, branch_name)
    )


def compute_commit_hash(commit_data: dict) -> str:
    """
    计算 Commit 哈希

    注意：message 字段不参与哈希计算（是可选元数据）
    """
    # 移除 message，它不参与哈希
    data_for_hash = {k: v for k, v in commit_data.items() if k != "message"}
    return compute_jcs_hash(data_for_hash)


def aggregate_facets_from_turns(cursor, start_hash: str, end_hash: str) -> list[dict]:
    """
    从 Turn 窗口聚合 Facet 快照

    使用已存储的 Ring 数据（由 RingExtractor 生成）聚合 facets。
    包含：goal（意图）、context（背景）、constraints（约束）等 facet 类型。
    """
    # 获取 end_turn 的对话信息
    end_turn_row = cursor.execute(
        "SELECT conversation_id, created_at FROM turns WHERE turn_hash = ?", (end_hash,)
    ).fetchone()

    if not end_turn_row:
        return []

    conversation_id = end_turn_row["conversation_id"]

    # 获取窗口内的所有 turns（从 start 到 end，按时间排序）
    # 注意：如果 start_hash == end_hash，只取一个 turn
    start_turn_row = cursor.execute(
        "SELECT created_at FROM turns WHERE turn_hash = ?", (start_hash,)
    ).fetchone()

    if not start_turn_row:
        return []

    start_time = start_turn_row["created_at"]
    end_time = end_turn_row["created_at"]

    # 获取窗口内所有 turns
    turns = cursor.execute(
        """
        SELECT turn_hash, role, content, rings_json, created_at
        FROM turns
        WHERE conversation_id = ?
        AND created_at >= ? AND created_at <= ?
        ORDER BY created_at ASC
        """,
        (conversation_id, start_time, end_time)
    ).fetchall()

    if not turns:
        return []

    # 聚合所有 turns 的 Ring 数据
    all_keywords = []
    all_entities = []
    all_segments = []
    intent_seeds = []
    preference_keywords = []

    for turn in turns:
        if not turn["rings_json"]:
            continue

        rings = json.loads(turn["rings_json"])
        turn_hash = turn["turn_hash"]

        # Ring 1: 关键词和实体
        ring1 = rings.get("ring1", {})
        for kw in ring1.get("keywords", []):
            all_keywords.append({"keyword": kw, "turn_hash": turn_hash})

        for entity in ring1.get("entities", []):
            all_entities.append({
                "text": entity.get("text"),
                "type": entity.get("type"),
                "turn_hash": turn_hash
            })

        for pref in ring1.get("preference_keywords", []):
            preference_keywords.append({
                "keyword": pref.get("keyword") or pref.get("lemma"),
                "polarity": pref.get("polarity"),
                "turn_hash": turn_hash
            })

        # Ring 2: 意图种子
        ring2 = rings.get("ring2", {})
        intent_seed = ring2.get("intent_seed")
        if intent_seed:
            intent_seeds.append({"intent": intent_seed, "turn_hash": turn_hash})

        # Ring 3: 分句
        ring3 = rings.get("ring3", {})
        for seg in ring3.get("segments", []):
            all_segments.append({
                "segment_id": seg.get("id"),
                "text": seg.get("text"),
                "turn_hash": turn_hash
            })

    # 构建 facet 快照
    facets = []

    # Facet 1: goal（目标/意图）
    # 从意图种子和关键词聚合
    if intent_seeds or all_keywords:
        goal_text_parts = []
        if intent_seeds:
            goal_text_parts.append(intent_seeds[-1]["intent"])  # 取最新的意图
        if all_keywords:
            # 去重并取前 5 个关键词
            unique_keywords = list(dict.fromkeys([kw["keyword"] for kw in all_keywords]))[:5]
            goal_text_parts.append(" ".join(unique_keywords))

        goal_text = " - ".join(goal_text_parts) if goal_text_parts else ""

        if goal_text:
            # 计算 evidence（取最相关的 segments）
            evidence = _compute_evidence(
                goal_text,
                all_segments,
                max_evidence=3
            )

            facets.append({
                "facet": "goal",
                "text": goal_text,
                "keywords": [kw["keyword"] for kw in all_keywords[:10]],
                "evidence": evidence
            })

    # Facet 2: context（背景/实体）
    if all_entities:
        # 按类型分组实体
        entity_groups = {}
        for entity in all_entities:
            etype = entity["type"] or "OTHER"
            if etype not in entity_groups:
                entity_groups[etype] = []
            entity_groups[etype].append(entity["text"])

        context_parts = []
        for etype, texts in entity_groups.items():
            unique_texts = list(dict.fromkeys(texts))[:3]
            context_parts.append(f"{etype}: {', '.join(unique_texts)}")

        context_text = "; ".join(context_parts)

        if context_text:
            evidence = _compute_evidence(
                context_text,
                all_segments,
                max_evidence=2
            )

            facets.append({
                "facet": "context",
                "text": context_text,
                "keywords": [e["text"] for e in all_entities[:5]],
                "evidence": evidence
            })

    # Facet 3: preferences（偏好/约束）
    if preference_keywords:
        must_have = [p["keyword"] for p in preference_keywords if p["polarity"] == "positive"]
        must_not = [p["keyword"] for p in preference_keywords if p["polarity"] == "negative"]

        pref_parts = []
        if must_have:
            pref_parts.append(f"必须: {', '.join(must_have[:3])}")
        if must_not:
            pref_parts.append(f"避免: {', '.join(must_not[:3])}")

        pref_text = "; ".join(pref_parts)

        if pref_text:
            evidence = _compute_evidence(
                pref_text,
                all_segments,
                max_evidence=2
            )

            facets.append({
                "facet": "preferences",
                "text": pref_text,
                "keywords": [p["keyword"] for p in preference_keywords[:5]],
                "evidence": evidence
            })

    return facets


def _compute_evidence(
    facet_text: str,
    segments: list[dict],
    max_evidence: int = 3
) -> list[dict]:
    """
    计算 facet 的 evidence（相关句子）

    如果 core.embedding 可用，使用语义相似度排序；
    否则使用简化的关键词匹配。
    """
    if not segments:
        return []

    if USE_CORE_EMBEDDING and _embedding_provider:
        # 使用语义相似度
        facet_vec = _embedding_provider.encode([facet_text])[0]
        segment_texts = [seg["text"] for seg in segments]
        segment_vecs = _embedding_provider.encode(segment_texts)

        scored_segments = []
        for seg, vec in zip(segments, segment_vecs):
            similarity = _embedding_provider.similarity(facet_vec, vec)
            scored_segments.append({
                "turn_hash": seg["turn_hash"],
                "segment_id": seg["segment_id"],
                "similarity_score": round(similarity, 3)
            })

        # 按相似度排序
        scored_segments.sort(key=lambda x: x["similarity_score"], reverse=True)
        return scored_segments[:max_evidence]
    else:
        # 简化实现：取最后几个 segments
        evidence = []
        for seg in segments[-max_evidence:]:
            evidence.append({
                "turn_hash": seg["turn_hash"],
                "segment_id": seg["segment_id"],
                "similarity_score": 0.8  # 占位分数
            })
        return evidence


@router.post("", response_model=APIResponse)
async def create_commit(
    commit: CommitCreate,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    创建 Commit（不可变语义快照）
    """
    cursor = db.cursor()

    # 检查项目是否存在
    project_exists = cursor.execute(
        "SELECT 1 FROM projects WHERE project_id = ?", (commit.project_id,)
    ).fetchone()
    if not project_exists:
        raise project_not_found(commit.project_id)

    # 确保分支存在（如果不存在则创建）
    ensure_branch_exists(cursor, commit.project_id, commit.branch)

    # 检查 turn_window 的有效性（必须属于该项目）
    start_turn = cursor.execute(
        "SELECT project_id, conversation_id FROM turns WHERE turn_hash = ?", (commit.turn_window.start_turn_hash,)
    ).fetchone()
    if not start_turn:
        raise turn_not_found(commit.turn_window.start_turn_hash)
    if start_turn["project_id"] != commit.project_id:
        raise turn_not_found(f"{commit.turn_window.start_turn_hash} (not in project {commit.project_id})")

    end_turn = cursor.execute(
        "SELECT project_id, conversation_id FROM turns WHERE turn_hash = ?", (commit.turn_window.end_turn_hash,)
    ).fetchone()
    if not end_turn:
        raise turn_not_found(commit.turn_window.end_turn_hash)
    if end_turn["project_id"] != commit.project_id:
        raise turn_not_found(f"{commit.turn_window.end_turn_hash} (not in project {commit.project_id})")

    # 确保 start 和 end turn 在同一个对话中
    if start_turn["conversation_id"] != end_turn["conversation_id"]:
        raise ValidationError(
            ErrorCode.VALIDATION_FAILED,
            "start_turn_hash and end_turn_hash must be in the same conversation",
            {
                "start_conversation": start_turn["conversation_id"],
                "end_conversation": end_turn["conversation_id"]
            }
        )

    # 获取父 commit（该分支的最新 commit）
    last_commit = cursor.execute(
        """
        SELECT commit_hash FROM commits
        WHERE project_id = ? AND branch = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (commit.project_id, commit.branch)
    ).fetchone()

    parent_hashes = [last_commit["commit_hash"]] if last_commit else []

    # 聚合 Facet 快照
    facet_snapshot = aggregate_facets_from_turns(
        cursor,
        commit.turn_window.start_turn_hash,
        commit.turn_window.end_turn_hash
    )

    # Pipeline 配置
    # 计算 pipeline 配置的哈希（确保可复现性）
    pipeline_id = "ring-default@v1"
    pipeline_config_content = {
        "id": pipeline_id,
        "extractor": "spacy" if USE_CORE_EMBEDDING else "simple",
        "embedding": "all-MiniLM-L6-v2" if USE_CORE_EMBEDDING else "none"
    }
    pipeline_hash = hashlib.sha256(
        json.dumps(pipeline_config_content, sort_keys=True).encode()
    ).hexdigest()
    pipeline_config = {
        "id": pipeline_id,
        "sha256": f"sha256:{pipeline_hash}"
    }

    # 生成时间戳
    created_at = datetime.now(timezone.utc).isoformat()

    # 准备 draft_ref
    draft_ref = None
    draft_text_hash = None
    if commit.draft_id:
        # 查询 draft 获取 text_hash
        draft_row = cursor.execute(
            "SELECT text FROM drafts WHERE draft_id = ?", (commit.draft_id,)
        ).fetchone()
        if draft_row:
            text_hash = hashlib.sha256(draft_row["text"].encode()).hexdigest()
            draft_text_hash = f"sha256:{text_hash}"
            draft_ref = {"draft_id": commit.draft_id, "text_hash": draft_text_hash}

    # 计算 Commit 哈希
    commit_data = {
        "project_id": commit.project_id,
        "branch": commit.branch,
        "parent_hashes": parent_hashes,
        "turn_window": {
            "start_turn_hash": commit.turn_window.start_turn_hash,
            "end_turn_hash": commit.turn_window.end_turn_hash
        },
        "facet_snapshot": facet_snapshot,
        "pipeline_config": pipeline_config,
        "draft_ref": draft_ref,
        "created_at": created_at
    }
    commit_hash = compute_commit_hash(commit_data)

    # 保存到数据库
    cursor.execute(
        """
        INSERT INTO commits (
            commit_hash, project_id, branch, message, parents_json,
            turn_window_json, facet_snapshot_json, pipeline_config_json,
            draft_id, draft_text_hash, signature_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            commit_hash,
            commit.project_id,
            commit.branch,
            commit.message,
            json.dumps(parent_hashes),
            json.dumps({
                "start_turn_hash": commit.turn_window.start_turn_hash,
                "end_turn_hash": commit.turn_window.end_turn_hash
            }),
            json.dumps(facet_snapshot),
            json.dumps(pipeline_config),
            commit.draft_id,
            draft_text_hash,
            None,  # signature
            created_at
        )
    )

    # 更新分支的 head_commit_hash
    update_branch_head(cursor, commit.project_id, commit.branch, commit_hash)

    db.commit()

    return APIResponse(
        data=CommitResponse(
            commit_hash=commit_hash,
            project_id=commit.project_id,
            branch=commit.branch,
            parent_hashes=parent_hashes,
            turn_window=commit.turn_window,
            draft_ref=DraftRef(
                draft_id=commit.draft_id,
                text_hash=draft_text_hash
            ) if draft_ref else None,
            created_at=created_at,
            signature=None
        )
    )


@router.get("", response_model=PaginatedResponse)
async def list_commits(
    project_id: str = Query(..., description="项目 ID（必需）"),
    branch: Optional[str] = Query(None, description="分支过滤（可选）"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    查询 Commit 列表
    """
    cursor = db.cursor()

    # 构建查询条件
    conditions = ["project_id = ?"]
    params = [project_id]

    if branch:
        conditions.append("branch = ?")
        params.append(branch)

    where_clause = " AND ".join(conditions)

    # 获取总数
    total = cursor.execute(
        f"SELECT COUNT(*) FROM commits WHERE {where_clause}",
        params
    ).fetchone()[0]

    # 获取 Commit 列表
    rows = cursor.execute(
        f"""
        SELECT commit_hash, project_id, branch, message, parents_json, created_at
        FROM commits
        WHERE {where_clause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        params + [limit, offset]
    ).fetchall()

    commits = [
        CommitListItem(
            commit_hash=row["commit_hash"],
            project_id=row["project_id"],
            branch=row["branch"],
            message=row["message"],
            parent_hashes=json.loads(row["parents_json"]),
            created_at=row["created_at"]
        )
        for row in rows
    ]

    return PaginatedResponse(
        data=commits,
        pagination=PaginationMeta(
            total=total,
            limit=limit,
            offset=offset,
            has_more=(offset + limit) < total
        )
    )


@router.get("/{commit_hash}", response_model=APIResponse)
async def get_commit(
    commit_hash: str,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    获取 Commit 完整详情
    """
    cursor = db.cursor()

    row = cursor.execute(
        """
        SELECT commit_hash, project_id, branch, parents_json, turn_window_json,
               facet_snapshot_json, pipeline_config_json, draft_id, draft_text_hash,
               signature_json, created_at
        FROM commits
        WHERE commit_hash = ?
        """,
        (commit_hash,)
    ).fetchone()

    if not row:
        raise commit_not_found(commit_hash)

    # 解析 JSON 字段
    turn_window_data = json.loads(row["turn_window_json"])
    facet_snapshot_data = json.loads(row["facet_snapshot_json"])
    pipeline_config_data = json.loads(row["pipeline_config_json"]) if row["pipeline_config_json"] else None

    # 构建 facet_snapshot
    facet_snapshots = []
    for fs in facet_snapshot_data:
        evidence = [
            EvidenceRef(**e) for e in fs.get("evidence", [])
        ]
        facet_snapshots.append(FacetSnapshot(
            facet=fs["facet"],
            text=fs["text"],
            keywords=fs.get("keywords", []),
            evidence=evidence
        ))

    # 构建 draft_ref
    draft_ref = None
    if row["draft_id"] and row["draft_text_hash"]:
        draft_ref = DraftRef(
            draft_id=row["draft_id"],
            text_hash=row["draft_text_hash"]
        )

    return APIResponse(
        data=CommitDetail(
            commit_hash=row["commit_hash"],
            project_id=row["project_id"],
            branch=row["branch"],
            parent_hashes=json.loads(row["parents_json"]),
            turn_window=TurnWindow(
                start_turn_hash=turn_window_data["start_turn_hash"],
                end_turn_hash=turn_window_data["end_turn_hash"]
            ),
            facet_snapshot=facet_snapshots,
            pipeline_config=PipelineConfig(**pipeline_config_data) if pipeline_config_data else None,
            draft_ref=draft_ref,
            created_at=row["created_at"],
            signature=None
        )
    )
