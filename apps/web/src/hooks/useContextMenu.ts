'use client';

import type { Node } from '@xyflow/react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  buildBackgroundMenu,
  buildLeafNodeMenu,
  buildUnitNodeMenu,
  type ContextMenuGroup,
} from '@/components/canvas/NodeContextMenu';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData, NodeKind } from '@/types/nodes';

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
  openNodeModal: (nodeId: string, viewMode: 'commit') => void;
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => Promise<void>;
  isDeveloperMode: boolean;
  notify: ((message: string, type: 'success' | 'error' | 'warning') => void) | null;
  getNodes: () => Node[];
  projectId: string | null;
  fitView: (options?: { padding?: number; duration?: number }) => void;
  handleAutoLayout: () => Promise<void>;
  /** Callback for auto-extract context menu action (optional, shows when hasConversation is true) */
  onAutoExtract?: (nodeId: string) => void;
  /** Router push for page navigation */
  onNavigate?: (url: string) => void;
}

export function useContextMenu({
  openNodeModal,
  addNode,
  isDeveloperMode,
  notify,
  getNodes,
  projectId,
  fitView,
  handleAutoLayout,
  onAutoExtract,
  onNavigate,
}: UseContextMenuOptions) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [, startTransition] = useTransition();

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Node context menu
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node<CanvasNodeData>) => {
      event.preventDefault();
      const isDraft = node.data.commitStatus === 'draft';
      const isCommitted = node.data.commitStatus === 'committed';
      const hasConversation = !!node.data.conversationId;
      const commitHash =
        node.data.commitV4?.hash || node.data.commitV3?.hash || node.data.commitHash || '';
      const conversationId = node.data.conversationId;
      const groups = buildUnitNodeMenu({
        onOpenDetail: () => openNodeModal(node.id, 'commit'),
        onOpenConversation:
          hasConversation && conversationId && onNavigate
            ? () => onNavigate(`/chat/${conversationId}`)
            : undefined,
        onViewCommitPage:
          isCommitted && commitHash && projectId && onNavigate
            ? () => onNavigate(`/project/${projectId}/commit/${encodeURIComponent(commitHash)}`)
            : undefined,
        onCreateBranch: () => {
          const position = { x: node.position.x + 320, y: node.position.y };
          startTransition(async () => {
            try {
              await addNode('unit', position);
            } catch (err) {
              notify?.(err instanceof Error ? err.message : 'Failed', 'error');
            }
          });
        },
        onConnectLeaf: () => useCanvasStore.getState().openLeafPanel(node.id),
        onAutoExtract: onAutoExtract ? () => onAutoExtract(node.id) : undefined,
        onCopyHash:
          commitHash
            ? () => {
                navigator.clipboard.writeText(commitHash);
                notify?.('Hash copied to clipboard', 'success');
              }
            : undefined,
        onDelete: isDraft
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
    [openNodeModal, addNode, isDeveloperMode, notify, onAutoExtract, projectId, onNavigate]
  );

  // Pane context menu — inline addNode to avoid forward-declaration of handleAddNode
  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const addNodeInline = (kind: NodeKind) => {
        startTransition(async () => {
          try {
            await addNode(kind);
          } catch (err) {
            notify?.(err instanceof Error ? err.message : 'Failed to create node', 'error');
          }
        });
      };
      const groups = buildBackgroundMenu({
        onAddConversation: () => addNodeInline('unit'),
        onAddLeaf: () => addNodeInline('leaf'),
        onFitView: () => fitView({ padding: 0.2, duration: 300 }),
        onAutoLayout: handleAutoLayout,
      });
      setContextMenu({ x: event.clientX, y: event.clientY, groups });
    },
    [addNode, notify, fitView, handleAutoLayout]
  );

  // Leaf context menu handler — called from CanvasNodes when right-clicking a leaf inside a unit node
  const handleLeafContextMenu = useCallback(
    (event: React.MouseEvent, leafId: string, nodeId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const groups = buildLeafNodeMenu({
        onOpenDetail: () => {
          if (projectId) {
            if (onNavigate) {
              onNavigate(`/project/${projectId}/leaf/${leafId}`);
            } else {
              window.location.href = `/project/${projectId}/leaf/${leafId}`;
            }
          }
        },
        onGenerate: () => {
          useCanvasStore.getState().openLeafPanel(nodeId);
        },
        onShare: () => {
          if (projectId) {
            const url = `${window.location.origin}/project/${projectId}/leaf/${leafId}`;
            navigator.clipboard.writeText(url);
            notify?.('Link copied to clipboard', 'success');
          }
        },
        onExport: () => {
          if (projectId) {
            window.open(`/project/${projectId}/leaf/${leafId}`, '_blank');
          }
        },
        onDelete: () => {
          useCanvasStore.getState().removeLeafFromNode(nodeId, leafId);
        },
      });
      setContextMenu({ x: event.clientX, y: event.clientY, groups });
    },
    [getNodes, projectId, notify]
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
