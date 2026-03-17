/**
 * Commits V4 API
 */

import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// Sentence type (used by DiffDisplayView and other components)
// ============================================================================

/**
 * Sentence with source info — used by diff display and other components
 * that need sentence text plus source tracing information.
 */
export interface SentenceWithSourceInfo {
  id: string;
  text: string;
  source: {
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
}

// ============================================================================
// Commits V4 (Pure knowledge - sentences only, no constraints)
// ============================================================================

// CommitV4 sentence source reference (with char positions for highlighting)
export interface CommitV4SentenceSourceRef {
  conversation_id: string;
  turn_hash: string;
  start_char: number;
  end_char: number;
}

// CommitV4 sentence from API
export interface CommitV4Sentence {
  id: string;
  text: string;
  confidence?: number;
  source_ref?: CommitV4SentenceSourceRef;
  /**
   * The commit hash where this sentence was originally created.
   * Set when a sentence is inherited from a parent commit.
   * Undefined for sentences created directly in this commit.
   */
  inherited_from?: string;
}

// CommitV4 author from API
export interface CommitV4Author {
  type: 'human' | 'agent';
  name?: string;
  id?: string;
}

// CommitV4 commit-level source reference
export interface CommitV4SourceRef {
  type: 'conversation' | 'leaf';
  id: string;
  title?: string;
  assertion_lessons?: string[];
}

// CommitV4 from API response
export interface CommitV4 {
  hash: string;
  schema: 't3x/commit/v4';
  parents: string[];
  author: CommitV4Author;
  committed_at: string;
  content: {
    sentences: CommitV4Sentence[];
  };
  project_id: string | null;
  message: string | null;
  branch: string | null;
  source_refs: CommitV4SourceRef[] | null;
  merge_summary?: {
    kept_identical: number;
    resolved_conflicts: number;
    kept_from_source: number;
    kept_from_target: number;
    discarded: number;
    total_sentences: number;
  } | null;
  /** Semantic frame content (frames + relations). Nullable — old commits have undefined. */
  semantic?: import('@t3x-dev/core').SemanticContent;
  position_x: number | null;
  position_y: number | null;
  created_at: string;
}

/**
 * List V4 commits by project
 * Returns array of CommitV4 directly
 */
export async function listCommitsV4(
  projectId: string,
  branch?: string,
  limit = 50,
  offset = 0
): Promise<CommitV4[]> {
  const query = buildQueryString({ branch, limit, offset });
  const res = await fetchWithTimeout(`${API_V1}/projects/${projectId}/commits-v4?${query}`);
  return handleResponse<CommitV4[]>(res);
}

/**
 * Get a V4 commit by hash
 */
export async function getCommitV4(commitHash: string): Promise<CommitV4> {
  const res = await fetchWithTimeout(`${API_V1}/commits-v4/${encodeURIComponent(commitHash)}`);
  return handleResponse<CommitV4>(res);
}

/**
 * Get V4 commit ancestor chain (history)
 * Walks parent chain via BFS from the given commit.
 */
export async function getCommitV4History(commitHash: string, limit = 50): Promise<CommitV4[]> {
  const query = buildQueryString({ limit });
  const res = await fetchWithTimeout(
    `${API_V1}/commits-v4/${encodeURIComponent(commitHash)}/history?${query}`
  );
  return handleResponse<CommitV4[]>(res);
}

/**
 * Update V4 commit canvas position
 */
export async function updateCommitV4Position(
  commitHash: string,
  positionX: number,
  positionY: number
): Promise<CommitV4> {
  const res = await fetchWithTimeout(
    `${API_V1}/commits-v4/${encodeURIComponent(commitHash)}/position`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position_x: positionX,
        position_y: positionY,
      }),
    }
  );
  return handleResponse<CommitV4>(res);
}

/** Response from createCommitV4 — commit data + optional conflict report */
export interface CreateCommitV4Result {
  commit: CommitV4;
  conflicts: ConflictReport | null;
}

/**
 * Create a V4 commit (pure knowledge - sentences only)
 *
 * V4 commits use sentences[] only. Constraints belong to Leaves.
 * source_ref in each sentence enables source context display with highlights.
 *
 * By default (inherit_parent_sentences=true), sentences from parent commits
 * are automatically inherited into the new commit. Set to false to disable.
 *
 * Returns the created commit plus an optional conflict report.
 * If no embedding provider is configured on the server, conflicts will be null.
 */
export async function createCommitV4(
  projectId: string,
  sentences: CommitV4Sentence[],
  options?: {
    branch?: string;
    message?: string;
    parents?: string[];
    position?: { x: number; y: number };
    author?: CommitV4Author;
    source_refs?: CommitV4SourceRef[];
    /**
     * If true (default), automatically inherit all sentences from parent commits.
     * Inherited sentences will have inherited_from set to their original commit hash.
     * New sentences with the same text will override inherited ones.
     */
    inherit_parent_sentences?: boolean;
    /** Semantic frame content (frames + relations) from the conversation's delta log. */
    semantic?: import('@t3x-dev/core').SemanticContent;
  }
): Promise<CreateCommitV4Result> {
  const res = await fetchWithTimeout(`${API_V1}/commits-v4`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      sentences,
      branch: options?.branch ?? 'main',
      message: options?.message,
      parents: options?.parents ?? [],
      position_x: options?.position?.x,
      position_y: options?.position?.y,
      author: options?.author ?? { type: 'human', name: 'User' },
      source_refs: options?.source_refs,
      inherit_parent_sentences: options?.inherit_parent_sentences,
      semantic: options?.semantic,
    }),
  });
  return handleResponse<CreateCommitV4Result>(res);
}

// ============================================================================
// Frame-based Commits (V5 — new model)
// ============================================================================

/** V5 commit from API response */
export interface CommitV5 {
  hash: string;
  schema: 't3x/commit/5';
  parents: string[];
  author: { type: string; id?: string; name?: string };
  committed_at: string;
  content: { frames: unknown[]; relations: unknown[] };
  project_id: string;
  message: string | null;
  branch: string;
  sources: Array<{ type: string; id: string; title?: string }> | null;
  provenance: { method: string; model?: string } | null;
  position_x?: number;
  position_y?: number;
}

/**
 * List V5 commits by project
 */
export async function listCommitsV5(
  projectId: string,
  branch?: string,
  limit = 50
): Promise<CommitV5[]> {
  const query = buildQueryString({ branch, limit });
  const res = await fetchWithTimeout(`${API_V1}/projects/${projectId}/commits?${query}`);
  return handleResponse<CommitV5[]>(res);
}

/**
 * Get a V5 commit by hash
 */
export async function getCommitV5(commitHash: string): Promise<CommitV5> {
  const res = await fetchWithTimeout(`${API_V1}/commits/${encodeURIComponent(commitHash)}`);
  return handleResponse<CommitV5>(res);
}

/**
 * Create a frame-based commit (new model).
 * Sends frames directly as content — no sentence conversion needed.
 */
export async function createCommit(
  projectId: string,
  content: { frames: unknown[]; relations: unknown[] },
  options?: {
    branch?: string;
    message?: string;
    parents?: string[];
    author?: { type: string; id?: string; name?: string };
    sources?: Array<{ type: string; id: string; title?: string }>;
    provenance?: { method: string; model?: string };
  }
): Promise<{ commit: { hash: string } }> {
  const res = await fetchWithTimeout(`${API_V1}/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      content,
      branch: options?.branch ?? 'main',
      message: options?.message,
      parents: options?.parents ?? [],
      author: options?.author ?? { type: 'human', name: 'User' },
      sources: options?.sources,
      provenance: options?.provenance,
    }),
  });
  return handleResponse(res);
}

// ============================================================================
// Conflict Detection
// ============================================================================

export interface ConflictCandidate {
  new_sentence_id: string;
  new_sentence_text: string;
  existing_sentence_id: string;
  existing_sentence_text: string;
  existing_commit_hash: string;
  cosine: number;
  jaccard: number;
}

export interface ConflictReport {
  conflicts: ConflictCandidate[];
  checked_count: number;
}

/**
 * Check for semantic conflicts between a commit's sentences and existing commits
 */
export async function checkConflicts(commitHash: string): Promise<ConflictReport> {
  const res = await fetchWithTimeout(
    `${API_V1}/commits-v4/${encodeURIComponent(commitHash)}/check-conflicts`,
    { method: 'POST' }
  );
  return handleResponse<ConflictReport>(res);
}
