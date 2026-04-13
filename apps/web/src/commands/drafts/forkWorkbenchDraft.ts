/**
 * L3 command — fork a committed draft into a new editable copy.
 */

import { forkWorkbenchDraft as forkWorkbenchDraftInfra } from '@/infrastructure/drafts';
import type { WorkbenchDraft } from '@/types/api';
import { DraftPersistenceError } from './errors';

export async function forkWorkbenchDraft(sourceDraftId: string): Promise<WorkbenchDraft> {
  try {
    return await forkWorkbenchDraftInfra(sourceDraftId);
  } catch (cause) {
    throw new DraftPersistenceError(
      cause instanceof Error ? cause.message : 'forkWorkbenchDraft failed',
      cause
    );
  }
}
