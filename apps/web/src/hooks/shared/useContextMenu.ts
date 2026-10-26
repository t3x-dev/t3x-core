'use client';

import type { Node } from '@xyflow/react';
import { useCallback, useState, useTransition } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData, NodeKind } from '@/types/nodes';
import {
  buildBackgroundMenu,
  buildUnitNodeMenu,
  type ContextMenuGroup,
} from '@/utils/canvasMenuBuilders';

export interface ContextMenuState {
  x: number;
  y: number;
  groups: ContextMenuGroup[];
}

interface UseContextMenuOptions {
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => Promise<void>;
  isDeveloperMode: boolean;
  notify: ((message: string, type: 'success' | 'error' | 'warning') => void) | null;
  fitView: (options?: { padding?: number; duration?: number }) => void;
}

export function useContextMenu({
  addNode,
  isDeveloperMode,
  notify,
  fitView,
}: UseContextMenuOptions) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [, startTransition] = useTransition();

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Node context menu
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node<CanvasNodeData>) => {
      event.preventDefault();
      event.stopPropagation();
      const isCommitted = node.data.commitStatus === 'committed';
      const hasConversation = !!node.data.conversationId;
      const commitHash = node.data.commit?.hash || node.data.commitHash || '';

      const groups = buildUnitNodeMenu({
        onOpenConversation: hasConversation
          ? () => useCanvasStore.getState().openNodeModal(node.id, 'conversation')
          : undefined,
        onCreateBranch: () => {
          const position = { x: node.position.x + 320, y: node.position.y };
          startTransition(async () => {
            try {
              await addNode('unit', position);
            } catch (err) {
              notify?.(formatUserFacingError(err, 'Failed to create branch.'), 'error');
            }
          });
        },
        onCopyHash: commitHash
          ? () => {
              navigator.clipboard.writeText(commitHash);
              notify?.('Hash copied to clipboard', 'success');
            }
          : undefined,
        onDelete: !isCommitted
          ? () => {
              // Trigger removal via onNodesChange (same as pressing Delete key)
              const change = { id: node.id, type: 'remove' as const };
              useCanvasStore.getState().onNodesChange([change]);
            }
          : undefined,
        isDeveloperMode,
        hasConversation,
      });
      setContextMenu({ x: event.clientX, y: event.clientY, groups });
    },
    [addNode, isDeveloperMode, notify]
  );

  // Pane context menu — inline addNode to avoid forward-declaration of handleAddNode
  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const groups = buildBackgroundMenu({
        onFitView: () => fitView({ padding: 0.2, duration: 300 }),
      });
      setContextMenu({ x: event.clientX, y: event.clientY, groups });
    },
    [fitView]
  );

  return {
    contextMenu,
    closeContextMenu,
    handleNodeContextMenu,
    handlePaneContextMenu,
  };
}
