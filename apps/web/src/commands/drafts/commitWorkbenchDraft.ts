/**
 * L3 command — commit a draft (creates a commit + optional leaf).
 */

import { commitWorkbenchDraft as commitWorkbenchDraftInfra } from '@/infrastructure/drafts';
import { DraftPersistenceError } from './errors';

export async function commitWorkbenchDraft(
  draftId: string,
  message?: string,
  branch?: string
): Promise<{
  commit: Record<string, unknown>;
  leaf: Record<string, unknown> | null;
  draft_status: string;
}> {
  try {
    return await commitWorkbenchDraftInfra(draftId, message, branch);
  } catch (cause) {
    throw new DraftPersistenceError(
      cause instanceof Error ? cause.message : 'commitWorkbenchDraft failed',
      cause
    );
  }
}
