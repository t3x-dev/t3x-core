/**
 * useTurnContext — imperative turn-context loader.
 *
 * Thin wrapper around fetchTurnContext so components can call it from
 * click handlers without importing @/queries directly.
 */

import { useCallback } from 'react';
import { fetchTurnContext } from '@/queries/turnContext';

type FetchOptions = Parameters<typeof fetchTurnContext>[1];

export function useTurnContext() {
  const loadTurnContext = useCallback(
    async (turnHash: string, options?: FetchOptions) => fetchTurnContext(turnHash, options),
    []
  );
  return { loadTurnContext };
}
