import type { TreeDiff } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export interface CommitMeta {
  digest: string;
  rationale: string | null;
  actor: unknown;
  recorded_at: string;
}

export interface DiffResponse {
  diff: TreeDiff;
  base: CommitMeta;
  target: CommitMeta;
}

export async function getTreeDiff(baseHash: string, targetHash: string): Promise<DiffResponse> {
  const res = await fetchWithTimeout(`${API_V1}/diff/frame`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_commit_hash: baseHash, target_commit_hash: targetHash }),
  });
  return handleResponse<DiffResponse>(res);
}
