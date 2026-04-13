/**
 * L3 command — request an LLM preview of a draft.
 */

import { previewWorkbenchDraft as previewWorkbenchDraftInfra } from '@/infrastructure/drafts';
import { DraftPersistenceError } from './errors';

export async function previewWorkbenchDraft(
  draftId: string,
  options?: { model?: string; preview_type?: string }
): Promise<{ output: string; model_used: string; token_count: number; cached: boolean }> {
  try {
    return await previewWorkbenchDraftInfra(draftId, options);
  } catch (cause) {
    throw new DraftPersistenceError(
      cause instanceof Error ? cause.message : 'previewWorkbenchDraft failed',
      cause
    );
  }
}
