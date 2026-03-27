// @ts-nocheck — tree-primary migration: needs rework
'use client';

import {
  type Delta,
  type DeltaSource,
  RELATION_TYPES,
  type RelationType,
  type SemanticContent,
  type SlotValue,
} from '@t3x-dev/core';
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
import { getLayoutedElements } from '@/lib/elkLayout';
import { cn } from '@/lib/utils';
import { FrameGraphToolbar } from './FrameGraphToolbar';
import { FrameNode } from './FrameNode';
import {
  type FrameNodeData,
  filterByZoomLevel,
  RELATION_STYLES,
  semanticToFlowElements,
  type ZoomLevel,
} from './frameGraphUtils';
import { RelationEdge, RelationEdgeMarkerDefs } from './RelationEdge';

// ── Custom type registrations ──

const nodeTypes = { frameNode: FrameNode };
const edgeTypes = { relationEdge: RelationEdge };

// ── Relation Type Selector (minimal popover for v1) ──

function RelationTypeSelector({
  position,
  onSelect,
  onCancel,
}: {
  position: { x: number; y: number };
  onSelect: (type: RelationType) => void;
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

/** Generate the next frame ID from current content, e.g. f_004 */
function nextFrameId(content: SemanticContent): string {
  let maxNum = 0;
  for (const frame of content.trees) {
    const match = frame.id.match(/^f_(\d+)$/);
    if (match) {
      const num = Number.parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `f_${String(maxNum + 1).padStart(3, '0')}`;
}

// ── Props ──

interface FrameGraphViewProps {
  content: SemanticContent;
  deltaState?: Record<string, 'added' | 'updated' | 'removed'>;
  updatedSlots?: Record<string, string[]>;
  onDeltaCreated?: (delta: Delta, source: DeltaSource) => void;
  className?: string;
}

// ── Inner component (needs ReactFlowProvider context) ──

function FrameGraphInner({
  content,
  deltaState,
  updatedSlots,
  onDeltaCreated,
  className,
}: FrameGraphViewProps) {
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

  // ── Edit callbacks (passed to FrameNode via node data) ──

  const handleSlotEdit = useCallback(
    (frameId: string, key: string, value: SlotValue) => {
      if (!onDeltaCreated) return;
      const delta: Delta = {
        changes: [{ action: 'update', target: frameId, slots: { [key]: value } }],
      };
      onDeltaCreated(delta, 'manual');
    },
    [onDeltaCreated]
  );

  const handleTypeEdit = useCallback(
    (frameId: string, newType: string) => {
      if (!onDeltaCreated) return;
      // Type change is modeled as an update with empty slots — the type itself is changed
      // We need to include the new type in the update. Since FrameChange 'update' only has
      // slots, we model type change as remove + add with same id.
      const existingFrame = content.trees.find((f) => f.id === frameId);
      if (!existingFrame) return;
      const delta: Delta = {
        changes: [
          { action: 'remove', target: frameId },
          {
            action: 'add',
            frame: { ...existingFrame, type: newType },
          },
        ],
      };
      onDeltaCreated(delta, 'manual');
    },
    [onDeltaCreated, content.trees]
  );

  // ── Node double-click on empty space → add node ──

  const handlePaneDoubleClick = useCallback(
    (_event: React.MouseEvent) => {
      if (!onDeltaCreated) return;
      const newId = nextFrameId(content);
      const delta: Delta = {
        changes: [
          {
            action: 'add',
            frame: {
              id: newId,
              type: 'new_frame',
              slots: { label: 'New Frame' },
            },
          },
        ],
      };
      onDeltaCreated(delta, 'manual');
    },
    [onDeltaCreated, content]
  );

  // ── Delete key → remove selected node or edge ──

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!onDeltaCreated) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;

      // Check if we're inside an input/contentEditable — don't intercept
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Delete selected node
      if (selectedNodeId) {
        const delta: Delta = {
          changes: [{ action: 'remove', target: selectedNodeId }],
        };
        onDeltaCreated(delta, 'manual');
        return;
      }

      // Delete selected edges
      const selectedEdges = edges.filter((e) => e.selected);
      if (selectedEdges.length > 0) {
        const removeRelations = selectedEdges
          .map((e) => {
            const relationType = (e.data as { relationType?: RelationType } | undefined)
              ?.relationType;
            if (!relationType) return null;
            return { from: e.source, to: e.target, type: relationType };
          })
          .filter(Boolean) as { from: string; to: string; type: RelationType }[];

        if (removeRelations.length > 0) {
          // Need at least one change for Delta; use a no-op comment via remove_relations
          const delta: Delta = {
            changes: [{ action: 'update', target: removeRelations[0].from, slots: {} }],
            remove_relations: removeRelations,
          };
          onDeltaCreated(delta, 'manual');
        }
      }
    },
    [onDeltaCreated, selectedNodeId, edges]
  );

  // ── Connect handler → show relation type selector ──

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!onDeltaCreated || !connection.source || !connection.target) return;
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
    [onDeltaCreated]
  );

  const handleRelationTypeSelect = useCallback(
    (type: RelationType) => {
      if (!pendingConnection || !onDeltaCreated) return;
      const delta: Delta = {
        // Need at least one change; use no-op update on source
        changes: [{ action: 'update', target: pendingConnection.source, slots: {} }],
        new_relations: [{ from: pendingConnection.source, to: pendingConnection.target, type }],
      };
      onDeltaCreated(delta, 'manual');
      setPendingConnection(null);
    },
    [pendingConnection, onDeltaCreated]
  );

  const handleRelationTypeCancel = useCallback(() => {
    setPendingConnection(null);
  }, []);

  // Filtered content based on zoom level
  const filtered = useMemo(
    () => filterByZoomLevel(content, zoomLevel, selectedNodeId),
    [content, zoomLevel, selectedNodeId]
  );

  // Convert to flow elements, merge deltaState, inject edit callbacks, run layout
  useEffect(() => {
    let cancelled = false;

    async function layout() {
      const { nodes: rawNodes, edges: rawEdges } = semanticToFlowElements(filtered);

      // Merge delta state and edit callbacks into node data
      const nodesWithState: Node<FrameNodeData>[] = rawNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          ...(deltaState?.[node.id] ? { state: deltaState[node.id] } : {}),
          ...(updatedSlots?.[node.id] ? { updatedSlots: updatedSlots[node.id] } : {}),
          ...(onDeltaCreated ? { onSlotEdit: handleSlotEdit, onTypeEdit: handleTypeEdit } : {}),
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
    deltaState,
    updatedSlots,
    setNodes,
    setEdges,
    fitView,
    onDeltaCreated,
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
        <FrameGraphToolbar
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

export function FrameGraphView(props: FrameGraphViewProps) {
  return (
    <ReactFlowProvider>
      <FrameGraphInner {...props} />
    </ReactFlowProvider>
  );
}
