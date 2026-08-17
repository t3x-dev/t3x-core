/**
 * Commits API (tree-based)
 */

import type { SemanticContent, TransitionViewV1 } from '@t3x-dev/core';
import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// ContentNode type (used by DiffDisplayView and other components)
// ============================================================================

/**
 * ContentNode with source info — used by diff display and other components
 * that need node text plus source tracing information.
 */
export interface NodeWithSourceInfo {
  id: string;
  text: string;
  source: {
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
}

// ============================================================================
// ContentNode-based commit types
// Used by diff display and other UI components.
// ============================================================================

/** Source reference for a node within a commit */
export interface NodeSourceRef {
  conversation_id: string;
  turn_hash: string;
  start_char: number;
  end_char: number;
}

/** A single node within a commit's content */
export interface CommitContentNode {
  id: string;
  text: string;
  source_ref?: NodeSourceRef;
  inherited_from?: string;
}

/** Author metadata for a commit */
export interface CommitAuthor {
  type: 'human' | 'agent';
  name?: string;
  id?: string;
}

/** Source reference at the commit level */
export interface CommitSourceRef {
  type: 'conversation' | 'leaf' | 'import';
  id: string;
  title?: string;
  assertion_lessons?: string[];
}

// ============================================================================
// Tree-based Commits
// ============================================================================

/** Tree-based commit operations from API response */

export interface ApiCommitOperation {
  created_at: string;
  id: string;
  model: string | null;
  source: string;
  turn_hash: string | null;
  yops: unknown;
}

export interface ApiCommitOperationsResponse {
  commit_hash: string;
  operations: ApiCommitOperation[];
}

/** Tree-based commit from API response */
export interface ApiCommit {
  hash: string;
  schema: 't3x/commit/v2';
  parents: string[];
  author: { type: string; id?: string; name?: string };
  committed_at: string;
  content: SemanticContent;
  project_id: string;
  message: string | null;
  branch: string;
  sources: Array<{ type: string; id: string; title?: string }> | null;
  provenance: {
    method: string;
    model?: string;
    schema_ref?: { name: string; version?: string; hash?: string };
  } | null;
  yops_log_ids?: string[];
  position_x?: number;
  position_y?: number;
}

interface CommitHistoryProjection {
  assurance?: { decision?: { digest?: string } };
  branch?: string;
  content?: SemanticContent;
  format: 'transition_v2';
  id: string;
  message?: string | null;
  parents: string[];
  project_id?: string;
  recordedAt: string;
  result?: { descriptor?: { digest?: string; schema?: string } };
  schema: 't3x/commit/v2';
}

interface StoredCommitV2Response {
  digest: string;
  hash?: string;
  recorded_at?: string;
  committed_at?: string;
  object?: {
    schema: 't3x/commit/v2';
    parents?: Array<{ digest: string }>;
  };
  parents?: string[];
  content?: SemanticContent;
  project_id?: string;
  message?: string | null;
  branch?: string;
  sources?: ApiCommit['sources'];
  provenance?: ApiCommit['provenance'];
}

function emptySemanticContent(): SemanticContent {
  return { trees: [], relations: [] };
}

function normalizeApiCommit(
  raw: ApiCommit | CommitHistoryProjection | StoredCommitV2Response,
  context: {
    branch?: string;
    projectId?: string;
  } = {}
): ApiCommit {
  if ('hash' in raw && raw.hash) {
    return {
      ...raw,
      branch: raw.branch || context.branch || 'main',
      content: raw.content ?? emptySemanticContent(),
      project_id: raw.project_id || context.projectId || '',
    } as ApiCommit;
  }

  if ('format' in raw && raw.format === 'transition_v2') {
    return {
      hash: raw.id,
      schema: raw.schema,
      parents: raw.parents,
      author: { type: 'system', name: 'Transition' },
      committed_at: raw.recordedAt,
      content: raw.content ?? emptySemanticContent(),
      project_id: raw.project_id || context.projectId || '',
      message: raw.message ?? null,
      branch: raw.branch || context.branch || 'main',
      sources: null,
      provenance: {
        method: 'transition_v2',
        schema_ref: {
          name: raw.result?.descriptor?.schema ?? 't3x/state/v1',
          hash: raw.result?.descriptor?.digest,
        },
      },
    };
  }

  const stored = raw as StoredCommitV2Response;
  const parents = stored.parents ?? stored.object?.parents?.map((parent) => parent.digest) ?? [];
  return {
    hash: stored.hash ?? stored.digest,
    schema: stored.object?.schema ?? 't3x/commit/v2',
    parents,
    author: { type: 'system', name: 'Transition' },
    committed_at: stored.committed_at ?? stored.recorded_at ?? new Date(0).toISOString(),
    content: stored.content ?? emptySemanticContent(),
    project_id: stored.project_id || context.projectId || '',
    message: stored.message ?? null,
    branch: stored.branch || context.branch || 'main',
    sources: stored.sources ?? null,
    provenance: stored.provenance ?? { method: 'transition_v2' },
  };
}

/**
 * List commits by project
 */
export async function listCommits(
  projectId: string,
  branch?: string,
  limit = 50,
  offset = 0
): Promise<ApiCommit[]> {
  const query = buildQueryString({ branch, limit, offset });
  const res = await fetchWithTimeout(`${API_V1}/projects/${projectId}/commits?${query}`);
  const data = await handleResponse<{ commits: Array<ApiCommit | CommitHistoryProjection> }>(res);
  return data.commits.map((commit) => normalizeApiCommit(commit, { branch, projectId }));
}

export function fetchCommits(
  projectId: string,
  branch?: string,
  limit = 100,
  offset = 0
): Promise<ApiCommit[]> {
  return listCommits(projectId, branch, limit, offset);
}

/**
 * Get a commit by hash
 */
export async function getApiCommit(commitHash: string, projectId?: string): Promise<ApiCommit> {
  const query = buildQueryString({ project_id: projectId });
  const res = await fetchWithTimeout(
    `${API_V1}/commits/${encodeURIComponent(commitHash)}${query ? `?${query}` : ''}`
  );
  const data = await handleResponse<{ commit: ApiCommit | StoredCommitV2Response }>(res);
  return normalizeApiCommit(data.commit, { projectId });
}

/** Read the server-derived Transition product projection for one commit/ref. */
export async function getCommitTransitionView(
  projectId: string,
  refName: string,
  commitId: string,
  signal?: AbortSignal
): Promise<TransitionViewV1> {
  const query = buildQueryString({ ref: refName });
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/commits/${encodeURIComponent(commitId)}/transition-view?${query}`,
    undefined,
    undefined,
    signal
  );
  const data = await handleResponse<{ transition: TransitionViewV1 }>(res);
  return data.transition;
}

/**
 * Commit exact structured repository state through the server Transition path.
 */
export async function commitRepositoryState(
  projectId: string,
  content: { trees: unknown[]; relations: unknown[] },
  options: {
    branch?: string;
    message?: string;
    expectedHead: string | null;
    sourceConversationId?: string;
  }
): Promise<{
  commit: {
    digest: string;
    hash?: string;
    ref_name: string;
    object: {
      schema: 't3x/commit/v2';
      parents: Array<{ kind: 'commit'; schema: 't3x/commit/v2'; digest: string }>;
      decision: { kind: 'statement'; schema: 't3x/statement/v1'; digest: string };
      result: { kind: 'state'; schema: 't3x/state/v1'; digest: string };
    };
  };
}> {
  const res = await fetchWithTimeout(`${API_V1}/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      content,
      branch: options.branch ?? 'main',
      message: options.message,
      expected_head: options.expectedHead,
      source_conversation_id: options.sourceConversationId,
    }),
  });
  return handleResponse(res);
}

/**
 * Update commit message (display name).
 */
export async function updateCommitMessage(commitHash: string, message: string): Promise<ApiCommit> {
  const res = await fetchWithTimeout(
    `${API_V1}/commits/${encodeURIComponent(commitHash)}/message`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }
  );
  return handleResponse<ApiCommit>(res);
}

/**
 * Get committed YOps log entries for a commit.
 */
export async function getApiCommitOperations(
  commitHash: string,
  projectId?: string
): Promise<ApiCommitOperationsResponse> {
  const query = buildQueryString({ project_id: projectId });
  const res = await fetchWithTimeout(
    `${API_V1}/commits/${encodeURIComponent(commitHash)}/operations${query ? `?${query}` : ''}`
  );
  return handleResponse<ApiCommitOperationsResponse>(res);
}

/**
 * Get commit ancestor chain as ApiCommit[].
 */
export async function getApiCommitHistory(commitHash: string, limit = 50): Promise<ApiCommit[]> {
  const query = buildQueryString({ limit });
  const res = await fetchWithTimeout(
    `${API_V1}/commits/${encodeURIComponent(commitHash)}/history?${query}`
  );
  const data = await handleResponse<{
    commits: Array<ApiCommit | CommitHistoryProjection>;
    truncated: boolean;
  }>(res);
  return data.commits.map((commit) => normalizeApiCommit(commit));
}

// ============================================================================
// ApiCommit helper functions
// ============================================================================
// Moved to @/domain/commitContent (v2 §2.2 pure functions). Re-export
// here for backward compat so existing non-component consumers (e.g.
// app/insights/page.tsx) keep working without a churn PR.

export { getSemanticContent, treeSummaryText } from '@/domain/commitContent';
