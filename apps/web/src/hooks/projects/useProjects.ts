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
  PROJECT_RESTORED_EVENT,
  type ProjectDeletedDetail,
} from '@/hooks/shared/deleteEvents';
import { ApiError } from '@/infrastructure/core';
import {
  cancelRepositoryDirectoryPrefetch,
  cancelRepositoryDirectoryRead,
  deleteProject,
  listProjectPage,
  listProjects,
  loadRepositoryDirectoryPage,
  readCachedRepositoryDirectoryPage,
} from '@/infrastructure/projects';
import { getSessionUserId } from '@/infrastructure/session';
import type { Project } from '@/infrastructure/types';

export interface UseProjectsResult {
  projects: Project[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hasMore: boolean;
  loadMore: () => Promise<boolean>;
  remove: (projectId: string) => Promise<void>;
  create: (name?: string) => Promise<Project>;
  rename: (projectId: string, name: string) => Promise<Project>;
}

export function useProjects(
  limit = 50,
  namespaceSlug?: string,
  mode: boolean | 'on-demand' = false,
  {
    search,
    tagSearch,
    editableOnly = false,
    visibility,
    tags,
    enabled = true,
    directoryUserId,
  }: {
    search?: string;
    tagSearch?: string;
    editableOnly?: boolean;
    visibility?: Project['visibility'];
    tags?: string[];
    enabled?: boolean;
    directoryUserId?: string;
  } = {}
): UseProjectsResult {
  const [initialPage] = useState(() =>
    directoryUserId ? readCachedRepositoryDirectoryPage(directoryUserId) : undefined
  );
  const [projects, setProjects] = useState<Project[]>(initialPage?.items ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage?.next_cursor ?? null);
  const requestIdRef = useRef(0);
  const activePage = useRef<AbortController | undefined>(undefined);
  const nextPageRequest = useRef<number | null>(null);
  const q = search?.trim() || undefined;
  const tag_query = tagSearch?.trim() || undefined;
  const fetchPage = useCallback(
    (cursor: string, signal: AbortSignal) =>
      listProjectPage(
        limit,
        cursor,
        namespaceSlug,
        q || tag_query || editableOnly || visibility || tags?.length
          ? { q, tag_query, editable: editableOnly || undefined, visibility, tags }
          : undefined,
        signal
      ),
    [limit, namespaceSlug, q, tag_query, editableOnly, visibility, tags]
  );

  const refreshFirstPage = useCallback(
    async (force: boolean) => {
      if (!enabled) return;
      const requestId = ++requestIdRef.current;
      activePage.current?.abort();
      const controller = new AbortController();
      activePage.current = controller;
      setLoading(true);
      try {
        if (mode === 'on-demand') {
          const data = directoryUserId
            ? await loadRepositoryDirectoryPage(directoryUserId, force)
            : await fetchPage('', controller.signal);
          if (
            requestId !== requestIdRef.current ||
            (directoryUserId && getSessionUserId() !== directoryUserId)
          )
            return;
          setProjects(data.items);
          setNextCursor(data.next_cursor);
          setError(null);
          return;
        }
        const collected = new Map<string, Project>();
        let offset = 0;
        for (;;) {
          const data = await listProjects(limit, offset, namespaceSlug);
          if (requestId !== requestIdRef.current) return;
          const rows = data.projects ?? [];
          const previousSize = collected.size;
          for (const project of rows) collected.set(project.project_id, project);
          if (!mode || rows.length < limit) break;
          if (collected.size === previousSize)
            throw new Error('Repository pagination did not advance. Please refresh.');
          offset += rows.length;
        }
        setProjects([...collected.values()]);
        setError(null);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        if (
          err instanceof ApiError &&
          ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'SESSION_NOT_CURRENT'].includes(err.code)
        ) {
          setProjects([]);
          setNextCursor(null);
        }
        setError(formatUserFacingError(err, 'Failed to load projects.'));
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [limit, namespaceSlug, mode, enabled, fetchPage, directoryUserId]
  );
  const refresh = useCallback(() => refreshFirstPage(true), [refreshFirstPage]);

  const loadMore = useCallback(async () => {
    const requestId = requestIdRef.current;
    if (!enabled || !nextCursor || loading || nextPageRequest.current === requestId) return false;
    nextPageRequest.current = requestId;
    const controller = new AbortController();
    activePage.current = controller;
    setLoading(true);
    try {
      const data = await fetchPage(nextCursor, controller.signal);
      if (requestId !== requestIdRef.current) return false;
      if (data.next_cursor === nextCursor)
        throw new Error('Repository pagination did not advance. Please refresh.');
      setProjects((previous) => {
        const collected = new Map(previous.map((project) => [project.project_id, project]));
        for (const project of data.items) collected.set(project.project_id, project);
        return [...collected.values()];
      });
      setNextCursor(data.next_cursor);
      setError(null);
      return data.items.length > 0;
    } catch (err) {
      if (requestId === requestIdRef.current) {
        if (
          err instanceof ApiError &&
          ['UNAUTHORIZED', 'FORBIDDEN', 'SESSION_NOT_CURRENT'].includes(err.code)
        ) {
          setProjects([]);
          setNextCursor(null);
        }
        setError(formatUserFacingError(err, 'Failed to load more projects.'));
      }
      return false;
    } finally {
      if (requestId === requestIdRef.current) {
        nextPageRequest.current = null;
        setLoading(false);
      }
    }
  }, [enabled, fetchPage, nextCursor, loading]);

  useEffect(() => {
    if (!directoryUserId) {
      setProjects([]);
      setNextCursor(null);
    }
    setError(null);
    setLoading(enabled);
    if (enabled && (q || tag_query || visibility || tags?.length)) {
      cancelRepositoryDirectoryPrefetch();
    }
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    if (q || tag_query) searchTimer = setTimeout(() => void refreshFirstPage(false), 250);
    else void refreshFirstPage(false);
    return () => {
      clearTimeout(searchTimer);
      requestIdRef.current += 1;
      activePage.current?.abort();
      if (directoryUserId) cancelRepositoryDirectoryRead(directoryUserId);
    };
  }, [enabled, q, tag_query, refreshFirstPage, directoryUserId, visibility, tags]);

  useEffect(() => {
    const restored = () => {
      void refresh();
    };
    window.addEventListener(PROJECT_RESTORED_EVENT, restored);
    return () => window.removeEventListener(PROJECT_RESTORED_EVENT, restored);
  }, [refresh]);

  useEffect(() => {
    const removeProjectFromList = (projectId: string) => {
      setProjects((prev) => prev.filter((project) => project.project_id !== projectId));
      if (mode === 'on-demand' && nextPageRequest.current === requestIdRef.current) {
        void refresh();
      }
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
  }, [mode, refresh]);

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

  return {
    projects,
    loading,
    error,
    refresh,
    hasMore: nextCursor !== null,
    loadMore,
    remove,
    create,
    rename,
  };
}
