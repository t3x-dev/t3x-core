'use client';

import type { WorkspaceTransitionReviewSnapshotEnvelope } from '@t3x-dev/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';

/** Decision status is independent of Draft revision: Reject does not edit the Draft. */
export function useSchemaReviewStatus(projectId: string, workspaceId: string, revision?: number) {
  const key = `${projectId}:${workspaceId}:${revision}`;
  const request = useRef(0);
  const [result, setResult] = useState<{
    key: string;
    latest: WorkspaceTransitionReviewSnapshotEnvelope | null;
    error?: string;
  }>();
  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    const token = ++request.current;
    try {
      const latest = await getSharedApiClient().workspaces.getLatestReviewSnapshot(
        projectId,
        workspaceId
      );
      if (token === request.current) setResult({ key, latest });
    } catch (error) {
      if (token !== request.current) return;
      setResult({
        key,
        latest: null,
        ...((error as { code?: string })?.code === 'NOT_FOUND'
          ? {}
          : { error: error instanceof Error ? error.message : 'Could not load Review status.' }),
      });
    }
  }, [key, projectId, workspaceId]);
  useEffect(() => {
    void refresh();
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => {
      ++request.current;
      window.removeEventListener('focus', focus);
    };
  }, [refresh]);
  const current = result?.key === key ? result : undefined;
  return {
    latest: current?.latest,
    loading: Boolean(workspaceId) && !current,
    error: current?.error,
    refresh,
  };
}
