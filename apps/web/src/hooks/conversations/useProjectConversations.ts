/**
 * useProjectConversations — list + delete conversations for a project.
 *
 * The sidebar lazily expands each project and populates its conversation
 * list on demand, so fetches are triggered imperatively via `load` rather
 * than on mount.
 */

import { useCallback, useEffect, useState } from 'react';
import { updateConversation as updateConversationCommand } from '@/commands/conversations';
import {
  CONVERSATION_DELETED_EVENT,
  type ConversationDeletedDetail,
  dispatchConversationDeleted,
  PROJECT_DELETED_EVENT,
  type ProjectDeletedDetail,
} from '@/hooks/shared/deleteEvents';
import { deleteConversation, listConversations } from '@/infrastructure/conversations';
import type { Conversation } from '@/infrastructure/types';

export interface UseProjectConversationsResult {
  conversationsByProject: Record<string, Conversation[]>;
  load: (projectId: string) => Promise<Conversation[]>;
  remove: (projectId: string, conversationId: string) => Promise<void>;
  rename: (projectId: string, conversationId: string, title: string) => Promise<Conversation>;
}

export function useProjectConversations(limit = 50): UseProjectConversationsResult {
  const [byProject, setByProject] = useState<Record<string, Conversation[]>>({});

  useEffect(() => {
    const handleConversationDeleted = (event: Event) => {
      const detail = (event as CustomEvent<ConversationDeletedDetail>).detail;
      if (!detail?.projectId || !detail.conversationId) return;
      setByProject((prev) => {
        const list = prev[detail.projectId];
        if (!list) return prev;
        return {
          ...prev,
          [detail.projectId]: list.filter((c) => c.conversation_id !== detail.conversationId),
        };
      });
    };

    const handleProjectDeleted = (event: Event) => {
      const detail = (event as CustomEvent<ProjectDeletedDetail>).detail;
      if (!detail?.projectId) return;
      setByProject((prev) => {
        if (!(detail.projectId in prev)) return prev;
        const next = { ...prev };
        delete next[detail.projectId];
        return next;
      });
    };

    window.addEventListener(CONVERSATION_DELETED_EVENT, handleConversationDeleted);
    window.addEventListener(PROJECT_DELETED_EVENT, handleProjectDeleted);
    return () => {
      window.removeEventListener(CONVERSATION_DELETED_EVENT, handleConversationDeleted);
      window.removeEventListener(PROJECT_DELETED_EVENT, handleProjectDeleted);
    };
  }, []);

  const load = useCallback(
    async (projectId: string) => {
      const data = await listConversations(projectId, limit, 0);
      const conversations = data.conversations ?? [];
      setByProject((prev) => ({ ...prev, [projectId]: conversations }));
      return conversations;
    },
    [limit]
  );

  const remove = useCallback(async (projectId: string, conversationId: string) => {
    await deleteConversation(conversationId);
    dispatchConversationDeleted({ projectId, conversationId });
    setByProject((prev) => {
      const list = prev[projectId];
      if (!list) return prev;
      return {
        ...prev,
        [projectId]: list.filter((c) => c.conversation_id !== conversationId),
      };
    });
  }, []);

  const rename = useCallback(
    async (projectId: string, conversationId: string, rawTitle: string): Promise<Conversation> => {
      const title = rawTitle.trim();
      const conversation = await updateConversationCommand(conversationId, { title });
      setByProject((prev) => {
        const list = prev[projectId];
        if (!list) return prev;
        return {
          ...prev,
          [projectId]: list.map((item) =>
            item.conversation_id === conversationId
              ? { ...item, ...conversation, title: conversation.title ?? title }
              : item
          ),
        };
      });
      return conversation;
    },
    []
  );

  return { conversationsByProject: byProject, load, remove, rename };
}
