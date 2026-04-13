/**
 * L3 command — finalise a merge draft into a merge commit.
 */

import { commitMergeDraft as commitMergeDraftInfra } from '@/infrastructure/mergeApi';
import { MergePersistenceError } from './errors';

export async function commitMergeDraft(
  ...args: Parameters<typeof commitMergeDraftInfra>
): ReturnType<typeof commitMergeDraftInfra> {
  try {
    return await commitMergeDraftInfra(...args);
  } catch (cause) {
    throw new MergePersistenceError(
      cause instanceof Error ? cause.message : 'commitMergeDraft failed',
      cause
    );
  }
}
