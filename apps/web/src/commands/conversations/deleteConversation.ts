/**
 * L3 command — delete a conversation by id.
 */

import { deleteConversation as deleteConversationInfra } from '@/infrastructure/conversations';
import { ConversationPersistenceError } from './errors';

export async function deleteConversation(
  conversationId: string
): Promise<{ deleted: boolean; conversation_id: string }> {
  try {
    return await deleteConversationInfra(conversationId);
  } catch (cause) {
    throw new ConversationPersistenceError(
      cause instanceof Error ? cause.message : 'deleteConversation failed',
      cause
    );
  }
}
