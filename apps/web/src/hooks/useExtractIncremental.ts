/**
 * useExtractIncremental — imperative incremental extraction trigger
 * for the draft Workbench's "Extract" action.
 */

import { useCallback } from 'react';
import { extractIncremental } from '@/infrastructure/drafts';

export function useExtractIncremental() {
  const extract = useCallback(
    async (projectId: string, conversationId: string, draftId: string) =>
      extractIncremental(projectId, conversationId, draftId),
    []
  );
  return { extract };
}
