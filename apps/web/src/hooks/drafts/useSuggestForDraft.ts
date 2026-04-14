/**
 * useSuggestForDraft — imperative pgvector-similarity suggestion loader for
 * Workbench V2's auto-suggest panel.
 */

import { useCallback } from 'react';
import { suggestForDraft } from '@/infrastructure/drafts';

export function useSuggestForDraft() {
  const loadSuggestions = useCallback(
    async (draftId: string, limit?: number) => suggestForDraft(draftId, limit),
    []
  );
  return { loadSuggestions };
}
