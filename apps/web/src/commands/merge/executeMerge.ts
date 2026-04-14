/**
 * L3 command — execute a prepared merge (canvas flow).
 *
 * Produces a merge commit; caller (hook) appends it to canvas state.
 */

import { executeMergeApi } from '@/infrastructure/mergeApi';
import { MergePersistenceError } from './errors';

export async function executeMerge(
  ...args: Parameters<typeof executeMergeApi>
): ReturnType<typeof executeMergeApi> {
  try {
    return await executeMergeApi(...args);
  } catch (cause) {
    throw new MergePersistenceError(
      cause instanceof Error ? cause.message : 'executeMerge failed',
      cause
    );
  }
}
