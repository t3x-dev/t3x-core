import type { FrameRelationType, SemanticContent, SlotValue } from '@t3x/core';
import type { Edge, Node } from '@xyflow/react';

// ── Exported Types ──

export type ZoomLevel = 'overview' | 'expand' | 'full';

export interface FrameNodeData {
  frameType: string;
  slots: Record<string, SlotValue>;
  source?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface RelationEdgeData {
  relationType: FrameRelationType;
  [key: string]: unknown;
}

// ── Relation Styles ──

export const RELATION_STYLES: Record<
  FrameRelationType,
  { color: string; label: string; strokeDasharray?: string }
> = {
  causes: { color: '#f97316', label: 'causes' },
  conditions: { color: '#eab308', strokeDasharray: '8 4', label: 'conditions' },
  contrasts: { color: '#ef4444', label: 'contrasts' },
  elaborates: { color: '#3b82f6', label: 'elaborates' },
  follows: { color: '#9ca3af', label: 'follows' },
  depends: { color: '#a855f7', strokeDasharray: '4 4', label: 'depends' },
};

// ── semanticToFlowElements ──

export function semanticToFlowElements(content: SemanticContent): {
  nodes: Node<FrameNodeData>[];
  edges: Edge<RelationEdgeData>[];
} {
  const nodes: Node<FrameNodeData>[] = content.frames.map((frame) => ({
    id: frame.id,
    type: 'frameNode',
    position: { x: 0, y: 0 },
    data: {
      frameType: frame.type,
      slots: frame.slots,
      source: frame.source,
      confidence: frame.confidence,
    },
  }));

  const frameIds = new Set(content.frames.map((f) => f.id));
  const edges: Edge<RelationEdgeData>[] = content.relations
    .filter((rel) => frameIds.has(rel.from) && frameIds.has(rel.to))
    .map((rel) => ({
      id: `${rel.from}-${rel.to}-${rel.type}`,
      source: rel.from,
      target: rel.to,
      type: 'relationEdge',
      data: { relationType: rel.type },
    }));

  return { nodes, edges };
}

// ── filterByZoomLevel ──

/**
 * Determines which frames are "trunk" nodes (visible in overview).
 * A frame is hidden in overview if:
 *   1. ALL its incoming relations are 'elaborates'
 *   2. It has NO outgoing non-elaborates relations
 */
function getTrunkFrameIds(content: SemanticContent): Set<string> {
  const frameIds = new Set(content.frames.map((f) => f.id));
  const hidden = new Set<string>();

  for (const frame of content.frames) {
    const incoming = content.relations.filter((r) => r.to === frame.id);
    const outgoing = content.relations.filter((r) => r.from === frame.id);

    // No incoming relations → trunk (root node)
    if (incoming.length === 0) continue;

    const allIncomingElaborates = incoming.every((r) => r.type === 'elaborates');
    const hasOutgoingNonElaborates = outgoing.some((r) => r.type !== 'elaborates');

    if (allIncomingElaborates && !hasOutgoingNonElaborates) {
      hidden.add(frame.id);
    }
  }

  // Return visible (trunk) ids
  const trunk = new Set<string>();
  for (const id of frameIds) {
    if (!hidden.has(id)) trunk.add(id);
  }
  return trunk;
}

function filterContent(content: SemanticContent, visibleIds: Set<string>): SemanticContent {
  return {
    frames: content.frames.filter((f) => visibleIds.has(f.id)),
    relations: content.relations.filter((r) => visibleIds.has(r.from) && visibleIds.has(r.to)),
  };
}

export function filterByZoomLevel(
  content: SemanticContent,
  level: ZoomLevel,
  expandedNodeId?: string
): SemanticContent {
  if (level === 'full') {
    return content;
  }

  const trunkIds = getTrunkFrameIds(content);

  if (level === 'overview' || (level === 'expand' && !expandedNodeId)) {
    return filterContent(content, trunkIds);
  }

  // level === 'expand' with expandedNodeId
  // Show trunk + elaborates children of the expanded node
  const visible = new Set(trunkIds);
  for (const rel of content.relations) {
    if (rel.type === 'elaborates' && rel.from === expandedNodeId) {
      visible.add(rel.to);
    }
  }
  return filterContent(content, visible);
}
