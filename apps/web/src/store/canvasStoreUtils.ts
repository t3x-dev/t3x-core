import type { Edge, Node } from '@xyflow/react';
import * as api from '@/lib/api';
import type { CanvasNodeData, NodeKind } from '../types/nodes';
import type { CanvasState, CommitTone, DraftBranchMode } from './canvasStoreTypes';

// API base URL - shared across store slices
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
export const API_V1 = `${API_BASE}/api/v1`;

const connectionMatrix: Record<NodeKind, NodeKind[]> = {
  unit: ['unit'],
  leaf: [],
};

export const canConnect = (source?: Node<CanvasNodeData>, target?: Node<CanvasNodeData>) => {
  if (!source || !target) {
    return false;
  }
  if (source.id === target.id) {
    return false;
  }

  // Committed units cannot accept new incoming connections
  if (target.data.kind === 'unit' && target.data.commitStatus !== 'staging') {
    return false;
  }

  return connectionMatrix[source.data.kind]?.includes(target.data.kind) ?? false;
};

let nodeCounter = 4;
let edgeCounter = 3;

export const resetCounters = () => {
  nodeCounter = 1;
  edgeCounter = 1;
};

export const getNodeCounter = () => nodeCounter;
export const nextNodeId = () => `node-${nodeCounter++}`;
export const nextEdgeId = () => `edge-${edgeCounter++}`;
export const edgeStyle = { stroke: '#8a8c92', strokeWidth: 3.6 };
export const edgeType: Edge['type'] = 'animated';
export const conversationCommitOffset = 300;
export const commitQuickOffset = conversationCommitOffset + 40;
const reactFlowGridSize = 16;
const conversationNodeHeight = reactFlowGridSize * 8;
const alignToGrid = (value: number) => Math.round(value / reactFlowGridSize) * reactFlowGridSize;
export const snapPosition = (position: { x: number; y: number }) => ({
  x: alignToGrid(position.x),
  y: alignToGrid(position.y),
});

const unitNodeHeight = reactFlowGridSize * 14; // Unit is taller (conversation + commit)

const getNodeHeightForKind = (kind: NodeKind) => {
  if (kind === 'unit') {
    return unitNodeHeight;
  }
  return conversationNodeHeight;
};

export const computeAttachedPosition = (
  source: Node<CanvasNodeData>,
  childKind: NodeKind,
  offsetX: number
) => {
  const sourceHeight = getNodeHeightForKind(source.data.kind);
  const targetHeight = getNodeHeightForKind(childKind);
  const y = source.position.y + (sourceHeight - targetHeight) / 2;
  return snapPosition({
    x: source.position.x + offsetX,
    y,
  });
};

export const getNumericId = (id: string) => {
  const match = /(\d+)$/.exec(id);
  return match ? Number.parseInt(match[1], 10) : 0;
};

export const buildIncomingMap = (edges: Edge[]) => {
  const incoming = new Map<string, string[]>();
  edges.forEach((edge) => {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge.source);
    incoming.set(edge.target, list);
  });
  return incoming;
};

export const buildOutgoingMap = (edges: Edge[]) => {
  const outgoing = new Map<string, string[]>();
  edges.forEach((edge) => {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge.target);
    outgoing.set(edge.source, list);
  });
  return outgoing;
};

export const getLockedNodeIds = (nodes: Node<CanvasNodeData>[], edges: Edge[]) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incomingMap = buildIncomingMap(edges);
  const locked = new Set<string>();

  // Lock committed units and ALL their upstream nodes
  // This prevents deletion of committed units and any nodes that contributed to them
  const committedUnits = nodes.filter(
    (node) => node.data.kind === 'unit' && node.data.commitStatus === 'committed'
  );

  committedUnits.forEach((unit) => {
    // Lock the committed unit itself
    locked.add(unit.id);

    // Lock ALL upstream nodes (committed units, etc.)
    const visited = new Set<string>();
    const stack = [...(incomingMap.get(unit.id) ?? [])];
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const currentNode = nodeMap.get(currentId);
      if (!currentNode) continue;

      // Lock this node (regardless of type - unit, etc.)
      // Only skip staging units as they can be modified/deleted
      if (currentNode.data.kind === 'unit' && currentNode.data.commitStatus === 'staging') {
        // Staging units are NOT locked, but still traverse their upstream
        const parents = incomingMap.get(currentId) ?? [];
        parents.forEach((parentId) => {
          if (!visited.has(parentId)) stack.push(parentId);
        });
      } else {
        // Lock committed units and other node types
        locked.add(currentId);
        // Continue traversing upstream
        const parents = incomingMap.get(currentId) ?? [];
        parents.forEach((parentId) => {
          if (!visited.has(parentId)) stack.push(parentId);
        });
      }
    }
  });

  return locked;
};

// Check if a node is upstream of any staging unit (needs confirmation on delete)
export const isUpstreamOfStagingUnit = (
  nodeId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[]
): boolean => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const outgoingMap = buildOutgoingMap(edges);

  const visited = new Set<string>();
  const stack = [nodeId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentNode = nodeMap.get(currentId);
    if (!currentNode) continue;

    // Found a staging unit downstream
    if (currentNode.data.kind === 'unit' && currentNode.data.commitStatus === 'staging') {
      return true;
    }

    // Continue traversing downstream
    const children = outgoingMap.get(currentId) ?? [];
    children.forEach((childId) => {
      if (!visited.has(childId)) stack.push(childId);
    });
  }

  return false;
};

// Collect all nodes that would be affected by deleting the given nodes
// Returns staging units that would become orphaned
export const collectAffectedStagingUnits = (
  nodeIds: string[],
  nodes: Node<CanvasNodeData>[],
  edges: Edge[]
): string[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const outgoingMap = buildOutgoingMap(edges);
  const toDelete = new Set(nodeIds);
  const affectedStagingUnits: string[] = [];

  // For each node being deleted, find downstream staging units
  nodeIds.forEach((nodeId) => {
    const visited = new Set<string>();
    const stack = [...(outgoingMap.get(nodeId) ?? [])];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (visited.has(currentId) || toDelete.has(currentId)) continue;
      visited.add(currentId);

      const currentNode = nodeMap.get(currentId);
      if (!currentNode) continue;

      if (currentNode.data.kind === 'unit' && currentNode.data.commitStatus === 'staging') {
        if (!affectedStagingUnits.includes(currentId)) {
          affectedStagingUnits.push(currentId);
        }
      }

      const children = outgoingMap.get(currentId) ?? [];
      children.forEach((childId) => {
        if (!visited.has(childId) && !toDelete.has(childId)) stack.push(childId);
      });
    }
  });

  return affectedStagingUnits;
};

const isDescendantOf = (
  nodeId: string,
  ancestorId: string,
  incomingMap: Map<string, string[]>,
  visited = new Set<string>()
): boolean => {
  if (nodeId === ancestorId) {
    return true;
  }
  if (visited.has(nodeId)) {
    return false;
  }
  visited.add(nodeId);
  const sources = incomingMap.get(nodeId) ?? [];
  return sources.some((sourceId) => {
    if (sourceId === ancestorId) {
      return true;
    }
    return isDescendantOf(sourceId, ancestorId, incomingMap, visited);
  });
};

const hasUnitDescendant = (
  nodeId: string,
  nodeMap: Map<string, Node<CanvasNodeData>>,
  outgoingMap: Map<string, string[]>,
  visited = new Set<string>()
): boolean => {
  if (visited.has(nodeId)) {
    return false;
  }
  visited.add(nodeId);
  const targets = outgoingMap.get(nodeId) ?? [];
  for (const targetId of targets) {
    const targetNode = nodeMap.get(targetId);
    if (!targetNode) {
      continue;
    }
    if (targetNode.data.kind === 'unit') {
      return true;
    }
    if (hasUnitDescendant(targetId, nodeMap, outgoingMap, visited)) {
      return true;
    }
  }
  return false;
};

// Compare timestamps (ISO strings) - returns true if a is newer than b
const isNewerTimestamp = (a: string | undefined, b: string | undefined): boolean => {
  if (!a) return false;
  if (!b) return true;
  return new Date(a).getTime() > new Date(b).getTime();
};

export const resolveLatestMainUnitId = (
  nodes: Node<CanvasNodeData>[],
  preferredId?: string
): string | undefined => {
  if (
    preferredId &&
    nodes.some(
      (node) =>
        node.id === preferredId && node.data.kind === 'unit' && node.data.branchType === 'main'
    )
  ) {
    return preferredId;
  }
  const mainUnits = nodes.filter(
    (node) => node.data.kind === 'unit' && node.data.branchType === 'main'
  );
  if (mainUnits.length === 0) {
    return undefined;
  }
  // Use timestamp (created_at) to determine latest unit, fallback to numeric ID comparison
  return mainUnits.reduce((latest, node) => {
    // First try comparing by timestamp
    if (isNewerTimestamp(node.data.timestamp, latest.data.timestamp)) {
      return node;
    }
    if (isNewerTimestamp(latest.data.timestamp, node.data.timestamp)) {
      return latest;
    }
    // Fallback to numeric ID comparison (for staging units without proper timestamps)
    return getNumericId(node.id) > getNumericId(latest.id) ? node : latest;
  }).id;
};

export const computeUnitTone = (
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  latestMainUnitId?: string,
  unitId?: string
): CommitTone => {
  if (!unitId) {
    return 'branch-history';
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const unitNode = nodeMap.get(unitId);
  if (!unitNode || unitNode.data.kind !== 'unit') {
    return 'branch-history';
  }
  const outgoingMap = buildOutgoingMap(edges);
  const descendantCache = new Map<string, boolean>();
  const ensureHasDescendant = (nodeId: string) => {
    if (descendantCache.has(nodeId)) {
      return descendantCache.get(nodeId)!;
    }
    const result = hasUnitDescendant(nodeId, nodeMap, outgoingMap);
    descendantCache.set(nodeId, result);
    return result;
  };
  if (unitNode.data.branchType === 'main') {
    const latest = resolveLatestMainUnitId(nodes, latestMainUnitId);
    return unitId === latest ? 'main-latest' : 'main-history';
  }
  if (unitNode.data.branchType === 'branch') {
    const branchKey = unitNode.data.branchName?.toLowerCase() ?? 'branch';
    const branchUnits = nodes.filter(
      (node) =>
        node.data.kind === 'unit' &&
        node.data.branchType === 'branch' &&
        (node.data.branchName?.toLowerCase() ?? 'branch') === branchKey
    );
    const activeCandidates = branchUnits.filter((node) => !ensureHasDescendant(node.id));
    const activeUnit =
      activeCandidates.length > 0
        ? activeCandidates.reduce((latest, node) => {
            // Use timestamp to determine latest unit
            if (isNewerTimestamp(node.data.timestamp, latest.data.timestamp)) {
              return node;
            }
            if (isNewerTimestamp(latest.data.timestamp, node.data.timestamp)) {
              return latest;
            }
            // Fallback to numeric ID comparison
            return getNumericId(node.id) > getNumericId(latest.id) ? node : latest;
          })
        : undefined;
    if (!activeUnit) {
      return 'branch-history';
    }
    return activeUnit.id === unitId ? 'branch-latest' : 'branch-history';
  }
  return 'branch-history';
};

const hasPrimaryAncestor = (
  nodeId: string,
  nodeMap: Map<string, Node<CanvasNodeData>>,
  incomingMap: Map<string, string[]>,
  visited = new Set<string>()
): boolean => {
  if (visited.has(nodeId)) {
    return false;
  }
  visited.add(nodeId);
  const node = nodeMap.get(nodeId);
  if (!node) {
    return false;
  }
  if (node.data.kind === 'unit') {
    return node.data.branchType === 'main' || node.data.branchType === 'branch';
  }
  const sources = incomingMap.get(nodeId);
  if (!sources || sources.length === 0) {
    return false;
  }
  return sources.some((sourceId) => hasPrimaryAncestor(sourceId, nodeMap, incomingMap, visited));
};

export const determineStagingUnitBranchMode = (
  state: CanvasState,
  unitId: string
): DraftBranchMode => {
  if (!state.hasMainCommit) {
    return 'force-main';
  }
  const nodeMap = new Map(state.nodes.map((node) => [node.id, node]));
  const incomingMap = buildIncomingMap(state.edges);
  const latestMainId = resolveLatestMainUnitId(state.nodes, state.latestMainCommitId);
  const attachedToLatestMain =
    latestMainId !== undefined && isDescendantOf(unitId, latestMainId, incomingMap);
  if (attachedToLatestMain) {
    return 'select';
  }
  return hasPrimaryAncestor(unitId, nodeMap, incomingMap) ? 'branch-only' : 'blocked';
};

// Check if a committed unit can create a new staging unit
export const canCreateStagingUnitFromUnit = (
  sourceUnitId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  hasMainCommit: boolean
): boolean => {
  if (!hasMainCommit) {
    return true;
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incomingMap = buildIncomingMap(edges);
  return hasPrimaryAncestor(sourceUnitId, nodeMap, incomingMap);
};

// Layout constants for API data
const LAYOUT = {
  CONVERSATION_START_X: 120,
  CONVERSATION_START_Y: 120,
  CONVERSATION_SPACING_Y: 200,
  COMMIT_OFFSET_X: 400,
  COMMIT_SPACING_Y: 150,
};

// Debounced position save - collect position changes and save after 500ms of no changes
const positionSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingPositionSaves = new Map<
  string,
  { kind: NodeKind; position: { x: number; y: number } }
>();

export function saveNodePosition(
  nodeId: string,
  kind: NodeKind,
  position: { x: number; y: number }
) {
  // Cancel existing timer for this node
  const existingTimer = positionSaveTimers.get(nodeId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Store the pending position
  pendingPositionSaves.set(nodeId, { kind, position });

  // Set a new timer
  const timer = setTimeout(() => {
    const pending = pendingPositionSaves.get(nodeId);
    if (!pending) return;

    pendingPositionSaves.delete(nodeId);
    positionSaveTimers.delete(nodeId);

    // Call appropriate API based on node kind
    // For unit nodes, determine if staging (conversationId) or committed (commit hash)
    if (pending.kind === 'unit') {
      // Staging units have conversationId as nodeId (e.g., conv_xxx)
      // Committed units have commit hash as nodeId (e.g., sha256:xxx)
      const isStagingUnit = nodeId.startsWith('conv_');

      if (isStagingUnit) {
        // Save position to conversation
        api
          .updateConversation(nodeId, {
            position_x: pending.position.x,
            position_y: pending.position.y,
          })
          .catch(() => {
            // Error handled silently
          });
      } else {
        // Committed unit - save position to commit via API
        api.updateCommitV4Position(nodeId, pending.position.x, pending.position.y).catch(() => {
          // Error handled silently
        });
      }
    }
  }, 500);

  positionSaveTimers.set(nodeId, timer);
}

// Convert API Conversation + Commit pair to Unit Canvas Node
export const unitToNode = (
  conv: api.Conversation,
  commit: api.Commit | null, // null for staging units (no commit yet)
  index: number,
  originalV4?: api.CommitV4 // Original V4 data for source context display
): Node<CanvasNodeData> => {
  // Use saved position from commit if available, otherwise from conversation, otherwise calculate
  const position =
    commit?.position_x != null && commit?.position_y != null
      ? { x: commit.position_x, y: commit.position_y }
      : conv.position_x != null && conv.position_y != null
        ? { x: conv.position_x, y: conv.position_y }
        : {
            x: LAYOUT.CONVERSATION_START_X,
            y: LAYOUT.CONVERSATION_START_Y + index * LAYOUT.CONVERSATION_SPACING_Y,
          };

  const facetCount = commit?.facet_snapshot?.length || 0;
  const isCommitted = commit !== null;

  return {
    id: commit?.commit_hash || conv.conversation_id, // Use commit hash as ID if committed
    type: 'unit',
    position: snapPosition(position),
    data: {
      entryId: commit
        ? commit.commit_hash.slice(0, 12)
        : conv.conversation_id.replace(/^(conv_|orphan-)/, '').slice(0, 8),
      // Priority: commit.message (committed) > conv.title > fallback
      title: (isCommitted && commit?.message) || conv.title || 'Untitled Unit',
      summary: isCommitted
        ? facetCount > 0
          ? `${facetCount} facets`
          : 'No facets'
        : `${conv.turns_count || 0} turns`,
      status: isCommitted ? 'committed' : 'staging',
      timestamp: commit?.created_at || conv.created_at,
      tags: ['unit'],
      kind: 'unit',
      // Sources section - conversation as primary source
      sources: [
        {
          id: conv.conversation_id,
          type: 'conversation' as const,
          label: `conv#${conv.conversation_id.replace(/^(conv_|orphan-)/, '').slice(0, 4)}`,
          title: conv.title || 'Conversation',
        },
      ],
      // Conversation data
      conversationId: conv.conversation_id,
      // Commit data
      commitStatus: isCommitted ? 'committed' : 'staging',
      commitHash: commit?.commit_hash,
      branchType: commit ? (commit.branch === 'main' ? 'main' : 'branch') : undefined,
      branchName: commit && commit.branch !== 'main' ? commit.branch : undefined,
      // User selections from committed commit
      sourceExcerpt: commit?.source_excerpt ?? undefined,
      mustHave: commit?.must_have ?? undefined,
      mustntHave: commit?.mustnt_have ?? undefined,
      // Facet snapshot for display
      facetSnapshot: commit?.facet_snapshot ?? undefined,
      // Turn window for creating child commits
      sourceTurnWindow: commit?.turn_window ?? undefined,
      // v1.1: Confirmed anchors (convert snake_case API format to camelCase)
      anchors: commit?.anchors
        ? (api.parseApiCommitAnchors(commit.anchors) ?? undefined)
        : undefined,
      // V4 commit data for source context display
      commitV4: originalV4
        ? {
            hash: originalV4.hash,
            schema: 't3x/commit/v4' as const,
            author: {
              type: originalV4.author.type,
              name: originalV4.author.name,
              id: originalV4.author.id,
            },
            committed_at: originalV4.committed_at,
            content: {
              sentences: originalV4.content.sentences.map((s) => ({
                id: s.id,
                text: s.text,
                source_ref: s.source_ref,
              })),
            },
            message: originalV4.message ?? undefined,
            branch: originalV4.branch ?? undefined,
          }
        : undefined,
    },
  };
};
