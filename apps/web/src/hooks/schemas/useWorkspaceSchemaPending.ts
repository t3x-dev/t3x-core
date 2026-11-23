'use client';

import type { WorkspaceSchemaPendingView } from '@t3x-dev/api-client';
import { useEffect, useState } from 'react';
import { readWorkspaceSchemaPending } from '@/infrastructure/schemaStudio';

export function useWorkspaceSchemaPending(
  projectId: string,
  workspaceId: string,
  revision?: number,
  confirmedEmpty = false
) {
  const key = JSON.stringify([projectId, workspaceId, revision]);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: WorkspaceSchemaPendingView;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    setResult(undefined);
    if (projectId && workspaceId && !confirmedEmpty)
      void readWorkspaceSchemaPending(projectId, workspaceId).then(
        (data) => {
          if (active) setResult({ key, data });
        },
        (error: unknown) => {
          if (active)
            setResult({
              key,
              error:
                error instanceof Error ? error.message : 'Schema preparation task unavailable.',
            });
        }
      );
    return () => {
      active = false;
    };
  }, [key, projectId, workspaceId, retry, confirmedEmpty]);
  useEffect(() => {
    if (confirmedEmpty) return;
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [confirmedEmpty]);
  const current = result?.key === key ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: Boolean(projectId && workspaceId) && !confirmedEmpty && !current,
    refresh: () => setRetry((value) => value + 1),
  };
}
