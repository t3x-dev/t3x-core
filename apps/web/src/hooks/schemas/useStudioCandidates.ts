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
  const read = useRef<{ epoch: number; promise: Promise<void> } | null>(null);
  const load = useCallback(
    (afterWrite: boolean) => {
      const current = epoch.current;
      if (!afterWrite && read.current?.epoch === current) return read.current.promise;

      const request = listStudioCandidates(projectId)
        .then(
          (items) => {
            if (epoch.current === current && read.current?.promise === request)
              setResult({ projectId, items });
          },
          (error: unknown) => {
            if (epoch.current === current && read.current?.promise === request)
              setResult({
                projectId,
                items: [],
                error: error instanceof Error ? error.message : 'Studio unavailable',
              });
          }
        )
        .finally(() => {
          if (read.current?.promise === request) read.current = null;
        });
      read.current = { epoch: current, promise: request };
      return request;
    },
    [projectId]
  );
  const refresh = useCallback(() => load(false), [load]);
  useEffect(() => {
    ++epoch.current;
    setResult(undefined);
    setPending(false);
    void refresh();
    return () => {
      ++epoch.current;
    };
  }, [refresh]);
  useEffect(() => {
    const reload = () => void refresh();
    window.addEventListener('focus', reload);
    return () => {
      window.removeEventListener('focus', reload);
    };
  }, [refresh]);
  async function mutate<T>(action: () => Promise<T>) {
    const current = epoch.current;
    setPending(true);
    try {
      const value = await action();
      if (epoch.current !== current) return undefined;
      await load(true);
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
