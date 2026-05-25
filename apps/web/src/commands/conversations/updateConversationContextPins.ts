/**
 * L3 command — update selected context pins for a conversation.
 */

import { type ConversationContext, updateConversationContext } from '@/infrastructure/pins';
import { ConversationPersistenceError } from './errors';

export async function updateConversationContextPins(
  conversationId: string,
  selectedPinIds: string[] | null
): Promise<ConversationContext> {
  try {
    return await updateConversationContext(conversationId, selectedPinIds);
  } catch (cause) {
    throw new ConversationPersistenceError(
      cause instanceof Error ? cause.message : 'updateConversationContextPins failed',
      cause
    );
  }
}
