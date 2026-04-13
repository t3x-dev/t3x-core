/**
 * useExtractFromConversation — imperative trigger to populate a draft from a
 * conversation. Distinct from useExtractToDraft (which appends an individual
 * node into the draft from a leaf selection).
 */

import { useCallback } from 'react';
import { extractToDraft } from '@/infrastructure/drafts';

export function useExtractFromConversation() {
  const extract = useCallback(
    async (draftId: string, conversationId: string, options?: { max_nodes?: number }) =>
      extractToDraft(draftId, conversationId, options),
    []
  );
  return { extract };
}
