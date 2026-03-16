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
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { getLayoutedElements } from '@/lib/elkLayout';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

// ── Inline mini node ──

interface MiniFrameNodeData {
  type: string;
  summary: string;
  changeType?: 'add' | 'update' | 'remove';
  isConfirmed?: boolean;
  confidence?: number;
  frameId?: string;
  onConfirmToggle?: (frameId: string) => void;
  [key: string]: unknown;
}

const CHANGE_BORDER_COLORS: Record<string, string> = {
  add: '#4ade80',
  update: '#facc15',
  remove: '#f87171',
};

function MiniFrameNode({ data }: { data: MiniFrameNodeData }) {
  const { changeType, isConfirmed, confidence, frameId, onConfirmToggle } = data;

  const borderColor =
    changeType && CHANGE_BORDER_COLORS[changeType]
      ? CHANGE_BORDER_COLORS[changeType]
      : 'var(--stroke-default)';

  const isRemoved = changeType === 'remove';
  const lowConfidence = typeof confidence === 'number' && confidence < 0.5;
  const borderStyle = isRemoved || (lowConfidence && !isConfirmed) ? 'dashed' : 'solid';
  const opacity = isRemoved ? 0.5 : 1;

  function handleConfirmClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!frameId || !onConfirmToggle) return;
    onConfirmToggle(frameId);
  }

  return (
    <div
      style={{
        borderColor,
        borderStyle,
        opacity,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        borderWidth: '1px',
        borderRadius: '8px',
        padding: '6px 10px',
        fontSize: '12px',
        background: 'var(--surface-panel)',
      }}
    >
      {/* Confirm button */}
      <button
        type="button"
        onClick={handleConfirmClick}
        title={isConfirmed ? 'Unconfirm frame' : 'Confirm frame'}
        style={{
          width: '16px',
          height: '16px',
          minWidth: '16px',
          borderRadius: '3px',
          border: `1px solid ${isConfirmed ? '#4ade80' : '#6b7280'}`,
          background: isConfirmed ? 'rgba(74,222,128,0.15)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          fontSize: '10px',
          color: isConfirmed ? '#4ade80' : 'transparent',
          flexShrink: 0,
        }}
      >
        ✓
      </button>

      {/* Text content */}
      <div>
        <div
          style={{
            fontWeight: 600,
            color: 'var(--text-primary)',
            textDecoration: isRemoved ? 'line-through' : 'none',
          }}
        >
          {data.type}
        </div>
        <div
          style={{
            color: 'var(--text-tertiary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '180px',
            textDecoration: isRemoved ? 'line-through' : 'none',
          }}
        >
          {data.summary}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { miniFrame: MiniFrameNode };

// ── Inner component ──

function FrameGraphMiniInner() {
  const draft = useExtractionPanelStore((s) => s.draft);
  const lastDeltaChanges = useExtractionPanelStore((s) => s.lastDeltaChanges);
  const confirmedFrameIds = useExtractionPanelStore((s) => s.confirmedFrameIds);
  const confirmFrame = useExtractionPanelStore((s) => s.confirmFrame);
  const unconfirmFrame = useExtractionPanelStore((s) => s.unconfirmFrame);

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const { fitView } = useReactFlow();

  // Build changeMap from lastDeltaChanges
  const changeMap = useMemo(() => {
    const map = new Map<string, 'add' | 'update' | 'remove'>();
    for (const c of lastDeltaChanges) {
      if (c.action === 'add') map.set(c.frame.id, 'add');
      else if (c.action === 'update') map.set(c.target, 'update');
      else if (c.action === 'remove') map.set(c.target, 'remove');
    }
    return map;
  }, [lastDeltaChanges]);

  const handleConfirmToggle = useMemo(
    () => (frameId: string) => {
      if (confirmedFrameIds[frameId]) {
        unconfirmFrame(frameId);
      } else {
        confirmFrame(frameId);
      }
    },
    [confirmedFrameIds, confirmFrame, unconfirmFrame]
  );

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

        const changeType = changeMap.get(frame.id);
        const isConfirmed = Boolean(confirmedFrameIds[frame.id]);

        return {
          id: frame.id,
          type: 'miniFrame',
          position: { x: 0, y: 0 },
          data: {
            type: frame.type,
            summary,
            changeType,
            isConfirmed,
            confidence: frame.confidence,
            frameId: frame.id,
            onConfirmToggle: handleConfirmToggle,
          },
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
  }, [draft, changeMap, confirmedFrameIds, handleConfirmToggle, setNodes, setEdges, fitView]);

  const isExtracting = useExtractionPanelStore((s) => s.isExtracting);

  if (draft.frames.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        {isExtracting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-commit)]" />
            <p className="text-xs text-[var(--text-tertiary)]">Extracting frames...</p>
          </>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)]">No frames yet</p>
        )}
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
