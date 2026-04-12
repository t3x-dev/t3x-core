/**
 * L3 — imperative "load conversation context (pin-selected view)" helper.
 */

import { type ConversationContext, getConversationContext } from '@/lib/api/pins';

export function fetchConversationContext(
  conversationId: string
): Promise<ConversationContext | null> {
  return getConversationContext(conversationId);
}

export type { ConversationContext };
