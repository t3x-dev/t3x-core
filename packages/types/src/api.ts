/**
 * API request/response types for T3X REST API
 */

/**
 * Standard API response wrapper
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Pagination
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  limit: number;
  offset: number;
  total?: number;
}

/**
 * Project API types
 */
export interface ApiProject {
  project_id: string;
  name: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface ApiProjectWithStats extends ApiProject {
  conversations_count: number;
  turns_count: number;
  commits_count: number;
  branches_count: number;
  drafts_count: number;
}

export interface CreateProjectRequest {
  name: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectRequest {
  name?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Conversation API types
 */
export interface ApiConversation {
  conversation_id: string;
  project_id: string;
  title: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface CreateConversationRequest {
  project_id: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateConversationRequest {
  title?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Turn API types
 */
export type ApiTurnRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ApiTurn {
  turn_hash: string;
  parent_turn_hash: string | null;
  project_id: string;
  conversation_id: string;
  role: ApiTurnRole;
  content: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface CreateTurnRequest {
  project_id: string;
  conversation_id: string;
  role: ApiTurnRole;
  content: string;
  parent_turn_hash?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Commit API types
 */
export interface ApiCommit {
  commit_hash: string;
  parent_hashes: string[];
  project_id: string;
  branch_id: string;
  message: string | null;
  turn_window: {
    start_turn_hash: string;
    end_turn_hash: string;
  };
  created_at: string;
}

export interface CreateCommitRequest {
  project_id: string;
  branch_id: string;
  message?: string;
  start_turn_hash: string;
  end_turn_hash: string;
  parent_hashes?: string[];
}

/**
 * Branch API types
 */
export interface ApiBranch {
  branch_id: string;
  project_id: string;
  name: string;
  head_commit_hash: string | null;
  created_at: string;
}

export interface CreateBranchRequest {
  project_id: string;
  name: string;
  from_commit_hash?: string;
}

/**
 * Draft API types
 */
export type ApiDraftStatus = 'pending' | 'approved' | 'rejected';

export interface ApiDraft {
  draft_id: string;
  project_id: string;
  conversation_id: string;
  status: ApiDraftStatus;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDraftRequest {
  project_id: string;
  conversation_id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateDraftRequest {
  status?: ApiDraftStatus;
  content?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Diff API types
 */
export interface DiffSegment {
  type: 'added' | 'removed' | 'unchanged' | 'modified';
  content: string;
  similarity?: number;
}

export interface TwoWayDiffRequest {
  base: string;
  target: string;
}

export interface TwoWayDiffResponse {
  segments: DiffSegment[];
  similarity: number;
}

export interface ThreeWayDiffRequest {
  base: string;
  ours: string;
  theirs: string;
}

export interface ThreeWayDiffResponse {
  segments: DiffSegment[];
  conflicts: Array<{
    base: string;
    ours: string;
    theirs: string;
  }>;
  has_conflicts: boolean;
}

/**
 * Merge API types
 */
export interface MergeRequest {
  project_id: string;
  base_commit_hash: string;
  ours_commit_hash: string;
  theirs_commit_hash: string;
  auto_resolve?: boolean;
}

export interface MergeResponse {
  merge_id: string;
  status: 'completed' | 'conflicts' | 'failed';
  result_commit_hash?: string;
  conflicts?: Array<{
    facet_id: string;
    base_value: unknown;
    ours_value: unknown;
    theirs_value: unknown;
  }>;
}

/**
 * Export API types
 */
export interface ExportOptions {
  project_id: string;
  format?: 'cfpack' | 'jsonl';
  include_metadata?: boolean;
}
