/**
 * L3 command — patch a conversation (title, position, metadata, etc).
 */

import { updateConversation as updateConversationInfra } from '@/infrastructure/conversations';
import type { Conversation } from '@/infrastructure/types';
import { ConversationPersistenceError } from './errors';

export type UpdateConversationInput = Parameters<typeof updateConversationInfra>[1];

export async function updateConversation(
  conversationId: string,
  updates: UpdateConversationInput
): Promise<Conversation> {
  try {
    return await updateConversationInfra(conversationId, updates);
  } catch (cause) {
    throw new ConversationPersistenceError(
      cause instanceof Error ? cause.message : 'updateConversation failed',
      cause
    );
  }
}
