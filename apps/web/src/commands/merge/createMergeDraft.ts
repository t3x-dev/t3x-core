/**
 * L3 command — create a merge draft (full-screen workspace flow).
 */

import { createMergeDraft as createMergeDraftInfra } from '@/infrastructure/mergeApi';
import { MergePersistenceError } from './errors';

export async function createMergeDraft(
  ...args: Parameters<typeof createMergeDraftInfra>
): ReturnType<typeof createMergeDraftInfra> {
  try {
    return await createMergeDraftInfra(...args);
  } catch (cause) {
    throw new MergePersistenceError(
      cause instanceof Error ? cause.message : 'createMergeDraft failed',
      cause
    );
  }
}
