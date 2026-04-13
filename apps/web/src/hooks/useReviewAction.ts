/**
 * useReviewAction — imperative semantic-point review action
 * (accept/dismiss/undo/edit) for the Workbench LLM panel.
 */

import { useCallback } from 'react';
import { reviewAction } from '@/infrastructure/drafts';

export function useReviewAction() {
  const submit = useCallback(
    async (
      draftId: string,
      spId: string,
      action: 'accept' | 'dismiss' | 'undo' | 'edit',
      editedText?: string
    ) => reviewAction(draftId, spId, action, editedText),
    []
  );
  return { submit };
}
