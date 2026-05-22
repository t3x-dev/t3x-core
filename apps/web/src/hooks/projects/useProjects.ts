/**
 * useProjects — project list + deletion for the chat sidebar.
 *
 * Thin React wrapper over the L1 `@/infrastructure/projects` adapter so
 * components do not import `@/infrastructure/*` directly.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  createProject as createProjectCommand,
  updateProject as updateProjectCommand,
} from '@/commands/projects';
import { DEFAULT_PROJECT_NAME } from '@/domain/project/defaults';
import { deleteProject, listProjects } from '@/infrastructure/projects';
import type { Project } from '@/infrastructure/types';

export interface UseProjectsResult {
  projects: Project[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  remove: (projectId: string) => Promise<void>;
  create: (name?: string) => Promise<Project>;
  rename: (projectId: string, name: string) => Promise<Project>;
}

export function useProjects(limit = 50): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProjects(limit, 0);
      setProjects(data.projects ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
    const name = (rawName ?? '').trim() || DEFAULT_PROJECT_NAME;
    const project = (await createProjectCommand(name)) as Project;
    setProjects((prev) => [project, ...prev]);
    return project;
  }, []);

  const rename = useCallback(async (projectId: string, rawName: string): Promise<Project> => {
    const name = rawName.trim();
    const project = (await updateProjectCommand(projectId, { name })) as Project;
    setProjects((prev) =>
      prev.map((item) =>
        item.project_id === projectId ? { ...item, ...project, name: project.name ?? name } : item
      )
    );
    return project;
  }, []);

  return { projects, loading, error, refresh, remove, create, rename };
}
