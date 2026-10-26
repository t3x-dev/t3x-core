import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteProject, restoreProject } from '@/commands/projects';
import { formatUserFacingError } from '@/domain/format/errors';
import { dispatchProjectDeleted, dispatchProjectRestored } from '@/hooks/shared/deleteEvents';
import { ApiError } from '@/queries/apiErrors';
import { fetchDeletedProjects } from '@/queries/projects';
import { useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/api';

const PAGE_SIZE = 20;

export function repositoryMutationError(cause: unknown): {
  message: string;
  refreshRequired: boolean;
} {
  let error = cause;
  const seen = new Set<object>();
  while (error && typeof error === 'object' && !seen.has(error)) {
    seen.add(error);
    if (error instanceof ApiError) {
      if (['NOT_FOUND', 'PROJECT_NOT_FOUND', 'REPOSITORY_STATE_CHANGED'].includes(error.code)) {
        return {
          message:
            'This repository is no longer in the expected state or is no longer accessible. Refresh the list before continuing.',
          refreshRequired: true,
        };
      }
      if (
        ![
          'TIMEOUT',
          'ABORTED',
          'PARSE_ERROR',
          'UNKNOWN_ERROR',
          'DELETE_FAILED',
          'RESTORE_FAILED',
          'INTERNAL_ERROR',
        ].includes(error.code)
      ) {
        return { message: formatUserFacingError(error), refreshRequired: false };
      }
      break;
    }
    error = (error as { cause?: unknown }).cause;
  }
  return {
    message:
      'The operation could not be confirmed. It may have completed. Refresh the list before trying again.',
    refreshRequired: true,
  };
}

/** Keep deleted rows separate from the active repository cache. */
export function useDeletedProjects(namespace: string) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const request = useRef(0);
  const mutating = useRef(false);

  const load = useCallback(
    async (nextOffset: number) => {
      const id = ++request.current;
      setLoading(true);
      setError(null);
      try {
        // Read one extra row to avoid an empty trailing page.
        let data = await fetchDeletedProjects(PAGE_SIZE + 1, nextOffset, namespace);
        if (id !== request.current) return;
        if (!data.projects.length && nextOffset > 0) {
          nextOffset = Math.max(0, nextOffset - PAGE_SIZE);
          data = await fetchDeletedProjects(PAGE_SIZE + 1, nextOffset, namespace);
          if (id !== request.current) return;
        }
        setProjects(data.projects.slice(0, PAGE_SIZE));
        setHasNext(data.projects.length > PAGE_SIZE);
        setOffset(nextOffset);
      } catch (cause) {
        if (id === request.current) {
          setError(formatUserFacingError(cause, 'Could not load deleted repositories.'));
        }
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [namespace]
  );

  useEffect(() => {
    setProjects([]);
    setOffset(0);
    void load(0);
    return () => {
      request.current += 1;
    };
  }, [load]);

  const mutate = async (project: Project, action: 'restore' | 'delete') => {
    if (mutating.current) return null;
    if (action === 'restore' ? !project.can_restore : !project.can_permanently_delete) return null;
    mutating.current = true;
    setPending(true);
    try {
      const restored = action === 'restore' ? await restoreProject(project.project_id) : null;
      if (action === 'delete')
        await deleteProject(project.project_id, { permanent: true, onlyIfDeleted: true });
      const store = useProjectStore.getState();
      store.removeProject(project.project_id);
      store.setInitialized(false);
      if (restored) dispatchProjectRestored({ projectId: restored.project_id });
      else dispatchProjectDeleted({ projectId: project.project_id });
      setProjects((rows) => rows.filter((row) => row.project_id !== project.project_id));
      void load(offset);
      return { restored };
    } finally {
      mutating.current = false;
      setPending(false);
    }
  };

  return {
    projects,
    loading,
    error,
    pending,
    hasNext,
    page: offset / PAGE_SIZE + 1,
    refresh: () => load(offset),
    previous: () => load(Math.max(0, offset - PAGE_SIZE)),
    next: () => load(offset + PAGE_SIZE),
    mutate,
  };
}
