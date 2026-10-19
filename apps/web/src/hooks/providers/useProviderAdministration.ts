import { useCallback, useEffect, useState } from 'react';
import { getAuthCapabilities } from '@/infrastructure/auth';

/** Request-scoped authority; never persisted or merged into deployment capabilities. */
export function useProviderAdministration(enabled: boolean) {
  const [state, setState] = useState<{ operator: boolean; status: 'loading' | 'ready' | 'error' }>({
    operator: false,
    status: 'loading',
  });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    setState({ operator: false, status: 'loading' });
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ operator: false, status: 'loading' });
    void getAuthCapabilities()
      .then((result) => {
        if (!cancelled) setState({ operator: result.operator === true, status: 'ready' });
      })
      .catch(() => {
        if (!cancelled) setState({ operator: false, status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, revision]);
  useEffect(() => {
    window.addEventListener('focus', refresh);
    window.addEventListener('t3x:session-changed', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('t3x:session-changed', refresh);
    };
  }, [refresh]);
  return { ...state, refresh };
}
