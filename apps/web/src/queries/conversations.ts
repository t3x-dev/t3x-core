/**
 * L3 — conversation list reader (read-only per v2 §2.3).
 *
 * Writes (create, delete, update) live in @/commands/conversations
 * per v2 §2.4.
 */

import { getConversation, listConversations } from '@/infrastructure/conversations';
import type { Conversation, ConversationListData } from '@/infrastructure/types';

export function fetchConversations(
  projectId: string,
  limit = 100,
  offset = 0
): Promise<ConversationListData> {
  return listConversations(projectId, limit, offset);
}

/** Load the complete lightweight conversation inventory for aggregate UI counts. */
export async function fetchAllConversations(projectId: string): Promise<Conversation[]> {
  const pageSize = 1000;
  const conversations: Conversation[] = [];
  let offset = 0;

  for (;;) {
    const page = await listConversations(projectId, pageSize, offset);
    conversations.push(...page.conversations);
    if (page.conversations.length < pageSize) return conversations;
    offset += page.conversations.length;
  }
}

export function fetchConversationForSourceRedirect(conversationId: string): Promise<Conversation> {
  return getConversation(conversationId);
}

export function fetchConversation(conversationId: string): Promise<Conversation> {
  return getConversation(conversationId);
}
