/**
 * useTemplates — view-facing API for the templates domain.
 *
 * Owns the I/O that used to live inside templateStore actions. Filter
 * changes (category, leafType, search) trigger debounced auto-refetch
 * — the behaviour is preserved from the old store, just relocated to
 * the hook layer per v2 §2.5.
 */

import { useCallback, useRef } from 'react';
import {
  type CreateTemplateInput,
  createTemplate as createTemplateCommand,
  deleteTemplate as deleteTemplateCommand,
} from '@/commands/templates';
import { fetchTemplates } from '@/queries/templates';
import { useTemplateStore } from '@/store/templateStore';
import type { Template, TemplateLeafType } from '@/types/api';

// Module-scoped generation counter — survives component re-renders so
// stale fetches are discarded even when the hook is remounted.
let fetchGen = 0;

export function useTemplates() {
  const templates = useTemplateStore((s) => s.templates);
  const loading = useTemplateStore((s) => s.loading);
  const error = useTemplateStore((s) => s.error);
  const category = useTemplateStore((s) => s.category);
  const leafType = useTemplateStore((s) => s.leafType);
  const search = useTemplateStore((s) => s.search);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runFetch = useCallback(async () => {
    const gen = ++fetchGen;
    const store = useTemplateStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const data = await fetchTemplates({
        category: store.category ?? undefined,
        leaf_type: store.leafType ?? undefined,
        search: store.search || undefined,
      });
      if (gen !== fetchGen) return;
      store.setTemplates(data);
      store.setLoading(false);
    } catch (err) {
      if (gen !== fetchGen) return;
      store.setError(err instanceof Error ? err.message : 'Failed to load templates');
      store.setLoading(false);
    }
  }, []);

  const setCategory = useCallback(
    (next: string | null) => {
      useTemplateStore.getState().setCategory(next);
      void runFetch();
    },
    [runFetch]
  );

  const setLeafType = useCallback(
    (next: TemplateLeafType | null) => {
      useTemplateStore.getState().setLeafType(next);
      void runFetch();
    },
    [runFetch]
  );

  const setSearch = useCallback(
    (next: string) => {
      useTemplateStore.getState().setSearch(next);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => void runFetch(), 300);
    },
    [runFetch]
  );

  const deleteTemplate = useCallback(async (id: string) => {
    await deleteTemplateCommand(id);
    useTemplateStore.getState().removeTemplate(id);
  }, []);

  const createTemplate = useCallback(async (input: CreateTemplateInput): Promise<Template> => {
    const template = await createTemplateCommand(input);
    useTemplateStore.getState().addTemplate(template);
    return template;
  }, []);

  return {
    templates,
    loading,
    error,
    category,
    leafType,
    search,
    fetchTemplates: runFetch,
    setCategory,
    setLeafType,
    setSearch,
    deleteTemplate,
    createTemplate,
  };
}
