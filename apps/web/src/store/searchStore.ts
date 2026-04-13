/**
 * searchStore — pure Zustand state container per
 * docs/frontend-architecture-v2-zh.md §2.5 ("store 只允许 state + setter").
 *
 * No I/O, no queries, no commands. The actual search call lives in
 * `hooks/useSearch` which composes this store + `queries/search`.
 */

import { create } from 'zustand';
import type { SearchHit, SearchMode } from '@/queries/search';

interface SearchState {
  query: string;
  mode: SearchMode;
  projectId: string | undefined;
  results: SearchHit[];
  total: number;
  queryTimeMs: number;
  loading: boolean;
  error: Error | null;
  searched: boolean;

  setQuery: (query: string) => void;
  setMode: (mode: SearchMode) => void;
  setProjectId: (projectId: string | undefined) => void;
  setResults: (input: { results: SearchHit[]; total: number; queryTimeMs: number }) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
  setSearched: (searched: boolean) => void;
  reset: () => void;
}

const initial = {
  query: '',
  mode: 'hybrid' as SearchMode,
  projectId: undefined,
  results: [] as SearchHit[],
  total: 0,
  queryTimeMs: 0,
  loading: false,
  error: null as Error | null,
  searched: false,
};

export const useSearchStore = create<SearchState>((set) => ({
  ...initial,

  setQuery: (query) => set({ query }),
  setMode: (mode) => set({ mode }),
  setProjectId: (projectId) => set({ projectId }),
  setResults: ({ results, total, queryTimeMs }) => set({ results, total, queryTimeMs }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSearched: (searched) => set({ searched }),

  reset: () =>
    set({
      query: '',
      results: [],
      total: 0,
      queryTimeMs: 0,
      loading: false,
      error: null,
      searched: false,
    }),
}));
