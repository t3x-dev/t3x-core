/**
 * L3 command — commit a workbench draft (produces a commit + optional leaf).
 */

import { commitWorkbenchDraft as commitWorkbenchDraftInfra } from '@/infrastructure/drafts';

export async function commitWorkbenchDraft(
  draftId: string,
  message?: string
): Promise<{
  commit: Record<string, unknown>;
  leaf: Record<string, unknown> | null;
  draft_status: string;
}> {
  return commitWorkbenchDraftInfra(draftId, message);
}
