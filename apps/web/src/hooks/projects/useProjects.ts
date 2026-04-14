/**
 * useProjects — project list + deletion for the chat sidebar.
 *
 * Thin React wrapper over the L1 `@/infrastructure/projects` adapter so
 * components do not import `@/infrastructure/*` directly.
 */

import { useCallback, useEffect, useState } from 'react';
import { deleteProject, listProjects } from '@/infrastructure/projects';
import type { Project } from '@/infrastructure/types';

export interface UseProjectsResult {
  projects: Project[];
  loading: boolean;
  refresh: () => Promise<void>;
  remove: (projectId: string) => Promise<void>;
}

export function useProjects(limit = 50): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProjects(limit, 0);
      setProjects(data.projects ?? []);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (projectId: string) => {
      await deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.project_id !== projectId));
    },
    []
  );

  return { projects, loading, refresh, remove };
}
