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
import { treesToNodes } from '@/lib/treeCompat';

// ── Inline mini node ──

interface MiniTreeNodeData {
  type: string;
  summary: string;
  changeType?: 'add' | 'update' | 'remove';
  isConfirmed?: boolean;
  confidence?: number;
  treeId?: string;
  onConfirmToggle?: (treeId: string) => void;
  [key: string]: unknown;
}

const CHANGE_BORDER_COLORS: Record<string, string> = {
  add: '#4ade80',
  update: '#facc15',
  remove: '#f87171',
};

function MiniTreeNodeView({ data }: { data: MiniTreeNodeData }) {
  const { changeType, isConfirmed, confidence, treeId, onConfirmToggle } = data;

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
    if (!treeId || !onConfirmToggle) return;
    onConfirmToggle(treeId);
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
        title={isConfirmed ? 'Unconfirm tree' : 'Confirm tree'}
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

const nodeTypes = { miniNode: MiniTreeNodeView };

// ── Inner component ──

function TreeGraphMiniInner() {
  const draft = useExtractionPanelStore((s) => s.draft);
  const yopsHistory = useExtractionPanelStore((s) => s.yopsHistory);
  const confirmedNodeIds = useExtractionPanelStore((s) => s.confirmedNodeIds);
  const confirmNode = useExtractionPanelStore((s) => s.confirmNode);
  const unconfirmNode = useExtractionPanelStore((s) => s.unconfirmNode);

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const { fitView } = useReactFlow();

  // Build changeMap from most recent yops (graph view doesn't need age)
  const changeMap = useMemo(() => {
    const map = new Map<string, 'add' | 'update' | 'remove'>();
    for (const op of yopsHistory[0] ?? []) {
      if ('add' in op) {
        const nodeKey = op.add.node ? Object.keys(op.add.node)[0] ?? '' : '';
        const parent = op.add.parent ?? '';
        map.set(parent ? `${parent}.${nodeKey}` : nodeKey, 'add');
      } else if ('set' in op) {
        map.set(op.set.path, 'update');
      } else if ('drop' in op) {
        map.set(op.drop.path, 'remove');
      }
    }
    return map;
  }, [yopsHistory]);

  const handleConfirmToggle = useMemo(
    () => (treeId: string) => {
      if (confirmedNodeIds[treeId]) {
        unconfirmNode(treeId);
      } else {
        confirmNode(treeId);
      }
    },
    [confirmedNodeIds, confirmNode, unconfirmNode]
  );

  useEffect(() => {
    let cancelled = false;
    let fitTimer: ReturnType<typeof setTimeout>;

    async function layout() {
      const nodes = treesToNodes(draft.trees);
      const rawNodes: Node<MiniTreeNodeData>[] = nodes.map((node) => {
        const slotEntries = Object.entries(node.slots);
        const summary =
          slotEntries.length > 0
            ? `${slotEntries[0][0]}: ${String(slotEntries[0][1])}`
            : '(no slots)';

        const changeType = changeMap.get(node.id);
        const isConfirmed = Boolean(confirmedNodeIds[node.id]);

        return {
          id: node.id,
          type: 'miniNode',
          position: { x: 0, y: 0 },
          data: {
            type: node.type,
            summary,
            changeType,
            isConfirmed,
            confidence: node.confidence,
            treeId: node.id,
            onConfirmToggle: handleConfirmToggle,
          },
        };
      });

      const treeIds = new Set(nodes.map((f) => f.id));
      const rawEdges: Edge[] = draft.relations
        .filter((r) => treeIds.has(r.from) && treeIds.has(r.to))
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
  }, [draft, changeMap, confirmedNodeIds, handleConfirmToggle, setNodes, setEdges, fitView]);

  const isExtracting = useExtractionPanelStore((s) => s.isExtracting);

  if (draft.trees.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        {isExtracting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-commit)]" />
            <p className="text-xs text-[var(--text-tertiary)]">Extracting nodes...</p>
          </>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)]">No trees yet</p>
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

export function TreeGraphMini() {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <TreeGraphMiniInner />
      </ReactFlowProvider>
    </div>
  );
}
