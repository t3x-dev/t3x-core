/**
 * L3 — conversation read/write pass-through used by the canvas slices.
 *
 * Chat has its own per-project hook (`useProjectConversations`) for
 * component consumers. Canvas slices need a plainer imperative surface;
 * this is it.
 */

import {
  createConversation,
  deleteConversation,
  listConversations,
  updateConversation,
} from '@/lib/api/conversations';
import type { Conversation, ConversationListData } from '@/lib/api/types';

export type UpdateConversationInput = Parameters<typeof updateConversation>[1];

export function fetchConversations(
  projectId: string,
  limit = 100,
  offset = 0
): Promise<ConversationListData> {
  return listConversations(projectId, limit, offset);
}

export function createConversationIn(
  projectId: string,
  title?: string,
  parentCommitHash?: string,
  position?: { x: number; y: number },
  metadata?: Record<string, unknown>
): Promise<Conversation> {
  return createConversation(projectId, title, parentCommitHash, position, metadata);
}

export function deleteConversationById(
  conversationId: string
): Promise<{ deleted: boolean; conversation_id: string }> {
  return deleteConversation(conversationId);
}

export function updateConversationById(
  conversationId: string,
  updates: UpdateConversationInput
): Promise<Conversation> {
  return updateConversation(conversationId, updates);
}
