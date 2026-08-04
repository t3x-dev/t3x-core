import { useCallback } from 'react';
import { getConversation } from '@/infrastructure/conversations';

export function useConversationParentResolver() {
  const findConversationForParent = useCallback(
    async (conversationIds: string[], parentCommitHash: string): Promise<string | undefined> => {
      for (const conversationId of conversationIds) {
        try {
          const conversation = await getConversation(conversationId);
          if (conversation.parent_commit_hash === parentCommitHash) return conversationId;
        } catch {
          // Ignore stale or inaccessible conversation references and try the next candidate.
        }
      }
      return undefined;
    },
    []
  );

  return { findConversationForParent };
}
