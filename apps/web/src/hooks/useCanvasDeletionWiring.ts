/**
 * useCanvasDeletionWiring — registers the conversation-delete side effect
 * with canvasStore.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, the store doesn't import
 * @/queries. The store emits an intent (via deleteConversationCallback)
 * and this hook supplies the I/O. Mount once at the canvas page root.
 */

import { useEffect } from 'react';
import { deleteConversationById } from '@/queries/conversations';
import { useCanvasStore } from '@/store/canvasStore';

export function useCanvasDeletionWiring(): void {
  useEffect(() => {
    const handler = (conversationId: string) => {
      deleteConversationById(conversationId).catch(() => {
        // Fire-and-forget — error handled silently to match prior behavior.
      });
    };
    useCanvasStore.getState().setDeleteConversationCallback(handler);
    return () => {
      useCanvasStore.getState().setDeleteConversationCallback(null);
    };
  }, []);
}
