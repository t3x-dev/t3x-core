/**
 * Commits API — V5 (frame-based)
 *
 * V4 endpoints have been removed from the API server.
 * V4 types are kept as deprecated aliases for gradual migration.
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
// V4 types — DEPRECATED, kept as aliases for gradual migration
// These are still used by many UI components that read sentence data
// converted from V5 frames via framesToSentences().
// ============================================================================

/** @deprecated Use CommitV5 source tracing instead */
export interface CommitV4SentenceSourceRef {
  conversation_id: string;
  turn_hash: string;
  start_char: number;
  end_char: number;
}

/** @deprecated Sentences are derived from V5 frames via framesToSentences() */
export interface CommitV4Sentence {
  id: string;
  text: string;
  confidence?: number;
  source_ref?: CommitV4SentenceSourceRef;
  inherited_from?: string;
}

/** @deprecated Use CommitV5['author'] */
export interface CommitV4Author {
  type: 'human' | 'agent';
  name?: string;
  id?: string;
}

/** @deprecated Use CommitV5['sources'] entries */
export interface CommitV4SourceRef {
  type: 'conversation' | 'leaf';
  id: string;
  title?: string;
  assertion_lessons?: string[];
}

/**
 * CommitV4 — DEPRECATED, kept for backward compatibility.
 * New code should use CommitV5 directly.
 * Existing UI code can treat a V5 commit as V4-like by deriving sentences
 * from frames via framesToSentences().
 */
export interface CommitV4 {
  hash: string;
  schema: 't3x/commit/v4' | 't3x/commit/5';
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
  semantic?: import('@t3x-dev/core').SemanticContent;
  position_x: number | null;
  position_y: number | null;
  created_at: string;
}

// ============================================================================
// Frame-based Commits (V5 — current model)
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
 * List commits by project (V5 endpoint)
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
 * Get a commit by hash (V5 endpoint)
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
// Backward-compat aliases — V4 function names pointing to V5 endpoints
// These convert V5 response data into V4-like shapes for consuming code.
// ============================================================================

import { framesToSentences } from '@/lib/framesToSentences';

/**
 * Convert a V5 commit to V4-like shape for backward compatibility.
 * Derives sentences from frames and maps `sources` to `source_refs`.
 */
export function v5toV4(v5: CommitV5): CommitV4 {
  const sentences: CommitV4Sentence[] = v5.content?.frames?.length
    ? framesToSentences(v5.content as import('@t3x-dev/core').SemanticContent).map((s) => ({
        id: s.id,
        text: s.text,
        confidence: s.confidence,
        source_ref: s.source_ref
          ? {
              conversation_id: s.source_ref.conversation_id ?? '',
              turn_hash: s.source_ref.turn_hash ?? '',
              start_char: s.source_ref.start_char ?? 0,
              end_char: s.source_ref.end_char ?? 0,
            }
          : undefined,
      }))
    : [];

  return {
    hash: v5.hash,
    schema: v5.schema,
    parents: v5.parents,
    author: {
      type: (v5.author.type === 'human' || v5.author.type === 'agent' ? v5.author.type : 'human') as 'human' | 'agent',
      name: v5.author.name,
      id: v5.author.id,
    },
    committed_at: v5.committed_at,
    content: { sentences },
    project_id: v5.project_id,
    message: v5.message,
    branch: v5.branch,
    source_refs: v5.sources?.map((s) => ({
      type: (s.type === 'leaf' ? 'leaf' : 'conversation') as 'conversation' | 'leaf',
      id: s.id,
      title: s.title,
    })) ?? null,
    merge_summary: null,
    semantic: v5.content as import('@t3x-dev/core').SemanticContent | undefined,
    position_x: v5.position_x ?? null,
    position_y: v5.position_y ?? null,
    created_at: v5.committed_at,
  };
}

/**
 * @deprecated Use listCommitsV5 directly. This wrapper converts V5 to V4-like shape.
 */
export async function listCommitsV4(
  projectId: string,
  branch?: string,
  limit = 50,
  _offset = 0
): Promise<CommitV4[]> {
  const v5List = await listCommitsV5(projectId, branch, limit);
  return v5List.map(v5toV4);
}

/**
 * @deprecated Use getCommitV5 directly. This wrapper converts V5 to V4-like shape.
 */
export async function getCommitV4(commitHash: string): Promise<CommitV4> {
  const v5 = await getCommitV5(commitHash);
  return v5toV4(v5);
}

/**
 * @deprecated V4 history endpoint has been removed. Returns empty array.
 */
export async function getCommitV4History(
  _commitHash: string,
  _limit = 50
): Promise<CommitV4[]> {
  // V4 history endpoint no longer exists; callers should migrate to V5 APIs.
  return [];
}

/**
 * @deprecated V4 position update endpoint has been removed. No-op.
 */
export async function updateCommitV4Position(
  _commitHash: string,
  _positionX: number,
  _positionY: number
): Promise<CommitV4> {
  // V4 position endpoint no longer exists.
  // TODO: Add V5 position update endpoint when available.
  throw new Error('updateCommitV4Position: V4 endpoint removed. V5 position update not yet available.');
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
 * @deprecated V4 conflict check endpoint has been removed. Returns empty report.
 */
export async function checkConflicts(_commitHash: string): Promise<ConflictReport> {
  return { conflicts: [], checked_count: 0 };
}
