/**
 * L3 command — patch a workbench draft (optimistic-lock via if_revision).
 *
 * Important: errors are NOT wrapped here. The calling hook needs to
 * detect `ApiError.code === 'CONFLICT'` (HTTP 409) to trigger the
 * conflict-resolution UX. Wrapping would force the hook to dig through
 * `.cause`, which is brittle. Per v2 §2.4, an aggregate's command
 * module is allowed to surface raw infra errors when the aggregate's
 * UX flow depends on the underlying error code.
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
