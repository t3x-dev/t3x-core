/**
 * Relations API — query semantic relations from commit content
 */

import type { Relation, RelationType } from '@t3x-dev/core';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

// Re-export core types for consumers
export type { Relation, RelationType };

/**
 * Get relations for a commit (from content.relations).
 */
export async function getCommitRelations(hash: string): Promise<{ relations: Relation[] }> {
  const res = await fetchWithTimeout(`${API_V1}/commits/${encodeURIComponent(hash)}/relations`);
  return handleResponse<{ relations: Relation[] }>(res);
}
