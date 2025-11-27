"""
Pydantic models - API contract definitions

These models define the API request/response formats, aligned with CORE_API_SPEC.zh.md.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ============================================================================
# Generic response models
# ============================================================================

class APIResponse(BaseModel):
    """Unified success response format"""
    status: str = "ok"
    data: Any = None


class PaginationMeta(BaseModel):
    """Pagination metadata"""
    total: int
    limit: int
    offset: int
    has_more: bool


class PaginatedResponse(BaseModel):
    """Paginated response"""
    status: str = "ok"
    data: list[Any]
    pagination: PaginationMeta


class ErrorDetail(BaseModel):
    """Error details"""
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class ErrorResponse(BaseModel):
    """Unified error response format"""
    status: str = "error"
    error: ErrorDetail


# ============================================================================
# Project models
# ============================================================================

class ProjectCreate(BaseModel):
    """Create project request"""
    name: str = Field(..., min_length=1, max_length=100)
    metadata: Optional[Dict[str, Any]] = None


class ProjectResponse(BaseModel):
    """Project response"""
    project_id: str
    name: str
    created_at: str
    metadata: Optional[Dict[str, Any]] = None


class ProjectListItem(BaseModel):
    """Project list item"""
    project_id: str
    name: str
    created_at: str
    conversations_count: int = 0
    turns_count: int = 0


class ProjectDetail(BaseModel):
    """Project details"""
    project_id: str
    name: str
    created_at: str
    metadata: Optional[Dict[str, Any]] = None
    stats: Optional[Dict[str, int]] = None


# ============================================================================
# Conversation models
# ============================================================================

class ConversationCreate(BaseModel):
    """Create conversation request"""
    project_id: str
    title: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ConversationResponse(BaseModel):
    """Conversation response"""
    conversation_id: str
    project_id: str
    title: Optional[str] = None
    created_at: str


class ConversationListItem(BaseModel):
    """Conversation list item"""
    conversation_id: str
    project_id: str
    title: Optional[str] = None
    created_at: str
    turns_count: int = 0


# ============================================================================
# Turn models
# ============================================================================

class TurnCreate(BaseModel):
    """Create turn request (parent_turn_hash not allowed)"""
    project_id: str
    conversation_id: str
    role: str = Field(..., pattern="^(user|assistant|system|tool)$")
    content: str
    language: Optional[str] = Field(
        None,
        pattern="^(zh|en|auto)$",
        description="Language specification: zh=Chinese(jieba), en=English(spaCy), auto=auto-detect(default)"
    )


class PreferenceKeyword(BaseModel):
    """Preference keyword"""
    keyword: str
    polarity: str  # positive | negative | neutral
    lemma: str


class Entity(BaseModel):
    """Entity"""
    text: str
    type: str
    start: Optional[int] = None
    end: Optional[int] = None


class Ring1(BaseModel):
    """Ring 1: Topic spine"""
    keywords: List[str] = []
    entities: List[Entity] = []
    time_anchor: Optional[str] = None
    preference_keywords: List[PreferenceKeyword] = []


class Ring2(BaseModel):
    """Ring 2: Soft relations / Facets"""
    intent_seed: Optional[str] = None
    time_window: Optional[str] = None
    preference_soft: List[str] = []
    unknown_slot: List[str] = []
    facets: List[str] = []  # Optional derived field


class Segment(BaseModel):
    """Sentence segment"""
    id: str
    text: str


class Ring3(BaseModel):
    """Ring 3: Sentence structure"""
    segments: List[Segment] = []


class Rings(BaseModel):
    """Complete ring structure"""
    ring1: Ring1
    ring2: Ring2
    ring3: Ring3


class TurnResponse(BaseModel):
    """Turn response (without rings)"""
    turn_hash: str
    project_id: str
    conversation_id: str
    role: str
    content: str
    parent_turn_hash: Optional[str] = None
    language: Optional[str] = None  # zh | en | auto | None
    created_at: str


class TurnDetailResponse(BaseModel):
    """Turn detail response (with rings)"""
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
# Commit models
# ============================================================================

class TurnWindow(BaseModel):
    """Turn window"""
    start_turn_hash: str
    end_turn_hash: str


class DraftRef(BaseModel):
    """Draft reference"""
    draft_id: str
    text_hash: str


class CommitCreate(BaseModel):
    """Create commit request"""
    project_id: str
    conversation_id: str
    branch: str = "main"
    message: Optional[str] = None  # Optional metadata, not included in hash
    turn_window: TurnWindow
    draft_id: Optional[str] = None
    sign: bool = False


class EvidenceRef(BaseModel):
    """Evidence reference"""
    turn_hash: str
    segment_id: str
    similarity_score: float


class FacetSnapshot(BaseModel):
    """Facet snapshot"""
    facet: str
    text: str
    keywords: List[str] = []
    evidence: List[EvidenceRef] = []


class PipelineConfig(BaseModel):
    """Pipeline configuration snapshot"""
    id: str
    sha256: str


class Signature(BaseModel):
    """Signature"""
    algo: str
    key_id: str
    value: str


class CommitResponse(BaseModel):
    """Commit response"""
    commit_hash: str
    project_id: str
    branch: str
    parent_hashes: List[str] = []
    turn_window: TurnWindow
    draft_ref: Optional[DraftRef] = None
    created_at: str
    signature: Optional[Signature] = None


class CommitListItem(BaseModel):
    """Commit list item"""
    commit_hash: str
    project_id: str
    branch: str
    message: Optional[str] = None
    parent_hashes: List[str] = []
    created_at: str


class CommitDetail(BaseModel):
    """Commit details"""
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
# Branch models
# ============================================================================

class BranchCreate(BaseModel):
    """Create branch request"""
    project_id: str
    name: str = Field(..., min_length=1, max_length=100, pattern=r"^[A-Za-z0-9._/-]+$")
    from_branch: Optional[str] = None  # Branch to create from, defaults to current branch
    description: Optional[str] = None
    checkout: bool = False  # Whether to switch to the new branch after creation


class BranchSwitchRequest(BaseModel):
    """Switch branch request"""
    project_id: str
    name: str
    create: bool = False  # Whether to create the branch if it doesn't exist
    from_branch: Optional[str] = None  # Base branch when create=True
    description: Optional[str] = None


class BranchDeleteRequest(BaseModel):
    """Delete branch request"""
    project_id: str
    name: str
    force: bool = False


class BranchResponse(BaseModel):
    """Branch response"""
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
    """Branch list item"""
    branch_id: str
    name: str
    parent_branch: Optional[str] = None
    head_commit_hash: Optional[str] = None
    description: Optional[str] = None
    is_current: bool = False
    created_at: str
    updated_at: str


class CurrentBranchResponse(BaseModel):
    """Current branch response"""
    project_id: str
    current_branch: str
    head_commit_hash: Optional[str] = None


# ============================================================================
# Diff models
# ============================================================================

class DiffRequest(BaseModel):
    """Diff request"""
    base_commit_hash: str
    target_commit_hash: str


class FacetChange(BaseModel):
    """Facet change"""
    facet: str
    change_type: str  # added | removed | modified
    base_text: Optional[str] = None
    target_text: Optional[str] = None
    added_keywords: List[str] = []
    removed_keywords: List[str] = []


class SegmentChange(BaseModel):
    """Segment change"""
    segment_id: str
    change_type: str  # added | removed | modified
    text: str
    similarity_to_base: Optional[float] = None


class DiffResult(BaseModel):
    """Diff result"""
    facet_changes: List[FacetChange] = []
    segment_changes: List[SegmentChange] = []


class DiffResponse(BaseModel):
    """Diff response"""
    base_commit_hash: str
    target_commit_hash: str
    diff: DiffResult
    computed_at: str


# ============================================================================
# Merge models
# ============================================================================

class MergeRequest(BaseModel):
    """Merge request"""
    project_id: str
    base_commit_hash: str
    source_commit_hash: str
    target_commit_hash: str


class AutoMergedFacet(BaseModel):
    """Auto-merged facet"""
    facet: str
    merged_text: str
    source: str  # source | target
    keywords: List[str] = []


class MergeConflict(BaseModel):
    """Merge conflict"""
    facet: str
    base_text: Optional[str] = None
    source_text: Optional[str] = None
    target_text: Optional[str] = None
    conflict_type: str  # divergent_edit | etc
    evidence: Optional[Dict[str, List[str]]] = None


class MergeResultResponse(BaseModel):
    """Merge result response"""
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
# Export models
# ============================================================================

class CfpackProject(BaseModel):
    """Project information in cfpack"""
    project_id: str
    name: str
    created_at: str


class CfpackTurn(BaseModel):
    """Turn in cfpack"""
    turn_hash: str
    parent_turn_hash: Optional[str] = None
    role: str
    content: str
    created_at: str
    rings: Optional[Rings] = None


class CfpackCommit(BaseModel):
    """Commit in cfpack"""
    commit_hash: str
    parent_hashes: List[str] = []
    branch: str
    turn_window: TurnWindow
    facet_snapshot: List[FacetSnapshot] = []
    pipeline_config: Optional[PipelineConfig] = None
    created_at: str


class CfpackFindings(BaseModel):
    """Findings in cfpack"""
    aggregated_keywords: List[Dict[str, Any]] = []
    must_have: List[str] = []
    mustnt_have: List[str] = []
    evidence_refs: List[Dict[str, Any]] = []


class CfpackHash(BaseModel):
    """Cfpack hash information"""
    algorithm: str
    pack_hash: str


class CfpackMeta(BaseModel):
    """Cfpack metadata"""
    exported_at: str
    exported_by: str


class CfpackResponse(BaseModel):
    """Complete cfpack response"""
    version: str = "1.0.0"
    cfpack_schema_version: str = "1.0.0"
    project: CfpackProject
    turns: List[CfpackTurn] = []
    findings: Optional[CfpackFindings] = None
    commits: List[CfpackCommit] = []
    hash: Optional[CfpackHash] = None
    meta: CfpackMeta


# ============================================================================
# Draft models (Agentic Layer)
# ============================================================================

class LLMConfig(BaseModel):
    """LLM configuration"""
    provider: str = "anthropic"
    model: str = "claude-sonnet-4-5-20250929"
    temperature: float = 0.3
    max_tokens: int = 2048


class DraftCreate(BaseModel):
    """Create draft request"""
    project_id: str
    conversation_id: str
    base_commit_hash: Optional[str] = None
    turn_anchor_hash: Optional[str] = None
    bridge_id: str = Field(..., pattern="^(plan|summary|explain|clarify)$")
    intent: str
    llm_config: Optional[LLMConfig] = None


class DraftValidation(BaseModel):
    """Draft validation result"""
    passed: bool
    missing_keywords: List[str] = []
    forbidden_keywords: List[str] = []


class DraftResponse(BaseModel):
    """Draft response"""
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
    """Update draft request"""
    feedback: Optional[str] = None
    append_must_have: List[str] = []


# ============================================================================
# Health & Status models
# ============================================================================

class HealthResponse(BaseModel):
    """Health check response"""
    status: str = "ok"
    version: str
    uptime: int


class StorageStats(BaseModel):
    """Storage statistics"""
    database_size_bytes: int
    ledger_files_count: int


class StatusResponse(BaseModel):
    """System status response"""
    projects_count: int = 0
    conversations_count: int = 0
    turns_count: int = 0
    commits_count: int = 0
    storage: Optional[StorageStats] = None
