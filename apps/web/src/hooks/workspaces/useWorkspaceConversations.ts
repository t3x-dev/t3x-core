import { useCallback } from 'react';
import {
  deleteConversation,
  type UpdateConversationInput,
  updateConversation,
} from '@/commands/conversations';
import { useConversations } from '@/hooks/shared/useApi';
import { fetchConversation } from '@/queries/conversations';

export function useWorkspaceConversations(projectId: string) {
  const query = useConversations(projectId, 100, 0);

  const update = useCallback(
    async (conversationId: string, input: UpdateConversationInput) => {
      await updateConversation(conversationId, input);
      await query.refetch();
    },
    [query.refetch]
  );

  const get = useCallback((conversationId: string) => fetchConversation(conversationId), []);

  const remove = useCallback(
    async (conversationId: string) => {
      await deleteConversation(conversationId);
      await query.refetch();
    },
    [query.refetch]
  );

  return { ...query, get, remove, update };
}
