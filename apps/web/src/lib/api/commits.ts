/**
 * Commits API (frame-based)
 *
 * Sentence-based types are kept as backward-compatible wrappers
 * that derive sentence data from frames via framesToSentences().
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
// Sentence-based commit types
// Used by UI components that read sentence data derived from frames.
// ============================================================================

/** Source reference for a sentence within a commit */
export interface SentenceSourceRef {
  conversation_id: string;
  turn_hash: string;
  start_char: number;
  end_char: number;
}

/** A single sentence within a commit's content */
export interface CommitSentence {
  id: string;
  text: string;
  confidence?: number;
  source_ref?: SentenceSourceRef;
  inherited_from?: string;
}

/** Author metadata for a commit */
export interface CommitAuthor {
  type: 'human' | 'agent';
  name?: string;
  id?: string;
}

/** Source reference at the commit level (conversation or leaf) */
export interface CommitSourceRef {
  type: 'conversation' | 'leaf';
  id: string;
  title?: string;
  assertion_lessons?: string[];
}

/**
 * SentenceCommit — A commit represented with sentence-based content.
 * New code should use ApiCommit directly.
 * Existing UI code can treat a frame-based commit as sentence-based by
 * deriving sentences from frames via framesToSentences().
 */
export interface SentenceCommit {
  hash: string;
  schema: 't3x/commit/v4' | 't3x/commit/5';
  parents: string[];
  author: CommitAuthor;
  committed_at: string;
  content: {
    sentences: CommitSentence[];
  };
  project_id: string | null;
  message: string | null;
  branch: string | null;
  source_refs: CommitSourceRef[] | null;
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
// Frame-based Commits
// ============================================================================

/** Frame-based commit from API response */
export interface ApiCommit {
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
 * List commits by project
 */
export async function listCommits(
  projectId: string,
  branch?: string,
  limit = 50
): Promise<ApiCommit[]> {
  const query = buildQueryString({ branch, limit });
  const res = await fetchWithTimeout(`${API_V1}/projects/${projectId}/commits?${query}`);
  const data = await handleResponse<{ commits: ApiCommit[] }>(res);
  return data.commits;
}

/**
 * Get a commit by hash
 */
export async function getApiCommit(commitHash: string): Promise<ApiCommit> {
  const res = await fetchWithTimeout(`${API_V1}/commits/${encodeURIComponent(commitHash)}`);
  const data = await handleResponse<{ commit: ApiCommit }>(res);
  return data.commit;
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
// Sentence conversion — converts frame-based commits to sentence-based shape
// ============================================================================

import { framesToSentences } from '@/lib/framesToSentences';

/**
 * Convert a frame-based commit to sentence-based shape.
 * Derives sentences from frames and maps `sources` to `source_refs`.
 */
export function toSentenceCommit(v5: ApiCommit): SentenceCommit {
  const sentences: CommitSentence[] = v5.content?.frames?.length
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
 * List commits as sentence-based shape.
 */
export async function listSentenceCommits(
  projectId: string,
  branch?: string,
  limit = 50,
  _offset = 0
): Promise<SentenceCommit[]> {
  const commitList = await listCommits(projectId, branch, limit);
  return commitList.map(toSentenceCommit);
}

/**
 * Get a single commit as sentence-based shape.
 */
export async function getSentenceCommit(commitHash: string): Promise<SentenceCommit> {
  const v5 = await getApiCommit(commitHash);
  return toSentenceCommit(v5);
}

/**
 * Get commit ancestor chain as sentence-based shape.
 */
export async function getCommitHistory(
  commitHash: string,
  limit = 50
): Promise<SentenceCommit[]> {
  try {
    const query = buildQueryString({ limit });
    const res = await fetchWithTimeout(
      `${API_V1}/commits/${encodeURIComponent(commitHash)}/history?${query}`
    );
    const data = await handleResponse<{ commits: ApiCommit[]; truncated: boolean }>(res);
    return data.commits.map(toSentenceCommit);
  } catch {
    return [];
  }
}

/**
 * Update commit canvas position.
 */
export async function updateCommitPosition(
  commitHash: string,
  positionX: number,
  positionY: number
): Promise<SentenceCommit> {
  const res = await fetchWithTimeout(
    `${API_V1}/commits/${encodeURIComponent(commitHash)}/position`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position_x: positionX, position_y: positionY }),
    }
  );
  const v5 = await handleResponse<ApiCommit>(res);
  return toSentenceCommit(v5);
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
