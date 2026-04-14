/**
 * useProvidersList — async loader for the LLM provider list.
 *
 * Replaces the `fetchProviders()` + useEffect + cancel-flag boilerplate
 * that LeafComposerDock and CompareModelsDialog both used to keep
 * inline. Components must not import @/queries directly (v2 §1 table);
 * this hook is the authorised reach-through.
 *
 * Pass `enabled: false` when the consumer only needs the data
 * conditionally (e.g. a dialog that shouldn't fetch until opened).
 */

import { useEffect, useState } from 'react';
import { fetchProviders } from '@/queries/providers';
import type { ProviderInfo } from '@/types/api';

export interface UseProvidersListResult {
  providers: ProviderInfo[];
  loading: boolean;
}

export function useProvidersList(options?: { enabled?: boolean }): UseProvidersListResult {
  const enabled = options?.enabled ?? true;
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchProviders()
      .then((data) => {
        if (!cancelled) setProviders(data);
      })
      .catch(() => {
        // Swallow — same silent behaviour the component had inline.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { providers, loading };
}
