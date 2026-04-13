/**
 * API client types - aligned with @t3x-dev/storage schema
 */

import type { ExtractionStyleConfig } from '@t3x-dev/core';

// Re-export external types used by consumers
export type { ExtractionStyleConfig, Pin } from '@t3x-dev/core';
export type {
  AnchorConstraint,
  AnchorType,
  CommitAnchors,
  ConfirmedAnchor,
  NodeWithAnchors,
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
  default_provider?: string | null;
  default_model?: string | null;
  extraction_style?: ExtractionStyleConfig | null;
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
  provider?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown> | null;
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

export interface TurnDetail extends Turn {
  // Legacy ring data (if present in DB) — ring extraction has been retired
  rings: Record<string, unknown> | null;
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
// Anchor Types — re-export from @/types/anchors (canonical home).
// Pre-existing infra consumers keep working; new code should import
// directly from @/types/anchors. Parsers live in @/domain/commitAnchors.
// ============================================================================

import type { ApiCommitAnchors } from '@/types/anchors';

export type {
  ApiAnchorCandidate,
  ApiAnchorConstraint,
  ApiAnchorType,
  ApiCommitAnchors,
  ApiConfirmedAnchor,
  ApiNodeWithAnchors,
} from '@/types/anchors';

// ============================================================================
// Commit types (V2/legacy)
// ============================================================================

// Parsed commit for frontend use
// Aligned with @t3x-dev/core Commit
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
    equivalentCount?: number;
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

// ============================================================================
// LLM types
// ============================================================================

export interface LLMModelInfo {
  id: string;
  label: string;
  capabilities: string[];
  max_output_tokens: number;
}

export interface LLMProviderInfo {
  name: string;
  label: string;
  available: boolean;
  models: LLMModelInfo[];
}

export interface LLMModelsResponse {
  providers: LLMProviderInfo[];
}
