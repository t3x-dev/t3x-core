import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import { applyEdgeChanges, applyNodeChanges, MarkerType } from '@xyflow/react';
import { create } from 'zustand';
import * as api from '@/lib/api';
import type {
  BranchType,
  CanvasNodeData,
  ConversationConstraints,
  DraftConstraintOverrides,
  LeafType,
  NodeKind,
  SourceTextBlock,
  TurnBoundary,
} from '../types/nodes';
import type { MergeState, CommitV3 } from '../types/merge';
import { tokenizeText } from '../utils/tokenizer';

// API base URL - uses standalone API server if configured
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const API_V1 = `${API_BASE}/api/v1`;

type DraftBranchMode = 'force-main' | 'select' | 'branch-only' | 'blocked';
type CommitTone = 'main-latest' | 'main-history' | 'branch-latest' | 'branch-history';

// Callback type for notifications
type NotifyCallback = (message: string, type: 'success' | 'error' | 'warning') => void;

// Deletion confirmation state
type DeletionConfirmation = {
  nodeIds: string[];
  edgeIds: string[];
  message: string;
  onConfirm: () => void;
} | null;

type CanvasState = {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  hasMainCommit: boolean;
  latestMainCommitId?: string;
  // Project data loading state
  projectId: string | null;
  loading: boolean;
  loadError: Error | null;
  // Notification callback
  notifyCallback: NotifyCallback | null;
  setNotifyCallback: (cb: NotifyCallback | null) => void;
  // Leaf panel state
  leafPanelOpen: boolean;
  leafPanelCommitId?: string;
  // Node modal state
  openNodeId: string | null;
  modalViewMode: 'conversation' | 'commit' | null;
  openNodeModal: (nodeId: string, viewMode?: 'conversation' | 'commit') => void;
  closeNodeModal: () => void;
  // Merge state (当前合并操作状态，如果有的话)
  mergeState: MergeState | null;
  mergeLoading: boolean;
  mergeError: string | null;
  // Data loading
  loadProjectData: (projectId: string) => Promise<void>;
  clearCanvas: () => void;
  // Deletion confirmation state
  deletionConfirmation: DeletionConfirmation;
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => Promise<void>;
  updateNode: (id: string, patch: Partial<CanvasNodeData>) => void;
  commitPendingCommit: (id: string) => void;
  addPendingCommitFromConversation: (conversationId: string) => Promise<void>;
  addConversationFromCommit: (commitId: string) => Promise<void>;
  addPendingCommitFromCommit: (commitId: string) => void;
  addUnitFromUnit: (unitId: string) => void;
  createMergePendingCommit: (commitId: string) => Promise<string | null>;
  getPendingCommitBranchMode: (commitId: string) => DraftBranchMode;
  canCreatePendingCommitFromConversation: (conversationId: string) => boolean;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  getCommitTone: (commitId: string) => CommitTone;
  resetToSingleConversation: () => void;
  loadDemoData: () => void;
  // Conversation constraints management
  saveConversationConstraints: (
    conversationId: string,
    constraints: ConversationConstraints
  ) => void;
  getConversationConstraints: (conversationId: string) => ConversationConstraints | undefined;
  // Pending commit constraint overrides
  updatePendingCommitConstraintOverrides: (
    commitId: string,
    overrides: Partial<DraftConstraintOverrides>
  ) => void;
  getPendingCommitEffectiveConstraints: (
    commitId: string
  ) =>
    | { clauses: ConversationConstraints['clauses']; must_have: string[]; mustnt_have: string[] }
    | undefined;
  // Get source conversation for a pending commit
  getSourceConversationForPendingCommit: (commitId: string) => Node<CanvasNodeData> | undefined;
  // Check if a conversation has any downstream pending commits (for locking)
  hasDownstreamPendingCommits: (conversationId: string) => boolean;
  // Leaf panel methods
  openLeafPanel: (commitId: string) => void;
  closeLeafPanel: () => void;
  addLeafNode: (leafType: LeafType) => Promise<void>;
  // Deletion confirmation methods
  confirmDeletion: () => void;
  cancelDeletion: () => void;
  // Update node ID (for syncing local pending commit with API commit_hash)
  updateNodeId: (oldId: string, newId: string) => void;
  // Get direct upstream source nodes (conversations and committed commits) for a pending commit
  getUpstreamSourceNodes: (nodeId: string) => Node<CanvasNodeData>[];
  // Merge operations (合并操作)
  startMerge: (sourceHash: string, targetHash: string) => Promise<void>;
  resolveSimilarPair: (index: number, pick: 'source' | 'target') => void;
  toggleKeep: (side: 'source' | 'target', index: number) => void;
  executeMerge: (message: string) => Promise<CommitV3>;
  cancelMerge: () => void;
  clearMergeError: () => void;
};

const connectionMatrix: Record<NodeKind, NodeKind[]> = {
  unit: ['unit', 'leaf'],
  leaf: [],
};

const canConnect = (source?: Node<CanvasNodeData>, target?: Node<CanvasNodeData>) => {
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

const nextNodeId = () => `node-${nodeCounter++}`;
const nextEdgeId = () => `edge-${edgeCounter++}`;
const edgeStyle = { stroke: '#8a8c92', strokeWidth: 3.6 };
const edgeType: Edge['type'] = 'smoothstep';
const conversationCommitOffset = 300;
const commitQuickOffset = conversationCommitOffset + 40;
const reactFlowGridSize = 16;
const conversationNodeHeight = reactFlowGridSize * 8;
const _commitNodeHeight = reactFlowGridSize * 10;
const alignToGrid = (value: number) => Math.round(value / reactFlowGridSize) * reactFlowGridSize;
const snapPosition = (position: { x: number; y: number }) => ({
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

const computeAttachedPosition = (
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

const getNumericId = (id: string) => {
  const match = /(\d+)$/.exec(id);
  return match ? Number.parseInt(match[1], 10) : 0;
};

const buildIncomingMap = (edges: Edge[]) => {
  const incoming = new Map<string, string[]>();
  edges.forEach((edge) => {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge.source);
    incoming.set(edge.target, list);
  });
  return incoming;
};

const buildOutgoingMap = (edges: Edge[]) => {
  const outgoing = new Map<string, string[]>();
  edges.forEach((edge) => {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge.target);
    outgoing.set(edge.source, list);
  });
  return outgoing;
};

const getLockedNodeIds = (nodes: Node<CanvasNodeData>[], edges: Edge[]) => {
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
const isUpstreamOfStagingUnit = (
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
const collectAffectedStagingUnits = (
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

const findNearestMainAncestorUnit = (
  unitId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[]
): Node<CanvasNodeData> | undefined => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incomingMap = buildIncomingMap(edges);
  const visited = new Set<string>();
  const queue = [...(incomingMap.get(unitId) ?? [])];
  let latestMain: Node<CanvasNodeData> | undefined;
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    const node = nodeMap.get(currentId);
    if (node && node.data.kind === 'unit' && node.data.branchType === 'main') {
      if (!latestMain || getNumericId(node.id) > getNumericId(latestMain.id)) {
        latestMain = node;
      }
    }
    const parents = incomingMap.get(currentId) ?? [];
    parents.forEach((parentId) => {
      if (!visited.has(parentId)) {
        queue.push(parentId);
      }
    });
  }
  return latestMain;
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

const resolveLatestMainUnitId = (
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

const _buildSeedUnitNode = (): Node<CanvasNodeData> => {
  const id = nextNodeId();
  return {
    id,
    type: 'unit',
    position: snapPosition({ x: 120, y: 120 }),
    data: {
      entryId: `UNIT-${getNumericId(id)}`,
      title: 'New Unit',
      summary: 'Start capturing context for this workflow.',
      status: 'raw-input',
      timestamp: 'just now',
      tags: ['unit'],
      kind: 'unit',
      commitStatus: 'staging',
    },
  };
};

const computeUnitTone = (
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

const determineStagingUnitBranchMode = (state: CanvasState, unitId: string): DraftBranchMode => {
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
const canCreateStagingUnitFromUnit = (
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

function saveNodePosition(nodeId: string, kind: NodeKind, position: { x: number; y: number }) {
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
          .catch((err) => {
            console.warn('Failed to save staging unit position:', err);
          });
      }
      // Note: Committed unit position saving is disabled for now
      // The commit position API endpoint doesn't exist yet
      // Position is saved during commit creation instead
    }
  }, 500);

  positionSaveTimers.set(nodeId, timer);
}

// Convert API Conversation + Commit pair to Unit Canvas Node
const unitToNode = (
  conv: api.Conversation,
  commit: api.Commit | null, // null for staging units (no commit yet)
  index: number
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
      entryId: commit ? commit.commit_hash.slice(0, 12) : conv.conversation_id.slice(0, 8),
      title: conv.title || 'Untitled',
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
      sources: [{
        id: conv.conversation_id,
        type: 'conversation' as const,
        label: `conv#${conv.conversation_id.slice(0, 4)}`,
        title: conv.title || 'Conversation',
      }],
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
      anchors: commit?.anchors ? api.parseApiCommitAnchors(commit.anchors) ?? undefined : undefined,
    },
  };
};

const leafNodeHeight = reactFlowGridSize * 5;
const leafNodeOffset = 80;

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  hasMainCommit: false,
  latestMainCommitId: undefined,
  projectId: null,
  loading: false,
  loadError: null,
  notifyCallback: null,
  leafPanelOpen: false,
  leafPanelCommitId: undefined,
  openNodeId: null,
  modalViewMode: null,
  deletionConfirmation: null,
  mergeState: null,
  mergeLoading: false,
  mergeError: null,

  setNotifyCallback: (cb) => set({ notifyCallback: cb }),

  openNodeModal: (nodeId, viewMode = 'commit') => set({ openNodeId: nodeId, modalViewMode: viewMode }),
  closeNodeModal: () => set({ openNodeId: null, modalViewMode: null }),

  loadProjectData: async (projectId: string) => {
    // Skip if already loading the same project
    const state = get();
    if (state.projectId === projectId && state.loading) {
      return;
    }

    set({ loading: true, loadError: null, projectId });

    try {
      // Fetch conversations, V3 commits, and V4 commits in parallel
      const [convResponse, commitV3Response, commitV4List] = await Promise.all([
        api.listConversations(projectId, 100, 0),
        api.listCommitsV3(projectId, undefined, 100, 0),
        api.listCommitsV4(projectId, undefined, 100, 0).catch(() => [] as api.CommitV4[]), // Graceful fallback if V4 not available
      ]);

      const conversations = convResponse.conversations;

      // Convert V3 commits to V2-compatible format for unitToNode
      const v3Commits: api.Commit[] = commitV3Response.commits.map((v3) => ({
        commit_hash: v3.hash,
        project_id: v3.project_id || projectId,
        branch: v3.branch || 'main',
        message: v3.message,
        parent_hashes: v3.parents,
        // V3: derive turn_window from sentences[].source for conversation association
        turn_window: v3.content.sentences[0]?.source ? {
          start_turn_hash: v3.content.sentences[0].source.turn_hash,
          end_turn_hash: v3.content.sentences[v3.content.sentences.length - 1]?.source?.turn_hash || v3.content.sentences[0].source.turn_hash,
        } : null,
        facet_snapshot: null, // V3 uses sentences/constraints instead
        pipeline_config: null,
        draft_id: null,
        draft_text_hash: null,
        signature: null,
        source_excerpt: v3.content.sentences.map((s) => s.text), // Convert sentences to source_excerpt
        must_have: v3.content.constraints?.filter((c) => c.type === 'require').map((c) => c.value) || null,
        mustnt_have: v3.content.constraints?.filter((c) => c.type === 'exclude').map((c) => c.value) || null,
        position_x: v3.position?.x ?? null,
        position_y: v3.position?.y ?? null,
        source_refs: null,
        anchors: null,
        created_at: v3.created_at,
        // Store original V3 data for merge compatibility
        sourceTurnWindow: v3.content.sentences[0]?.source ? {
          start_turn_hash: v3.content.sentences[0].source.turn_hash,
          end_turn_hash: v3.content.sentences[v3.content.sentences.length - 1]?.source.turn_hash || v3.content.sentences[0].source.turn_hash,
        } : undefined,
      } as api.Commit));

      // Convert V4 commits to V2-compatible format for unitToNode
      const v4Commits: api.Commit[] = commitV4List.map((v4) => ({
        commit_hash: v4.hash,
        project_id: v4.project_id || projectId,
        branch: v4.branch || 'main',
        message: v4.message,
        parent_hashes: v4.parents,
        // V4: derive turn_window from source_ref if available
        turn_window: v4.content.sentences[0]?.source_ref ? {
          start_turn_hash: v4.content.sentences[0].source_ref.turn_hash,
          end_turn_hash: v4.content.sentences[v4.content.sentences.length - 1]?.source_ref?.turn_hash || v4.content.sentences[0].source_ref.turn_hash,
        } : null,
        facet_snapshot: null,
        pipeline_config: null,
        draft_id: null,
        draft_text_hash: null,
        signature: null,
        source_excerpt: v4.content.sentences.map((s) => s.text),
        must_have: null, // V4 commits don't have constraints (they're in Leaf)
        mustnt_have: null,
        position_x: v4.position_x ?? null,
        position_y: v4.position_y ?? null,
        source_refs: v4.source_refs?.map(ref => ({
          type: ref.type,
          conversation_id: ref.type === 'conversation' ? ref.id : undefined,
          commit_hash: ref.type === 'leaf' ? ref.id : undefined,
        })) ?? null,
        anchors: null,
        created_at: v4.created_at,
        // Store V4 marker
        isV4: true,
      } as api.Commit));

      // Combine V3 and V4 commits, avoiding duplicates by hash
      const seenHashes = new Set<string>();
      const commits: api.Commit[] = [];

      // Add V4 commits first (newer format takes priority)
      for (const commit of v4Commits) {
        if (!seenHashes.has(commit.commit_hash)) {
          seenHashes.add(commit.commit_hash);
          commits.push(commit);
        }
      }

      // Add V3 commits that aren't already in V4
      for (const commit of v3Commits) {
        if (!seenHashes.has(commit.commit_hash)) {
          seenHashes.add(commit.commit_hash);
          commits.push(commit);
        }
      }

      // Preserve existing node positions
      const existingNodePositions = new Map<string, { x: number; y: number }>();
      get().nodes.forEach((node) => {
        existingNodePositions.set(node.id, node.position);
      });

      // Build turn_hash → conversation_id map
      // Optimization: Only fetch turns for commits that have turn_window
      // Instead of fetching all turns for all conversations
      const turnToConvMap = new Map<string, string>();

      // Collect unique turn hashes we need to look up (both start and end)
      // Filter out undefined, null, empty strings, and the literal string "undefined"
      const turnHashesToLookup = new Set<string>();
      commits.forEach((commit) => {
        const startHash = commit.turn_window?.start_turn_hash;
        const endHash = commit.turn_window?.end_turn_hash;
        if (startHash && typeof startHash === 'string' && startHash !== 'undefined') {
          turnHashesToLookup.add(startHash);
        }
        if (endHash && typeof endHash === 'string' && endHash !== 'undefined') {
          turnHashesToLookup.add(endHash);
        }
      });

      // If we have turns to look up, fetch them via individual turn detail API
      // This is more efficient than fetching all turns for all conversations
      if (turnHashesToLookup.size > 0) {
        await Promise.all(
          Array.from(turnHashesToLookup).map(async (turnHash) => {
            try {
              const turn = await api.getTurn(turnHash);
              turnToConvMap.set(turn.turn_hash, turn.conversation_id);
            } catch {
              // Skip if turn fetch fails
            }
          })
        );
      }

      // Build a map: commit_hash -> conversation_id (if commit was created from a conversation)
      const commitSourceConvMap = new Map<string, string>();
      commits.forEach((commit) => {
        // Method 1: Use source_refs (most reliable - explicitly stored during commit creation)
        if (commit.source_refs && commit.source_refs.length > 0) {
          const convRef = commit.source_refs.find((ref) => ref.type === 'conversation');
          if (convRef?.conversation_id) {
            commitSourceConvMap.set(commit.commit_hash, convRef.conversation_id);
            return;
          }
        }
        // Method 2: Fallback to turn_window lookup (for older commits without source_refs)
        if (commit.turn_window) {
          const startConvId = turnToConvMap.get(commit.turn_window.start_turn_hash);
          const endConvId = turnToConvMap.get(commit.turn_window.end_turn_hash);
          if (startConvId && startConvId === endConvId) {
            commitSourceConvMap.set(commit.commit_hash, startConvId);
          }
        }
      });

      // Build a map: conversation_id -> commit (for pairing into units)
      const convToCommitMap = new Map<string, api.Commit>();
      commits.forEach((commit) => {
        const convId = commitSourceConvMap.get(commit.commit_hash);
        if (convId) {
          // Use the latest commit for each conversation
          const existing = convToCommitMap.get(convId);
          if (!existing || new Date(commit.created_at) > new Date(existing.created_at)) {
            convToCommitMap.set(convId, commit);
          }
        }
      });

      // Create unit nodes from conversations (paired with commits if available)
      const _convIds = new Set(conversations.map((c) => c.conversation_id));
      const _pairedConvIds = new Set(convToCommitMap.keys());

      // Units from conversations with commits (committed units)
      const commitedUnitNodes: Node<CanvasNodeData>[] = [];
      // Units from conversations without commits (staging units)
      const stagingUnitNodes: Node<CanvasNodeData>[] = [];

      let nodeIndex = 0;
      conversations.forEach((conv) => {
        const commit = convToCommitMap.get(conv.conversation_id);
        const node = unitToNode(conv, commit || null, nodeIndex++);
        const existingPos = existingNodePositions.get(node.id);
        if (existingPos) {
          node.position = existingPos;
        }
        if (commit) {
          commitedUnitNodes.push(node);
        } else {
          stagingUnitNodes.push(node);
        }
      });

      // Orphan commits (not linked to any conversation) - create standalone units
      const orphanCommits = commits.filter((c) => !commitSourceConvMap.has(c.commit_hash));
      orphanCommits.forEach((commit) => {
        // Create a minimal "virtual" conversation for the orphan commit
        const virtualConv: api.Conversation = {
          conversation_id: `orphan-${commit.commit_hash.slice(0, 12)}`,
          project_id: projectId,
          title: commit.message || `Commit ${commit.commit_hash.slice(0, 8)}`,
          parent_commit_hash: commit.parent_hashes[0] ?? undefined,
          turns_count: 0,
          position_x: undefined,
          position_y: undefined,
          created_at: commit.created_at,
        };
        const node = unitToNode(virtualConv, commit, nodeIndex++);
        const existingPos = existingNodePositions.get(node.id);
        if (existingPos) {
          node.position = existingPos;
        }
        commitedUnitNodes.push(node);
      });

      const nodes = [...commitedUnitNodes, ...stagingUnitNodes];

      const edges: Edge[] = [];
      const commitHashes = new Set(commits.map((c) => c.commit_hash));

      // Build unit→unit edges based on commit parent relationships
      // In the unit model, edges connect committed units to their children
      // Edge: parentUnit (commit_hash) → childUnit (commit_hash)
      commits.forEach((commit) => {
        commit.parent_hashes.forEach((parentHash) => {
          if (!commitHashes.has(parentHash)) return;

          edges.push({
            id: `unit-${parentHash}-${commit.commit_hash}`,
            source: parentHash,
            target: commit.commit_hash,
            type: edgeType,
            animated: false,
            style: edgeStyle,
          });
        });
      });

      // Check for main commits
      const hasMainCommit = commits.some((c) => c.branch === 'main');
      const latestMainCommitId = resolveLatestMainUnitId(nodes);

      set({
        nodes,
        edges,
        hasMainCommit,
        latestMainCommitId,
        loading: false,
        loadError: null,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({
        loading: false,
        loadError: error,
      });
      console.error('Failed to load project data:', error);
    }
  },

  clearCanvas: () => {
    set({
      nodes: [],
      edges: [],
      projectId: null,
      loading: false,
      loadError: null,
      hasMainCommit: false,
      latestMainCommitId: undefined,
    });
  },

  addNode: async (kind, position) => {
    const state = get();
    const total = state.nodes.length;
    const basePosition = position ?? {
      x: 140 + (total % 3) * 220,
      y: 100 + Math.floor(total / 3) * 180,
    };
    const snappedPosition = snapPosition(basePosition);

    // For unit nodes, create a staging unit with a new conversation
    if (kind === 'unit') {
      if (!state.projectId) {
        throw new Error('Cannot create unit: no project selected');
      }

      const conversation = await api.createConversation(
        state.projectId,
        'New Unit',
        undefined, // no parent commit
        { x: snappedPosition.x, y: snappedPosition.y }
      );

      const newNode: Node<CanvasNodeData> = {
        id: conversation.conversation_id,
        type: 'unit',
        position: snappedPosition,
        data: {
          entryId: conversation.conversation_id.slice(0, 8),
          title: conversation.title || 'New Unit',
          summary: '0 turns',
          status: 'staging',
          timestamp: conversation.created_at,
          tags: ['unit'],
          kind: 'unit',
          conversationId: conversation.conversation_id,
          commitStatus: 'staging',
          // Set sourceConversationId to self for new units (enables commit flow)
          sourceConversationId: conversation.conversation_id,
        },
      };

      set((s) => ({
        nodes: [...s.nodes, newNode],
      }));
      return;
    }

    // For leaf nodes: must be created via LeafPanel from a commit
    // Direct creation would create a fake node without backend data
    if (kind === 'leaf') {
      // Use warning instead of error - this is an expected user flow issue, not a bug
      const notify = get().notifyCallback;
      notify?.('To create a Leaf, click "Add output" on a committed Unit node.', 'warning');
      return;
    }

    // Fallback for any unknown kinds - should not happen
    throw new Error(`Cannot create node of kind "${kind}" directly.`);
  },

  updateNode: (id, patch) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node
      ),
    })),

  commitPendingCommit: (id) => {
    console.log('[canvasStore] commitPendingCommit called with id:', id);
    const state = get();
    const notify = state.notifyCallback;

    const pendingNode = state.nodes.find(
      (node) => node.id === id && node.data.kind === 'unit' && node.data.commitStatus === 'staging'
    );
    console.log(
      '[canvasStore] Found pending node:',
      pendingNode?.id,
      'kind:',
      pendingNode?.data.kind,
      'status:',
      pendingNode?.data.commitStatus
    );
    if (!pendingNode) {
      console.log('[canvasStore] Pending node not found!');
      notify?.('Pending commit not found', 'error');
      return;
    }

    const branchMode = determineStagingUnitBranchMode(state, id);
    console.log('[canvasStore] branchMode:', branchMode);
    if (branchMode === 'blocked') {
      console.log('[canvasStore] Commit blocked!');
      notify?.('Cannot commit: blocked by existing commits', 'warning');
      return;
    }

    console.log('[canvasStore] Proceeding with commit...');
    set((state) => {
      const isMergeCommit =
        pendingNode.data.bridgePrompt === '/merge' && !!pendingNode.data.mergeConfig;
      let branchType: BranchType = 'branch';

      if (branchMode === 'force-main' || isMergeCommit) {
        branchType = 'main';
      } else if (branchMode === 'select') {
        branchType = pendingNode.data.pendingBranch ?? 'branch';
      }

      const branchName =
        branchType === 'branch'
          ? pendingNode.data.pendingBranchName?.trim() || `branch-${getNumericId(id)}`
          : undefined;

      const latestMainId = resolveLatestMainUnitId(state.nodes, state.latestMainCommitId);

      const updatedNodes = state.nodes.map<Node<CanvasNodeData>>((node) => {
        if (node.id !== id || node.data.commitStatus !== 'staging') {
          return node;
        }
        const nextData: CanvasNodeData = {
          ...node.data,
          kind: 'unit',
          entryId: `UNIT-${getNumericId(id)}`,
          status: 'Committed · awaiting diff',
          tags: Array.from(
            new Set([...node.data.tags, 'unit', ...(isMergeCommit ? ['merge'] : [])])
          ),
          branchType,
          branchName,
          pendingBranch: undefined,
          pendingBranchName: undefined,
          mergeConfig: undefined,
          isMergeCommit: isMergeCommit,
          commitStatus: 'committed',
        };

        return {
          ...node,
          type: 'unit',
          data: nextData,
        };
      });

      console.log(
        '[canvasStore] Commit successful! branchType:',
        branchType,
        'branchName:',
        branchName
      );
      console.log(
        '[canvasStore] Updated node commitStatus:',
        updatedNodes.find((n) => n.id === id)?.data.commitStatus
      );
      return {
        nodes: updatedNodes,
        hasMainCommit: state.hasMainCommit || branchType === 'main',
        latestMainCommitId: branchType === 'main' ? id : latestMainId,
      };
    });
  },

  addPendingCommitFromConversation: async (conversationId) => {
    const state = get();
    const notify = state.notifyCallback;

    const source = state.nodes.find((node) => node.id === conversationId);
    if (!source || source.data.kind !== 'unit') {
      notify?.('Unit not found', 'error');
      return;
    }
    const canSeed = canCreateStagingUnitFromUnit(
      conversationId,
      state.nodes,
      state.edges,
      state.hasMainCommit
    );
    if (!canSeed) {
      notify?.('Cannot create pending commit from this conversation', 'warning');
      return;
    }

    // Fetch actual chat content from upstream conversation
    let baselineSummary = '';
    let pendingSourceBlock: SourceTextBlock | undefined;
    const projectId = state.projectId;
    if (projectId && source.data.conversationId) {
      try {
        const turnsData = await api.listTurns(projectId, source.data.conversationId);
        if (turnsData.turns && turnsData.turns.length > 0) {
          // Build full text with turn separator (newline between turns)
          const fullText = turnsData.turns.map((turn) => turn.content).join('\n');

          // Tokenize the full text
          const tokens = tokenizeText(fullText);

          // Build turn boundaries by tracking token positions
          const turnBoundaries: TurnBoundary[] = [];
          let currentTokenIndex = 0;

          for (const turn of turnsData.turns) {
            const turnTokens = tokenizeText(turn.content);
            const turnTokenCount = turnTokens.length;

            if (turnTokenCount > 0) {
              turnBoundaries.push({
                role: turn.role as 'user' | 'assistant',
                startTokenIndex: currentTokenIndex,
                endTokenIndex: currentTokenIndex + turnTokenCount - 1,
              });
            }

            // Account for the newline separator token between turns (+1)
            // But not after the last turn
            currentTokenIndex += turnTokenCount + 1;
          }

          // Create the SourceTextBlock with source info and turn boundaries
          pendingSourceBlock = {
            id: 'block-conv-1',
            originalText: fullText,
            tokens,
            selections: [],
            keywords: [],
            sourceNodeId: source.data.conversationId,
            sourceNodeType: 'unit',
            sourceNodeTitle: source.data.title || 'Unit',
            turnBoundaries,
          };

          // Also keep baselineSummary for backward compatibility
          baselineSummary = fullText;
        }
      } catch (err) {
        console.warn('Failed to fetch turns for baselineSummary:', err);
        notify?.('Failed to fetch conversation content', 'warning');
      }
    }

    const newNode: Node<CanvasNodeData> = {
      id: nextNodeId(),
      type: 'unit',
      position: computeAttachedPosition(source, 'unit', conversationCommitOffset),
      data: {
        entryId: `UNIT-${nodeCounter}`,
        title: `Unit from ${source.data.entryId}`,
        summary: '',
        status: 'staging',
        timestamp: 'just now',
        tags: ['unit'],
        kind: 'unit',
        bridgePrompt: 'prose',
        // Default to 'main' for first commit, 'branch' for subsequent commits
        pendingBranch: state.hasMainCommit ? 'branch' : 'main',
        pendingBranchName: '',
        commitStatus: 'staging',
        // Pass upstream chat content to pending commit
        baselineSummary,
        sourceConversationId: source.data.conversationId,
        // New: pendingSource with structured text blocks
        pendingSource: pendingSourceBlock ? { textBlocks: [pendingSourceBlock] } : undefined,
      },
    };

    const newEdge: Edge = {
      id: nextEdgeId(),
      source: source.id,
      target: newNode.id,
      type: edgeType,
      animated: false,
      style: edgeStyle,
    };

    set({
      nodes: [...state.nodes, newNode],
      edges: [...state.edges, newEdge],
    });
  },

  addConversationFromCommit: async (commitId) => {
    const state = get();
    const source = state.nodes.find((node) => node.id === commitId && node.data.kind === 'unit');
    if (!source) {
      throw new Error('Cannot create unit: source unit not found');
    }
    if (!state.projectId) {
      throw new Error('Cannot create unit: no project selected');
    }

    // Create conversation via API with parent_commit_hash
    const title = `Unit from ${source.data.entryId}`;
    const parentCommitHash = source.data.commitHash || source.id;
    // Calculate position before API call so we can save it
    const position = computeAttachedPosition(source, 'unit', commitQuickOffset);
    const conversation = await api.createConversation(state.projectId, title, parentCommitHash, {
      x: position.x,
      y: position.y,
    });

    // Add node using the real conversation ID from API
    const newNode: Node<CanvasNodeData> = {
      id: conversation.conversation_id,
      type: 'unit',
      position,
      data: {
        entryId: conversation.conversation_id.slice(0, 8),
        title: conversation.title || title,
        summary: '0 turns',
        status: 'staging',
        timestamp: conversation.created_at,
        tags: ['unit'],
        kind: 'unit',
        conversationId: conversation.conversation_id, // Full ID for API calls
        commitStatus: 'staging',
      },
    };
    const newEdge: Edge = {
      id: nextEdgeId(),
      source: source.id,
      target: newNode.id,
      type: edgeType,
      animated: false,
      style: edgeStyle,
    };

    set({
      nodes: [...get().nodes, newNode],
      edges: [...get().edges, newEdge],
    });
  },

  addPendingCommitFromCommit: (commitId) =>
    set((state) => {
      const source = state.nodes.find(
        (node) =>
          node.id === commitId &&
          node.data.kind === 'unit' &&
          node.data.commitStatus === 'committed'
      );
      if (!source) {
        return {};
      }

      // Build pending source block from commit's sourceExcerpt (semantic selections)
      // Not from summary which is the generated output
      const sourceExcerptArray = source.data.sourceExcerpt || [];
      const sourceExcerptText = sourceExcerptArray.join('\n');
      const tokens = tokenizeText(sourceExcerptText);
      const pendingSourceBlock: SourceTextBlock = {
        id: 'block-unit-1',
        originalText: sourceExcerptText,
        tokens,
        selections: [],
        keywords: [],
        sourceNodeId: source.data.commitHash || source.id,
        sourceNodeType: 'unit',
        sourceNodeTitle: source.data.title || `Unit ${source.data.entryId}`,
        // No turnBoundaries for unit type
      };

      // Build sentences for V3 commit compatibility
      // Each sourceExcerpt item becomes a sentence
      const turnHash = source.data.sourceTurnWindow?.end_turn_hash || 'sha256:unknown';
      let charOffset = 0;
      const sentences = sourceExcerptArray.map((text, idx) => {
        const sentence = {
          id: `s${idx + 1}`,
          text,
          start: charOffset,
          end: charOffset + text.length,
        };
        charOffset += text.length + 1; // +1 for newline separator
        return sentence;
      });

      // Compute inputTextHash for anchor tracking
      const inputTextHash = `sha256:${sourceExcerptText.length}-${Date.now()}`;

      const newNode: Node<CanvasNodeData> = {
        id: nextNodeId(),
        type: 'unit',
        position: computeAttachedPosition(source, 'unit', commitQuickOffset),
        data: {
          entryId: `UNIT-${nodeCounter}`,
          title: `Unit from ${source.data.entryId}`,
          summary: '',
          status: 'in progress',
          timestamp: 'just now',
          tags: ['unit'],
          kind: 'unit',
          bridgePrompt: 'prose',
          // Default to 'main' for first commit, 'branch' for subsequent commits
          pendingBranch: state.hasMainCommit ? 'branch' : 'main',
          pendingBranchName: '',
          commitStatus: 'staging',
          // Pass upstream content to pending commit (use sourceExcerpt)
          baselineSummary: sourceExcerptText,
          // Inherit source commit info for creating child commits without conversation
          sourceCommitHash: source.data.commitHash,
          sourceTurnWindow: source.data.sourceTurnWindow,
          // New: pendingSource with structured text block AND sentences for V3
          pendingSource: tokens.length > 0 ? {
            textBlocks: [pendingSourceBlock],
            sentences: sentences.length > 0 ? sentences : undefined,
            inputTextHash: sentences.length > 0 ? inputTextHash : undefined,
          } : undefined,
        },
      };
      const newEdge: Edge = {
        id: nextEdgeId(),
        source: source.id,
        target: newNode.id,
        type: edgeType,
        animated: false,
        style: edgeStyle,
      };
      return {
        nodes: [...state.nodes, newNode],
        edges: [...state.edges, newEdge],
      };
    }),

  // Alias for addPendingCommitFromCommit for unit model
  addUnitFromUnit: (unitId) => get().addPendingCommitFromCommit(unitId),

  /**
   * Trigger two-way merge from a branch commit to latest main
   * Opens MergePanel with prepared merge results
   */
  createMergePendingCommit: async (commitId) => {
    const state = get();
    const nodes = state.nodes;
    const edges = state.edges;
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const branchCommit = nodeMap.get(commitId);

    // Validate: must be a branch commit
    if (
      !branchCommit ||
      branchCommit.data.kind !== 'unit' ||
      branchCommit.data.branchType !== 'branch'
    ) {
      state.notifyCallback?.('Cannot merge: not a branch commit', 'error');
      return null;
    }

    // Get source commit hash (branch commit)
    const sourceHash = branchCommit.data.commitHash;
    if (!sourceHash) {
      state.notifyCallback?.('Cannot merge: branch commit has no hash', 'error');
      return null;
    }

    // Get source branch name
    const sourceBranch = branchCommit.data.branchName || 'branch';

    // Get target commit hash (latest main)
    const latestMainId = resolveLatestMainUnitId(nodes, state.latestMainCommitId);
    if (!latestMainId) {
      state.notifyCallback?.('Cannot merge: no main commits found', 'error');
      return null;
    }
    const latestMainCommit = nodeMap.get(latestMainId);
    if (!latestMainCommit) {
      state.notifyCallback?.('Cannot merge: main commit not found', 'error');
      return null;
    }
    const targetHash = latestMainCommit.data.commitHash;
    if (!targetHash) {
      state.notifyCallback?.('Cannot merge: main commit has no hash', 'error');
      return null;
    }

    // Check tone - only branch-latest can merge
    const tone = computeUnitTone(nodes, edges, state.latestMainCommitId, commitId);
    if (tone !== 'branch-latest') {
      state.notifyCallback?.('Cannot merge: only latest branch commit can be merged', 'error');
      return null;
    }

    // Create merge draft via API (redirects to Merge Workspace)
    try {
      const response = await fetch(`${API_V1}/merge/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          source_hash: sourceHash,
          target_hash: targetHash,
          source_branch: sourceBranch,
          target_branch: 'main',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || 'Failed to create merge draft');
      }

      // Return the draft ID for navigation
      return json.data.draftId as string;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      state.notifyCallback?.(`Failed to create merge: ${errorMessage}`, 'error');
      return null;
    }
  },

  getPendingCommitBranchMode: (commitId) => determineStagingUnitBranchMode(get(), commitId),
  canCreatePendingCommitFromConversation: (unitId) => {
    const state = get();
    const node = state.nodes.find(
      (candidate) => candidate.id === unitId && candidate.data.kind === 'unit'
    );
    if (!node) {
      return false;
    }
    return canCreateStagingUnitFromUnit(unitId, state.nodes, state.edges, state.hasMainCommit);
  },

  onNodesChange: (changes) =>
    set((state) => {
      if (changes.length === 0) {
        return {};
      }

      const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
      const lockedNodes = getLockedNodeIds(state.nodes, state.edges);

      // Handle position changes - save to database (debounced)
      const positionChanges = changes.filter((c) => c.type === 'position' && c.position);
      if (positionChanges.length > 0) {
        positionChanges.forEach((change) => {
          if (change.type !== 'position' || !change.position) return;
          const node = nodeMap.get(change.id);
          if (!node) return;

          const snappedPos = snapPosition(change.position);
          // Save position to database (fire and forget, debounced internally)
          saveNodePosition(node.id, node.data.kind, snappedPos);
        });
      }

      // Separate remove changes from other changes
      const removeChanges = changes.filter((c) => c.type === 'remove');
      const otherChanges = changes.filter((c) => c.type !== 'remove');

      // Filter out locked nodes from removal
      const allowedRemoves = removeChanges.filter((c) => !lockedNodes.has(c.id));

      if (allowedRemoves.length === 0) {
        // No removes, just apply other changes
        if (otherChanges.length === 0) return {};
        return {
          nodes: (applyNodeChanges(otherChanges, state.nodes) as Node<CanvasNodeData>[]).map(
            (node) => ({
              ...node,
              position: snapPosition(node.position),
            })
          ),
        };
      }

      // Check if any of the nodes to be removed need confirmation
      const nodeIdsToRemove = allowedRemoves.map((c) => c.id);
      const needsConfirmation: string[] = [];
      const directDeletes: string[] = [];

      nodeIdsToRemove.forEach((nodeId) => {
        const node = nodeMap.get(nodeId);
        if (!node) return;

        // Staging unit needs confirmation
        if (node.data.kind === 'unit' && node.data.commitStatus === 'staging') {
          needsConfirmation.push(nodeId);
          return;
        }

        // Node upstream of pending commit needs confirmation
        if (isUpstreamOfStagingUnit(nodeId, state.nodes, state.edges)) {
          needsConfirmation.push(nodeId);
          return;
        }

        // Otherwise, can delete directly
        directDeletes.push(nodeId);
      });

      // If there are nodes needing confirmation, show dialog
      if (needsConfirmation.length > 0) {
        // Build confirmation message
        const stagingUnitsInSelection = needsConfirmation.filter((id) => {
          const n = nodeMap.get(id);
          return n?.data.kind === 'unit' && n?.data.commitStatus === 'staging';
        });
        const upstreamNodes = needsConfirmation.filter(
          (id) => !stagingUnitsInSelection.includes(id)
        );
        const affectedDownstream = collectAffectedStagingUnits(
          needsConfirmation,
          state.nodes,
          state.edges
        );

        let message = '';
        if (stagingUnitsInSelection.length > 0) {
          message += `Discard ${stagingUnitsInSelection.length} staging unit(s)?`;
        }
        if (upstreamNodes.length > 0) {
          if (message) message += '\n';
          message += `Delete ${upstreamNodes.length} upstream node(s)?`;
        }
        if (affectedDownstream.length > 0) {
          if (message) message += '\n';
          message += `This will also affect ${affectedDownstream.length} downstream pending commit(s).`;
        }

        // Collect edges that connect to/from nodes being deleted
        const edgesToRemove = state.edges
          .filter(
            (e) => needsConfirmation.includes(e.source) || needsConfirmation.includes(e.target)
          )
          .map((e) => e.id);

        // Apply direct deletes immediately, but defer confirmation nodes
        const directRemoveChanges = allowedRemoves.filter((c) => directDeletes.includes(c.id));

        // Delete conversations from database for directly deleted unit nodes
        // Note: Commit deletion is local only - backend deleteCommit API not available
        directDeletes.forEach((nodeId) => {
          const node = nodeMap.get(nodeId);
          if (node?.data.kind === 'unit' && node.data.conversationId) {
            api.deleteConversation(node.data.conversationId).catch((err) => {
              console.warn('Failed to delete conversation from database:', err);
            });
          }
          if (node?.data.kind === 'unit' && node.data.commitHash) {
            console.info(
              'Unit node deleted locally. Backend deleteCommit API not available:',
              node.data.commitHash
            );
          }
        });

        const newNodes =
          directRemoveChanges.length > 0
            ? (
                applyNodeChanges(
                  [...otherChanges, ...directRemoveChanges],
                  state.nodes
                ) as Node<CanvasNodeData>[]
              ).map((node) => ({
                ...node,
                position: snapPosition(node.position),
              }))
            : otherChanges.length > 0
              ? (applyNodeChanges(otherChanges, state.nodes) as Node<CanvasNodeData>[]).map(
                  (node) => ({
                    ...node,
                    position: snapPosition(node.position),
                  })
                )
              : state.nodes;

        return {
          nodes: newNodes,
          deletionConfirmation: {
            nodeIds: needsConfirmation,
            edgeIds: edgesToRemove,
            message,
            onConfirm: () => {
              // This will be called when user confirms
              const currentState = get();
              const nodesToDelete = new Set(needsConfirmation);
              const edgesToDelete = new Set(edgesToRemove);

              // Delete conversations from database for unit nodes
              // Note: Commit deletion is local only - backend deleteCommit API not available
              needsConfirmation.forEach((nodeId) => {
                const node = currentState.nodes.find((n) => n.id === nodeId);
                if (node?.data.kind === 'unit' && node.data.conversationId) {
                  api.deleteConversation(node.data.conversationId).catch((err) => {
                    console.warn('Failed to delete conversation from database:', err);
                  });
                }
                if (node?.data.kind === 'unit' && node.data.commitHash) {
                  console.info(
                    'Unit node deleted locally. Backend deleteCommit API not available:',
                    node.data.commitHash
                  );
                }
              });

              set((s) => ({
                nodes: s.nodes.filter((n) => !nodesToDelete.has(n.id)),
                edges: s.edges.filter(
                  (e) =>
                    !edgesToDelete.has(e.id) &&
                    !nodesToDelete.has(e.source) &&
                    !nodesToDelete.has(e.target)
                ),
                deletionConfirmation: null,
              }));
            },
          },
        };
      }

      // No confirmation needed, apply all changes
      // Delete conversations from database for removed unit nodes
      // Note: Commit deletion is local only - backend deleteCommit API not available
      allowedRemoves.forEach((change) => {
        const node = nodeMap.get(change.id);
        if (node?.data.kind === 'unit' && node.data.conversationId) {
          api.deleteConversation(node.data.conversationId).catch((err) => {
            console.warn('Failed to delete conversation from database:', err);
          });
        }
        if (node?.data.kind === 'unit' && node.data.commitHash) {
          console.info(
            'Unit node deleted locally. Backend deleteCommit API not available:',
            node.data.commitHash
          );
        }
      });

      return {
        nodes: (
          applyNodeChanges(
            [...otherChanges, ...allowedRemoves],
            state.nodes
          ) as Node<CanvasNodeData>[]
        ).map((node) => ({
          ...node,
          position: snapPosition(node.position),
        })),
      };
    }),

  onEdgesChange: (changes) =>
    set((state) => {
      if (changes.length === 0) {
        return {};
      }

      const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
      const lockedNodes = getLockedNodeIds(state.nodes, state.edges);

      // Separate remove changes from other changes
      const removeChanges = changes.filter((c) => c.type === 'remove');
      const otherChanges = changes.filter((c) => c.type !== 'remove');

      // Filter out edges that connect locked nodes
      // An edge is protected if BOTH source and target are locked
      // (this means the edge is part of committed history)
      const allowedRemoves = removeChanges.filter((c) => {
        const edge = state.edges.find((e) => e.id === c.id);
        if (!edge) return false;
        const sourceLocked = lockedNodes.has(edge.source);
        const targetLocked = lockedNodes.has(edge.target);
        // Block if BOTH ends are locked (edge is part of committed history)
        return !(sourceLocked && targetLocked);
      });

      if (allowedRemoves.length === 0) {
        if (otherChanges.length === 0) return {};
        return { edges: applyEdgeChanges(otherChanges, state.edges) };
      }

      // Check if any edge removal needs confirmation
      // An edge needs confirmation if it connects to a pending commit
      const needsConfirmation: string[] = [];
      const directDeletes: string[] = [];

      allowedRemoves.forEach((c) => {
        const edge = state.edges.find((e) => e.id === c.id);
        if (!edge) return;

        const targetNode = nodeMap.get(edge.target);

        // Edge going INTO a staging unit needs confirmation
        if (targetNode?.data.kind === 'unit' && targetNode?.data.commitStatus === 'staging') {
          needsConfirmation.push(c.id);
          return;
        }

        // Edge from a node that feeds into pending commit downstream
        if (isUpstreamOfStagingUnit(edge.source, state.nodes, state.edges)) {
          needsConfirmation.push(c.id);
          return;
        }

        directDeletes.push(c.id);
      });

      if (needsConfirmation.length > 0) {
        // Find affected staging units
        const affectedStagingUnits = new Set<string>();
        needsConfirmation.forEach((edgeId) => {
          const edge = state.edges.find((e) => e.id === edgeId);
          if (!edge) return;

          const targetNode = nodeMap.get(edge.target);
          if (targetNode?.data.kind === 'unit' && targetNode?.data.commitStatus === 'staging') {
            affectedStagingUnits.add(edge.target);
          }

          // Also check downstream
          const downstream = collectAffectedStagingUnits([edge.source], state.nodes, state.edges);
          downstream.forEach((id) => affectedStagingUnits.add(id));
        });

        const message =
          affectedStagingUnits.size > 0
            ? `This will disconnect ${affectedStagingUnits.size} staging unit(s) from their source. Continue?`
            : `Delete ${needsConfirmation.length} connection(s)?`;

        // Apply direct deletes immediately
        const directRemoveChanges = allowedRemoves.filter((c) => directDeletes.includes(c.id));
        const newEdges =
          directRemoveChanges.length > 0
            ? applyEdgeChanges([...otherChanges, ...directRemoveChanges], state.edges)
            : otherChanges.length > 0
              ? applyEdgeChanges(otherChanges, state.edges)
              : state.edges;

        return {
          edges: newEdges,
          deletionConfirmation: {
            nodeIds: [],
            edgeIds: needsConfirmation,
            message,
            onConfirm: () => {
              set((s) => {
                const edgesToDelete = new Set(needsConfirmation);
                return {
                  edges: s.edges.filter((e) => !edgesToDelete.has(e.id)),
                  deletionConfirmation: null,
                };
              });
            },
          },
        };
      }

      // No confirmation needed
      return {
        edges: applyEdgeChanges([...otherChanges, ...allowedRemoves], state.edges),
      };
    }),

  onConnect: (connection) => {
    const { nodes, edges } = get();
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);

    if (!canConnect(source, target)) {
      return;
    }

    const exists = edges.some(
      (edge) => edge.source === connection.source && edge.target === connection.target
    );

    if (exists) {
      return;
    }

    const newEdge: Edge = {
      id: nextEdgeId(),
      source: connection.source!,
      target: connection.target!,
      type: edgeType,
      animated: false,
      style: edgeStyle,
    };

    set({ edges: [...edges, newEdge] });
  },
  getCommitTone: (commitId) => {
    const state = get();
    return computeUnitTone(state.nodes, state.edges, state.latestMainCommitId, commitId);
  },
  resetToSingleConversation: () => {
    nodeCounter = 1;
    edgeCounter = 1;
    // Don't create seed node with fake ID - user should use addNode to create real units
    set({
      nodes: [],
      edges: [],
      hasMainCommit: false,
      latestMainCommitId: undefined,
    });
  },

  // DEV: Load demo data to showcase 3-section layout
  loadDemoData: () => {
    const demoNode: Node<CanvasNodeData> = {
      id: 'demo-unit-1',
      type: 'unit',
      position: { x: 100, y: 100 },
      data: {
        entryId: 'demo_001',
        title: 'Legal rewrite v2',
        summary: 'Refined legal language for compliance review',
        status: 'Active',
        timestamp: '2h ago',
        tags: ['legal', 'compliance'],
        kind: 'unit',
        commitStatus: 'committed',
        commitHash: 'abc123def456789',
        branchType: 'main',
        // Sources section - 2 conversations
        sources: [
          { id: 'src-1', type: 'conversation', label: 'conv#34', title: 'Initial legal discussion' },
          { id: 'src-2', type: 'meeting', label: 'mtg#7', title: 'Compliance review meeting' },
        ],
        // Leaves section - 2 outputs
        leaves: [
          { id: 'leaf-1', type: 'deploy_agent', title: 'Production Agent', status: 'running' },
          { id: 'leaf-2', type: 'eval', title: 'Compliance Check', status: 'passed', passedCount: 18, failedCount: 2 },
        ],
      },
    };

    const demoNode2: Node<CanvasNodeData> = {
      id: 'demo-unit-2',
      type: 'unit',
      position: { x: 500, y: 100 },
      data: {
        entryId: 'demo_002',
        title: 'Marketing copy draft',
        summary: '',
        status: 'Draft',
        timestamp: '1h ago',
        tags: ['marketing'],
        kind: 'unit',
        commitStatus: 'staging',
        branchType: 'branch',
        branchName: 'feature/marketing',
        mustHave: ['brand', 'value'],
        mustntHave: ['competitor'],
        // Sources - 1 file import
        sources: [
          { id: 'src-3', type: 'file', label: 'brief.pdf', title: 'Marketing brief document' },
        ],
        // No leaves yet (staging)
      },
    };

    set({
      nodes: [demoNode, demoNode2],
      edges: [],
      hasMainCommit: true,
      latestMainCommitId: 'demo-unit-1',
    });
  },

  // Save constraints to a unit node
  saveConversationConstraints: (unitId, constraints) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === unitId && node.data.kind === 'unit'
          ? { ...node, data: { ...node.data, constraints } }
          : node
      ),
    })),

  // Get constraints from a unit node
  getConversationConstraints: (unitId) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === unitId && n.data.kind === 'unit');
    return node?.data.constraints;
  },

  // Update staging unit constraint overrides
  updatePendingCommitConstraintOverrides: (unitId, overrides) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (
          node.id !== unitId ||
          node.data.kind !== 'unit' ||
          node.data.commitStatus !== 'staging'
        ) {
          return node;
        }
        const currentOverrides = node.data.constraintOverrides ?? {
          disabledClauseIds: [],
          additionalMustHave: [],
          additionalMustntHave: [],
          removedMustHave: [],
          removedMustntHave: [],
        };
        return {
          ...node,
          data: {
            ...node.data,
            constraintOverrides: { ...currentOverrides, ...overrides },
          },
        };
      }),
    })),

  // Get source unit for a staging unit (follows edges backward to parent unit)
  getSourceConversationForPendingCommit: (unitId) => {
    const state = get();
    const incomingMap = buildIncomingMap(state.edges);
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));

    // BFS to find the first unit ancestor
    const visited = new Set<string>();
    const queue = [...(incomingMap.get(unitId) ?? [])];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const node = nodeMap.get(currentId);
      if (node?.data.kind === 'unit') {
        return node;
      }

      const parents = incomingMap.get(currentId) ?? [];
      parents.forEach((p) => {
        if (!visited.has(p)) queue.push(p);
      });
    }
    return undefined;
  },

  // Get effective constraints for a pending commit (conversation constraints + overrides)
  getPendingCommitEffectiveConstraints: (commitId) => {
    const state = get();
    const pendingNode = state.nodes.find(
      (n) => n.id === commitId && n.data.kind === 'unit' && n.data.commitStatus === 'staging'
    );
    if (!pendingNode) return undefined;

    // Find source conversation
    const sourceConv = get().getSourceConversationForPendingCommit(commitId);
    const baseConstraints = sourceConv?.data.constraints;
    if (!baseConstraints) return undefined;

    const overrides = pendingNode.data.constraintOverrides;

    // Apply overrides
    const clauses = baseConstraints.clauses.filter(
      (c) => !overrides?.disabledClauseIds?.includes(c.id)
    );

    const must_have = [
      ...baseConstraints.must_have.filter((kw) => !overrides?.removedMustHave?.includes(kw)),
      ...(overrides?.additionalMustHave ?? []),
    ];

    const mustnt_have = [
      ...baseConstraints.mustnt_have.filter((kw) => !overrides?.removedMustntHave?.includes(kw)),
      ...(overrides?.additionalMustntHave ?? []),
    ];

    return { clauses, must_have, mustnt_have };
  },

  // Check if a conversation has any downstream pending commits (for locking editing)
  hasDownstreamPendingCommits: (conversationId) => {
    const state = get();
    const outgoingMap = buildOutgoingMap(state.edges);
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));

    // BFS to find any pending commit descendant
    const visited = new Set<string>();
    const queue = [...(outgoingMap.get(conversationId) ?? [])];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const node = nodeMap.get(currentId);
      if (node?.data.kind === 'unit' && node?.data.commitStatus === 'staging') {
        return true;
      }

      const children = outgoingMap.get(currentId) ?? [];
      children.forEach((c) => {
        if (!visited.has(c)) queue.push(c);
      });
    }
    return false;
  },

  // Leaf panel methods
  openLeafPanel: (commitId) => set({ leafPanelOpen: true, leafPanelCommitId: commitId }),
  closeLeafPanel: () => set({ leafPanelOpen: false, leafPanelCommitId: undefined }),

  addLeafNode: async (leafType) => {
    const state = get();
    const notify = state.notifyCallback;

    const commitId = state.leafPanelCommitId;
    if (!commitId) {
      notify?.('No commit selected', 'error');
      return;
    }

    const unitNode = state.nodes.find((node) => node.id === commitId && node.data.kind === 'unit');
    if (!unitNode) {
      notify?.('Unit not found', 'error');
      return;
    }

    // Get commit hash from unit node - required for creating leaf
    const commitHash = unitNode.data.commitHash;
    if (!commitHash) {
      notify?.('Commit not saved yet. Please commit first before adding output.', 'error');
      return;
    }

    const projectId = state.projectId;
    if (!projectId) {
      notify?.('Project not found', 'error');
      return;
    }

    const leafLabels: Record<LeafType, string> = {
      deploy_agent: 'Deploy',
      tweet: 'Twitter',
      weibo: '微博',
      wechat: '朋友圈',
      email: 'Email',
      article: '文章',
      slack: 'Slack',
      eval: 'Eval',
    };

    // Close panel immediately
    set({ leafPanelOpen: false, leafPanelCommitId: undefined });

    try {
      // Call API to create leaf
      const leaf = await api.createLeaf({
        commit_hash: commitHash,
        type: leafType,
        title: leafLabels[leafType],
        project_id: projectId,
        constraints: [],
        config: {},
      });

      // Add leaf node to canvas with the backend leafId
      set((state) => {
        // Count existing leaf nodes connected to this commit to offset position
        const existingLeafCount = state.edges.filter((edge) => {
          if (edge.source !== commitId) return false;
          const targetNode = state.nodes.find((n) => n.id === edge.target);
          return targetNode?.data.kind === 'leaf';
        }).length;

        const newNodeId = nextNodeId();

        // Position leaf above the unit node
        const newNode: Node<CanvasNodeData> = {
          id: newNodeId,
          type: 'leaf',
          position: snapPosition({
            x: unitNode.position.x + commitQuickOffset,
            y:
              unitNode.position.y -
              leafNodeHeight -
              leafNodeOffset -
              existingLeafCount * (leafNodeHeight + 20),
          }),
          data: {
            entryId: `LEAF-${getNumericId(newNodeId)}`,
            title: leafLabels[leafType],
            summary: '',
            status: 'pending',
            timestamp: 'just now',
            tags: ['leaf', leafType],
            kind: 'leaf',
            leafType,
            leafId: leaf.id, // Store backend leaf ID
          },
        };

        const newEdge: Edge = {
          id: nextEdgeId(),
          source: commitId,
          target: newNodeId,
          type: edgeType,
          animated: false,
          style: edgeStyle,
        };

        return {
          nodes: [...state.nodes, newNode],
          edges: [...state.edges, newEdge],
        };
      });

      notify?.(`${leafLabels[leafType]} created successfully`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create leaf';
      notify?.(message, 'error');
    }
  },

  // Deletion confirmation methods
  confirmDeletion: () => {
    const state = get();
    if (state.deletionConfirmation?.onConfirm) {
      state.deletionConfirmation.onConfirm();
    }
  },

  cancelDeletion: () => set({ deletionConfirmation: null }),

  // Update node ID and all related edges (for syncing local pending commit with API commit_hash)
  updateNodeId: (oldId, newId) =>
    set((state) => {
      // Update nodes
      const updatedNodes = state.nodes.map((node) =>
        node.id === oldId ? { ...node, id: newId } : node
      );

      // Update edges (both source and target references)
      const updatedEdges = state.edges.map((edge) => {
        let updated = edge;
        if (edge.source === oldId) {
          updated = { ...updated, source: newId };
        }
        if (edge.target === oldId) {
          updated = { ...updated, target: newId };
        }
        // Update edge ID if it contains the old node ID
        if (edge.id.includes(oldId)) {
          updated = { ...updated, id: edge.id.replace(oldId, newId) };
        }
        return updated;
      });

      // Update latestMainCommitId if it matches
      const latestMainCommitId =
        state.latestMainCommitId === oldId ? newId : state.latestMainCommitId;

      return {
        nodes: updatedNodes,
        edges: updatedEdges,
        latestMainCommitId,
      };
    }),

  // Get direct upstream source nodes (committed units) for a staging unit
  // Returns nodes that can provide source content for a staging unit
  getUpstreamSourceNodes: (nodeId) => {
    const state = get();
    const incomingMap = buildIncomingMap(state.edges);
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));

    const sourceNodeIds = incomingMap.get(nodeId) ?? [];
    const sourceNodes: Node<CanvasNodeData>[] = [];

    for (const sourceId of sourceNodeIds) {
      const node = nodeMap.get(sourceId);
      if (!node) continue;

      // Include committed units (not staging)
      if (node.data.kind === 'unit' && node.data.commitStatus === 'committed') {
        sourceNodes.push(node);
      }
    }

    return sourceNodes;
  },

  // ============================================================================
  // Merge Operations (合并操作)
  // ============================================================================

  /**
   * Start a merge between two commits
   * Calls API to prepare merge, stores result
   * 启动两个 commit 之间的合并操作
   */
  startMerge: async (sourceHash: string, targetHash: string) => {
    const { notifyCallback } = get();

    // Clear previous errors and set loading
    set({ mergeLoading: true, mergeError: null });

    try {
      const response = await fetch(`${API_V1}/merge/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_hash: sourceHash, target_hash: targetHash }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || 'Failed to prepare merge');
      }

      set({
        mergeState: {
          sourceHash,
          targetHash,
          prepared: json.data,
        },
        mergeLoading: false,
        mergeError: null,
      });

      notifyCallback?.('Merge prepared successfully', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({
        mergeLoading: false,
        mergeError: errorMessage,
      });

      notifyCallback?.(`Failed to prepare merge: ${errorMessage}`, 'error');
      throw error;
    }
  },

  /**
   * Resolve a similar pair conflict
   * @param index - Index in similarPairs array
   * @param pick - 'source' or 'target'
   * 解决相似句子对的冲突
   */
  resolveSimilarPair: (index: number, pick: 'source' | 'target') => {
    set((state) => {
      if (!state.mergeState) return state;

      const newPairs = [...state.mergeState.prepared.similarPairs];
      newPairs[index] = { ...newPairs[index], resolution: pick };

      return {
        mergeState: {
          ...state.mergeState,
          prepared: {
            ...state.mergeState.prepared,
            similarPairs: newPairs,
          },
        },
      };
    });
  },

  /**
   * Toggle keep/discard for a unique sentence
   * @param side - 'source' or 'target'
   * @param index - Index in onlyInSource or onlyInTarget array
   * 切换唯一句子的保留/丢弃状态
   */
  toggleKeep: (side: 'source' | 'target', index: number) => {
    set((state) => {
      if (!state.mergeState) return state;

      const key = side === 'source' ? 'onlyInSource' : 'onlyInTarget';
      const newCandidates = [...state.mergeState.prepared[key]];
      newCandidates[index] = {
        ...newCandidates[index],
        keep: !newCandidates[index].keep,
      };

      return {
        mergeState: {
          ...state.mergeState,
          prepared: {
            ...state.mergeState.prepared,
            [key]: newCandidates,
          },
        },
      };
    });
  },

  /**
   * Execute the merge after all decisions are made
   * @param message - Commit message for merge
   * @returns The created merge commit
   * 执行合并，创建合并 commit
   */
  executeMerge: async (message: string) => {
    const { mergeState, notifyCallback } = get();

    if (!mergeState) {
      const errorMsg = 'No merge in progress';
      set({ mergeError: errorMsg });
      notifyCallback?.(errorMsg, 'error');
      throw new Error(errorMsg);
    }

    // Set loading state
    set({ mergeLoading: true, mergeError: null });

    try {
      // Determine target branch for the merge commit (default to 'main')
      const targetBranch = mergeState.targetBranch || 'main';

      const response = await fetch(`${API_V1}/merge/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_hash: mergeState.sourceHash,
          target_hash: mergeState.targetHash,
          prepared: mergeState.prepared,
          message,
          branch: targetBranch, // Merge commit goes to target branch
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || 'Failed to execute merge');
      }

      const mergeCommit = json.data as CommitV3;

      // Get current nodes and edges to add the merge commit node
      const { nodes, edges } = get();

      // Find source and target nodes to calculate merge node position
      const sourceNode = nodes.find((n) => n.id === mergeState.sourceHash);
      const targetNode = nodes.find((n) => n.id === mergeState.targetHash);

      // Calculate position for merge commit node (below and between source/target)
      let mergeNodePosition = { x: 400, y: 400 }; // Default position
      if (sourceNode && targetNode) {
        const midX = (sourceNode.position.x + targetNode.position.x) / 2;
        const maxY = Math.max(sourceNode.position.y, targetNode.position.y);
        mergeNodePosition = snapPosition({
          x: midX,
          y: maxY + 200, // 200px below the lower node
        });
      } else if (sourceNode) {
        mergeNodePosition = snapPosition({
          x: sourceNode.position.x,
          y: sourceNode.position.y + 200,
        });
      } else if (targetNode) {
        mergeNodePosition = snapPosition({
          x: targetNode.position.x,
          y: targetNode.position.y + 200,
        });
      }

      // Create the merge commit node
      const mergeNode: Node<CanvasNodeData> = {
        id: mergeCommit.hash,
        type: 'unit',
        position: mergeNodePosition,
        data: {
          entryId: mergeCommit.hash.slice(0, 12),
          title: mergeCommit.message || 'Merge commit',
          summary: `${mergeCommit.content.sentences.length} sentences`,
          status: 'committed',
          timestamp: mergeCommit.committed_at,
          tags: ['merge'],
          kind: 'unit',
          // Commit data
          commitStatus: 'committed',
          commitHash: mergeCommit.hash,
          // Use targetBranch as fallback if mergeCommit.branch is not set
          branchType: (mergeCommit.branch || targetBranch) === 'main' ? 'main' : 'branch',
          branchName: (mergeCommit.branch || targetBranch) !== 'main' ? (mergeCommit.branch || targetBranch) : undefined,
          // Content
          sourceExcerpt: mergeCommit.content.sentences.map((s) => s.text),
          mustHave: mergeCommit.content.constraints?.filter((c) => c.type === 'require').map((c) => c.value) ?? undefined,
          mustntHave: mergeCommit.content.constraints?.filter((c) => c.type === 'exclude').map((c) => c.value) ?? undefined,
        },
      };

      // Create edges from parent commits to merge commit
      const newEdges: Edge[] = mergeCommit.parents.map((parentHash, idx) => ({
        id: `merge-edge-${parentHash}-${mergeCommit.hash}-${idx}`,
        source: parentHash,
        target: mergeCommit.hash,
        type: edgeType,
        animated: false,
        style: edgeStyle,
      }));

      // Update state with new node and edges
      set({
        nodes: [...nodes, mergeNode],
        edges: [...edges, ...newEdges],
        mergeState: null,
        mergeLoading: false,
        mergeError: null,
      });

      notifyCallback?.('Merge executed successfully', 'success');

      return mergeCommit;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({
        mergeLoading: false,
        mergeError: errorMessage,
      });

      notifyCallback?.(`Failed to execute merge: ${errorMessage}`, 'error');
      throw error;
    }
  },

  /**
   * Cancel the current merge operation
   * 取消当前合并操作
   */
  cancelMerge: () => {
    set({
      mergeState: null,
      mergeLoading: false,
      mergeError: null,
    });
  },

  /**
   * Clear merge error message
   * 清除合并错误信息
   */
  clearMergeError: () => {
    set({ mergeError: null });
  },
}));

// ============================================================================
// Merge Selectors (合并选择器)
// ============================================================================

/**
 * Is a merge currently in progress?
 * 是否正在进行合并？
 */
export const selectIsMerging = (state: CanvasState) => state.mergeState !== null;

/**
 * Can the merge be executed? (all similar pairs resolved)
 * 合并是否可以执行？（所有冲突都已解决）
 */
export const selectCanExecuteMerge = (state: CanvasState) => {
  if (!state.mergeState) return false;
  return state.mergeState.prepared.similarPairs.every((p) => p.resolution !== undefined);
};

/**
 * How many similar pairs are unresolved?
 * 有多少未解决的冲突？
 */
export const selectUnresolvedCount = (state: CanvasState) => {
  if (!state.mergeState) return 0;
  return state.mergeState.prepared.similarPairs.filter((p) => p.resolution === undefined).length;
};

/**
 * Get counts for merge summary
 * 获取合并统计数据
 */
export const selectMergeCounts = (state: CanvasState) => {
  if (!state.mergeState) {
    return null;
  }

  const { prepared } = state.mergeState;
  return {
    identical: prepared.identical.length,
    similar: prepared.similarPairs.length,
    onlyInSource: prepared.onlyInSource.length,
    onlyInTarget: prepared.onlyInTarget.length,
    resolved: prepared.similarPairs.filter((p) => p.resolution).length,
  };
};
