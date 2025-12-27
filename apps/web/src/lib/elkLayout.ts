import type { Edge, Node } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

// Default node dimensions
const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 160;

interface LayoutOptions {
  direction?: 'DOWN' | 'RIGHT' | 'UP' | 'LEFT';
  nodeSpacing?: number;
  rankSpacing?: number;
}

/**
 * Applies ELK layout algorithm to ReactFlow nodes and edges
 * Returns nodes with updated positions
 */
export async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Promise<Node[]> {
  const { direction = 'DOWN', nodeSpacing = 80, rankSpacing = 120 } = options;

  if (nodes.length === 0) {
    return nodes;
  }

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': String(nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(rankSpacing),
      'elk.layered.considerModelOrder': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: node.measured?.width ?? DEFAULT_NODE_WIDTH,
      height: node.measured?.height ?? DEFAULT_NODE_HEIGHT,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layoutedGraph = await elk.layout(graph);

  // Create a map of node positions from ELK layout
  const positionMap = new Map<string, { x: number; y: number }>();
  layoutedGraph.children?.forEach((child) => {
    if (child.x !== undefined && child.y !== undefined) {
      positionMap.set(child.id, { x: child.x, y: child.y });
    }
  });

  // Apply new positions to nodes
  return nodes.map((node) => {
    const position = positionMap.get(node.id);
    if (position) {
      return {
        ...node,
        position,
      };
    }
    return node;
  });
}
