/**
 * Storage layer types for V2 tables
 * These types map to the Python core_api storage layer
 */

// === Record Types (DB rows) ===

export interface ProjectRecord {
  project_id: string;
  name: string;
  created_at: string;
  metadata_json: string | null;
}

export interface ConversationRecord {
  conversation_id: string;
  project_id: string;
  title: string | null;
  parent_commit_hash: string | null;
  created_at: string;
  metadata_json: string | null;
}

export interface TurnV2Record {
  turn_hash: string;
  parent_turn_hash: string | null;
  project_id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  language: string | null;
  rings_json: string | null;
  created_at: string;
}

export interface BranchRecord {
  branch_id: string;
  project_id: string;
  name: string;
  parent_branch: string | null;
  head_commit_hash: string | null;
  description: string | null;
  is_current: number; // SQLite uses 0/1 for boolean
  created_at: string;
  updated_at: string;
}

export interface CommitV2Record {
  commit_hash: string;
  project_id: string;
  branch: string;
  message: string | null;
  parents_json: string;
  turn_window_json: string;
  facet_snapshot_json: string;
  pipeline_config_json: string | null;
  draft_id: string | null;
  draft_text_hash: string | null;
  signature_json: string | null;
  source_excerpt_json: string | null;
  must_have_json: string | null;
  mustnt_have_json: string | null;
  created_at: string;
}

export interface DraftV2Record {
  draft_id: string;
  project_id: string;
  conversation_id: string;
  base_commit_hash: string | null;
  turn_anchor_hash: string | null;
  bridge_id: string;
  bridge_payload_json: string;
  must_have_json: string | null;
  mustnt_have_json: string | null;
  llm_config_json: string;
  text: string;
  status: 'ephemeral' | 'adopted' | 'superseded';
  created_at: string;
  completed_at: string | null;
}

export interface MergeResultRecord {
  merge_result_id: string;
  project_id: string;
  base_commit_hash: string;
  source_commit_hash: string;
  target_commit_hash: string;
  status: 'clean' | 'conflicts';
  auto_merged_json: string;
  conflicts_json: string;
  created_at: string;
}

export interface SegmentEmbeddingRecord {
  segment_id: string;           // "turn_hash:s-0"
  turn_hash: string;
  segment_index: number;
  segment_text: string;
  embedding_model: string;      // "google-ai:text-embedding-004"
  embedding_dim: number;        // 768
  embedding: Buffer;            // Float32Array as binary
  created_at: string;
}

// === Input Types ===

export interface CreateProjectInput {
  name: string;
  metadata?: Record<string, unknown>;
}

export interface CreateConversationInput {
  project_id: string;
  title?: string;
  parent_commit_hash?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateTurnV2Input {
  project_id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  language?: string;
  rings?: unknown; // Ring output from extractor
}

export interface CreateBranchInput {
  project_id: string;
  name: string;
  parent_branch?: string;
  description?: string;
}

export interface CreateCommitV2Input {
  project_id: string;
  branch: string;
  message?: string;
  turn_window: {
    start_turn_hash: string;
    end_turn_hash: string;
  };
  facet_snapshot: unknown[];
  pipeline_config?: unknown;
  draft_id?: string;
  draft_text_hash?: string;
  signature?: unknown;
  source_excerpt?: string[];
  must_have?: string[];
  mustnt_have?: string[];
}

export interface CreateDraftV2Input {
  project_id: string;
  conversation_id: string;
  base_commit_hash?: string;
  turn_anchor_hash?: string;
  bridge_id: string;
  bridge_payload: unknown;
  must_have?: string[];
  mustnt_have?: string[];
  llm_config: unknown;
  text: string;
}

export interface CreateSegmentEmbeddingInput {
  turn_hash: string;
  segment_index: number;
  segment_text: string;
  embedding_model: string;
  embedding_dim: number;
  embedding: number[];          // Float array from embedding provider
}

export interface CreateSegmentEmbeddingsBatchInput {
  turn_hash: string;
  embedding_model: string;
  embedding_dim: number;
  segments: Array<{
    index: number;
    text: string;
    embedding: number[];
  }>;
}

// === Query Options ===

export interface ListOptions {
  limit?: number;
  offset?: number;
}

export interface ListProjectsOptions extends ListOptions {}

export interface ListConversationsOptions extends ListOptions {
  project_id: string;
}

export interface ListTurnsV2Options extends ListOptions {
  conversation_id: string;
  /** Sort order: 'asc' (oldest first) or 'desc' (newest first). Default: 'asc' */
  order?: 'asc' | 'desc';
}

export interface ListBranchesOptions extends ListOptions {
  project_id: string;
}

export interface ListCommitsV2Options extends ListOptions {
  project_id: string;
  branch?: string;
}

export interface ListDraftsV2Options extends ListOptions {
  project_id: string;
  status?: 'ephemeral' | 'adopted' | 'superseded';
}

// === Stats Types ===

export interface ProjectStats {
  conversations_count: number;
  turns_count: number;
  commits_count: number;
  branches_count: number;
  drafts_count: number;
}

export interface ProjectWithStats extends ProjectRecord {
  stats: ProjectStats;
}
