/**
 * useConversationContext — async loader for a conversation's context
 * config (selected_pin_ids + metadata).
 *
 * Thin wrapper so CanvasNodes doesn't reach into @/queries directly
 * for the per-conversation context indicator.
 */

import { useEffect, useState } from 'react';
import { fetchConversationContext } from '@/queries/conversationContext';
import type { ConversationContext } from '@/types/api';

export interface UseConversationContextResult {
  contextConfig: ConversationContext | null;
  loading: boolean;
}

export function useConversationContext(
  conversationId: string | null | undefined,
  options?: { enabled?: boolean }
): UseConversationContextResult {
  const enabled = options?.enabled ?? true;
  const [contextConfig, setContextConfig] = useState<ConversationContext | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !conversationId) {
      setContextConfig(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchConversationContext(conversationId)
      .then((ctx) => {
        if (!cancelled) setContextConfig(ctx);
      })
      .catch(() => {
        // Silent fail — same behaviour the component had inline.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, conversationId]);

  return { contextConfig, loading };
}
