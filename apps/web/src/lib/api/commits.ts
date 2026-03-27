/**
 * Commits API (tree-based)
 */

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
  confidence?: number;
  source_ref?: NodeSourceRef;
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

// ============================================================================
// Tree-based Commits
// ============================================================================

/** Tree-based commit from API response */
export interface ApiCommit {
  hash: string;
  schema: 't3x/commit/5';
  parents: string[];
  author: { type: string; id?: string; name?: string };
  committed_at: string;
  content: { trees: unknown[]; relations: unknown[] };
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
 * Create a tree-based commit (new model).
 * Sends trees directly as content — no node conversion needed.
 */
export async function createCommit(
  projectId: string,
  content: { trees: unknown[]; relations: unknown[] },
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

/**
 * Update commit canvas position.
 */
export async function updateCommitPosition(
  commitHash: string,
  positionX: number,
  positionY: number
): Promise<ApiCommit> {
  const res = await fetchWithTimeout(
    `${API_V1}/commits/${encodeURIComponent(commitHash)}/position`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position_x: positionX, position_y: positionY }),
    }
  );
  return handleResponse<ApiCommit>(res);
}

/**
 * Get commit ancestor chain as ApiCommit[].
 */
export async function getApiCommitHistory(commitHash: string, limit = 50): Promise<ApiCommit[]> {
  try {
    const query = buildQueryString({ limit });
    const res = await fetchWithTimeout(
      `${API_V1}/commits/${encodeURIComponent(commitHash)}/history?${query}`
    );
    const data = await handleResponse<{ commits: ApiCommit[]; truncated: boolean }>(res);
    return data.commits;
  } catch {
    return [];
  }
}

// ============================================================================
// Conflict Detection
// ============================================================================

export interface ConflictCandidate {
  new_node_id: string;
  new_node_text: string;
  existing_node_id: string;
  existing_node_text: string;
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

// ============================================================================
// ApiCommit helper functions (tree-based)
// ============================================================================

import type { SemanticContent } from '@t3x-dev/core';

/**
 * Extract SemanticContent from an ApiCommit.
 * Returns the tree-based content, or a default empty SemanticContent if missing.
 */
export function getSemanticContent(commit: ApiCommit): SemanticContent {
  return (commit.content ?? { trees: [], relations: [] }) as SemanticContent;
}

/**
 * Generate summary text from trees for display purposes (export, insights).
 * Converts tree structure to human-readable text representation.
 */
export function treeSummaryText(commit: ApiCommit): string {
  const content = getSemanticContent(commit);
  function nodeToText(node: { key: string; slots: Record<string, unknown>; children?: unknown[] }): string {
    const slots = Object.entries(node.slots ?? {})
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(', ');
    return `${node.key}: ${slots}`;
  }
  function flattenNodes(trees: Array<{ key: string; slots: Record<string, unknown>; children?: Array<{ key: string; slots: Record<string, unknown>; children?: unknown[] }> }>): string[] {
    const result: string[] = [];
    for (const t of trees) {
      result.push(nodeToText(t));
      if (t.children && t.children.length > 0) {
        result.push(...flattenNodes(t.children as typeof trees));
      }
    }
    return result;
  }
  return flattenNodes(content.trees as Array<{ key: string; slots: Record<string, unknown>; children?: Array<{ key: string; slots: Record<string, unknown>; children?: unknown[] }> }>).join('. ');
}
