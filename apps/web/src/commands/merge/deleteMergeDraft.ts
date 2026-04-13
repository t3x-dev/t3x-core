/**
 * L3 command — delete a merge draft (cancel flow).
 *
 * Fire-and-forget at the call site; caller (useMergeWorkspaceActions.cancel)
 * already swallows errors so workspace can clear local state regardless.
 */

import { deleteMergeDraft as deleteMergeDraftInfra } from '@/infrastructure/mergeApi';
import { MergePersistenceError } from './errors';

export async function deleteMergeDraft(draftId: string): Promise<void> {
  try {
    return await deleteMergeDraftInfra(draftId);
  } catch (cause) {
    throw new MergePersistenceError(
      cause instanceof Error ? cause.message : 'deleteMergeDraft failed',
      cause
    );
  }
}
