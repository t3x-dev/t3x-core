'use client';

import { useCallback } from 'react';
import { updateConversationContextPins } from '@/commands/conversations';

export function useConversationContextPins() {
  const updateSelectedPins = useCallback(
    async (conversationId: string, selectedPinIds: string[] | null) =>
      updateConversationContextPins(conversationId, selectedPinIds),
    []
  );

  return { updateSelectedPins };
}
