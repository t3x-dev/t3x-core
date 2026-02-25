import { create } from 'zustand';
import type { Template } from '@/lib/api';
import * as api from '@/lib/api';

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
  createTemplate: (input: api.CreateTemplateInput) => Promise<Template>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  loading: false,
  error: null,
  category: null,
  leafType: null,
  search: '',

  fetchTemplates: async () => {
    const { category, leafType, search } = get();
    set({ loading: true, error: null });
    try {
      const templates = await api.listTemplates({
        category: category ?? undefined,
        leaf_type: leafType ?? undefined,
        search: search || undefined,
      });
      set({ templates, loading: false });
    } catch (err) {
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
    get().fetchTemplates();
  },

  deleteTemplate: async (id) => {
    await api.deleteTemplate(id);
    set((state) => ({
      templates: state.templates.filter((t) => t.template_id !== id),
    }));
  },

  createTemplate: async (input) => {
    const template = await api.createTemplate(input);
    set((state) => ({
      templates: [template, ...state.templates],
    }));
    return template;
  },
}));
