/**
 * useConversationMemory — imperative loader for a conversation's
 * plain-text memory (used for copy-to-clipboard in ContextPanel).
 */

import { useCallback } from 'react';
import { getConversationMemoryText } from '@/infrastructure/conversations';

export function useConversationMemory() {
  const loadMemory = useCallback(
    async (conversationId: string) => getConversationMemoryText(conversationId),
    []
  );
  return { loadMemory };
}
