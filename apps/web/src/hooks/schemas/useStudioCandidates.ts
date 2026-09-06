'use client';
import type { AddStudioCandidate, StudioCandidate } from '@t3x-dev/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addStudioCandidate,
  listStudioCandidates,
  removeStudioCandidate,
} from '@/infrastructure/schemaStudio';
export function useStudioCandidates(projectId: string) {
  const [result, setResult] = useState<{
    projectId: string;
    items: StudioCandidate[];
    error?: string;
  }>();
  const [pending, setPending] = useState(false);
  const epoch = useRef(0);
  const refresh = useCallback(async () => {
    const current = epoch.current;
    try {
      const items = await listStudioCandidates(projectId);
      if (epoch.current === current) setResult({ projectId, items });
    } catch (error) {
      if (epoch.current === current)
        setResult({
          projectId,
          items: [],
          error: error instanceof Error ? error.message : 'Studio unavailable',
        });
    }
  }, [projectId]);
  useEffect(() => {
    ++epoch.current;
    setResult(undefined);
    setPending(false);
    void refresh();
    return () => {
      ++epoch.current;
    };
  }, [refresh]);
  async function mutate<T>(action: () => Promise<T>) {
    const current = epoch.current;
    setPending(true);
    try {
      const value = await action();
      if (epoch.current !== current) return undefined;
      await refresh();
      return epoch.current === current ? value : undefined;
    } finally {
      if (epoch.current === current) setPending(false);
    }
  }
  const data = result?.projectId === projectId ? result : undefined;
  return {
    items: data?.items ?? [],
    error: data?.error,
    loading: !data,
    pending,
    refresh,
    add: (source: AddStudioCandidate) => mutate(() => addStudioCandidate(projectId, source)),
    remove: (id: string) => mutate(() => removeStudioCandidate(projectId, id)),
  };
}
