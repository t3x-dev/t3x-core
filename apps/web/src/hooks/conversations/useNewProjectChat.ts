/**
 * useNewProjectChat — creates a new conversation under a project, threading
 * the active branch HEAD as the parent so the new chat inherits from the
 * selected branch tip.
 *
 * Wraps the two L1 calls (listCommits + createConversation) so ChatSidebar
 * stops dynamically importing from `@/infrastructure/*`.
 */

import { useCallback } from 'react';
import type { ApiCommit } from '@/infrastructure/commits';
import { listCommits } from '@/infrastructure/commits';
import {
  createConversation,
  deleteConversation,
  listConversations,
} from '@/infrastructure/conversations';
import type { Conversation } from '@/infrastructure/types';

function getCommittedConversationIds(commits: ApiCommit[]): Set<string> {
  const ids = new Set<string>();

  for (const commit of commits) {
    for (const source of commit.sources ?? []) {
      if (source.type === 'conversation') {
        ids.add(source.id);
      }
    }
  }

  return ids;
}

function isUncommittedConversation(
  conversation: Conversation,
  committedConversationIds: Set<string>
): boolean {
  return !conversation.committed_as && !committedConversationIds.has(conversation.conversation_id);
}

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
  start: (projectId: string, branch?: string) => Promise<string | null>;
} {
  const start = useCallback(async (projectId: string, branch = 'main'): Promise<string | null> => {
    try {
      const conversationData = await listConversations(projectId, 100, 0);
      const conversations = conversationData.conversations ?? [];
      const allCommits = await listCommits(projectId, undefined, 100);
      const committedConversationIds = getCommittedConversationIds(allCommits);
      const reusableConversation = conversations
        .filter((conversation) => isUncommittedConversation(conversation, committedConversationIds))
        .sort(newestFirst)[0];
      const emptyDrafts = conversations
        .filter(isEmptyNewChat)
        .filter((conversation) => isUncommittedConversation(conversation, committedConversationIds))
        .filter(
          (conversation) => conversation.conversation_id !== reusableConversation?.conversation_id
        )
        .sort(newestFirst);

      if (reusableConversation) {
        await Promise.allSettled(
          emptyDrafts.map((conversation) => deleteConversation(conversation.conversation_id))
        );
        return reusableConversation.conversation_id;
      }

      const branchHead = await listCommits(projectId, branch, 1);
      const parentHash = branchHead.length > 0 ? branchHead[0].hash : undefined;
      const conv = await createConversation(projectId, 'New Chat', parentHash, undefined, {
        target_branch: branch,
      });
      return conv.conversation_id;
    } catch {
      return null;
    }
  }, []);
  return { start };
}
