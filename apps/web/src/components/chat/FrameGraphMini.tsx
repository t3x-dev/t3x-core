'use client';

import type { Edge, Node } from '@xyflow/react';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect } from 'react';
import { getLayoutedElements } from '@/lib/elkLayout';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

// ── Inline mini node ──

interface MiniFrameNodeData {
  type: string;
  summary: string;
  isNew?: boolean;
  [key: string]: unknown;
}

function MiniFrameNode({ data }: { data: MiniFrameNodeData }) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-xs bg-[var(--surface-panel)]',
        data.isNew && 'border-[var(--accent-commit)] ring-1 ring-[var(--accent-commit)]/30'
      )}
      style={{ borderColor: data.isNew ? undefined : 'var(--stroke-default)' }}
    >
      <div className="font-semibold text-[var(--text-primary)]">{data.type}</div>
      <div className="text-[var(--text-tertiary)] truncate max-w-[200px]">{data.summary}</div>
    </div>
  );
}

const nodeTypes = { miniFrame: MiniFrameNode };

// ── Inner component ──

function FrameGraphMiniInner() {
  const draft = useExtractionPanelStore((s) => s.draft);
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const { fitView } = useReactFlow();

  useEffect(() => {
    let cancelled = false;
    let fitTimer: ReturnType<typeof setTimeout>;

    async function layout() {
      const rawNodes: Node<MiniFrameNodeData>[] = draft.frames.map((frame) => {
        const slotEntries = Object.entries(frame.slots);
        const summary =
          slotEntries.length > 0
            ? `${slotEntries[0][0]}: ${String(slotEntries[0][1])}`
            : '(no slots)';
        return {
          id: frame.id,
          type: 'miniFrame',
          position: { x: 0, y: 0 },
          data: { type: frame.type, summary },
        };
      });

      const frameIds = new Set(draft.frames.map((f) => f.id));
      const rawEdges: Edge[] = draft.relations
        .filter((r) => frameIds.has(r.from) && frameIds.has(r.to))
        .map((r) => ({
          id: `${r.from}-${r.to}-${r.type}`,
          source: r.from,
          target: r.to,
          label: r.type,
          style: { strokeWidth: 1.5, stroke: 'var(--stroke-default)' },
        }));

      const layoutedNodes = await getLayoutedElements(rawNodes, rawEdges, {
        direction: 'DOWN',
        nodeSpacing: 40,
        rankSpacing: 80,
      });

      if (cancelled) return;

      setNodes(layoutedNodes);
      setEdges(rawEdges);

      // Delay fitView to allow panel expand animation to complete
      fitTimer = setTimeout(() => {
        if (!cancelled) fitView({ padding: 0.2, duration: 300 });
      }, 500);
    }

    layout();
    return () => {
      cancelled = true;
      clearTimeout(fitTimer);
    };
  }, [draft, setNodes, setEdges, fitView]);

  if (draft.frames.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-[var(--text-tertiary)]">No frames yet</p>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
    >
      <Background gap={16} size={0.5} color="var(--stroke-default)" />
    </ReactFlow>
  );
}

// ── Public component ──

export function FrameGraphMini() {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <FrameGraphMiniInner />
      </ReactFlowProvider>
    </div>
  );
}
