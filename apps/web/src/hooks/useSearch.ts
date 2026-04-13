/**
 * useSearch — view-facing API for the search domain.
 *
 * Owns the I/O that used to live inside `searchStore.search()`. Store is
 * now pure state + setters (v2 §2.5); this hook composes the query with
 * the store via setters. Returned surface matches the old store-action
 * shape so SearchPage can switch one import line.
 */

import { useCallback } from 'react';
import { searchNodes } from '@/queries/search';
import { useSearchStore } from '@/store/searchStore';

export function useSearch() {
  const query = useSearchStore((s) => s.query);
  const mode = useSearchStore((s) => s.mode);
  const projectId = useSearchStore((s) => s.projectId);
  const results = useSearchStore((s) => s.results);
  const total = useSearchStore((s) => s.total);
  const queryTimeMs = useSearchStore((s) => s.queryTimeMs);
  const loading = useSearchStore((s) => s.loading);
  const error = useSearchStore((s) => s.error);
  const searched = useSearchStore((s) => s.searched);

  const setQuery = useSearchStore((s) => s.setQuery);
  const setMode = useSearchStore((s) => s.setMode);
  const setProjectId = useSearchStore((s) => s.setProjectId);
  const reset = useSearchStore((s) => s.reset);

  const search = useCallback(async () => {
    const state = useSearchStore.getState();
    const q = state.query.trim();
    if (!q) return;

    state.setLoading(true);
    state.setError(null);
    try {
      const result = await searchNodes({
        query: q,
        mode: state.mode,
        project_id: state.projectId,
        limit: 50,
      });
      state.setResults({
        results: result.results,
        total: result.total,
        queryTimeMs: result.query_time_ms,
      });
      state.setLoading(false);
      state.setSearched(true);
    } catch (err) {
      state.setError(err instanceof Error ? err : new Error(String(err)));
      state.setLoading(false);
      state.setSearched(true);
    }
  }, []);

  return {
    query,
    mode,
    projectId,
    results,
    total,
    queryTimeMs,
    loading,
    error,
    searched,
    setQuery,
    setMode,
    setProjectId,
    search,
    reset,
  };
}
