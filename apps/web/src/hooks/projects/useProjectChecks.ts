import { useEffect } from 'react';
import { useQuery } from '@/hooks/shared/useQuery';
import { useSessionUserId } from '@/hooks/shared/useSession';
import { ApiError } from '@/infrastructure/core';
import { fetchProjectCheck, fetchProjectChecks } from '@/queries/checks';

export function useProjectChecks(projectId: string, recordId: string | undefined, query: string) {
  const userId = useSessionUserId();
  const params = new URLSearchParams(query);
  const apiParams = new URLSearchParams();
  for (const name of ['kind', 'workspace', 'pr', 'commit', 'cursor', 'q']) {
    const value = params.get(name);
    if (value) apiParams.set(name, value);
  }
  const apiQuery = recordId ? '' : apiParams.toString();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['project-runs', userId, projectId, recordId, apiQuery],
    staleTime: 0,
    queryFn: async (signal) =>
      recordId
        ? { records: [await fetchProjectCheck(projectId, recordId, signal)], next_cursor: null }
        : fetchProjectChecks(projectId, apiQuery, signal),
  });

  const selected = recordId ? data?.records[0] : undefined;
  const status = selected?.payload.status;
  const accessLost =
    error instanceof ApiError &&
    ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'SESSION_NOT_CURRENT'].includes(error.code);
  const tracking =
    !accessLost &&
    selected?.kind === 'validation' &&
    (status === 'running' || status === 'pending');
  useEffect(() => {
    if (!tracking || isLoading) return;
    const timer = document.hidden ? undefined : window.setTimeout(refetch, error ? 10_000 : 5_000);
    const visibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) refetch();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [tracking, isLoading, error, refetch, data]);

  const current = error
    ? { records: [], next: null, error: error.message }
    : data
      ? { records: data.records, next: data.next_cursor, error: undefined }
      : null;
  return { current, refresh: refetch };
}
