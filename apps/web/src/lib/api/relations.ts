/**
 * Inter-sentence relations API — extract and query semantic relations between sentences
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// Types
// ============================================================================

export type RelationType =
  | 'supports'
  | 'contrasts'
  | 'causes'
  | 'elaborates'
  | 'temporal_follows'
  | 'conditions'
  | 'summarizes';

export interface SentenceRelation {
  id: string;
  source_id: string;
  target_id: string;
  type: RelationType;
  confidence: number;
  reasoning: string;
}

export interface ExtractionStats {
  total_sentences: number;
  relations_found: number;
  avg_confidence: number;
  extraction_time_ms: number;
}

// ============================================================================
// Relations
// ============================================================================

/**
 * Get existing relations for a commit.
 */
export async function getCommitRelations(hash: string): Promise<{ relations: SentenceRelation[] }> {
  const res = await fetchWithTimeout(`${API_V1}/commits/${encodeURIComponent(hash)}/relations`);
  return handleResponse<{ relations: SentenceRelation[] }>(res);
}

/**
 * Extract (compute) inter-sentence relations for a commit.
 */
export async function extractCommitRelations(
  hash: string
): Promise<{ relations_found: number; stats: ExtractionStats }> {
  const res = await fetchWithTimeout(
    `${API_V1}/commits/${encodeURIComponent(hash)}/relations/extract`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    60000 // 60s timeout for LLM relation extraction
  );
  return handleResponse<{ relations_found: number; stats: ExtractionStats }>(res);
}
