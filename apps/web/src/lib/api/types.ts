/**
 * API client types - aligned with @t3x/storage schema
 */

// Re-export external types used by consumers
export type { Pin } from '@t3x/core';
export type {
  AnchorConstraint,
  AnchorType,
  CommitAnchors,
  ConfirmedAnchor,
  SentenceWithAnchors,
} from '@/types/nodes';

// ============================================================================
// Project types
// ============================================================================

export interface Project {
  project_id: string;
  name: string;
  created_at: string;
  conversations_count?: number;
  turns_count?: number;
  commits_count?: number;
  branches_count?: number;
  drafts_count?: number;
  metadata?: Record<string, unknown>;
}

export interface ProjectDetail extends Project {
  stats?: {
    conversations_count: number;
    turns_count: number;
    commits_count: number;
  };
}

// ============================================================================
// Conversation types
// ============================================================================

export interface Conversation {
  conversation_id: string;
  project_id: string;
  title?: string;
  parent_commit_hash?: string;
  position_x?: number;
  position_y?: number;
  created_at: string;
  turns_count?: number;
  metadata?: {
    import?: {
      source_type: 'url' | 'document' | 'platform';
      source_url?: string;
      source_filename?: string;
      platform?: string;
      title?: string;
      imported_at?: string;
    };
  } | null;
}

// ============================================================================
// Turn types
// ============================================================================

export interface Turn {
  turn_hash: string;
  project_id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parent_turn_hash?: string;
  language?: string;
  created_at: string;
}

// Keyword from Ring 1 - aligned with @t3x/core Keyword
export interface RingKeyword {
  text: string;
  lemma: string;
  polarity: -1 | 0 | 1;
  pos: string;
  entityType: string | null;
  confidence: number;
}

// Facet from Ring 2 - aligned with @t3x/core Facet
export interface RingFacet {
  facetType: 'intent_seed' | 'time_window' | 'preference_soft' | 'unknown_slot';
  key: string;
  value: unknown;
  confidence: number;
}

// Segment from Ring 3 - aligned with @t3x/core Segment
export interface RingSegment {
  segmentId: string;
  text: string;
  startChar: number;
  endChar: number;
}

// Anchor candidate from Ring 1 (camelCase for internal use)
export interface RingAnchorCandidate {
  text: string;
  type: 'number' | 'money' | 'duration' | 'percent' | 'date' | 'entity' | 'term' | 'phrase';
  startChar: number;
  endChar: number;
  confidence: number;
  source: 'token' | 'entity' | 'phrase';
}

// Ring output structure - aligned with @t3x/core RingOutput
export interface RingsData {
  ring1: {
    keywords: RingKeyword[];
    timeAnchor: string | null;
    topic: string | null;
    preferenceKeywords: RingKeyword[];
    /** v1.1: Anchor candidates for inline highlighting */
    anchorCandidates?: RingAnchorCandidate[];
  };
  ring2: {
    facets: RingFacet[];
  };
  ring3: {
    segments: RingSegment[];
  };
}

export interface TurnDetail extends Turn {
  // API returns { rings: { ring1, ring2, ring3 } } wrapper
  rings: { rings: RingsData } | RingsData | null;
}

// ============================================================================
// Branch types
// ============================================================================

export interface Branch {
  branch_id: string;
  name: string;
  project_id?: string;
  parent_branch?: string;
  head_commit_hash?: string;
  description?: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Facet types from CLI aggregateFacets
// ============================================================================

// Base fields that all facets have
export interface FacetBase {
  facet: string;
  confidence?: number;
  source_turn?: string;
  // Additional fields from CLI FacetRecord
  key?: string;
  value?: unknown;
  text?: string;
  entity_type?: string;
}

export interface GoalFacet extends FacetBase {
  facet: 'goal';
  text: string;
}

export interface PreferenceFacet extends FacetBase {
  facet: 'preference';
  key: string;
  value: string;
}

export interface ContextFacet extends FacetBase {
  facet: 'context';
  entity_type: string;
  text: string;
}

// Union type for all facet kinds, plus catch-all for unknown facet types
export type Facet = GoalFacet | PreferenceFacet | ContextFacet | FacetBase;

// Source reference for multi-source commits
export interface SourceRef {
  type: 'conversation' | 'commit';
  conversation_id?: string;
  turn_window?: {
    start_turn_hash: string;
    end_turn_hash: string;
  };
  commit_hash?: string;
}

// ============================================================================
// Anchor Types for Commits (snake_case API format)
// ============================================================================

/** Anchor constraint type (snake_case to match API v1.1 output) */
export type ApiAnchorConstraint = 'must_have' | 'mustnt_have' | 'preferred';

/** Anchor type */
export type ApiAnchorType =
  | 'number'
  | 'money'
  | 'duration'
  | 'percent'
  | 'date'
  | 'entity'
  | 'term'
  | 'phrase';

/** Confirmed anchor (snake_case API format) */
export interface ApiConfirmedAnchor {
  id: string;
  text: string;
  /** Relative position within sentence (for API storage) */
  start: number;
  /** Relative position within sentence (for API storage) */
  end: number;
  type: ApiAnchorType;
  constraint: ApiAnchorConstraint;
  /** Optional: Pre-computed global start position (NOT from API, computed in UI layer during parsing) */
  global_start?: number;
  /** Optional: Pre-computed global end position (NOT from API, computed in UI layer during parsing) */
  global_end?: number;
}

/** Sentence with anchors (snake_case API format) */
export interface ApiSentenceWithAnchors {
  sentence_id: string;
  text: string;
  start_char: number;
  end_char: number;
  anchors: ApiConfirmedAnchor[];
}

/** Commit-level anchor storage (snake_case API format) */
export interface ApiCommitAnchors {
  input_text_hash: string;
  sentences: ApiSentenceWithAnchors[];
}

// ============================================================================
// Commit types (V2/legacy)
// ============================================================================

// Parsed commit for frontend use
// Aligned with @t3x/core CommitV2Record
export interface Commit {
  commit_hash: string;
  project_id: string;
  branch: string;
  message: string | null;
  parent_hashes: string[];
  turn_window: {
    start_turn_hash: string;
    end_turn_hash: string;
  } | null;
  facet_snapshot: Facet[] | null;
  pipeline_config: unknown | null;
  draft_id: string | null;
  draft_text_hash: string | null;
  signature: {
    algo: string;
    key_id: string;
    value: string;
  } | null;
  source_excerpt: string[] | null;
  must_have: string[] | null;
  mustnt_have: string[] | null;
  position_x: number | null;
  position_y: number | null;
  source_refs: SourceRef[] | null;
  /** v1.1: Confirmed anchors for this commit */
  anchors: ApiCommitAnchors | null;
  created_at: string;
}

// CommitDetail is now same as Commit since we parse all JSON fields
export type CommitDetail = Commit;

// ============================================================================
// Draft types (V1/V2)
// ============================================================================

export interface Draft {
  draft_id: string;
  project_id: string;
  conversation_id: string;
  lifecycle_status: 'ephemeral' | 'adopted' | 'superseded';
  validation_status: 'pending' | 'passed' | 'failed';
  base_commit_hash: string | null;
  turn_anchor_hash: string | null;
  bridge_id: string;
  intent: string;
  text: string | null;
  must_have: string[];
  mustnt_have: string[];
  validation: {
    passed: boolean;
    missing_keywords: string[];
    forbidden_keywords: string[];
  } | null;
  llm_config: unknown;
  created_at: string;
  completed_at: string | null;
}

// ============================================================================
// Diff types
// ============================================================================

// Raw diff response from backend
export interface DiffResultRaw {
  baseId: string;
  targetId: string;
  segmentDiffs: Array<{
    segmentId: string;
    text: string;
    diffType: 'same' | 'added' | 'removed' | 'modified';
    matchedSegmentId?: string;
    matchedText?: string;
    similarity?: number;
    wordDiff?: Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }>;
  }>;
  threshold: number;
  stats: {
    totalSegments: number;
    sameCount: number;
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
    conflictCount: number;
  };
  method: string;
  usedCache: boolean;
}

// Transformed diff result for UI
export interface DiffResult {
  base_commit_hash: string;
  target_commit_hash: string;
  diff: {
    facet_changes: Array<{
      facet: string;
      change_type: 'added' | 'removed' | 'modified';
      base_text?: string;
      target_text?: string;
      added_keywords: string[];
      removed_keywords: string[];
    }>;
    segment_changes: Array<{
      segment_id: string;
      change_type: 'added' | 'removed' | 'modified' | 'same';
      text: string;
      similarity_to_base?: number;
    }>;
  };
  computed_at: string;
  stats?: DiffResultRaw['stats'];
}

// ============================================================================
// List response types
// ============================================================================

export interface ProjectListData {
  projects: Project[];
  limit: number;
  offset: number;
}

export interface ConversationListData {
  conversations: Conversation[];
  limit: number;
  offset: number;
}

export interface TurnListData {
  turns: Turn[];
  limit: number;
  offset: number;
}

export interface BranchListData {
  branches: Branch[];
  limit: number;
  offset: number;
}

// ============================================================================
// API Response wrapper
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
