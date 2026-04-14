/**
 * L3 command — patch a merge draft (auto-save in the workspace).
 */

import { saveMergeDraft as saveMergeDraftInfra } from '@/infrastructure/mergeApi';
import { MergePersistenceError } from './errors';

export async function saveMergeDraft(
  ...args: Parameters<typeof saveMergeDraftInfra>
): ReturnType<typeof saveMergeDraftInfra> {
  try {
    return await saveMergeDraftInfra(...args);
  } catch (cause) {
    throw new MergePersistenceError(
      cause instanceof Error ? cause.message : 'saveMergeDraft failed',
      cause
    );
  }
}
