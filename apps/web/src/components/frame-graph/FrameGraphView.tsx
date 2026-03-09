'use client';

import type { Delta, DeltaSource, SemanticContent } from '@t3x/core';
import type { Edge, Node } from '@xyflow/react';
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getLayoutedElements } from '@/lib/elkLayout';
import { cn } from '@/lib/utils';
import { FrameGraphToolbar } from './FrameGraphToolbar';
import { FrameNode } from './FrameNode';
import {
  type FrameNodeData,
  filterByZoomLevel,
  semanticToFlowElements,
  type ZoomLevel,
} from './frameGraphUtils';
import { RelationEdge, RelationEdgeMarkerDefs } from './RelationEdge';

// ── Custom type registrations ──

const nodeTypes = { frameNode: FrameNode };
const edgeTypes = { relationEdge: RelationEdge };

// ── Props ──

interface FrameGraphViewProps {
  content: SemanticContent;
  deltaState?: Record<string, 'added' | 'updated' | 'removed'>;
  updatedSlots?: Record<string, string[]>;
  onDeltaCreated?: (delta: Delta, source: DeltaSource) => void;
  className?: string;
}

// ── Inner component (needs ReactFlowProvider context) ──

function FrameGraphInner({ content, deltaState, updatedSlots, className }: FrameGraphViewProps) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('overview');
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const { fitView } = useReactFlow();

  // Filtered content based on zoom level
  const filtered = useMemo(
    () => filterByZoomLevel(content, zoomLevel, selectedNodeId),
    [content, zoomLevel, selectedNodeId]
  );

  // Convert to flow elements, merge deltaState, run layout
  useEffect(() => {
    let cancelled = false;

    async function layout() {
      const { nodes: rawNodes, edges: rawEdges } = semanticToFlowElements(filtered);

      // Merge delta state into node data
      const nodesWithState: Node<FrameNodeData>[] = rawNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          ...(deltaState?.[node.id] ? { state: deltaState[node.id] } : {}),
          ...(updatedSlots?.[node.id] ? { updatedSlots: updatedSlots[node.id] } : {}),
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
  }, [filtered, deltaState, updatedSlots, setNodes, setEdges, fitView]);

  // Track selected node
  const handleSelectionChange = useCallback(({ nodes: selected }: { nodes: Node[] }) => {
    setSelectedNodeId(selected.length > 0 ? selected[0].id : undefined);
  }, []);

  return (
    <div className={cn('relative h-full w-full', className)}>
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10">
        <FrameGraphToolbar
          zoomLevel={zoomLevel}
          onZoomLevelChange={setZoomLevel}
          hasSelectedNode={!!selectedNodeId}
        />
      </div>

      {/* ReactFlow canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={handleSelectionChange}
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
