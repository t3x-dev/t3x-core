/**
 * L3 command — fork an existing workbench draft into a new editable copy.
 */

import { forkWorkbenchDraft as forkWorkbenchDraftInfra } from '@/infrastructure/drafts';
import type { WorkbenchDraft } from '@/types/api';

export async function forkWorkbenchDraft(draftId: string): Promise<WorkbenchDraft> {
  return forkWorkbenchDraftInfra(draftId);
}
