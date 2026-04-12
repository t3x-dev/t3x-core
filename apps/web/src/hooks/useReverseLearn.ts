/**
 * useReverseLearn — wraps the L1 `reverseLearnConstraints` adapter for the
 * "Learn from edit suggestion" panel.
 */

import { useCallback } from 'react';
import { type ReverseLearnResult, reverseLearnConstraints } from '@/lib/api/leaves';

export function useReverseLearn(): {
  run: (leafId: string, maxSuggestions?: number) => Promise<ReverseLearnResult>;
} {
  const run = useCallback(
    (leafId: string, maxSuggestions?: number) =>
      reverseLearnConstraints(leafId, maxSuggestions),
    []
  );
  return { run };
}
