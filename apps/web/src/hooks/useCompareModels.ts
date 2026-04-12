/**
 * useCompareModels — runs the multi-model comparison for a leaf via the
 * L1 `compareLeafModels` adapter. Long-running (~5 minute timeout on the
 * server side); callers should show their own loading state.
 */

import { useCallback } from 'react';
import { type CompareModelsResult, compareLeafModels } from '@/lib/api/leaves';

export function useCompareModels(): {
  compare: (leafId: string, models: string[]) => Promise<CompareModelsResult>;
} {
  const compare = useCallback(
    (leafId: string, models: string[]) => compareLeafModels(leafId, models),
    []
  );
  return { compare };
}
