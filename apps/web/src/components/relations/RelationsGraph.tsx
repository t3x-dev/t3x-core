'use client';

import { Background, Controls, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Edge, Node } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NodeRelation } from '@/lib/api/relations';
import { getLayoutedElements } from '@/lib/elkLayout';
import { truncate } from '@/lib/truncate';

interface RelationsGraphProps {
  relations: NodeRelation[];
  nodes: Array<{ id: string; text: string }>;
}

const edgeColors: Record<string, string> = {
  causes: '#3b82f6',
  conditions: '#f97316',
  contrasts: '#ef4444',
  follows: '#a855f7',
  depends: '#06b6d4',
};

export function RelationsGraph({ relations, nodes }: RelationsGraphProps) {
  const [layoutedNodes, setLayoutedNodes] = useState<Node[]>([]);

  // Collect node keys referenced in relations
  const referencedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rel of relations) {
      ids.add(rel.from);
      ids.add(rel.to);
    }
    return ids;
  }, [relations]);

  // Build raw nodes
  const rawNodes: Node[] = useMemo(() => {
    const nodeMap = new Map(nodes.map((n) => [n.id, n.text]));
    return Array.from(referencedIds).map((id) => ({
      id,
      position: { x: 0, y: 0 },
      data: { label: truncate(nodeMap.get(id) ?? `[${id}]`, 50) },
      style: {
        padding: '8px 12px',
        borderRadius: '8px',
        fontSize: '12px',
        maxWidth: '220px',
        background: 'var(--surface-card)',
        border: '1px solid var(--stroke-divider)',
        color: 'var(--text-secondary)',
      },
    }));
  }, [referencedIds, nodes]);

  // Build edges
  const edges: Edge[] = useMemo(
    () =>
      relations.map((rel, idx) => ({
        id: `${rel.from}-${rel.to}-${rel.type}-${idx}`,
        source: rel.from,
        target: rel.to,
        label: rel.type.replace('_', ' '),
        style: { stroke: edgeColors[rel.type] ?? '#6b7280', strokeWidth: 2 },
        labelStyle: { fontSize: 10, fill: 'var(--text-tertiary)' },
        animated: false,
      })),
    [relations]
  );

  // Apply ELK layout
  const applyLayout = useCallback(async () => {
    if (rawNodes.length === 0) return;
    try {
      const positioned = await getLayoutedElements(rawNodes, edges, {
        direction: 'RIGHT',
        nodeSpacing: 60,
        rankSpacing: 100,
      });
      setLayoutedNodes(positioned);
    } catch {
      // Fallback: simple grid
      setLayoutedNodes(
        rawNodes.map((node, i) => ({
          ...node,
          position: { x: (i % 3) * 260, y: Math.floor(i / 3) * 140 },
        }))
      );
    }
  }, [rawNodes, edges]);

  useEffect(() => {
    applyLayout();
  }, [applyLayout]);

  if (relations.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-[var(--text-tertiary)] text-sm">
        No relations to visualize
      </div>
    );
  }

  if (layoutedNodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-[var(--text-tertiary)] text-sm">
        Computing layout...
      </div>
    );
  }

  return (
    <div className="w-full h-[400px] border border-[var(--stroke-divider)] rounded-md overflow-hidden bg-[var(--surface-app)]">
      <ReactFlow
        nodes={layoutedNodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
