/**
 * useCanvasDeletionWiring — registers the conversation-delete side effect
 * with canvasStore.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, the store doesn't import
 * @/queries. The store emits an intent (via deleteConversationCallback)
 * and this hook supplies the I/O. Mount once at the canvas page root.
 */

import { useEffect } from 'react';
import { deleteConversation } from '@/commands/conversations';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import { dispatchConversationDeleted } from '@/hooks/shared/deleteEvents';
import { useCanvasStore } from '@/store/canvasStore';

export function useCanvasDeletionWiring(): void {
  const { load } = useCanvasNodeActions();

  useEffect(() => {
    const handler = (conversationId: string) => {
      const projectId = useCanvasStore.getState().projectId;
      deleteConversation(conversationId)
        .then(() => {
          if (projectId) {
            dispatchConversationDeleted({ projectId, conversationId });
          }
        })
        .catch((err) => {
          const store = useCanvasStore.getState();
          store.notifyCallback?.(
            err instanceof Error ? err.message : 'Failed to delete conversation',
            'error'
          );
          if (projectId && store.projectId === projectId) {
            void load(projectId);
          }
        });
    };
    useCanvasStore.getState().setDeleteConversationCallback(handler);
    return () => {
      useCanvasStore.getState().setDeleteConversationCallback(null);
    };
  }, [load]);
}
