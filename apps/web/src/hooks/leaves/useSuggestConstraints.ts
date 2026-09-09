/** Provider-backed constraint suggestions for a repository Leaf. */

import { useCallback } from 'react';
import { type SuggestConstraintsResult, suggestLeafConstraints } from '@/infrastructure/leaves';

export function useSuggestConstraints(): {
  suggest: (
    leafId: string,
    options?: { max_suggestions?: number; instructions?: string }
  ) => Promise<SuggestConstraintsResult>;
} {
  const suggest = useCallback(
    (leafId: string, options?: { max_suggestions?: number; instructions?: string }) =>
      suggestLeafConstraints(leafId, options),
    []
  );
  return { suggest };
}
