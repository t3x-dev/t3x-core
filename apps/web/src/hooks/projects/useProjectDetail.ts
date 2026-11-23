'use client';

import { useEffect, useState } from 'react';
import { useSessionUserId } from '@/hooks/shared/useSession';
import { getSessionUserId } from '@/infrastructure/session';
import { fetchProject } from '@/queries/project';
import { apiProjectToSummary, type ProjectSummary, useProjectStore } from '@/store/projectStore';

export function useProjectDetail(projectId: string | null) {
  const userId = useSessionUserId();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([userId, projectId, attempt]);
  const [result, setResult] = useState<{
    key: string;
    project?: ProjectSummary;
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
        setResult({ key, project });
      })
      .catch((error: unknown) => {
        if (isCurrent())
          setResult({ key, error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => {
      active = false;
    };
  }, [key, projectId, userId]);

  const current = result?.key === key ? result : undefined;
  return {
    project: current?.project ?? null,
    error: current?.error ?? null,
    loading: Boolean(projectId && !current),
    retry: () => setAttempt((value) => value + 1),
  };
}
