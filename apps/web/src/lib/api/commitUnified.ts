/**
 * Unified commit fetch — frame-based
 */

import type { Commit } from '@t3x-dev/core';
import { upgradeLegacyCommit } from '@t3x-dev/core';
import { getApiCommit } from './commits';
import { API_V1, fetchWithTimeout } from './core';

/**
 * Fetch a commit as frames.
 */
export async function getCommitAsFrames(hash: string): Promise<Commit> {
  try {
    const res = await fetchWithTimeout(`${API_V1}/commits/${encodeURIComponent(hash)}`);
    if (res.ok) {
      const json = (await res.json()) as { success: boolean; data?: { commit?: Commit } };
      if (json.success && json.data?.commit) {
        return json.data.commit;
      }
    }
  } catch {
    // Fall through
  }

  // Fallback: fetch via API and attempt upgrade
  const v5 = await getApiCommit(hash);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return upgradeLegacyCommit(v5 as any);
}

/**
 * Fetch commit history as frames.
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
