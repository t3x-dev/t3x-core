/**
 * useSuggestConstraints — thin wrapper over the L1 `suggestLeafConstraints`
 * call for the Suggest Constraints dialog.
 */

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
