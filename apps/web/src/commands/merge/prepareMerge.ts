/**
 * L3 command — prepare a merge plan between two commits (canvas flow).
 *
 * Returns the auto-kept / conflicts / source-only / target-only buckets
 * for the canvas merge view to render.
 */

import { prepareMergeApi } from '@/infrastructure/mergeApi';
import { MergePersistenceError } from './errors';

export async function prepareMerge(
  ...args: Parameters<typeof prepareMergeApi>
): ReturnType<typeof prepareMergeApi> {
  try {
    return await prepareMergeApi(...args);
  } catch (cause) {
    throw new MergePersistenceError(
      cause instanceof Error ? cause.message : 'prepareMerge failed',
      cause
    );
  }
}
