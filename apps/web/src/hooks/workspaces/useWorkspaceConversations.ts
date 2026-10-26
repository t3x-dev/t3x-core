import { useCallback } from 'react';
import { type UpdateConversationInput, updateConversation } from '@/commands/conversations';
import { useConversations } from '@/hooks/shared/useApi';

export function useWorkspaceConversations(projectId: string) {
  const query = useConversations(projectId, 100, 0);

  const update = useCallback(
    async (conversationId: string, input: UpdateConversationInput) => {
      await updateConversation(conversationId, input);
      await query.refetch();
    },
    [query.refetch]
  );

  return { ...query, update };
}
