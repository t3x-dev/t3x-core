import type { RepositoryNameCheck } from '@t3x-dev/api-client';
import { useEffect, useState } from 'react';
import { PROJECT_DELETED_EVENT, PROJECT_RESTORED_EVENT } from '@/hooks/shared/deleteEvents';
import { checkRepositoryName } from '@/queries/projects';

/** Key results to the exact input as well as cancelling old effects. This also
 * prevents an old success enabling submit during the render before an effect. */
export function useRepositoryName(
  namespace: string | null | undefined,
  name: string,
  projectId?: string
) {
  const key = JSON.stringify([namespace, name, projectId]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    result?: RepositoryNameCheck;
    error?: string;
  } | null>(null);
  useEffect(() => {
    const invalidate = () => {
      setState(null);
      setAttempt((value) => value + 1);
    };
    window.addEventListener(PROJECT_DELETED_EVENT, invalidate);
    window.addEventListener(PROJECT_RESTORED_EVENT, invalidate);
    return () => {
      window.removeEventListener(PROJECT_DELETED_EVENT, invalidate);
      window.removeEventListener(PROJECT_RESTORED_EVENT, invalidate);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setState(null);
    if (!namespace) return;
    const timer = setTimeout(() => {
      void checkRepositoryName(namespace, name, projectId)
        .then((result) => {
          if (!cancelled) setState({ key, result });
        })
        .catch((cause) => {
          if (!cancelled)
            setState({
              key,
              error: cause instanceof Error ? cause.message : 'Name check failed. Please retry.',
            });
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, namespace, name, projectId, attempt]);
  const current = state?.key === key ? state : null;
  return {
    result: current?.result,
    error: namespace
      ? current?.error
      : 'A valid namespace is required before this repository can have a name address.',
    pending: Boolean(namespace && !current),
    canSubmit: current?.result?.available === true,
    retry: () => setAttempt((value) => value + 1),
  };
}
