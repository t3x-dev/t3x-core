/**
 * templateStore — pure Zustand state container per
 * docs/frontend-architecture-v2-zh.md §2.5. No I/O.
 *
 * The debounced auto-refetch that used to live in the setters now lives
 * in `hooks/useTemplates`. The store only holds state + setters.
 */

import { create } from 'zustand';
import type { Template } from '@/types/api';

interface TemplateState {
  templates: Template[];
  loading: boolean;
  error: string | null;

  category: string | null;
  leafType: string | null;
  search: string;

  setTemplates: (templates: Template[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  setCategory: (category: string | null) => void;
  setLeafType: (leafType: string | null) => void;
  setSearch: (search: string) => void;

  addTemplate: (template: Template) => void;
  removeTemplate: (id: string) => void;
}

export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  loading: false,
  error: null,
  category: null,
  leafType: null,
  search: '',

  setTemplates: (templates) => set({ templates }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  setCategory: (category) => set({ category }),
  setLeafType: (leafType) => set({ leafType }),
  setSearch: (search) => set({ search }),

  addTemplate: (template) =>
    set((state) => ({ templates: [template, ...state.templates] })),
  removeTemplate: (id) =>
    set((state) => ({ templates: state.templates.filter((t) => t.template_id !== id) })),
}));
