/**
 * L3 command — delete a workbench draft.
 */

import { deleteWorkbenchDraft as deleteWorkbenchDraftInfra } from '@/infrastructure/drafts';
import { DraftPersistenceError } from './errors';

export async function deleteWorkbenchDraft(draftId: string): Promise<void> {
  try {
    await deleteWorkbenchDraftInfra(draftId);
  } catch (cause) {
    throw new DraftPersistenceError(
      cause instanceof Error ? cause.message : 'deleteWorkbenchDraft failed',
      cause
    );
  }
}
