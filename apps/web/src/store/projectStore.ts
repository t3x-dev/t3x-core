/**
 * projectStore — project list cache (passive).
 *
 * v2 §2.5 — state + setters only. I/O lives in hooks/useProjectOperations.
 * Pure selectors (getProject) stay here.
 */

import { create } from 'zustand';
import type { NotifyCallback } from './shared';

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  owner: string;
  status: 'draft' | 'active' | 'paused';
  nodes: number;
  drafts: number;
  commitsCount: number;
  branchesCount: number;
  defaultProvider?: string | null;
  defaultModel?: string | null;
}

type ProjectStore = {
  projects: ProjectSummary[];
  loading: boolean;
  error: Error | null;
  initialized: boolean;
  notifyCallback: NotifyCallback | null;

  // Setters (no I/O)
  setNotifyCallback: (cb: NotifyCallback | null) => void;
  setProjects: (projects: ProjectSummary[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
  setInitialized: (flag: boolean) => void;
  patchProject: (id: string, patch: Partial<ProjectSummary>) => void;

  // Pure selector
  getProject: (id: string) => ProjectSummary | undefined;
};

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  loading: false,
  error: null,
  initialized: false,
  notifyCallback: null,

  setNotifyCallback: (cb) => set({ notifyCallback: cb }),
  setProjects: (projects) => set({ projects }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setInitialized: (flag) => set({ initialized: flag }),
  patchProject: (id, patch) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  getProject: (id) => get().projects.find((project) => project.id === id),
}));
