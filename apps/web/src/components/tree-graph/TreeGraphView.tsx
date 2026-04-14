'use client';

import {
  type YOp,
  type YOpsSource,
  RELATION_TYPES,
  type Relation,
  type SemanticContent,
  type SlotValue,
} from '@t3x-dev/core';
import { treesToNodes } from '@/domain/tree/treeCompat';

type SemanticRelationType = (typeof RELATION_TYPES)[number];
import type { Connection, Edge, Node } from '@xyflow/react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLayoutedElements } from '@/components/canvas/elkLayout';
import { cn } from '@/utils/cn';
import { TreeGraphToolbar } from './TreeGraphToolbar';
import { TreeNodeView } from './TreeNodeView';
import {
  type TreeNodeData,
  filterByZoomLevel,
  RELATION_STYLES,
  semanticToFlowElements,
  type ZoomLevel,
} from './treeGraphUtils';
import { RelationEdge, RelationEdgeMarkerDefs } from './RelationEdge';

// ── Custom type registrations ──

const nodeTypes = { treeNode: TreeNodeView };
const edgeTypes = { relationEdge: RelationEdge };

// ── Relation Type Selector (minimal popover for v1) ──

function RelationTypeSelector({
  position,
  onSelect,
  onCancel,
}: {
  position: { x: number; y: number };
  onSelect: (type: SemanticRelationType) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape key
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        onCancel();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[140px]"
      style={{ left: position.x, top: position.y }}
    >
      <div className="px-3 py-1 text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
        Relation Type
      </div>
      {RELATION_TYPES.map((type) => {
        const style = RELATION_STYLES[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
          >
            <span
              className="inline-block w-3 h-0.5 rounded"
              style={{ backgroundColor: style.color }}
            />
            <span>{style.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Helpers ──

/** Generate the next tree key from current content, e.g. node_004 */
function nextNodeKey(content: SemanticContent): string {
  const nodes = treesToNodes(content.trees);
  let maxNum = 0;
  for (const node of nodes) {
    const match = node.id.match(/^frame_(\d+)$/);
    if (match) {
      const num = Number.parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `frame_${String(maxNum + 1).padStart(3, '0')}`;
}

// ── Props ──

interface TreeGraphViewProps {
  content: SemanticContent;
  changeState?: Record<string, 'added' | 'updated' | 'removed'>;
  updatedSlots?: Record<string, string[]>;
  onBatchCreated?: (ops: YOp[], source: YOpsSource) => void;
  className?: string;
}

// ── Inner component (needs ReactFlowProvider context) ──

function TreeGraphInner({
  content,
  changeState,
  updatedSlots,
  onBatchCreated,
  className,
}: TreeGraphViewProps) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('overview');
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const { fitView } = useReactFlow();

  // Pending connection for relation type selector
  const [pendingConnection, setPendingConnection] = useState<{
    source: string;
    target: string;
    screenPos: { x: number; y: number };
  } | null>(null);

  // ── Edit callbacks (passed to TreeNodeView via node data) ──

  const handleSlotEdit = useCallback(
    (treeId: string, key: string, value: SlotValue) => {
      if (!onBatchCreated) return;
      const ops: YOp[] = [{ set: { path: `${treeId}/${key}`, value: value as string } }];
      onBatchCreated(ops, 'manual');
    },
    [onBatchCreated]
  );

  const handleTypeEdit = useCallback(
    (treeId: string, newType: string) => {
      if (!onBatchCreated) return;
      // Type change: remove old node + add with new key
      const nodes = treesToNodes(content.trees);
      const existingNode = nodes.find((f) => f.id === treeId);
      if (!existingNode) return;
      const slots = Object.fromEntries(Object.entries(existingNode.slots));
      const ops: YOp[] = [
        { drop: { path: treeId } },
        { define: { path: newType } },
        { populate: { path: newType, values: slots } },
      ];
      onBatchCreated(ops, 'manual');
    },
    [onBatchCreated, content.trees]
  );

  // ── Node double-click on empty space → add node ──

  const handlePaneDoubleClick = useCallback(
    (_event: React.MouseEvent) => {
      if (!onBatchCreated) return;
      const newKey = nextNodeKey(content);
      const ops: YOp[] = [
        { define: { path: newKey } },
        { populate: { path: newKey, values: { label: 'New Node' } } },
      ];
      onBatchCreated(ops, 'manual');
    },
    [onBatchCreated, content]
  );

  // ── Delete key → remove selected node or edge ──

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!onBatchCreated) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;

      // Check if we're inside an input/contentEditable — don't intercept
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Delete selected node
      if (selectedNodeId) {
        const ops: YOp[] = [{ drop: { path: selectedNodeId } }];
        onBatchCreated(ops, 'manual');
        return;
      }

      // Delete selected edges
      const selectedEdges = edges.filter((e) => e.selected);
      if (selectedEdges.length > 0) {
        const removeRelations = selectedEdges
          .map((e) => {
            const relationType = (e.data as { relationType?: SemanticRelationType } | undefined)
              ?.relationType;
            if (!relationType) return null;
            return { from: e.source, to: e.target, type: relationType };
          })
          .filter(Boolean) as Relation[];

        if (removeRelations.length > 0) {
          const ops: YOp[] = removeRelations.map((r) => ({
            unrelate: { from: r.from, to: r.to, type: r.type },
          }));
          onBatchCreated(ops, 'manual');
        }
      }
    },
    [onBatchCreated, selectedNodeId, edges]
  );

  // ── Connect handler → show relation type selector ──

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!onBatchCreated || !connection.source || !connection.target) return;
      if (connection.source === connection.target) return;

      // Position the selector near the center of the viewport
      const container = document.querySelector('.react-flow');
      const rect = container?.getBoundingClientRect();
      const screenPos = {
        x: rect ? rect.width / 2 - 70 : 200,
        y: rect ? rect.height / 2 - 80 : 200,
      };

      setPendingConnection({
        source: connection.source,
        target: connection.target,
        screenPos,
      });
    },
    [onBatchCreated]
  );

  const handleRelationTypeSelect = useCallback(
    (type: SemanticRelationType) => {
      if (!pendingConnection || !onBatchCreated) return;
      const ops: YOp[] = [
        { relate: { from: pendingConnection.source, to: pendingConnection.target, type } },
      ];
      onBatchCreated(ops, 'manual');
      setPendingConnection(null);
    },
    [pendingConnection, onBatchCreated]
  );

  const handleRelationTypeCancel = useCallback(() => {
    setPendingConnection(null);
  }, []);

  // Filtered content based on zoom level
  const filtered = useMemo(
    () => filterByZoomLevel(content, zoomLevel, selectedNodeId),
    [content, zoomLevel, selectedNodeId]
  );

  // Convert to flow elements, merge changeState, inject edit callbacks, run layout
  useEffect(() => {
    let cancelled = false;

    async function layout() {
      const { nodes: rawNodes, edges: rawEdges } = semanticToFlowElements(filtered);

      // Merge change state and edit callbacks into node data
      const nodesWithState: Node<TreeNodeData>[] = rawNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          ...(changeState?.[node.id] ? { state: changeState[node.id] } : {}),
          ...(updatedSlots?.[node.id] ? { updatedSlots: updatedSlots[node.id] } : {}),
          ...(onBatchCreated ? { onSlotEdit: handleSlotEdit, onTypeEdit: handleTypeEdit } : {}),
        },
      }));

      const layoutedNodes = await getLayoutedElements(nodesWithState, rawEdges, {
        direction: 'RIGHT',
      });

      if (cancelled) return;

      setNodes(layoutedNodes);
      setEdges(rawEdges);

      // fitView after React has rendered the new nodes
      requestAnimationFrame(() => {
        if (!cancelled) fitView({ padding: 0.15, duration: 300 });
      });
    }

    layout();
    return () => {
      cancelled = true;
    };
  }, [
    filtered,
    changeState,
    updatedSlots,
    setNodes,
    setEdges,
    fitView,
    onBatchCreated,
    handleSlotEdit,
    handleTypeEdit,
  ]);

  // Track selected node
  const handleSelectionChange = useCallback(({ nodes: selected }: { nodes: Node[] }) => {
    setSelectedNodeId(selected.length > 0 ? selected[0].id : undefined);
  }, []);

  return (
    <div
      className={cn('relative h-full w-full', className)}
      onKeyDown={handleKeyDown}
      role="application"
    >
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10">
        <TreeGraphToolbar
          zoomLevel={zoomLevel}
          onZoomLevelChange={setZoomLevel}
          hasSelectedNode={!!selectedNodeId}
        />
      </div>

      {/* Relation type selector popover */}
      {pendingConnection && (
        <RelationTypeSelector
          position={pendingConnection.screenPos}
          onSelect={handleRelationTypeSelect}
          onCancel={handleRelationTypeCancel}
        />
      )}

      {/* ReactFlow canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={handleSelectionChange}
        onConnect={handleConnect}
        onDoubleClick={handlePaneDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
        <RelationEdgeMarkerDefs />
      </ReactFlow>
    </div>
  );
}

// ── Public component (wraps with Provider) ──

export function TreeGraphView(props: TreeGraphViewProps) {
  return (
    <ReactFlowProvider>
      <TreeGraphInner {...props} />
    </ReactFlowProvider>
  );
}
