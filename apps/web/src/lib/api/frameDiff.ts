import type { TreeDiff } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export interface CommitMeta {
  hash: string;
  message: string | null;
  author: { type: string; name?: string };
  committed_at: string;
  branch: string;
}

export interface FrameDiffResponse {
  diff: TreeDiff;
  base: CommitMeta;
  target: CommitMeta;
}

export async function getTreeDiff(
  baseHash: string,
  targetHash: string
): Promise<FrameDiffResponse> {
  const res = await fetchWithTimeout(`${API_V1}/diff/frame`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_commit_hash: baseHash, target_commit_hash: targetHash }),
  });
  return handleResponse<FrameDiffResponse>(res);
}
