/**
 * projectStore — pure Zustand state container per
 * docs/frontend-architecture-v2-zh.md §2.5. No I/O.
 *
 * Async actions (fetchProjects, addProject, deleteProject,
 * updateProjectModel) live in `hooks/useProjectCrud`.
 *
 * State-only selectors (`projects`, `initialized`, `loading`, `error`,
 * `notifyCallback`, `getProject`) remain on the store — existing consumers
 * reading those values need no change.
 */

import { create } from 'zustand';
import type { Project } from '@/types/api';
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
  outputsCount?: number;
  defaultProvider?: string | null;
  defaultModel?: string | null;
}

type ProjectStore = {
  projects: ProjectSummary[];
  loading: boolean;
  error: Error | null;
  initialized: boolean;
  notifyCallback: NotifyCallback | null;

  setNotifyCallback: (cb: NotifyCallback | null) => void;
  setProjects: (projects: ProjectSummary[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
  setInitialized: (initialized: boolean) => void;
  addToProjects: (project: ProjectSummary) => void;
  removeProject: (id: string) => ProjectSummary | undefined;
  updateProject: (id: string, patch: Partial<ProjectSummary>) => void;

  getProject: (id: string) => ProjectSummary | undefined;
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const deriveStatus = (project: Project): 'draft' | 'active' | 'paused' => {
  if ((project.commits_count || 0) > 0) return 'active';
  if ((project.conversations_count || 0) > 0) return 'draft';
  return 'draft';
};

export const apiProjectToSummary = (project: Project): ProjectSummary => ({
  id: project.project_id,
  name: project.name,
  description: (project.metadata?.description as string) || '',
  updatedAt: formatDate(project.created_at),
  owner: 'You',
  status: deriveStatus(project),
  nodes: project.turns_count || 0,
  drafts: project.conversations_count || 0,
  commitsCount: project.commits_count || 0,
  branchesCount: project.branches_count || 0,
  outputsCount: project.outputs_count ?? 0,
  defaultProvider: project.default_provider ?? null,
  defaultModel: project.default_model ?? null,
});

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
  setInitialized: (initialized) => set({ initialized }),

  addToProjects: (project) => set((state) => ({ projects: [project, ...state.projects] })),

  removeProject: (id) => {
    const existing = get().projects.find((p) => p.id === id);
    set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }));
    return existing;
  },

  updateProject: (id, patch) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  getProject: (id) => get().projects.find((project) => project.id === id),
}));
