/**
 * L3 — search I/O entry point for stores and hooks.
 *
 * Thin wrapper around the raw HTTP adapter in `@/lib/api/search`. Stores
 * and components must import search I/O from here so the L3 store layer
 * does not reach into L1 directly (see docs/frontend-architecture-zh.md §2).
 */

import { searchNodes as searchNodesApi } from '@/lib/api/search';
import type { SearchHit, SearchMode, SearchNodesInput, SearchResult } from '@/lib/api/search';

export type { SearchHit, SearchMode, SearchNodesInput, SearchResult };

export function searchNodes(input: SearchNodesInput): Promise<SearchResult> {
  return searchNodesApi(input);
}
