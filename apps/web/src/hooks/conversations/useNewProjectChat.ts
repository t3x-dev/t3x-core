/**
 * useNewProjectChat — creates a new conversation under a project, threading
 * the latest commit hash as the parent so the new chat inherits from the
 * project's current tip.
 *
 * Wraps the two L1 calls (listCommits + createConversation) so ChatSidebar
 * stops dynamically importing from `@/infrastructure/*`.
 */

import { useCallback } from 'react';
import { listCommits } from '@/infrastructure/commits';
import {
  createConversation,
  deleteConversation,
  listConversations,
} from '@/infrastructure/conversations';
import type { Conversation } from '@/infrastructure/types';

function isEmptyNewChat(conversation: Conversation): boolean {
  return (
    (conversation.title ?? '').trim() === 'New Chat' &&
    (conversation.turns_count ?? 0) === 0 &&
    !conversation.committed_as
  );
}

function newestFirst(a: Conversation, b: Conversation): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function useNewProjectChat(): {
  start: (projectId: string) => Promise<string | null>;
} {
  const start = useCallback(async (projectId: string): Promise<string | null> => {
    try {
      const conversationData = await listConversations(projectId, 100, 0);
      const emptyDrafts = (conversationData.conversations ?? [])
        .filter(isEmptyNewChat)
        .sort(newestFirst);
      const reusableDraft = emptyDrafts[0];

      if (reusableDraft) {
        await Promise.allSettled(
          emptyDrafts
            .slice(1)
            .map((conversation) => deleteConversation(conversation.conversation_id))
        );
        return reusableDraft.conversation_id;
      }

      const commits = await listCommits(projectId, undefined, 1);
      const parentHash = commits.length > 0 ? commits[0].hash : undefined;
      const conv = await createConversation(projectId, 'New Chat', parentHash);
      return conv.conversation_id;
    } catch {
      return null;
    }
  }, []);
  return { start };
}
