/**
 * useProjects — project list + deletion for the chat sidebar.
 *
 * Thin React wrapper over the L1 `@/infrastructure/projects` adapter so
 * components do not import `@/infrastructure/*` directly.
 */

import { useCallback, useEffect, useState } from 'react';
import { createProject as createProjectCommand } from '@/commands/projects';
import { deleteProject, listProjects } from '@/infrastructure/projects';
import type { Project } from '@/infrastructure/types';

export interface UseProjectsResult {
  projects: Project[];
  loading: boolean;
  refresh: () => Promise<void>;
  remove: (projectId: string) => Promise<void>;
  create: (name?: string) => Promise<Project>;
}

export function useProjects(limit = 50): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProjects(limit, 0);
      setProjects(data.projects ?? []);
    } catch {
      // Project list is sidebar chrome on chat routes. Keep the page usable when
      // the background fetch fails instead of surfacing an unhandled rejection.
      setProjects((previous) => previous);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(async (projectId: string) => {
    await deleteProject(projectId);
    setProjects((prev) => prev.filter((p) => p.project_id !== projectId));
  }, []);

  const create = useCallback(async (rawName?: string): Promise<Project> => {
    const name = (rawName ?? '').trim() || 'Untitled Project';
    const project = (await createProjectCommand(name)) as Project;
    setProjects((prev) => [project, ...prev]);
    return project;
  }, []);

  return { projects, loading, refresh, remove, create };
}
