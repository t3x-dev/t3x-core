/**
 * L3 command — generate an LLM preview for a draft.
 */

import { previewWorkbenchDraft as previewWorkbenchDraftInfra } from '@/infrastructure/drafts';

export async function previewWorkbenchDraft(
  draftId: string,
  options?: { model?: string; preview_type?: string }
): Promise<{ output: string; model_used: string; token_count: number; cached: boolean }> {
  return previewWorkbenchDraftInfra(draftId, options);
}
