import { useEffect, useState } from 'react';
import type { CheckRecord } from '@/domain/project/checks';
import { fetchProjectCheck, fetchProjectChecks } from '@/queries/checks';

export function useProjectChecks(projectId: string, recordId: string | undefined, query: string) {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{
    key: string;
    records: CheckRecord[];
    next: string | null;
    error?: string;
  } | null>(null);
  const params = new URLSearchParams(query);
  const apiParams = new URLSearchParams();
  for (const name of ['kind', 'workspace', 'pr', 'commit', 'cursor', 'q']) {
    const value = params.get(name);
    if (value) apiParams.set(name, value);
  }
  const apiQuery = recordId ? '' : apiParams.toString();
  const key = JSON.stringify([projectId, recordId, apiQuery, reload]);
  useEffect(() => {
    const abort = new AbortController();
    const request = recordId
      ? fetchProjectCheck(projectId, recordId, abort.signal).then((record) => ({
          records: [record],
          next_cursor: null,
        }))
      : fetchProjectChecks(projectId, apiQuery, abort.signal);
    void request.then(
      (result) => {
        if (!abort.signal.aborted)
          setState({ key, records: result.records, next: result.next_cursor });
      },
      (error: unknown) => {
        if (!abort.signal.aborted)
          setState({
            key,
            records: [],
            next: null,
            error: error instanceof Error ? error.message : 'Could not load checks.',
          });
      }
    );
    return () => abort.abort();
  }, [projectId, recordId, apiQuery, key]);
  return { current: state?.key === key ? state : null, refresh: () => setReload((n) => n + 1) };
}
