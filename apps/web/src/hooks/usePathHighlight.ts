'use client';

import type { Edge, Node } from '@xyflow/react';
import { useMemo, useState } from 'react';
import type { CanvasNodeData } from '@/types/nodes';

export type PathHighlight =
  | { mode: 'main' }
  | { mode: 'branch'; branch?: string }
  | { mode: 'node'; nodeId: string }
  | null;

function matchesHighlightCommit(node: Node<CanvasNodeData>, mode: PathHighlight) {
  if (!mode || node.data.kind !== 'unit') {
    return false;
  }
  if (mode.mode === 'main') {
    return node.data.branchType === 'main';
  }
  if (mode.mode === 'branch') {
    if (node.data.branchType !== 'branch') {
      return false;
    }
    if (!mode.branch) {
      return true;
    }
    return (node.data.branchName ?? '').toLowerCase() === mode.branch.toLowerCase();
  }
  return false;
}

interface UsePathHighlightOptions {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
}

export function usePathHighlight({ nodes, edges }: UsePathHighlightOptions) {
  const [highlight, setHighlight] = useState<PathHighlight>(null);

  const highlightSets = useMemo(() => {
    if (!highlight) {
      return {
        nodes: new Set<string>(),
        edges: new Set<string>(),
      };
    }

    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
      const out = adjacency.get(edge.source) ?? new Set<string>();
      out.add(edge.target);
      adjacency.set(edge.source, out);

      const inbound = adjacency.get(edge.target) ?? new Set<string>();
      inbound.add(edge.source);
      adjacency.set(edge.target, inbound);
    }

    // Node-click highlighting: 1-hop neighbors only
    if (highlight.mode === 'node') {
      const { nodeId } = highlight;
      const connected = new Set<string>([nodeId]);
      const neighbors = adjacency.get(nodeId);
      if (neighbors) {
        for (const id of neighbors) {
          connected.add(id);
        }
      }

      const connectedEdges = new Set<string>();
      for (const edge of edges) {
        if (edge.source === nodeId || edge.target === nodeId) {
          connectedEdges.add(edge.id);
        }
      }

      return { nodes: connected, edges: connectedEdges };
    }

    // Branch/main highlighting: BFS traversal
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    const startNodes = nodes
      .filter((node) => matchesHighlightCommit(node, highlight))
      .map((node) => node.id);

    if (startNodes.length === 0) {
      return {
        nodes: new Set<string>(),
        edges: new Set<string>(),
      };
    }

    const visited = new Set<string>(startNodes);
    const commitStarts = new Set(startNodes);
    const queue = [...startNodes];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current);
      if (!neighbors) {
        continue;
      }
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) {
          continue;
        }
        const neighborNode = nodeMap.get(neighborId);
        if (!neighborNode) {
          continue;
        }
        if (neighborNode.data.kind === 'unit' && !matchesHighlightCommit(neighborNode, highlight)) {
          continue;
        }
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    const highlightedEdges = new Set<string>();
    for (const edge of edges) {
      const bothVisited = visited.has(edge.source) && visited.has(edge.target);
      if (bothVisited) {
        highlightedEdges.add(edge.id);
        continue;
      }
      if (
        highlight.mode !== 'main' &&
        (commitStarts.has(edge.source) || commitStarts.has(edge.target))
      ) {
        highlightedEdges.add(edge.id);
      }
    }

    return {
      nodes: visited,
      edges: highlightedEdges,
    };
  }, [nodes, edges, highlight]);

  // Semantic highlight colors - Blue for main/node (committed), Orange for branch (pending)
  const highlightColor = !highlight
    ? undefined
    : highlight.mode === 'main' || highlight.mode === 'node'
      ? '#2563eb'
      : highlight.mode === 'branch'
        ? '#f97316'
        : undefined;

  const nodesForRender = useMemo(() => {
    if (!highlight) {
      return nodes;
    }

    const hasHighlightedNodes = highlightSets.nodes.size > 0;

    return nodes.map((node) => {
      const isHighlighted = highlightSets.nodes.has(node.id);
      if (isHighlighted) {
        return {
          ...node,
          data: {
            ...node.data,
            highlightMode: highlight.mode,
            dimmed: false,
          },
        };
      }
      // Dim non-highlighted nodes when a highlight is active
      if (hasHighlightedNodes) {
        return {
          ...node,
          data: {
            ...node.data,
            highlightMode: undefined,
            dimmed: true,
          },
        };
      }
      return node;
    });
  }, [nodes, highlight, highlightSets.nodes]);

  const edgesForRender = useMemo(() => {
    if (!highlight || !highlightColor) {
      return edges;
    }
    const hasHighlightedEdges = highlightSets.edges.size > 0;
    return edges.map((edge) => {
      if (highlightSets.edges.has(edge.id)) {
        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: highlightColor,
            strokeWidth: 4.5,
          },
        };
      }
      // Dim non-highlighted edges when a highlight is active
      if (hasHighlightedEdges) {
        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: 0.2,
          },
        };
      }
      return edge;
    });
  }, [edges, highlight, highlightSets.edges, highlightColor]);

  const toggleHighlight = (mode: PathHighlight) => {
    setHighlight((current) => {
      if (!mode) {
        return null;
      }
      if (!current) {
        return mode;
      }
      if (current.mode === mode.mode) {
        if (current.mode === 'branch' && mode.mode === 'branch') {
          const prevBranch = current.branch ?? 'all';
          const nextBranch = mode.branch ?? 'all';
          if (prevBranch === nextBranch) {
            return null;
          }
        } else {
          return null;
        }
      }
      return mode;
    });
  };

  const hasMainCommits = nodes.some(
    (node) => node.data.kind === 'unit' && node.data.branchType === 'main'
  );
  const hasBranchCommits = nodes.some(
    (node) => node.data.kind === 'unit' && node.data.branchType === 'branch'
  );

  return {
    highlight,
    setHighlight,
    toggleHighlight,
    nodesForRender,
    edgesForRender,
    hasMainCommits,
    hasBranchCommits,
  };
}
