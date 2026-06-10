import type { Node, ReactFlowInstance } from '@xyflow/react';
import { useCallback } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import type { NotifyCallback } from '@/store/canvasStoreTypes';
import type { NodeKind } from '@/types/nodes';

interface UseCanvasHandlersOptions {
  getNodes: () => Node[];
  setNodes: ReactFlowInstance['setNodes'];
  setCenter: ReactFlowInstance['setCenter'];
  screenToFlowPosition: ReactFlowInstance['screenToFlowPosition'];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  notify: NotifyCallback | null;
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => Promise<void>;
  setIsAdding: (value: boolean) => void;
}

export function useCanvasHandlers({
  getNodes,
  setNodes,
  setCenter,
  screenToFlowPosition,
  canvasRef,
  notify,
  addNode,
  setIsAdding,
}: UseCanvasHandlersOptions) {
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
        const message = formatUserFacingError(err, 'Failed to create node.');
        notify?.(message, 'error');
      } finally {
        setIsAdding(false);
      }
    },
    [getViewportCenter, addNode, notify, setIsAdding]
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
    handleAddNode,
    selectAllNodes,
    deselectAllNodes,
    navigateToNode,
  };
}
