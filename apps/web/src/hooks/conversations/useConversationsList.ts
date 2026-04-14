/**
 * useConversationsList — imperative conversation-list loader.
 */

import { useCallback } from 'react';
import { fetchConversations } from '@/queries/conversations';

export function useConversationsList() {
  const loadConversations = useCallback(
    async (projectId: string, limit?: number, offset?: number) =>
      fetchConversations(projectId, limit, offset),
    []
  );
  return { loadConversations };
}
