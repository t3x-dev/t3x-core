import type { RepositoryAddress } from '@t3x-dev/api-client';
import { useEffect, useRef, useState } from 'react';
import { PROJECT_DELETED_EVENT, PROJECT_RESTORED_EVENT } from '@/hooks/shared/deleteEvents';
import { resolveRepository } from '@/queries/projects';

export function prefetchDirectoryRepositoryAddress(
  path: string
): Promise<RepositoryAddress> | undefined {
  const [, owner, name] = path.split('/');
  if (owner && name) return resolveRepository(decodeURIComponent(owner), decodeURIComponent(name));
}

/** Resolve an address independently of the paginated project directory. */
export function useRepositoryAddress(
  owner: string,
  name: string,
  enabled: boolean,
  earlyAddress?: Promise<RepositoryAddress>,
  initialAddress?: RepositoryAddress
) {
  const key = JSON.stringify([owner, name]);
  const earlyAddressRef = useRef(earlyAddress);
  earlyAddressRef.current = earlyAddress;
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState<{
    key: string;
    address?: RepositoryAddress;
    error?: Error;
  } | null>(null);
  useEffect(() => {
    const invalidate = () => {
      setLookup(null);
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
    setLookup(null);
    if (!enabled || (initialAddress && attempt === 0)) return;
    let cancelled = false;
    // The layout may consume the handoff after mount. Keep its in-flight lookup
    // for this route, and always make a fresh request on manual invalidation.
    const address = (attempt === 0 && earlyAddressRef.current) || resolveRepository(owner, name);
    void address
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
  }, [key, owner, name, enabled, attempt, initialAddress]);
  return {
    current: !enabled
      ? null
      : lookup?.key === key
        ? lookup
        : attempt === 0 && initialAddress
          ? { key, address: initialAddress }
          : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
