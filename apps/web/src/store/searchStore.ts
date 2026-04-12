import { create } from 'zustand';
import type { SearchHit, SearchMode } from '@/queries/search';
import { searchNodes } from '@/queries/search';

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
  search: () => Promise<void>;
  reset: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  mode: 'hybrid',
  projectId: undefined,
  results: [],
  total: 0,
  queryTimeMs: 0,
  loading: false,
  error: null,
  searched: false,

  setQuery: (query) => set({ query }),
  setMode: (mode) => set({ mode }),
  setProjectId: (projectId) => set({ projectId }),

  search: async () => {
    const { query, mode, projectId } = get();
    if (!query.trim()) return;

    set({ loading: true, error: null });
    try {
      const result = await searchNodes({
        query: query.trim(),
        mode,
        project_id: projectId,
        limit: 50,
      });
      set({
        results: result.results,
        total: result.total,
        queryTimeMs: result.query_time_ms,
        loading: false,
        searched: true,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err : new Error(String(err)),
        loading: false,
        searched: true,
      });
    }
  },

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
