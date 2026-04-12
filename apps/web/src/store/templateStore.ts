import { create } from 'zustand';
import {
  type CreateTemplateInput,
  createTemplateApi,
  deleteTemplateById,
  fetchTemplates,
} from '@/queries/templates';
import type { Template } from '@/types/api';

interface TemplateState {
  templates: Template[];
  loading: boolean;
  error: string | null;

  // Filters
  category: string | null;
  leafType: string | null;
  search: string;

  // Actions
  fetchTemplates: () => Promise<void>;
  setCategory: (category: string | null) => void;
  setLeafType: (leafType: string | null) => void;
  setSearch: (search: string) => void;
  deleteTemplate: (id: string) => Promise<void>;
  createTemplate: (input: CreateTemplateInput) => Promise<Template>;
}

// Generation counter to discard stale fetch results when filters change rapidly
let fetchGen = 0;
// Debounce timer for search input
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  loading: false,
  error: null,
  category: null,
  leafType: null,
  search: '',

  fetchTemplates: async () => {
    const gen = ++fetchGen;
    const { category, leafType, search } = get();
    set({ loading: true, error: null });
    try {
      const templates = await fetchTemplates({
        category: category ?? undefined,
        leaf_type: leafType ?? undefined,
        search: search || undefined,
      });
      // Discard stale results if a newer fetch was triggered
      if (gen !== fetchGen) return;
      set({ templates, loading: false });
    } catch (err) {
      if (gen !== fetchGen) return;
      set({
        error: err instanceof Error ? err.message : 'Failed to load templates',
        loading: false,
      });
    }
  },

  setCategory: (category) => {
    set({ category });
    get().fetchTemplates();
  },

  setLeafType: (leafType) => {
    set({ leafType });
    get().fetchTemplates();
  },

  setSearch: (search) => {
    set({ search });
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => get().fetchTemplates(), 300);
  },

  deleteTemplate: async (id) => {
    await deleteTemplateById(id);
    set((state) => ({
      templates: state.templates.filter((t) => t.template_id !== id),
    }));
  },

  createTemplate: async (input) => {
    const template = await createTemplateApi(input);
    set((state) => ({
      templates: [template, ...state.templates],
    }));
    return template;
  },
}));
