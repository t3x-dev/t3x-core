import type { StateOverview } from '@t3x-dev/api-client';
import { useEffect, useState } from 'react';
import { fetchStateOverview } from '@/infrastructure/stateOverview';
export function useStateOverview(projectId: string, commitDigest: string) {
  const key = `${projectId}:${commitDigest}`;
  const [result, setResult] = useState<{ key: string; data?: StateOverview; error?: string }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResult(undefined);
    fetchStateOverview(projectId, commitDigest)
      .then((data) => {
        if (!cancelled) setResult({ key, data });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setResult({
            key,
            error: error instanceof Error ? error.message : 'Overview unavailable',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, commitDigest, key, retry]);
  const current = result?.key === key ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    retry: () => setRetry((n) => n + 1),
  };
}
