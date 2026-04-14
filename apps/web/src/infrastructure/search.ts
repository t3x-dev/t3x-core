/**
 * Search API — hybrid (keyword + vector) node search
 */

import type { SearchHit, SearchMode, SearchNodesInput, SearchResult } from '@/types/search';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

// Re-export types for backward compat. Canonical home: @/types/search.
export type { SearchHit, SearchMode, SearchNodesInput, SearchResult };

/**
 * Search nodes across commits using hybrid (keyword + vector) search.
 */
export async function searchNodes(input: SearchNodesInput): Promise<SearchResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    30000
  );
  return handleResponse<SearchResult>(res);
}
