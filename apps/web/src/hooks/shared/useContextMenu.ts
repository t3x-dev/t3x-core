'use client';

import type { Node } from '@xyflow/react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { getProjectOutputsPath } from '@/domain/project/repoPath';
import { useCanvasLeafActions } from '@/hooks/canvas/useCanvasLeafActions';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData, NodeKind } from '@/types/nodes';
import {
  buildBackgroundMenu,
  buildLeafNodeMenu,
  buildUnitNodeMenu,
  type ContextMenuGroup,
} from '@/utils/canvasMenuBuilders';

/**
 * Module-level ref for the leaf context menu handler.
 * Storing a React callback in Zustand state causes setState on every re-render.
 * Consumers (CanvasNodes) read from this ref instead of from the Zustand store.
 */
export const leafContextMenuHandlerRef: {
  current: ((event: React.MouseEvent, leafId: string, nodeId: string) => void) | null;
} = { current: null };

export interface ContextMenuState {
  x: number;
  y: number;
  groups: ContextMenuGroup[];
}

interface UseContextMenuOptions {
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => Promise<void>;
  isDeveloperMode: boolean;
  notify: ((message: string, type: 'success' | 'error' | 'warning') => void) | null;
  projectId: string | null;
  projectName: string;
  fitView: (options?: { padding?: number; duration?: number }) => void;
  /** Router push for page navigation */
  onNavigate?: (url: string) => void;
}

export function useContextMenu({
  addNode,
  isDeveloperMode,
  notify,
  projectId,
  projectName,
  fitView,
  onNavigate,
}: UseContextMenuOptions) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [, startTransition] = useTransition();
  const { remove: removeLeafFromNode } = useCanvasLeafActions();

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Node context menu
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node<CanvasNodeData>) => {
      event.preventDefault();
      event.stopPropagation();
      const isDraft = node.data.commitStatus === 'draft';
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
        isDraft,
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

  // Leaf context menu handler — called from CanvasNodes when right-clicking a leaf inside a unit node
  const handleLeafContextMenu = useCallback(
    (event: React.MouseEvent, leafId: string, nodeId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const leafHref = projectId
        ? getProjectOutputsPath({ id: projectId, name: projectName }, leafId)
        : undefined;
      const groups = buildLeafNodeMenu({
        onOpenDetail: () => {
          if (leafHref) {
            if (onNavigate) {
              onNavigate(leafHref);
            } else {
              window.location.href = leafHref;
            }
          }
        },
        onGenerate: () => {
          useCanvasStore.getState().openLeafPanel(nodeId);
        },
        onShare: () => {
          if (leafHref) {
            const url = `${window.location.origin}${leafHref}`;
            navigator.clipboard.writeText(url);
            notify?.('Link copied to clipboard', 'success');
          }
        },
        onExport: () => {
          if (leafHref) {
            window.open(leafHref, '_blank');
          }
        },
        onDelete: () => {
          void removeLeafFromNode(nodeId, leafId);
        },
      });
      setContextMenu({ x: event.clientX, y: event.clientY, groups });
    },
    [projectId, projectName, notify, onNavigate, removeLeafFromNode]
  );

  // Keep the module-level ref up to date so CanvasNodes can call the handler
  // without triggering Zustand setState on every render of the parent component
  useEffect(() => {
    leafContextMenuHandlerRef.current = handleLeafContextMenu;
    return () => {
      leafContextMenuHandlerRef.current = null;
    };
  }, [handleLeafContextMenu]);

  return {
    contextMenu,
    closeContextMenu,
    handleNodeContextMenu,
    handlePaneContextMenu,
    handleLeafContextMenu,
  };
}
