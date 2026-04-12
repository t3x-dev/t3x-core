import { create } from 'zustand';
import {
  createProjectApi,
  deleteProjectById,
  fetchProjects,
  updateProjectById,
} from '@/queries/projects';
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
  fetchProjects: () => Promise<void>;
  addProject: (name?: string) => Promise<ProjectSummary>;
  deleteProject: (id: string) => Promise<void>;
  getProject: (id: string) => ProjectSummary | undefined;
  updateProjectModel: (
    projectId: string,
    provider: string | null,
    model: string | null
  ) => Promise<void>;
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

const apiProjectToSummary = (project: Project): ProjectSummary => ({
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

  fetchProjects: async () => {
    // Skip if already loading
    if (get().loading) return;

    set({ loading: true, error: null });
    try {
      const response = await fetchProjects(50, 0);
      const projects = response.projects.map(apiProjectToSummary);
      set({ projects, loading: false, initialized: true });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({
        error,
        loading: false,
        initialized: true,
      });
      get().notifyCallback?.(`Failed to load projects: ${error.message}`, 'error');
    }
  },

  addProject: async (rawName = 'Untitled Project') => {
    const name = rawName.trim() || 'Untitled Project';
    const notify = get().notifyCallback;

    try {
      // Create project via API
      const project = await createProjectApi(name, {
        description: 'Fresh project awaiting conversations.',
      });

      const projectSummary = apiProjectToSummary(project);

      set((state) => ({
        projects: [projectSummary, ...state.projects],
      }));

      notify?.(`Created project "${name}"`, 'success');
      return projectSummary;
    } catch (err) {
      // Only create a local offline project for network errors (TypeError from fetch).
      // HTTP 4xx/5xx errors propagate so the UI can display them properly.
      if (!(err instanceof TypeError)) {
        throw err;
      }

      notify?.(`API unavailable - created offline project "${name}"`, 'warning');

      const projectSummary: ProjectSummary = {
        id: `local-${Date.now()}`,
        name: `${name} (offline)`,
        description: 'Created offline - will sync when API is available.',
        updatedAt: 'just now',
        owner: 'You',
        status: 'draft',
        nodes: 0,
        drafts: 0,
        commitsCount: 0,
        branchesCount: 0,
      };

      set((state) => ({
        projects: [projectSummary, ...state.projects],
      }));

      return projectSummary;
    }
  },

  deleteProject: async (id) => {
    const notify = get().notifyCallback;
    const project = get().projects.find((p) => p.id === id);

    // Optimistically remove from UI
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    }));

    // Skip API call for local-only projects
    if (id.startsWith('local-')) {
      notify?.(`Deleted offline project`, 'success');
      return;
    }

    try {
      await deleteProjectById(id);
      notify?.(`Deleted "${project?.name || id}"`, 'success');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // If 404, the project was already deleted on the server — don't restore
      if (error.message.includes('404') || error.message.includes('not found')) {
        notify?.(`Project was already deleted from server`, 'warning');
      } else {
        // Restore project on non-404 failure
        if (project) {
          set((state) => ({
            projects: [project, ...state.projects],
          }));
        }
        notify?.(`Failed to delete: ${error.message}`, 'error');
      }
    }
  },

  getProject: (id) => get().projects.find((project) => project.id === id),

  updateProjectModel: async (projectId, provider, model) => {
    const notify = get().notifyCallback;
    try {
      await updateProjectById(projectId, {
        default_provider: provider,
        default_model: model,
      });
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, defaultProvider: provider, defaultModel: model } : p
        ),
      }));
      notify?.('Model settings saved', 'success');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      notify?.(`Failed to save model settings: ${error.message}`, 'error');
      throw error;
    }
  },
}));
