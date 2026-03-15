/**
 * Unified commit fetch — V5 frames with V4 fallback
 */

import type { Commit } from '@t3x-dev/core';
import { upgradeLegacyCommit } from '@t3x-dev/core';

import { API_V1, fetchWithTimeout } from './core';
import { getCommitV4, getCommitV4History } from './commits';

/**
 * Fetch a commit as V5 frames. Tries V5 endpoint first, falls back to V4 + upgrade.
 */
export async function getCommitAsFrames(hash: string): Promise<Commit> {
  // Try V5 first
  try {
    const res = await fetchWithTimeout(`${API_V1}/commits/${encodeURIComponent(hash)}`);
    if (res.ok) {
      const json = (await res.json()) as { success: boolean; data?: { commit?: Commit } };
      if (json.success && json.data?.commit) {
        return json.data.commit;
      }
    }
  } catch {
    // V5 not available, fall through to V4
  }

  // Fall back to V4 + upgrade
  const v4 = await getCommitV4(hash);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return upgradeLegacyCommit(v4 as any);
}

/**
 * Fetch commit history as V5 frames.
 */
export async function getCommitHistoryAsFrames(
  hash: string,
  limit = 10
): Promise<Commit[]> {
  const v4History = await getCommitV4History(hash, limit);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return v4History.map((c) => upgradeLegacyCommit(c as any));
}
