/**
 * useUpdateDraft — imperative "update a workbench draft" trigger.
 *
 * Thin wrapper around commands/drafts/updateWorkbenchDraft for
 * lightweight callers (e.g. DraftQuickSheet) that don't need the
 * full useDraftWorkspaceActions surface.
 *
 * Callers provide the optimistic-lock `if_revision` via input as
 * documented in commands/drafts; this hook does not add retry logic.
 */

import { useCallback } from 'react';
import { type UpdateWorkbenchDraftInput, updateWorkbenchDraft } from '@/commands/drafts';

export function useUpdateDraft() {
  const update = useCallback(
    async (draftId: string, input: UpdateWorkbenchDraftInput) =>
      updateWorkbenchDraft(draftId, input),
    []
  );
  return { update };
}
