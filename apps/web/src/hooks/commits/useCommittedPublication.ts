import { useEffect, useState } from 'react';
import { fetchStateExport } from '@/infrastructure/stateExport';

export function useCommittedPublication(projectId: string, digest: string) {
  const scope = `${projectId}:${digest}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ scope: string; value?: unknown; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    void fetchStateExport(projectId, digest, 'json', controller.signal)
      .then((artifact) => {
        const value: unknown = JSON.parse(artifact.content);
        if (!controller.signal.aborted) setResult({ scope, value });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ scope, error: 'Could not load the complete committed content. Try again.' });
      });
    return () => controller.abort();
  }, [projectId, digest, scope, attempt]);
  return {
    result: result?.scope === scope ? result : undefined,
    retry() {
      setResult(undefined);
      setAttempt((value) => value + 1);
    },
  };
}
