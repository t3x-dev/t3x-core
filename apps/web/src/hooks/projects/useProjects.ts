/**
 * useProjects — project list + deletion for the chat sidebar.
 *
 * Thin React wrapper over the L1 `@/infrastructure/projects` adapter so
 * components do not import `@/infrastructure/*` directly.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createProject as createProjectCommand,
  updateProject as updateProjectCommand,
} from '@/commands/projects';
import { formatUserFacingError } from '@/domain/format/errors';
import { DEFAULT_PROJECT_NAME } from '@/domain/project/defaults';
import {
  INTRO_DEMO_PROJECT_DELETED_EVENT,
  type IntroDemoProjectDeletedDetail,
} from '@/hooks/onboarding/introDemoEvents';
import {
  dispatchProjectDeleted,
  PROJECT_DELETED_EVENT,
  type ProjectDeletedDetail,
} from '@/hooks/shared/deleteEvents';
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

export function useProjects(limit = 50, namespaceSlug?: string): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const data = await listProjects(limit, 0, namespaceSlug);
      if (requestId !== requestIdRef.current) return;
      setProjects(data.projects ?? []);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(formatUserFacingError(err, 'Failed to load projects.'));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [limit, namespaceSlug]);

  useEffect(() => {
    setProjects([]);
    void refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    const removeProjectFromList = (projectId: string) => {
      setProjects((prev) => prev.filter((project) => project.project_id !== projectId));
    };
    const handleIntroDemoDeleted = (event: Event) => {
      const detail = (event as CustomEvent<IntroDemoProjectDeletedDetail>).detail;
      if (!detail?.projectId) return;
      removeProjectFromList(detail.projectId);
    };
    const handleProjectDeleted = (event: Event) => {
      const detail = (event as CustomEvent<ProjectDeletedDetail>).detail;
      if (!detail?.projectId) return;
      removeProjectFromList(detail.projectId);
    };

    window.addEventListener(INTRO_DEMO_PROJECT_DELETED_EVENT, handleIntroDemoDeleted);
    window.addEventListener(PROJECT_DELETED_EVENT, handleProjectDeleted);
    return () => {
      window.removeEventListener(INTRO_DEMO_PROJECT_DELETED_EVENT, handleIntroDemoDeleted);
      window.removeEventListener(PROJECT_DELETED_EVENT, handleProjectDeleted);
    };
  }, []);

  const remove = useCallback(async (projectId: string) => {
    await deleteProject(projectId);
    setProjects((prev) => prev.filter((p) => p.project_id !== projectId));
    dispatchProjectDeleted({ projectId });
  }, []);

  const create = useCallback(
    async (rawName?: string): Promise<Project> => {
      const name = (rawName ?? '').trim() || DEFAULT_PROJECT_NAME;
      const project = (await (namespaceSlug
        ? createProjectCommand(name, undefined, namespaceSlug)
        : createProjectCommand(name))) as Project;
      setProjects((prev) => [project, ...prev]);
      return project;
    },
    [namespaceSlug]
  );

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
