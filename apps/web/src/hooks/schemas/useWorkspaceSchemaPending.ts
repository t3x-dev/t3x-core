'use client';

import type { WorkspaceSchemaPendingView } from '@t3x-dev/api-client';
import { useEffect, useState } from 'react';
import { useSessionUserId } from '@/hooks/shared/useSession';
import { readWorkspaceSchemaPending } from '@/infrastructure/schemaStudio';

const pendingReads = new Map<string, Promise<WorkspaceSchemaPendingView>>();

export function useWorkspaceSchemaPending(
  projectId: string,
  workspaceId: string,
  revision?: number,
  confirmedEmpty = false,
  initial?: WorkspaceSchemaPendingView
) {
  const userId = useSessionUserId();
  const key = JSON.stringify([userId, projectId, workspaceId, revision]);
  const [retry, setRetry] = useState(0);
  const seeded = retry === 0 ? initial : undefined;
  const [result, setResult] = useState<{
    key: string;
    data?: WorkspaceSchemaPendingView;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    setResult(undefined);
    if (projectId && workspaceId && !confirmedEmpty && !seeded) {
      const read = pendingReads.get(key) ?? readWorkspaceSchemaPending(projectId, workspaceId);
      if (!pendingReads.has(key)) {
        pendingReads.set(key, read);
        const clear = () => pendingReads.delete(key);
        void read.then(clear, clear);
      }
      void read.then(
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
    }
    return () => {
      active = false;
    };
  }, [key, projectId, workspaceId, retry, confirmedEmpty, seeded]);
  useEffect(() => {
    if (confirmedEmpty) return;
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [confirmedEmpty]);
  const current = !confirmedEmpty && result?.key === key ? result : undefined;
  return {
    data: current?.data ?? seeded,
    error: current?.error,
    loading: Boolean(projectId && workspaceId) && !confirmedEmpty && !current && !seeded,
    refresh: () => setRetry((value) => value + 1),
  };
}
