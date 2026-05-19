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

    // Directed (source→target) adjacency for branch/main BFS — ensures traversal
    // only follows edges in commit order and does not traverse upstream
    const forwardAdj = new Map<string, Set<string>>();
    // Undirected adjacency for 1-hop node highlighting
    const undirectedAdj = new Map<string, Set<string>>();
    for (const edge of edges) {
      const fwd = forwardAdj.get(edge.source) ?? new Set<string>();
      fwd.add(edge.target);
      forwardAdj.set(edge.source, fwd);

      const out = undirectedAdj.get(edge.source) ?? new Set<string>();
      out.add(edge.target);
      undirectedAdj.set(edge.source, out);

      const inbound = undirectedAdj.get(edge.target) ?? new Set<string>();
      inbound.add(edge.source);
      undirectedAdj.set(edge.target, inbound);
    }

    // Node-click highlighting: 1-hop neighbors only (undirected — includes both parents and children)
    if (highlight.mode === 'node') {
      const { nodeId } = highlight;
      const connected = new Set<string>([nodeId]);
      const neighbors = undirectedAdj.get(nodeId);
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
      // Use directed forward adjacency: branch BFS only traverses parent→child direction
      const neighbors = forwardAdj.get(current);
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

  const highlightTone = highlight?.mode === 'branch' ? 'branch' : 'commit';

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
    if (!highlight) {
      return edges;
    }
    const hasHighlightedEdges = highlightSets.edges.size > 0;
    return edges.map((edge) => {
      if (highlightSets.edges.has(edge.id)) {
        return {
          ...edge,
          data: {
            ...edge.data,
            edgePathTone: highlightTone,
            edgeRhythm: 'selected',
          },
        };
      }
      // Dim non-highlighted edges when a highlight is active
      if (hasHighlightedEdges) {
        return {
          ...edge,
          data: {
            ...edge.data,
            edgePathTone: highlightTone,
            edgeRhythm: 'dimmed',
          },
        };
      }
      return edge;
    });
  }, [edges, highlight, highlightSets.edges, highlightTone]);

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
