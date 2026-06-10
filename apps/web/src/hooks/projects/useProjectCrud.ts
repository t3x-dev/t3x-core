/**
 * useProjectCrud — async actions for the project list.
 *
 * Owns the I/O that used to live inside `projectStore` async actions
 * (fetchProjects, addProject, deleteProject, updateProjectModel) per
 * v2 §2.5. Store now holds state + setters only.
 *
 * Consumers reading project state/selectors continue to use
 * `useProjectStore` directly — this hook is only for mutations.
 */

import { useCallback } from 'react';
import {
  createProject,
  deleteProject,
  ProjectPersistenceError,
  updateProject as updateProjectCommand,
} from '@/commands/projects';
import { DEFAULT_PROJECT_NAME } from '@/domain/project/defaults';
import { dispatchProjectDeleted } from '@/hooks/shared/deleteEvents';
import { fetchProjects } from '@/queries/projects';
import { apiProjectToSummary, type ProjectSummary, useProjectStore } from '@/store/projectStore';

export function useProjectCrud() {
  const list = useCallback(async (): Promise<void> => {
    const store = useProjectStore.getState();
    if (store.loading) return;
    store.setLoading(true);
    store.setError(null);
    try {
      const response = await fetchProjects(50, 0);
      store.setProjects(response.projects.map(apiProjectToSummary));
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

  const add = useCallback(async (rawName = DEFAULT_PROJECT_NAME): Promise<ProjectSummary> => {
    const store = useProjectStore.getState();
    const name = rawName.trim() || DEFAULT_PROJECT_NAME;
    const notify = store.notifyCallback;

    try {
      const project = await createProject(name, {
        description: 'Fresh project awaiting conversations.',
      });
      const summary = apiProjectToSummary(project);
      store.addToProjects(summary);
      notify?.(`Created project "${name}"`, 'success');
      return summary;
    } catch (err) {
      // Only create a local offline project for network errors. The command
      // wraps everything in ProjectPersistenceError; the underlying TypeError
      // (fetch network failure) is preserved on `.cause`.
      const isNetworkError =
        err instanceof ProjectPersistenceError && err.cause instanceof TypeError;
      if (!isNetworkError) {
        throw err;
      }

      notify?.(`API unavailable - created offline project "${name}"`, 'warning');
      const summary: ProjectSummary = {
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
      store.addToProjects(summary);
      return summary;
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    const store = useProjectStore.getState();
    const notify = store.notifyCallback;

    // Optimistically remove from UI and capture the previous entry for rollback.
    const removed = store.removeProject(id);

    // Skip API call for local-only projects.
    if (id.startsWith('local-')) {
      notify?.('Deleted offline project', 'success');
      return;
    }

    try {
      await deleteProject(id);
      dispatchProjectDeleted({ projectId: id });
      notify?.(`Deleted "${removed?.name || id}"`, 'success');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // If 404, the project was already deleted on the server — don't restore.
      if (error.message.includes('404') || error.message.includes('not found')) {
        notify?.('Project was already deleted from server', 'warning');
        return;
      }
      if (removed) {
        store.addToProjects(removed);
      }
      notify?.(`Failed to delete: ${error.message}`, 'error');
    }
  }, []);

  const setModel = useCallback(
    async (projectId: string, provider: string | null, model: string | null): Promise<void> => {
      const store = useProjectStore.getState();
      const notify = store.notifyCallback;
      try {
        await updateProjectCommand(projectId, {
          default_provider: provider,
          default_model: model,
        });
        store.updateProject(projectId, {
          defaultProvider: provider,
          defaultModel: model,
        });
        notify?.('Model settings saved', 'success');
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        notify?.(`Failed to save model settings: ${error.message}`, 'error');
        throw error;
      }
    },
    []
  );

  return { list, add, remove, setModel };
}
