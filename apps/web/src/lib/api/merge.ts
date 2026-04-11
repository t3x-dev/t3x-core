/**
 * Merge Drafts API
 *
 * CRUD operations for merge drafts, plus prepare/execute for canvas-based merges.
 */

import type { MergeResult } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// Types
// ============================================================================

export interface MergeDraftResponse {
  draftId: string;
  projectId: string;
  sourceHash: string;
  targetHash: string;
  sourceBranch: string | null;
  targetBranch: string | null;
  prepared: MergeResult | undefined;
  status: 'pending' | 'committed' | 'cancelled';
  message: string | null;
}

/** Server-side merge check result. */
export interface ApiMergeCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
  source?: 'frontend' | 'server';
}

export interface MergePrepareResult {
  autoKept: string[];
  conflicts: Array<{ path: string; slotConflicts: unknown[] }>;
  onlyInSource: string[];
  onlyInTarget: string[];
}

// ============================================================================
// Merge Draft CRUD
// ============================================================================

/**
 * Create a new merge draft.
 */
export async function createMergeDraft(params: {
  project_id: string;
  source_hash: string;
  target_hash: string;
  source_branch?: string;
  target_branch?: string;
}): Promise<MergeDraftResponse> {
  const res = await fetchWithTimeout(`${API_V1}/merge/drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleResponse<MergeDraftResponse>(res);
}

/**
 * Load an existing merge draft by ID.
 */
export async function getMergeDraft(draftId: string): Promise<MergeDraftResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/merge/drafts/${encodeURIComponent(draftId)}`
  );
  return handleResponse<MergeDraftResponse>(res);
}

/**
 * Save (patch) a merge draft.
 */
export async function saveMergeDraft(
  draftId: string,
  patch: { prepared?: MergeResult; message?: string }
): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_V1}/merge/drafts/${encodeURIComponent(draftId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }
  );
  await handleResponse(res);
}

/**
 * Delete a merge draft.
 */
export async function deleteMergeDraft(draftId: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_V1}/merge/drafts/${encodeURIComponent(draftId)}`,
    { method: 'DELETE' }
  );
  await handleResponse(res);
}

/**
 * Commit a merge draft, producing a merge commit.
 */
export async function commitMergeDraft(
  draftId: string,
  params: { message: string; branch: string }
): Promise<{ hash: string }> {
  const res = await fetchWithTimeout(
    `${API_V1}/merge/drafts/${encodeURIComponent(draftId)}/commit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }
  );
  return handleResponse<{ hash: string }>(res);
}

/**
 * Fetch server-side merge checks for a draft.
 */
export async function getMergeDraftChecks(draftId: string): Promise<ApiMergeCheck[]> {
  const res = await fetchWithTimeout(
    `${API_V1}/merge/drafts/${encodeURIComponent(draftId)}/checks`
  );
  return handleResponse<ApiMergeCheck[]>(res);
}

// ============================================================================
// Canvas Merge (prepare/execute without draft)
// ============================================================================

/**
 * Prepare a merge between two commits (canvas workflow).
 */
export async function prepareMergeApi(
  sourceHash: string,
  targetHash: string
): Promise<MergeResult> {
  const res = await fetchWithTimeout(`${API_V1}/merge/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_hash: sourceHash, target_hash: targetHash }),
  });
  return handleResponse<MergeResult>(res);
}

/**
 * Execute a prepared merge (canvas workflow).
 */
export async function executeMergeApi(params: {
  source_hash: string;
  target_hash: string;
  prepared: MergeResult;
  message: string;
  branch: string;
}): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(`${API_V1}/merge/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleResponse<Record<string, unknown>>(res);
}
