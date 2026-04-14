/**
 * useCommitDraft — imperative "commit a workbench draft" trigger.
 *
 * Thin wrapper around commands/drafts/commitWorkbenchDraft for
 * components that commit drafts from sheets / dialogs (DraftQuickSheet).
 */

import { useCallback } from 'react';
import { commitWorkbenchDraft } from '@/commands/drafts';

export function useCommitDraft() {
  const commit = useCallback(
    async (draftId: string, message?: string) => commitWorkbenchDraft(draftId, message),
    []
  );
  return { commit };
}
