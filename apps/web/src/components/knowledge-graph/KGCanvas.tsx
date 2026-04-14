'use client';

import { Background, Controls, type Edge, MiniMap, type Node, ReactFlow } from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import '@xyflow/react/dist/style.css';
import { useKnowledgeGraph } from '@/hooks/knowledge-graph/useKnowledgeGraph';

interface KGCanvasProps {
  projectId: string;
}

const COLS = 4;
const GAP_X = 250;
const GAP_Y = 150;

export function KGCanvas({ projectId }: KGCanvasProps) {
  const { nodes: kgNodes, selectNode } = useKnowledgeGraph();

  const rfNodes: Node[] = useMemo(
    () =>
      kgNodes.map((n, i) => ({
        id: n.id,
        position: { x: (i % COLS) * GAP_X, y: Math.floor(i / COLS) * GAP_Y },
        data: { label: `${n.label} (${n.member_count})` },
        type: 'default',
      })),
    [kgNodes]
  );

  const rfEdges: Edge[] = useMemo(() => [], []);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(projectId, node.id);
    },
    [projectId, selectNode]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodeClick={handleNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
        className="bg-[var(--surface-app)]"
      >
        <Background color="var(--stroke-divider)" gap={20} size={1} />
        <Controls
          className="rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-card)]"
          showInteractive={false}
        />
        <MiniMap
          className="rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-card)]"
          nodeColor="var(--accent-commit)"
          maskColor="rgba(0,0,0,0.3)"
        />
      </ReactFlow>
    </div>
  );
}
