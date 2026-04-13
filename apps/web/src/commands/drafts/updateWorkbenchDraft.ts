/**
 * L3 command — patch a workbench draft (optimistic-lock via if_revision).
 */

import {
  type UpdateWorkbenchDraftInput,
  updateWorkbenchDraft as updateWorkbenchDraftInfra,
} from '@/infrastructure/drafts';
import type { WorkbenchDraft } from '@/types/api';

export async function updateWorkbenchDraft(
  draftId: string,
  updates: UpdateWorkbenchDraftInput
): Promise<WorkbenchDraft> {
  return updateWorkbenchDraftInfra(draftId, updates);
}

export type { UpdateWorkbenchDraftInput };
