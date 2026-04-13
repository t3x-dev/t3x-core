/**
 * useTurnsList — imperative turns-list loader.
 */

import { useCallback } from 'react';
import { fetchTurns } from '@/queries/turns';

type TurnsOptions = Parameters<typeof fetchTurns>[2];

export function useTurnsList() {
  const loadTurns = useCallback(
    async (projectId: string, conversationId: string, options?: TurnsOptions) =>
      fetchTurns(projectId, conversationId, options),
    []
  );
  return { loadTurns };
}
