/**
 * useCanvasDeletionWiring — registers persisted deletion side effects for
 * uncommitted canvas sources with canvasStore.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, the store doesn't import
 * @/queries. The store emits an intent via callbacks and this hook supplies
 * the conversation I/O. Mount once at the canvas page root.
 */

import { useEffect } from 'react';
import { deleteConversation } from '@/commands/conversations';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import { dispatchConversationDeleted } from '@/hooks/shared/deleteEvents';
import { useCanvasStore } from '@/store/canvasStore';

export function useCanvasDeletionWiring(enabled = true): void {
  const { load } = useCanvasNodeActions();

  useEffect(() => {
    if (!enabled) return;

    const reloadCurrentProject = (projectId: string | null) => {
      if (projectId && useCanvasStore.getState().projectId === projectId) {
        void load(projectId);
      }
    };
    const conversationHandler = (conversationId: string) => {
      const projectId = useCanvasStore.getState().projectId;
      deleteConversation(conversationId)
        .then(() => {
          if (projectId) {
            dispatchConversationDeleted({ projectId, conversationId });
          }
          reloadCurrentProject(projectId);
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
    useCanvasStore.getState().setDeleteConversationCallback(conversationHandler);
    return () => {
      useCanvasStore.getState().setDeleteConversationCallback(null);
    };
  }, [enabled, load]);
}
