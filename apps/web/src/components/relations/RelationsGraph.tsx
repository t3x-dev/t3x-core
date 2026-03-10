'use client';

import { Background, Controls, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Edge, Node } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SentenceRelation } from '@/lib/api/relations';
import { getLayoutedElements } from '@/lib/elkLayout';

interface RelationsGraphProps {
  relations: SentenceRelation[];
  sentences: Array<{ id: string; text: string }>;
}

const edgeColors: Record<string, string> = {
  supports: '#10b981',
  contrasts: '#ef4444',
  causes: '#3b82f6',
  elaborates: '#6b7280',
  temporal_follows: '#a855f7',
  conditions: '#f97316',
  summarizes: '#06b6d4',
};

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

export function RelationsGraph({ relations, sentences }: RelationsGraphProps) {
  const [layoutedNodes, setLayoutedNodes] = useState<Node[]>([]);

  // Collect sentence IDs referenced in relations
  const referencedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rel of relations) {
      ids.add(rel.source_id);
      ids.add(rel.target_id);
    }
    return ids;
  }, [relations]);

  // Build raw nodes
  const rawNodes: Node[] = useMemo(() => {
    const sentenceMap = new Map(sentences.map((s) => [s.id, s.text]));
    return Array.from(referencedIds).map((id) => ({
      id,
      position: { x: 0, y: 0 },
      data: { label: truncate(sentenceMap.get(id) ?? `[${id}]`, 50) },
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
  }, [referencedIds, sentences]);

  // Build edges
  const edges: Edge[] = useMemo(
    () =>
      relations.map((rel) => ({
        id: rel.id,
        source: rel.source_id,
        target: rel.target_id,
        label: rel.type.replace('_', ' '),
        style: { stroke: edgeColors[rel.type] ?? '#6b7280', strokeWidth: 2 },
        labelStyle: { fontSize: 10, fill: 'var(--text-tertiary)' },
        animated: rel.confidence >= 0.8,
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
