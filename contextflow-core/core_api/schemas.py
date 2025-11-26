"""
Pydantic 模型 - API 契约定义

这些模型定义了 API 的请求/响应格式，与 CORE_API_SPEC.zh.md 保持一致。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ============================================================================
# 通用响应模型
# ============================================================================

class APIResponse(BaseModel):
    """统一成功响应格式"""
    status: str = "ok"
    data: Any = None


class PaginationMeta(BaseModel):
    """分页元数据"""
    total: int
    limit: int
    offset: int
    has_more: bool


class PaginatedResponse(BaseModel):
    """带分页的响应"""
    status: str = "ok"
    data: list[Any]
    pagination: PaginationMeta


class ErrorDetail(BaseModel):
    """错误详情"""
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class ErrorResponse(BaseModel):
    """统一错误响应格式"""
    status: str = "error"
    error: ErrorDetail


# ============================================================================
# Project 模型
# ============================================================================

class ProjectCreate(BaseModel):
    """创建项目请求"""
    name: str = Field(..., min_length=1, max_length=100)
    metadata: Optional[Dict[str, Any]] = None


class ProjectResponse(BaseModel):
    """项目响应"""
    project_id: str
    name: str
    created_at: str
    metadata: Optional[Dict[str, Any]] = None


class ProjectListItem(BaseModel):
    """项目列表项"""
    project_id: str
    name: str
    created_at: str
    conversations_count: int = 0
    turns_count: int = 0


class ProjectDetail(BaseModel):
    """项目详情"""
    project_id: str
    name: str
    created_at: str
    metadata: Optional[Dict[str, Any]] = None
    stats: Optional[Dict[str, int]] = None


# ============================================================================
# Conversation 模型
# ============================================================================

class ConversationCreate(BaseModel):
    """创建对话请求"""
    project_id: str
    title: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ConversationResponse(BaseModel):
    """对话响应"""
    conversation_id: str
    project_id: str
    title: Optional[str] = None
    created_at: str


class ConversationListItem(BaseModel):
    """对话列表项"""
    conversation_id: str
    project_id: str
    title: Optional[str] = None
    created_at: str
    turns_count: int = 0


# ============================================================================
# Turn 模型
# ============================================================================

class TurnCreate(BaseModel):
    """创建 Turn 请求（不允许指定 parent_turn_hash）"""
    project_id: str
    conversation_id: str
    role: str = Field(..., pattern="^(user|assistant|system|tool)$")
    content: str
    language: Optional[str] = Field(
        None,
        pattern="^(zh|en|auto)$",
        description="指定语言：zh=中文(jieba), en=英文(spaCy), auto=自动检测(默认)"
    )


class PreferenceKeyword(BaseModel):
    """偏好关键词"""
    keyword: str
    polarity: str  # positive | negative | neutral
    lemma: str


class Entity(BaseModel):
    """实体"""
    text: str
    type: str
    start: Optional[int] = None
    end: Optional[int] = None


class Ring1(BaseModel):
    """Ring 1：主题主轴"""
    keywords: List[str] = []
    entities: List[Entity] = []
    time_anchor: Optional[str] = None
    preference_keywords: List[PreferenceKeyword] = []


class Ring2(BaseModel):
    """Ring 2：轻关系 / Facet"""
    intent_seed: Optional[str] = None
    time_window: Optional[str] = None
    preference_soft: List[str] = []
    unknown_slot: List[str] = []
    facets: List[str] = []  # 可选派生字段


class Segment(BaseModel):
    """分句片段"""
    id: str
    text: str


class Ring3(BaseModel):
    """Ring 3：分句结构"""
    segments: List[Segment] = []


class Rings(BaseModel):
    """完整 Ring 结构"""
    ring1: Ring1
    ring2: Ring2
    ring3: Ring3


class TurnResponse(BaseModel):
    """Turn 响应（不含 Rings）"""
    turn_hash: str
    project_id: str
    conversation_id: str
    role: str
    content: str
    parent_turn_hash: Optional[str] = None
    language: Optional[str] = None  # zh | en | auto | None
    created_at: str


class TurnDetailResponse(BaseModel):
    """Turn 详情响应（含 Rings）"""
    turn_hash: str
    project_id: str
    conversation_id: str
    role: str
    content: str
    parent_turn_hash: Optional[str] = None
    language: Optional[str] = None  # zh | en | auto | None
    created_at: str
    rings: Rings


# ============================================================================
# Commit 模型
# ============================================================================

class TurnWindow(BaseModel):
    """Turn 窗口"""
    start_turn_hash: str
    end_turn_hash: str


class DraftRef(BaseModel):
    """Draft 引用"""
    draft_id: str
    text_hash: str


class CommitCreate(BaseModel):
    """创建 Commit 请求"""
    project_id: str
    conversation_id: str
    branch: str = "main"
    message: Optional[str] = None  # 可选元数据，不参与哈希
    turn_window: TurnWindow
    draft_id: Optional[str] = None
    sign: bool = False


class EvidenceRef(BaseModel):
    """证据引用"""
    turn_hash: str
    segment_id: str
    similarity_score: float


class FacetSnapshot(BaseModel):
    """Facet 快照"""
    facet: str
    text: str
    keywords: List[str] = []
    evidence: List[EvidenceRef] = []


class PipelineConfig(BaseModel):
    """Pipeline 配置快照"""
    id: str
    sha256: str


class Signature(BaseModel):
    """签名"""
    algo: str
    key_id: str
    value: str


class CommitResponse(BaseModel):
    """Commit 响应"""
    commit_hash: str
    project_id: str
    branch: str
    parent_hashes: List[str] = []
    turn_window: TurnWindow
    draft_ref: Optional[DraftRef] = None
    created_at: str
    signature: Optional[Signature] = None


class CommitListItem(BaseModel):
    """Commit 列表项"""
    commit_hash: str
    project_id: str
    branch: str
    message: Optional[str] = None
    parent_hashes: List[str] = []
    created_at: str


class CommitDetail(BaseModel):
    """Commit 详情"""
    commit_hash: str
    project_id: str
    branch: str
    parent_hashes: List[str] = []
    turn_window: TurnWindow
    facet_snapshot: List[FacetSnapshot] = []
    pipeline_config: Optional[PipelineConfig] = None
    draft_ref: Optional[DraftRef] = None
    created_at: str
    signature: Optional[Signature] = None


# ============================================================================
# Branch 模型
# ============================================================================

class BranchCreate(BaseModel):
    """创建分支请求"""
    project_id: str
    name: str = Field(..., min_length=1, max_length=100, pattern=r"^[A-Za-z0-9._/-]+$")
    from_branch: Optional[str] = None  # 基于哪个分支创建，默认当前分支
    description: Optional[str] = None
    checkout: bool = False  # 创建后是否切换到新分支


class BranchSwitchRequest(BaseModel):
    """切换分支请求"""
    project_id: str
    name: str
    create: bool = False  # 如果分支不存在是否创建
    from_branch: Optional[str] = None  # create=True 时的基础分支
    description: Optional[str] = None


class BranchDeleteRequest(BaseModel):
    """删除分支请求"""
    project_id: str
    name: str
    force: bool = False


class BranchResponse(BaseModel):
    """分支响应"""
    branch_id: str
    project_id: str
    name: str
    parent_branch: Optional[str] = None
    head_commit_hash: Optional[str] = None
    description: Optional[str] = None
    is_current: bool = False
    created_at: str
    updated_at: str


class BranchListItem(BaseModel):
    """分支列表项"""
    branch_id: str
    name: str
    parent_branch: Optional[str] = None
    head_commit_hash: Optional[str] = None
    description: Optional[str] = None
    is_current: bool = False
    created_at: str
    updated_at: str


class CurrentBranchResponse(BaseModel):
    """当前分支响应"""
    project_id: str
    current_branch: str
    head_commit_hash: Optional[str] = None


# ============================================================================
# Diff 模型
# ============================================================================

class DiffRequest(BaseModel):
    """Diff 请求"""
    base_commit_hash: str
    target_commit_hash: str


class FacetChange(BaseModel):
    """Facet 变更"""
    facet: str
    change_type: str  # added | removed | modified
    base_text: Optional[str] = None
    target_text: Optional[str] = None
    added_keywords: List[str] = []
    removed_keywords: List[str] = []


class SegmentChange(BaseModel):
    """Segment 变更"""
    segment_id: str
    change_type: str  # added | removed | modified
    text: str
    similarity_to_base: Optional[float] = None


class DiffResult(BaseModel):
    """Diff 结果"""
    facet_changes: List[FacetChange] = []
    segment_changes: List[SegmentChange] = []


class DiffResponse(BaseModel):
    """Diff 响应"""
    base_commit_hash: str
    target_commit_hash: str
    diff: DiffResult
    computed_at: str


# ============================================================================
# Merge 模型
# ============================================================================

class MergeRequest(BaseModel):
    """Merge 请求"""
    project_id: str
    base_commit_hash: str
    source_commit_hash: str
    target_commit_hash: str


class AutoMergedFacet(BaseModel):
    """自动合并的 Facet"""
    facet: str
    merged_text: str
    source: str  # source | target
    keywords: List[str] = []


class MergeConflict(BaseModel):
    """合并冲突"""
    facet: str
    base_text: Optional[str] = None
    source_text: Optional[str] = None
    target_text: Optional[str] = None
    conflict_type: str  # divergent_edit | etc
    evidence: Optional[Dict[str, List[str]]] = None


class MergeResultResponse(BaseModel):
    """Merge 结果响应"""
    merge_result_id: str
    base_commit_hash: str
    source_commit_hash: str
    target_commit_hash: str
    status: str  # clean | conflicts
    auto_merged_facets: List[AutoMergedFacet] = []
    conflicts: List[MergeConflict] = []
    auto_merged_count: int = 0
    conflict_count: int = 0
    created_at: str


# ============================================================================
# Export 模型
# ============================================================================

class CfpackProject(BaseModel):
    """cfpack 中的项目信息"""
    project_id: str
    name: str
    created_at: str


class CfpackTurn(BaseModel):
    """cfpack 中的 Turn"""
    turn_hash: str
    parent_turn_hash: Optional[str] = None
    role: str
    content: str
    created_at: str
    rings: Optional[Rings] = None


class CfpackCommit(BaseModel):
    """cfpack 中的 Commit"""
    commit_hash: str
    parent_hashes: List[str] = []
    branch: str
    turn_window: TurnWindow
    facet_snapshot: List[FacetSnapshot] = []
    pipeline_config: Optional[PipelineConfig] = None
    created_at: str


class CfpackFindings(BaseModel):
    """cfpack 中的 Findings"""
    aggregated_keywords: List[Dict[str, Any]] = []
    must_have: List[str] = []
    mustnt_have: List[str] = []
    evidence_refs: List[Dict[str, Any]] = []


class CfpackHash(BaseModel):
    """cfpack 哈希信息"""
    algorithm: str
    pack_hash: str


class CfpackMeta(BaseModel):
    """cfpack 元数据"""
    exported_at: str
    exported_by: str


class CfpackResponse(BaseModel):
    """完整 cfpack 响应"""
    version: str = "1.0.0"
    cfpack_schema_version: str = "1.0.0"
    project: CfpackProject
    turns: List[CfpackTurn] = []
    findings: Optional[CfpackFindings] = None
    commits: List[CfpackCommit] = []
    hash: Optional[CfpackHash] = None
    meta: CfpackMeta


# ============================================================================
# Draft 模型（Agentic Layer）
# ============================================================================

class LLMConfig(BaseModel):
    """LLM 配置"""
    provider: str = "anthropic"
    model: str = "claude-sonnet-4-5-20250929"
    temperature: float = 0.3
    max_tokens: int = 2048


class DraftCreate(BaseModel):
    """创建 Draft 请求"""
    project_id: str
    conversation_id: str
    base_commit_hash: Optional[str] = None
    turn_anchor_hash: Optional[str] = None
    bridge_id: str = Field(..., pattern="^(plan|summary|explain|clarify)$")
    intent: str
    llm_config: Optional[LLMConfig] = None


class DraftValidation(BaseModel):
    """Draft 验证结果"""
    passed: bool
    missing_keywords: List[str] = []
    forbidden_keywords: List[str] = []


class DraftResponse(BaseModel):
    """Draft 响应"""
    draft_id: str
    project_id: str
    conversation_id: str
    status: str  # pending | ready | failed
    base_commit_hash: Optional[str] = None
    turn_anchor_hash: Optional[str] = None
    bridge_id: str
    intent: str
    text: Optional[str] = None
    must_have: List[str] = []
    mustnt_have: List[str] = []
    validation: Optional[DraftValidation] = None
    llm_config: Optional[LLMConfig] = None
    created_at: str
    completed_at: Optional[str] = None


class DraftUpdate(BaseModel):
    """更新 Draft 请求"""
    feedback: Optional[str] = None
    append_must_have: List[str] = []


# ============================================================================
# Health & Status 模型
# ============================================================================

class HealthResponse(BaseModel):
    """健康检查响应"""
    status: str = "ok"
    version: str
    uptime: int


class StorageStats(BaseModel):
    """存储统计"""
    database_size_bytes: int
    ledger_files_count: int


class StatusResponse(BaseModel):
    """系统状态响应"""
    projects_count: int = 0
    conversations_count: int = 0
    turns_count: int = 0
    commits_count: int = 0
    storage: Optional[StorageStats] = None
