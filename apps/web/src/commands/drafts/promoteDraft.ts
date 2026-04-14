/**
 * L3 command — promote an auto-generated draft to editing status.
 */

import { promoteDraft as promoteDraftInfra } from '@/infrastructure/drafts';
import type { WorkbenchDraft } from '@/types/api';
import { DraftPersistenceError } from './errors';

export async function promoteDraft(draftId: string): Promise<WorkbenchDraft> {
  try {
    return await promoteDraftInfra(draftId);
  } catch (cause) {
    throw new DraftPersistenceError(
      cause instanceof Error ? cause.message : 'promoteDraft failed',
      cause
    );
  }
}
