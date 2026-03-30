/**
 * Unified commit fetch — tree-primary
 */

import type { Commit } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout } from './core';

/** Commit extended with optional API-only fields not present in core type */
export type WebCommit = Commit & {
  sources?: Array<{ type: string; id: string; title?: string }> | null;
  position_x?: number | null;
  position_y?: number | null;
};

/**
 * Fetch a commit (tree-primary format).
 */
export async function getCommitAsNodes(hash: string): Promise<WebCommit> {
  const res = await fetchWithTimeout(`${API_V1}/commits/${encodeURIComponent(hash)}`);
  const json = (await res.json()) as { success: boolean; data?: { commit?: WebCommit } };
  if (json.success && json.data?.commit) {
    return json.data.commit;
  }
  throw new Error(`Failed to fetch commit ${hash}`);
}

/**
 * Fetch commit history (tree-primary format).
 */
export async function getCommitHistoryAsNodes(hash: string, limit = 10): Promise<WebCommit[]> {
  try {
    const res = await fetchWithTimeout(
      `${API_V1}/commits/${encodeURIComponent(hash)}/history?limit=${limit}`
    );
    if (res.ok) {
      const json = (await res.json()) as { success: boolean; data?: { commits?: WebCommit[] } };
      if (json.success && json.data?.commits) {
        return json.data.commits;
      }
    }
  } catch {
    // Fall through
  }
  return [];
}
