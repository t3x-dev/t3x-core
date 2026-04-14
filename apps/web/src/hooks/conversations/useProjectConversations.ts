/**
 * useProjectConversations — list + delete conversations for a project.
 *
 * The sidebar lazily expands each project and populates its conversation
 * list on demand, so fetches are triggered imperatively via `load` rather
 * than on mount.
 */

import { useCallback, useState } from 'react';
import { deleteConversation, listConversations } from '@/infrastructure/conversations';
import type { Conversation } from '@/infrastructure/types';

export interface UseProjectConversationsResult {
  conversationsByProject: Record<string, Conversation[]>;
  load: (projectId: string) => Promise<void>;
  remove: (projectId: string, conversationId: string) => Promise<void>;
}

export function useProjectConversations(limit = 50): UseProjectConversationsResult {
  const [byProject, setByProject] = useState<Record<string, Conversation[]>>({});

  const load = useCallback(
    async (projectId: string) => {
      const data = await listConversations(projectId, limit, 0);
      setByProject((prev) => ({ ...prev, [projectId]: data.conversations ?? [] }));
    },
    [limit]
  );

  const remove = useCallback(async (projectId: string, conversationId: string) => {
    await deleteConversation(conversationId);
    setByProject((prev) => {
      const list = prev[projectId];
      if (!list) return prev;
      return {
        ...prev,
        [projectId]: list.filter((c) => c.conversation_id !== conversationId),
      };
    });
  }, []);

  return { conversationsByProject: byProject, load, remove };
}
