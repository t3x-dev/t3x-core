'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSessionUserId } from '@/hooks/shared/useSession';
import { ApiError } from '@/infrastructure/core';
import { getSessionUserId } from '@/infrastructure/session';
import type { ProjectDetail } from '@/infrastructure/types';
import { fetchProject } from '@/queries/project';
import { apiProjectToSummary, type ProjectSummary, useProjectStore } from '@/store/projectStore';

export function useProjectDetail(
  projectId: string | null,
  deferStats = false,
  initialProject?: ProjectSummary
) {
  const userId = useSessionUserId();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([userId, projectId, attempt]);
  const [statsRequest, setStatsRequest] = useState<{ key: string; attempt: number }>();
  const statsAttempt = statsRequest?.key === key ? statsRequest.attempt : 0;
  const [fullDetailKey, setFullDetailKey] = useState<string>();
  const initial = attempt === 0 ? initialProject : undefined;
  const includeStats = !deferStats || fullDetailKey === key || statsAttempt > 0;
  const [result, setResult] = useState<{
    key: string;
    project?: ProjectSummary;
    detail?: ProjectDetail;
    error?: Error;
    statsError?: Error;
    hasStats?: boolean;
  }>();
  const saved = useRef<{ key: string; patch: Partial<ProjectDetail> }>(undefined);
  const loadStats = useCallback(() => {
    setStatsRequest((previous) => ({
      key,
      attempt: previous?.key === key ? previous.attempt + 1 : 1,
    }));
  }, [key]);

  useEffect(() => {
    if (!projectId || initial) return;
    if (includeStats) {
      setFullDetailKey(key);
      setResult((current) =>
        current?.key === key && current.statsError ? { ...current, statsError: undefined } : current
      );
    }
    let active = true;
    const isCurrent = () => active && getSessionUserId() === userId;
    const read = includeStats ? fetchProject(projectId) : fetchProject(projectId, false);
    void read
      .then((response) => {
        if (!isCurrent()) return;
        const detail =
          saved.current?.key === key ? { ...response, ...saved.current.patch } : response;
        const project = apiProjectToSummary(detail);
        if (includeStats) useProjectStore.getState().cacheProject(project);
        setResult({ key, project, detail, hasStats: includeStats });
      })
      .catch((cause: unknown) => {
        if (!isCurrent()) return;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        const denied =
          error instanceof ApiError &&
          ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'].includes(error.code);
        setResult((current) =>
          !denied && includeStats && current?.key === key && current.detail
            ? { ...current, statsError: error }
            : { key, error }
        );
      });
    return () => {
      active = false;
    };
  }, [includeStats, initial, key, projectId, statsAttempt, userId]);

  const updateDetail = useCallback(
    (patch: Partial<ProjectDetail>) => {
      saved.current = {
        key,
        patch: { ...(saved.current?.key === key ? saved.current.patch : {}), ...patch },
      };
      setResult((current) =>
        current?.key === key && current.detail
          ? { ...current, detail: { ...current.detail, ...patch } }
          : current
      );
    },
    [key]
  );
  const current = result?.key === key ? result : undefined;
  return {
    detail: current?.detail ?? null,
    updateDetail,
    project: current?.project ?? (!current ? initial : undefined) ?? null,
    error: current?.error ?? null,
    loading: Boolean(projectId && !current && !initial),
    retry: () => setAttempt((value) => value + 1),
    hasStats: current?.hasStats === true,
    statsLoading: Boolean(
      projectId && includeStats && current?.detail && !current.hasStats && !current.statsError
    ),
    statsError: current?.statsError ?? null,
    loadStats,
  };
}

export const ProjectDetailContext = createContext<{
  projectId: string | null;
  detail: ReturnType<typeof useProjectDetail>;
} | null>(null);

export function useRepositoryProjectDetail(
  projectId: string | null,
  deferStats = false,
  initialProject?: ProjectSummary
) {
  const shared = useContext(ProjectDetailContext);
  const detail = shared && shared.projectId === projectId ? shared.detail : undefined;
  const local = useProjectDetail(detail ? null : projectId, deferStats, initialProject);
  return detail ?? local;
}
