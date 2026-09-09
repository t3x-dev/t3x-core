import type { StatePresentationInput } from '@t3x-dev/api-client';
import { useEffect, useRef, useState } from 'react';
import { fetchAuthoringTarget, publishAuthorRevision } from '@/infrastructure/stateAuthoring';
export function useStateAuthoring(projectId: string, refName: string, commitDigest: string) {
  const key = `${projectId}:${refName}:${commitDigest}`;
  const [permission, setPermission] = useState<{ key: string; allowed: boolean }>();
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    epoch.current += 1;
    inFlight.current = false;
    setBusy(false);
    setError(undefined);
    let cancelled = false;
    fetchAuthoringTarget(projectId, refName)
      .then((target) => {
        if (!cancelled)
          setPermission({ key, allowed: target.canEdit && target.head === commitDigest });
      })
      .catch(() => {
        if (!cancelled) setPermission({ key, allowed: false });
      });
    return () => {
      cancelled = true;
      epoch.current += 1;
    };
  }, [projectId, refName, commitDigest, key]);
  return {
    canEdit: permission?.key === key && permission.allowed,
    busy,
    error,
    save: async (input: StatePresentationInput, onSaved: (digest: string) => void) => {
      if (inFlight.current || permission?.key !== key || !permission.allowed) return;
      const generation = epoch.current;
      inFlight.current = true;
      setBusy(true);
      setError(undefined);
      try {
        const result = await publishAuthorRevision(projectId, refName, commitDigest, input);
        if (epoch.current === generation) onSaved(result.commitDigest);
      } catch (cause) {
        if (epoch.current === generation)
          setError(cause instanceof Error ? cause.message : 'Could not save introduction');
      } finally {
        if (epoch.current === generation) {
          inFlight.current = false;
          setBusy(false);
        }
      }
    },
  };
}
