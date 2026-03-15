import { useCallback } from 'react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import * as api from '@/lib/api';
import { getLayoutedElements } from '@/lib/elkLayout';
import { useCanvasStore } from '@/store/canvasStore';
import type { NotifyCallback } from '@/store/canvasStoreTypes';
import type { NodeKind } from '@/types/nodes';

interface UseCanvasHandlersOptions {
  getNodes: () => Node[];
  getEdges: ReactFlowInstance['getEdges'];
  setNodes: ReactFlowInstance['setNodes'];
  fitView: ReactFlowInstance['fitView'];
  setCenter: ReactFlowInstance['setCenter'];
  screenToFlowPosition: ReactFlowInstance['screenToFlowPosition'];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  projectId: string | null;
  notify: NotifyCallback | null;
  router: { push: (url: string) => void };
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => Promise<void>;
  addDraftNode: (position?: { x: number; y: number }) => Promise<void>;
  setIsAdding: (value: boolean) => void;
  setIsLayouting: (value: boolean) => void;
}

export function useCanvasHandlers({
  getNodes,
  getEdges,
  setNodes,
  fitView,
  setCenter,
  screenToFlowPosition,
  canvasRef,
  projectId,
  notify,
  router,
  addNode,
  addDraftNode,
  setIsAdding,
  setIsLayouting,
}: UseCanvasHandlersOptions) {
  // Auto-layout handler
  const handleAutoLayout = useCallback(async () => {
    const currentNodes = getNodes();
    const currentEdges = getEdges();

    if (currentNodes.length === 0) return;

    setIsLayouting(true);
    try {
      const layoutedNodes = await getLayoutedElements(currentNodes, currentEdges, {
        direction: 'DOWN',
        nodeSpacing: 80,
        rankSpacing: 120,
      });
      setNodes(layoutedNodes);
      // Fit view after layout -- double rAF ensures DOM has updated after React render
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fitView({ padding: 0.2, duration: 300 });
        });
      });
    } catch (_err) {
      notify?.('Auto-layout failed', 'error');
    } finally {
      setIsLayouting(false);
    }
  }, [getNodes, getEdges, setNodes, fitView, notify, setIsLayouting]);

  // Auto-extract: create a draft from a conversation node via LLM extraction
  const handleAutoExtract = useCallback(
    async (nodeId: string) => {
      const node = getNodes().find((n) => n.id === nodeId);
      const conversationId = node?.data.conversationId as string | undefined;
      if (!conversationId || !projectId) {
        notify?.('No conversation found on this node', 'warning');
        return;
      }
      try {
        notify?.('Creating auto-draft...', 'success');
        const draft = await api.createAutoDraft({
          project_id: projectId,
          conversation_id: conversationId,
        });
        // Reload canvas to pick up the new draft node, then navigate
        await useCanvasStore.getState().loadProjectData(projectId);
        router.push(`/project/${projectId}/draft/${draft.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Auto-extract failed';
        notify?.(message, 'error');
      }
    },
    [getNodes, projectId, notify, router]
  );

  const getViewportCenter = useCallback(() => {
    if (!canvasRef.current) {
      return undefined;
    }
    const bounds = canvasRef.current.getBoundingClientRect();
    return screenToFlowPosition({
      x: bounds.width / 2,
      y: bounds.height / 2,
    });
  }, [screenToFlowPosition, canvasRef]);

  const handleAddNode = useCallback(
    async (kind: NodeKind) => {
      const position = getViewportCenter();
      setIsAdding(true);
      try {
        await addNode(kind, position);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create node';
        notify?.(message, 'error');
      } finally {
        setIsAdding(false);
      }
    },
    [getViewportCenter, addNode, notify, setIsAdding]
  );

  // Drag-and-drop handlers for node palette
  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const kind = event.dataTransfer.getData('application/reactflow') as NodeKind;
      if (!kind) return;

      const isDraft = event.dataTransfer.getData('application/reactflow-draft') === 'true';

      // Get the drop position in flow coordinates
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setIsAdding(true);
      try {
        if (isDraft) {
          await addDraftNode(position);
        } else {
          await addNode(kind, position);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create node';
        notify?.(message, 'error');
      } finally {
        setIsAdding(false);
      }
    },
    [screenToFlowPosition, addNode, addDraftNode, notify, setIsAdding]
  );

  // Select all nodes (Ctrl/Cmd+A)
  const selectAllNodes = useCallback(() => {
    const currentNodes = getNodes();
    setNodes(currentNodes.map((node) => ({ ...node, selected: true })));
  }, [getNodes, setNodes]);

  // Deselect all nodes (Escape)
  const deselectAllNodes = useCallback(() => {
    const currentNodes = getNodes();
    setNodes(currentNodes.map((node) => ({ ...node, selected: false })));
  }, [getNodes, setNodes]);

  // Navigate to adjacent node (Arrow keys)
  const navigateToNode = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      const currentNodes = getNodes();
      const selectedNodes = currentNodes.filter((node) => node.selected);

      // If no nodes selected, select the first one
      if (selectedNodes.length === 0 && currentNodes.length > 0) {
        setNodes(currentNodes.map((node, i) => ({ ...node, selected: i === 0 })));
        return;
      }

      // Get the "anchor" node (last selected)
      const anchorNode = selectedNodes[selectedNodes.length - 1];
      if (!anchorNode) return;

      // Find the nearest node in the given direction
      let bestNodeId: string | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const node of currentNodes) {
        if (node.id === anchorNode.id) continue;

        const dx = node.position.x - anchorNode.position.x;
        const dy = node.position.y - anchorNode.position.y;

        // Check if node is in the correct direction
        const isInDirection =
          (direction === 'up' && dy < -20) ||
          (direction === 'down' && dy > 20) ||
          (direction === 'left' && dx < -20) ||
          (direction === 'right' && dx > 20);

        if (!isInDirection) continue;

        // Calculate distance with preference for the primary axis
        const primaryDistance =
          direction === 'up' || direction === 'down' ? Math.abs(dy) : Math.abs(dx);
        const secondaryDistance =
          direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy);

        // Weight primary axis more heavily
        const distance = primaryDistance + secondaryDistance * 0.3;

        if (distance < bestDistance) {
          bestDistance = distance;
          bestNodeId = node.id;
        }
      }

      if (bestNodeId) {
        const targetNode = currentNodes.find((n) => n.id === bestNodeId);
        setNodes(
          currentNodes.map((node) => ({
            ...node,
            selected: node.id === bestNodeId,
          }))
        );
        // Auto-pan viewport to follow selected node
        if (targetNode) {
          setCenter(targetNode.position.x + 100, targetNode.position.y + 50, { duration: 200 });
        }
      }
    },
    [getNodes, setNodes, setCenter]
  );

  return {
    handleAutoLayout,
    handleAutoExtract,
    handleAddNode,
    onDragOver,
    onDrop,
    getViewportCenter,
    selectAllNodes,
    deselectAllNodes,
    navigateToNode,
  };
}
