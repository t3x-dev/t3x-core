/**
 * useDriftResolver — apply a drift-decision choice and re-hydrate.
 *
 * Thin wrapper over the drift-aware `extractNodes` call so DriftPopup
 * never imports `@/lib/api/*` directly. Swallows drift-choice failures
 * (they are non-critical: the user can re-pick).
 */

import { useCallback } from 'react';
import { extractNodes } from '@/infrastructure/trees';
import { hydrateConversation } from '@/queries/loadConversation';

export interface DriftDecision {
  choice: string;
  relation?: string;
  new_topic?: string;
}

export function useDriftResolver(): {
  applyChoice: (
    projectId: string | null,
    conversationId: string,
    decision: DriftDecision
  ) => Promise<void>;
} {
  const applyChoice = useCallback(
    async (projectId: string | null, conversationId: string, decision: DriftDecision) => {
      try {
        const result = await extractNodes(conversationId, undefined, decision);
        if (result.status === 'completed' && projectId) {
          await hydrateConversation(projectId, conversationId);
        }
      } catch {
        // non-critical — caller can retry
      }
    },
    []
  );

  return { applyChoice };
}
