import type { RepositoryAddress } from '@t3x-dev/api-client';
import { useEffect, useState } from 'react';
import { resolveRepository } from '@/queries/projects';

/** Resolve an address independently of the paginated project directory. */
export function useRepositoryAddress(owner: string, name: string, enabled: boolean) {
  const key = JSON.stringify([owner, name]);
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState<{
    key: string;
    address?: RepositoryAddress;
    error?: Error;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLookup(null);
    void resolveRepository(owner, name)
      .then((address) => {
        if (!cancelled) setLookup({ key, address });
      })
      .catch((error) => {
        if (!cancelled)
          setLookup({ key, error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, owner, name, enabled, attempt]);
  return {
    current: lookup?.key === key ? lookup : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
