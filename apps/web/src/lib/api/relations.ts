/**
 * Relations API — query semantic relations from commit content
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// Types
// ============================================================================

export type RelationType =
  | 'causes'
  | 'conditions'
  | 'contrasts'
  | 'follows'
  | 'depends';

export interface NodeRelation {
  from: string;
  to: string;
  type: RelationType;
  confidence?: number;
}

// ============================================================================
// Relations
// ============================================================================

/**
 * Get relations for a commit (from content.relations).
 */
export async function getCommitRelations(hash: string): Promise<{ relations: NodeRelation[] }> {
  const res = await fetchWithTimeout(`${API_V1}/commits/${encodeURIComponent(hash)}/relations`);
  return handleResponse<{ relations: NodeRelation[] }>(res);
}
