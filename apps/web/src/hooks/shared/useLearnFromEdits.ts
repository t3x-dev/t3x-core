/**
 * useLearnFromEdits — surfaces "learn from edits" as a typed-result hook
 * so LearnFromEditsPanel stops importing ApiError + the raw L1 fn.
 *
 * Collapses the `instanceof ApiError && err.code === 'NO_EDITS'` branch
 * into a structured success/error discriminant so the component doesn't
 * need to reason about the error class.
 */

import { useCallback } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { ApiError } from '@/infrastructure/core';
import { type LearnFromEditsResult, learnFromEdits } from '@/infrastructure/leaves';

export type LearnFromEditsOutcome =
  | { kind: 'ok'; data: LearnFromEditsResult }
  | { kind: 'no_edits'; message: string }
  | { kind: 'error'; message: string };

export function useLearnFromEdits(): {
  run: (leafId: string) => Promise<LearnFromEditsOutcome>;
} {
  const run = useCallback(async (leafId: string): Promise<LearnFromEditsOutcome> => {
    try {
      const data = await learnFromEdits(leafId);
      return { kind: 'ok', data };
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_EDITS') {
        return { kind: 'no_edits', message: err.message };
      }
      return { kind: 'error', message: formatUserFacingError(err, 'Failed to learn from edits.') };
    }
  }, []);
  return { run };
}
