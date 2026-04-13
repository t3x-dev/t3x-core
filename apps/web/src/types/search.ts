/**
 * Search API contract types.
 *
 * Lives in @/types/ so components, store, and queries can import them
 * without importing from @/infrastructure directly (v2 §1 layer ban).
 * Infrastructure and queries both re-export for backward compat.
 */

export type SearchMode = 'hybrid' | 'keyword' | 'semantic';

export interface SearchHit {
  node_id: string;
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

export interface SearchNodesInput {
  project_id?: string;
  query: string;
  mode?: SearchMode;
  limit?: number;
}
