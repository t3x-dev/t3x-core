'use client';

import type { Node } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  buildBackgroundMenu,
  buildLeafNodeMenu,
  buildUnitNodeMenu,
  type ContextMenuGroup,
} from '@/components/canvas/NodeContextMenu';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData, NodeKind } from '@/types/nodes';

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
}: UseContextMenuOptions) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [, startTransition] = useTransition();

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Node context menu
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node<CanvasNodeData>) => {
      event.preventDefault();
      const isDraft = node.data.commitStatus === 'draft';
      const hasConversation = !!node.data.conversationId;
      const groups = buildUnitNodeMenu({
        onOpenDetail: () => openNodeModal(node.id, 'commit'),
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
        onCopyHash: isDeveloperMode
          ? () => {
              const hash =
                node.data.commitV4?.hash || node.data.commitV3?.hash || node.data.commitHash || '';
              navigator.clipboard.writeText(hash);
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
    [openNodeModal, addNode, isDeveloperMode, notify, onAutoExtract]
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
          const node = getNodes().find((n) => n.id === nodeId);
          const leaves = node?.data.leaves as Array<{ id: string }> | undefined;
          const leaf = leaves?.find((l) => l.id === leafId);
          if (leaf && projectId) {
            window.location.href = `/project/${projectId}/leaf/${leafId}`;
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

  // Store leaf context menu handler ref for CanvasNodes to access
  const leafContextMenuRef = useRef(handleLeafContextMenu);
  leafContextMenuRef.current = handleLeafContextMenu;

  // Expose leaf context menu handler via store for CanvasNodes
  useEffect(() => {
    useCanvasStore.setState({ leafContextMenuHandler: handleLeafContextMenu });
    return () => {
      useCanvasStore.setState({ leafContextMenuHandler: undefined });
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
