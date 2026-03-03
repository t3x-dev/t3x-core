/**
 * Diff & Merge API
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';
import type { DiffResult, DiffResultRaw } from './types';

export async function diff(baseCommitHash: string, targetCommitHash: string): Promise<DiffResult> {
  const res = await fetchWithTimeout(`${API_V1}/diff/two-way`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_commit_hash: baseCommitHash,
      target_commit_hash: targetCommitHash,
    }),
  });
  const raw = await handleResponse<DiffResultRaw>(res);

  // Transform backend response to frontend format
  const segmentChanges = raw.segmentDiffs.map((seg) => ({
    segment_id: seg.segmentId,
    change_type: seg.diffType as 'added' | 'removed' | 'modified' | 'same',
    text: seg.text,
    matched_text: seg.matchedText,
    similarity_to_base: seg.similarity,
  }));

  // Group segments by change type to create facet-like changes for display
  const addedSegments = segmentChanges.filter((s) => s.change_type === 'added');
  const removedSegments = segmentChanges.filter((s) => s.change_type === 'removed');
  const modifiedSegments = segmentChanges.filter((s) => s.change_type === 'modified');

  // Create facet_changes from segment diffs for UI display
  const facetChanges: DiffResult['diff']['facet_changes'] = [];

  // Add removed segments as facet changes
  removedSegments.forEach((seg, idx) => {
    facetChanges.push({
      facet: `removed_${idx + 1}`,
      change_type: 'removed',
      base_text: seg.text,
      target_text: undefined,
      added_keywords: [],
      removed_keywords: [],
    });
  });

  // Add added segments as facet changes
  addedSegments.forEach((seg, idx) => {
    facetChanges.push({
      facet: `added_${idx + 1}`,
      change_type: 'added',
      base_text: undefined,
      target_text: seg.text,
      added_keywords: [],
      removed_keywords: [],
    });
  });

  // Add modified segments as facet changes
  modifiedSegments.forEach((seg, idx) => {
    facetChanges.push({
      facet: `modified_${idx + 1}`,
      change_type: 'modified',
      base_text: seg.text,
      target_text: seg.matched_text ?? seg.text,
      added_keywords: [],
      removed_keywords: [],
    });
  });

  return {
    base_commit_hash: baseCommitHash,
    target_commit_hash: targetCommitHash,
    diff: {
      facet_changes: facetChanges,
      segment_changes: segmentChanges,
    },
    computed_at: new Date().toISOString(),
    stats: raw.stats,
  };
}

/**
 * Raw diff - returns the unprocessed API response for full-screen diff view
 */
export async function diffRaw(
  baseCommitHash: string,
  targetCommitHash: string
): Promise<DiffResultRaw> {
  const res = await fetchWithTimeout(`${API_V1}/diff/two-way`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_commit_hash: baseCommitHash,
      target_commit_hash: targetCommitHash,
    }),
  });
  return handleResponse<DiffResultRaw>(res);
}
