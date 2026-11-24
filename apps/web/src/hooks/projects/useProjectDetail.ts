'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSessionUserId } from '@/hooks/shared/useSession';
import { getSessionUserId } from '@/infrastructure/session';
import type { ProjectDetail } from '@/infrastructure/types';
import { fetchProject } from '@/queries/project';
import { apiProjectToSummary, type ProjectSummary, useProjectStore } from '@/store/projectStore';

export function useProjectDetail(projectId: string | null) {
  const userId = useSessionUserId();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([userId, projectId, attempt]);
  const [result, setResult] = useState<{
    key: string;
    project?: ProjectSummary;
    detail?: ProjectDetail;
    error?: Error;
  }>();

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const isCurrent = () => active && getSessionUserId() === userId;
    void fetchProject(projectId)
      .then((detail) => {
        if (!isCurrent()) return;
        const project = apiProjectToSummary(detail);
        useProjectStore.getState().cacheProject(project);
        setResult({ key, project, detail });
      })
      .catch((error: unknown) => {
        if (isCurrent())
          setResult({ key, error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => {
      active = false;
    };
  }, [key, projectId, userId]);

  const updateDetail = useCallback(
    (patch: Partial<ProjectDetail>) => {
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
    project: current?.project ?? null,
    error: current?.error ?? null,
    loading: Boolean(projectId && !current),
    retry: () => setAttempt((value) => value + 1),
  };
}

export const ProjectDetailContext = createContext<{
  projectId: string | null;
  detail: ReturnType<typeof useProjectDetail>;
} | null>(null);

export function useRepositoryProjectDetail(projectId: string | null) {
  const shared = useContext(ProjectDetailContext);
  const detail = shared && shared.projectId === projectId ? shared.detail : undefined;
  const local = useProjectDetail(detail ? null : projectId);
  return detail ?? local;
}
