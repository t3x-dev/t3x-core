/**
 * useProjectOperations — view-facing API for the projectStore I/O.
 *
 * Owns fetchProjects (list load) and updateProjectModel (per-project
 * provider/model patch) previously embedded in projectStore actions.
 * Store is now passive (v2 §2.5). Notification side effects remain
 * routed through the store's notifyCallback.
 */

import { useCallback } from 'react';
import { updateProject } from '@/commands/projects';
import { fetchProjects as listProjectsQuery } from '@/queries/projects';
import { type ProjectSummary, useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/api';

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

export function useProjectOperations() {
  const fetchProjects = useCallback(async (): Promise<void> => {
    const store = useProjectStore.getState();
    if (store.loading) return; // already in flight

    store.setLoading(true);
    store.setError(null);
    try {
      const response = await listProjectsQuery(50, 0);
      const projects = response.projects.map(apiProjectToSummary);
      store.setProjects(projects);
      store.setLoading(false);
      store.setInitialized(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      store.setError(error);
      store.setLoading(false);
      store.setInitialized(true);
      store.notifyCallback?.(`Failed to load projects: ${error.message}`, 'error');
    }
  }, []);

  const updateProjectModel = useCallback(
    async (projectId: string, provider: string | null, model: string | null): Promise<void> => {
      const store = useProjectStore.getState();
      try {
        await updateProject(projectId, {
          default_provider: provider,
          default_model: model,
        });
        store.patchProject(projectId, {
          defaultProvider: provider,
          defaultModel: model,
        });
        store.notifyCallback?.('Model settings saved', 'success');
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        store.notifyCallback?.(`Failed to save model settings: ${error.message}`, 'error');
        throw error;
      }
    },
    []
  );

  return { fetchProjects, updateProjectModel };
}
