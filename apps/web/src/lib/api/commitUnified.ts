/**
 * Unified commit fetch — V5 frames
 */

import type { Commit } from '@t3x-dev/core';
import { upgradeLegacyCommit } from '@t3x-dev/core';
import { getCommitV5 } from './commits';
import { API_V1, fetchWithTimeout } from './core';

/**
 * Fetch a commit as V5 frames.
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

  // Fallback: fetch via V5 API and attempt upgrade
  const v5 = await getCommitV5(hash);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return upgradeLegacyCommit(v5 as any);
}

/**
 * Fetch commit history as V5 frames.
 * Note: V4 history endpoint is removed; this returns empty for now.
 */
export async function getCommitHistoryAsFrames(_hash: string, _limit = 10): Promise<Commit[]> {
  // V4 history endpoint removed. Callers should migrate to V5 APIs.
  return [];
}
