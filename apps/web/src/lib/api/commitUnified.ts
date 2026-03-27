/**
 * Unified commit fetch — tree-primary
 */

import type { Commit } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout } from './core';

/**
 * Fetch a commit (tree-primary format).
 */
export async function getCommitAsFrames(hash: string): Promise<Commit> {
  const res = await fetchWithTimeout(`${API_V1}/commits/${encodeURIComponent(hash)}`);
  const json = (await res.json()) as { success: boolean; data?: { commit?: Commit } };
  if (json.success && json.data?.commit) {
    return json.data.commit;
  }
  throw new Error(`Failed to fetch commit ${hash}`);
}

/**
 * Fetch commit history (tree-primary format).
 */
export async function getCommitHistoryAsFrames(hash: string, limit = 10): Promise<Commit[]> {
  try {
    const res = await fetchWithTimeout(
      `${API_V1}/commits/${encodeURIComponent(hash)}/history?limit=${limit}`
    );
    if (res.ok) {
      const json = (await res.json()) as { success: boolean; data?: { commits?: Commit[] } };
      if (json.success && json.data?.commits) {
        return json.data.commits;
      }
    }
  } catch {
    // Fall through
  }
  return [];
}
