/**
 * Search API — hybrid (keyword + vector) sentence search
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// Types
// ============================================================================

export type SearchMode = 'hybrid' | 'keyword' | 'semantic';

export interface SearchHit {
  sentence_id: string;
  commit_hash: string;
  text: string;
  score: number;
  keyword_rank: number | null;
  vector_rank: number | null;
}

export interface SearchResult {
  results: SearchHit[];
  total: number;
  mode: SearchMode;
  query_time_ms: number;
}

// ============================================================================
// Search
// ============================================================================

export interface SearchSentencesInput {
  project_id?: string;
  query: string;
  mode?: SearchMode;
  limit?: number;
}

/**
 * Search sentences across commits using hybrid (keyword + vector) search.
 */
export async function searchSentences(input: SearchSentencesInput): Promise<SearchResult> {
  const res = await fetchWithTimeout(`${API_V1}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<SearchResult>(res);
}
