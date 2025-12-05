import { create } from 'zustand'
import { applyEdgeChanges, applyNodeChanges, MarkerType } from 'reactflow'
import type { Connection, Edge, EdgeChange, Node, NodeChange } from 'reactflow'
import type { BranchType, CanvasNodeData, NodeKind, ConversationConstraints, DraftConstraintOverrides, LeafType, CommitStatus, PendingCommitSource } from '../types/nodes'
import { createSourceTextBlock } from '../utils/tokenizer'

type DraftBranchMode = 'force-main' | 'select' | 'branch-only' | 'blocked'
type CommitTone = 'main-latest' | 'main-history' | 'branch-latest' | 'branch-history'

// Deletion confirmation state
type DeletionConfirmation = {
  nodeIds: string[]
  edgeIds: string[]
  message: string
  onConfirm: () => void
} | null

type CanvasState = {
  nodes: Node<CanvasNodeData>[]
  edges: Edge[]
  hasMainCommit: boolean
  latestMainCommitId?: string
  // Leaf panel state
  leafPanelOpen: boolean
  leafPanelCommitId?: string
  // Deletion confirmation state
  deletionConfirmation: DeletionConfirmation
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => void
  updateNode: (id: string, patch: Partial<CanvasNodeData>) => void
  commitPendingCommit: (id: string) => void
  addPendingCommitFromConversation: (conversationId: string) => void
  addConversationFromCommit: (commitId: string) => void
  addPendingCommitFromCommit: (commitId: string) => void
  createMergePendingCommit: (commitId: string) => void
  getPendingCommitBranchMode: (commitId: string) => DraftBranchMode
  canCreatePendingCommitFromConversation: (conversationId: string) => boolean
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  getCommitTone: (commitId: string) => CommitTone
  resetToSingleConversation: () => void
  // Conversation constraints management
  saveConversationConstraints: (conversationId: string, constraints: ConversationConstraints) => void
  getConversationConstraints: (conversationId: string) => ConversationConstraints | undefined
  // Pending commit constraint overrides
  updatePendingCommitConstraintOverrides: (commitId: string, overrides: Partial<DraftConstraintOverrides>) => void
  getPendingCommitEffectiveConstraints: (commitId: string) => { clauses: ConversationConstraints['clauses'], must_have: string[], mustnt_have: string[] } | undefined
  // Get source conversation for a pending commit
  getSourceConversationForPendingCommit: (commitId: string) => Node<CanvasNodeData> | undefined
  // Check if a conversation has any downstream pending commits (for locking)
  hasDownstreamPendingCommits: (conversationId: string) => boolean
  // Leaf panel methods
  openLeafPanel: (commitId: string) => void
  closeLeafPanel: () => void
  addLeafNode: (leafType: LeafType) => void
  // Deletion confirmation methods
  confirmDeletion: () => void
  cancelDeletion: () => void
}

const connectionMatrix: Record<NodeKind, NodeKind[]> = {
  conversation: ['commit', 'conversation'],
  commit: ['conversation', 'commit', 'leaf'],
  leaf: [],
}

const canConnect = (
  source?: Node<CanvasNodeData>,
  target?: Node<CanvasNodeData>,
) => {
  if (!source || !target) {
    return false
  }
  if (source.id === target.id) {
    return false
  }

  // Committed commits cannot accept new incoming connections
  if (
    target.data.kind === 'commit' &&
    target.data.commitStatus !== 'pending'
  ) {
    return false
  }

  return connectionMatrix[source.data.kind]?.includes(target.data.kind) ?? false
}

let nodeCounter = 4
let edgeCounter = 3

const nextNodeId = () => `node-${nodeCounter++}`
const nextEdgeId = () => `edge-${edgeCounter++}`
const edgeStyle = { stroke: '#8a8c92', strokeWidth: 3.6 }
const edgeType: Edge['type'] = 'default'
const conversationCommitOffset = 300
const commitQuickOffset = conversationCommitOffset + 40
const reactFlowGridSize = 16
const conversationNodeHeight = reactFlowGridSize * 8
const commitNodeHeight = reactFlowGridSize * 10
const mergeArrowMarker = {
  type: MarkerType.ArrowClosed,
  color: '#6d6f76',
  width: 18,
  height: 18,
} as const

const alignToGrid = (value: number) => Math.round(value / reactFlowGridSize) * reactFlowGridSize
const snapPosition = (position: { x: number; y: number }) => ({
  x: alignToGrid(position.x),
  y: alignToGrid(position.y),
})

const getNodeHeightForKind = (kind: NodeKind) => {
  if (kind === 'commit') {
    return commitNodeHeight
  }
  return conversationNodeHeight
}

const computeAttachedPosition = (
  source: Node<CanvasNodeData>,
  childKind: NodeKind,
  offsetX: number,
) => {
  const sourceHeight = getNodeHeightForKind(source.data.kind)
  const targetHeight = getNodeHeightForKind(childKind)
  const y = source.position.y + (sourceHeight - targetHeight) / 2
  return snapPosition({
    x: source.position.x + offsetX,
    y,
  })
}

const getNumericId = (id: string) => {
  const match = /(\d+)$/.exec(id)
  return match ? Number.parseInt(match[1], 10) : 0
}

const buildIncomingMap = (edges: Edge[]) => {
  const incoming = new Map<string, string[]>()
  edges.forEach((edge) => {
    const list = incoming.get(edge.target) ?? []
    list.push(edge.source)
    incoming.set(edge.target, list)
  })
  return incoming
}

const buildOutgoingMap = (edges: Edge[]) => {
  const outgoing = new Map<string, string[]>()
  edges.forEach((edge) => {
    const list = outgoing.get(edge.source) ?? []
    list.push(edge.target)
    outgoing.set(edge.source, list)
  })
  return outgoing
}

const getLockedNodeIds = (nodes: Node<CanvasNodeData>[], edges: Edge[]) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incomingMap = buildIncomingMap(edges)
  const locked = new Set<string>()

  // Only lock committed commits and their upstream committed commits
  // Pending commits and their upstream (non-committed) nodes are NOT locked
  const committedCommits = nodes.filter(
    (node) => node.data.kind === 'commit' && node.data.commitStatus === 'committed'
  )

  committedCommits.forEach((commit) => {
    // Lock the committed commit itself
    locked.add(commit.id)

    // Lock upstream committed commits only (stop at pending commits or conversations)
    const visited = new Set<string>()
    const stack = [...(incomingMap.get(commit.id) ?? [])]
    while (stack.length > 0) {
      const currentId = stack.pop()!
      if (visited.has(currentId)) continue
      visited.add(currentId)

      const currentNode = nodeMap.get(currentId)
      if (!currentNode) continue

      // Only lock if it's a committed commit
      if (currentNode.data.kind === 'commit' && currentNode.data.commitStatus === 'committed') {
        locked.add(currentId)
        // Continue traversing upstream
        const parents = incomingMap.get(currentId) ?? []
        parents.forEach((parentId) => {
          if (!visited.has(parentId)) stack.push(parentId)
        })
      }
      // Stop at pending commits, conversations, or leaves - they are NOT locked
    }
  })

  return locked
}

// Check if a node is upstream of any pending commit (needs confirmation on delete)
const isUpstreamOfPendingCommit = (
  nodeId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
): boolean => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const outgoingMap = buildOutgoingMap(edges)

  const visited = new Set<string>()
  const stack = [nodeId]

  while (stack.length > 0) {
    const currentId = stack.pop()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const currentNode = nodeMap.get(currentId)
    if (!currentNode) continue

    // Found a pending commit downstream
    if (currentNode.data.kind === 'commit' && currentNode.data.commitStatus === 'pending') {
      return true
    }

    // Continue traversing downstream
    const children = outgoingMap.get(currentId) ?? []
    children.forEach((childId) => {
      if (!visited.has(childId)) stack.push(childId)
    })
  }

  return false
}

// Collect all nodes that would be affected by deleting the given nodes
// Returns pending commits that would become orphaned
const collectAffectedPendingCommits = (
  nodeIds: string[],
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
): string[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const outgoingMap = buildOutgoingMap(edges)
  const toDelete = new Set(nodeIds)
  const affectedPendingCommits: string[] = []

  // For each node being deleted, find downstream pending commits
  nodeIds.forEach((nodeId) => {
    const visited = new Set<string>()
    const stack = [...(outgoingMap.get(nodeId) ?? [])]

    while (stack.length > 0) {
      const currentId = stack.pop()!
      if (visited.has(currentId) || toDelete.has(currentId)) continue
      visited.add(currentId)

      const currentNode = nodeMap.get(currentId)
      if (!currentNode) continue

      if (currentNode.data.kind === 'commit' && currentNode.data.commitStatus === 'pending') {
        if (!affectedPendingCommits.includes(currentId)) {
          affectedPendingCommits.push(currentId)
        }
      }

      const children = outgoingMap.get(currentId) ?? []
      children.forEach((childId) => {
        if (!visited.has(childId) && !toDelete.has(childId)) stack.push(childId)
      })
    }
  })

  return affectedPendingCommits
}

const findNearestMainAncestorCommit = (
  commitId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
): Node<CanvasNodeData> | undefined => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incomingMap = buildIncomingMap(edges)
  const visited = new Set<string>()
  const queue = [...(incomingMap.get(commitId) ?? [])]
  let latestMain: Node<CanvasNodeData> | undefined
  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) {
      continue
    }
    visited.add(currentId)
    const node = nodeMap.get(currentId)
    if (node && node.data.kind === 'commit' && node.data.branchType === 'main') {
      if (!latestMain || getNumericId(node.id) > getNumericId(latestMain.id)) {
        latestMain = node
      }
    }
    const parents = incomingMap.get(currentId) ?? []
    parents.forEach((parentId) => {
      if (!visited.has(parentId)) {
        queue.push(parentId)
      }
    })
  }
  return latestMain
}

const isDescendantOf = (
  nodeId: string,
  ancestorId: string,
  incomingMap: Map<string, string[]>,
  visited = new Set<string>(),
): boolean => {
  if (nodeId === ancestorId) {
    return true
  }
  if (visited.has(nodeId)) {
    return false
  }
  visited.add(nodeId)
  const sources = incomingMap.get(nodeId) ?? []
  return sources.some((sourceId) => {
    if (sourceId === ancestorId) {
      return true
    }
    return isDescendantOf(sourceId, ancestorId, incomingMap, visited)
  })
}

const hasCommitDescendant = (
  nodeId: string,
  nodeMap: Map<string, Node<CanvasNodeData>>,
  outgoingMap: Map<string, string[]>,
  visited = new Set<string>(),
): boolean => {
  if (visited.has(nodeId)) {
    return false
  }
  visited.add(nodeId)
  const targets = outgoingMap.get(nodeId) ?? []
  for (const targetId of targets) {
    const targetNode = nodeMap.get(targetId)
    if (!targetNode) {
      continue
    }
    if (targetNode.data.kind === 'commit') {
      return true
    }
    if (hasCommitDescendant(targetId, nodeMap, outgoingMap, visited)) {
      return true
    }
  }
  return false
}

const resolveLatestMainCommitId = (
  nodes: Node<CanvasNodeData>[],
  preferredId?: string,
): string | undefined => {
  if (
    preferredId &&
    nodes.some(
      (node) =>
        node.id === preferredId && node.data.kind === 'commit' && node.data.branchType === 'main',
    )
  ) {
    return preferredId
  }
  const mainCommits = nodes.filter(
    (node) => node.data.kind === 'commit' && node.data.branchType === 'main',
  )
  if (mainCommits.length === 0) {
    return undefined
  }
  return mainCommits.reduce((latest, node) =>
    getNumericId(node.id) > getNumericId(latest.id) ? node : latest,
  ).id
}

const buildSeedConversationNode = (): Node<CanvasNodeData> => {
  const id = nextNodeId()
  return {
    id,
    type: 'conversation',
    position: snapPosition({ x: 120, y: 120 }),
    data: {
      entryId: `CONV-${getNumericId(id)}`,
      title: 'Conversation: new workflow seed',
      summary: 'Start capturing context for this workflow.',
      status: 'raw-input',
      timestamp: 'just now',
      tags: ['conversation'],
      kind: 'conversation',
    },
  }
}

const computeCommitTone = (
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  latestMainCommitId?: string,
  commitId?: string,
): CommitTone => {
  if (!commitId) {
    return 'branch-history'
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const commitNode = nodeMap.get(commitId)
  if (!commitNode || commitNode.data.kind !== 'commit') {
    return 'branch-history'
  }
  const outgoingMap = buildOutgoingMap(edges)
  const descendantCache = new Map<string, boolean>()
  const ensureHasDescendant = (nodeId: string) => {
    if (descendantCache.has(nodeId)) {
      return descendantCache.get(nodeId)!
    }
    const result = hasCommitDescendant(nodeId, nodeMap, outgoingMap)
    descendantCache.set(nodeId, result)
    return result
  }
  if (commitNode.data.branchType === 'main') {
    const latest = resolveLatestMainCommitId(nodes, latestMainCommitId)
    return commitId === latest ? 'main-latest' : 'main-history'
  }
  if (commitNode.data.branchType === 'branch') {
    const branchKey = commitNode.data.branchName?.toLowerCase() ?? 'branch'
    const branchCommits = nodes.filter(
      (node) =>
        node.data.kind === 'commit' &&
        node.data.branchType === 'branch' &&
        (node.data.branchName?.toLowerCase() ?? 'branch') === branchKey,
    )
    const activeCandidates = branchCommits.filter((node) => !ensureHasDescendant(node.id))
    const activeCommit =
      activeCandidates.length > 0
        ? activeCandidates.reduce((latest, node) =>
            getNumericId(node.id) > getNumericId(latest.id) ? node : latest,
          )
        : undefined
    if (!activeCommit) {
      return 'branch-history'
    }
    return activeCommit.id === commitId ? 'branch-latest' : 'branch-history'
  }
  return 'branch-history'
}

const hasPrimaryAncestor = (
  nodeId: string,
  nodeMap: Map<string, Node<CanvasNodeData>>,
  incomingMap: Map<string, string[]>,
  visited = new Set<string>(),
): boolean => {
  if (visited.has(nodeId)) {
    return false
  }
  visited.add(nodeId)
  const node = nodeMap.get(nodeId)
  if (!node) {
    return false
  }
  if (node.data.kind === 'commit') {
    return node.data.branchType === 'main' || node.data.branchType === 'branch'
  }
  const sources = incomingMap.get(nodeId)
  if (!sources || sources.length === 0) {
    return false
  }
  return sources.some((sourceId) => hasPrimaryAncestor(sourceId, nodeMap, incomingMap, visited))
}

const determinePendingCommitBranchMode = (state: CanvasState, commitId: string): DraftBranchMode => {
  if (!state.hasMainCommit) {
    return 'force-main'
  }
  const nodeMap = new Map(state.nodes.map((node) => [node.id, node]))
  const incomingMap = buildIncomingMap(state.edges)
  const latestMainId = resolveLatestMainCommitId(state.nodes, state.latestMainCommitId)
  const attachedToLatestMain =
    latestMainId !== undefined && isDescendantOf(commitId, latestMainId, incomingMap)
  if (attachedToLatestMain) {
    return 'select'
  }
  return hasPrimaryAncestor(commitId, nodeMap, incomingMap) ? 'branch-only' : 'blocked'
}

const canConversationSeedPendingCommit = (
  conversationId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  hasMainCommit: boolean,
): boolean => {
  if (!hasMainCommit) {
    return true
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incomingMap = buildIncomingMap(edges)
  return hasPrimaryAncestor(conversationId, nodeMap, incomingMap)
}

const canAttachConversationToPendingCommit = (
  conversationId: string,
  commitId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  hasMainCommit: boolean,
): boolean => {
  if (!hasMainCommit) {
    return true
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incomingMap = buildIncomingMap(edges)
  if (hasPrimaryAncestor(commitId, nodeMap, incomingMap)) {
    return true
  }
  return hasPrimaryAncestor(conversationId, nodeMap, incomingMap)
}

// Sample source text for pending commit demo
const sampleSourceText1 = '我计划下周去大阪旅行，想体验当地的夜市文化和传统温泉。希望能品尝到正宗的章鱼烧和拉面，还想去道顿堀看看霓虹灯。'
const sampleSourceText2 = '预算大概在5000元左右，住宿偏好民宿或者商务酒店。行程最好能安排3到4天，不想太赶。'

// Create source blocks with model-suggested selections and keywords
const createSamplePendingSource = (): PendingCommitSource => {
  const block1 = createSourceTextBlock(
    'block-1',
    sampleSourceText1,
    // Model suggests: select most of the first sentence
    [{ start: 0, end: 25 }],  // "我计划下周去大阪旅行，想体验当地的夜市文化和传统温泉"
    // Model suggests these keywords
    [
      { tokenIndex: 5, constraint: 'must_have' },   // 大阪
      { tokenIndex: 13, constraint: 'must_have' },  // 夜市
      { tokenIndex: 17, constraint: 'must_have' },  // 温泉
    ]
  )

  const block2 = createSourceTextBlock(
    'block-2',
    sampleSourceText2,
    // Model suggests: select budget info
    [{ start: 0, end: 12 }],  // "预算大概在5000元左右"
    [
      { tokenIndex: 4, constraint: 'must_have' },   // 5000
    ]
  )

  return {
    textBlocks: [block1, block2],
  }
}

const seedNodes: Node<CanvasNodeData>[] = [
  {
    id: 'node-1',
    type: 'conversation',
    position: snapPosition({ x: 120, y: 120 }),
    data: {
      entryId: 'CONV-18',
      title: 'Conversation: 大阪旅行规划',
      summary: '用户分享了大阪旅行的计划，包括夜市、温泉、美食等偏好。',
      status: 'ready for extraction',
      timestamp: '14m ago',
      tags: ['conversation', 'travel'],
      kind: 'conversation',
    },
  },
  {
    id: 'node-2',
    type: 'commit',
    position: snapPosition({ x: 360, y: 240 }),
    data: {
      entryId: 'COMMIT-42',
      title: 'Commit: 大阪行程偏好',
      summary: '提取用户的旅行偏好和约束条件',
      status: 'pending review',
      timestamp: '10m ago',
      tags: ['commit', 'travel'],
      kind: 'commit',
      bridgePrompt: '/plan',
      pendingBranch: 'branch',
      pendingBranchName: '',
      commitStatus: 'pending',
      pendingSource: createSamplePendingSource(),
    },
  },
  {
    id: 'node-3',
    type: 'commit',
    position: snapPosition({ x: 620, y: 80 }),
    data: {
      entryId: 'COMMIT-27',
      title: 'Commit: Osaka weekend v2',
      summary: 'Validator-signed snapshot with 6 evidence links.',
      status: 'signed · ready to diff',
      timestamp: '2h ago',
      tags: ['commit', 'stable'],
      kind: 'commit',
      branchType: 'main',
      commitStatus: 'committed',
    },
  },
]

const seedEdges: Edge[] = [
  {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    type: edgeType,
    animated: false,
    style: edgeStyle,
  },
  {
    id: 'edge-2',
    source: 'node-2',
    target: 'node-3',
    type: edgeType,
    animated: false,
    style: edgeStyle,
  },
]

const initialLatestMainCommitId = resolveLatestMainCommitId(seedNodes)

const leafNodeHeight = reactFlowGridSize * 5
const leafNodeOffset = 80

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: seedNodes,
  edges: seedEdges,
  hasMainCommit: seedNodes.some(
    (node) => node.data.kind === 'commit' && node.data.branchType === 'main',
  ),
  latestMainCommitId: initialLatestMainCommitId,
  leafPanelOpen: false,
  leafPanelCommitId: undefined,
  deletionConfirmation: null,

  addNode: (kind, position) => {
    const total = get().nodes.length
    const basePosition =
      position ?? {
        x: 140 + (total % 3) * 220,
        y: 100 + Math.floor(total / 3) * 180,
      }
    const snappedPosition = snapPosition(basePosition)
    const newNode: Node<CanvasNodeData> = {
      id: nextNodeId(),
      type: kind,
      position: snappedPosition,
      data: {
        entryId: kind.toUpperCase(),
        title:
          kind === 'conversation'
            ? 'New Conversation'
            : 'New Commit',
        summary:
          kind === 'conversation'
            ? 'Capture the latest exchange before structuring.'
            : 'Snapshot that passed validator.',
        status:
          kind === 'conversation'
            ? 'raw-input'
            : 'stable',
        timestamp: 'just now',
        tags: [kind],
        kind,
        ...(kind === 'commit'
          ? {
              branchType: 'branch' as const,
              commitStatus: 'committed' as CommitStatus,
            }
          : {}),
      },
    }

    set((state) => ({
      nodes: [...state.nodes, newNode],
    }))
  },

  updateNode: (id, patch) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    })),

  commitPendingCommit: (id) =>
    set((state) => {
      const pendingNode = state.nodes.find((node) => node.id === id && node.data.kind === 'commit' && node.data.commitStatus === 'pending')
      if (!pendingNode) {
        return {}
      }

      const branchMode = determinePendingCommitBranchMode(state, id)
      if (branchMode === 'blocked') {
        return {}
      }
      const isMergeCommit = pendingNode.data.bridgePrompt === '/merge' && !!pendingNode.data.mergeConfig
      let branchType: BranchType = 'branch'

      if (branchMode === 'force-main' || isMergeCommit) {
        branchType = 'main'
      } else if (branchMode === 'select') {
        branchType = pendingNode.data.pendingBranch ?? 'branch'
      }

      const branchName =
        branchType === 'branch'
          ? pendingNode.data.pendingBranchName?.trim() || `branch-${getNumericId(id)}`
          : undefined

      const latestMainId = resolveLatestMainCommitId(state.nodes, state.latestMainCommitId)

      const updatedNodes = state.nodes.map<Node<CanvasNodeData>>((node) => {
        if (node.id !== id || node.data.commitStatus !== 'pending') {
          return node
        }
        const nextData: CanvasNodeData = {
          ...node.data,
          kind: 'commit',
          entryId: `COMMIT-${getNumericId(id)}`,
          status: 'Committed · awaiting diff',
          tags: Array.from(
            new Set([
              ...node.data.tags,
              'commit',
              ...(isMergeCommit ? ['merge'] : []),
            ]),
          ),
          branchType,
          branchName,
          pendingBranch: undefined,
          pendingBranchName: undefined,
          mergeConfig: undefined,
          isMergeCommit: isMergeCommit,
          commitStatus: 'committed',
        }

        return {
          ...node,
          type: 'commit',
          data: nextData,
        }
      })

      return {
        nodes: updatedNodes,
        hasMainCommit: state.hasMainCommit || branchType === 'main',
        latestMainCommitId: branchType === 'main' ? id : latestMainId,
      }
    }),

  addPendingCommitFromConversation: (conversationId) =>
    set((state) => {
      const source = state.nodes.find((node) => node.id === conversationId)
      if (!source || source.data.kind !== 'conversation') {
        return {}
      }
      const canSeed = canConversationSeedPendingCommit(
        conversationId,
        state.nodes,
        state.edges,
        state.hasMainCommit,
      )
      if (!canSeed) {
        return {}
      }

      const newNode: Node<CanvasNodeData> = {
        id: nextNodeId(),
        type: 'commit',
        position: computeAttachedPosition(source, 'commit', conversationCommitOffset),
        data: {
          entryId: `COMMIT-${nodeCounter}`,
          title: `Commit from ${source.data.entryId}`,
          summary: '',
          status: 'in progress',
          timestamp: 'just now',
          tags: ['commit'],
          kind: 'commit',
          bridgePrompt: 'prose',
          pendingBranch: 'branch',
          pendingBranchName: '',
          commitStatus: 'pending',
          // Pass upstream content to pending commit
          baselineSummary: source.data.summary,
          sourceConversationId: source.id,
        },
      }

      const newEdge: Edge = {
        id: nextEdgeId(),
        source: source.id,
        target: newNode.id,
        type: edgeType,
        animated: false,
        style: edgeStyle,
      }

      return {
        nodes: [...state.nodes, newNode],
        edges: [...state.edges, newEdge],
      }
    }),

  addConversationFromCommit: (commitId) =>
    set((state) => {
      const source = state.nodes.find(
        (node) => node.id === commitId && node.data.kind === 'commit',
      )
      if (!source) {
        return {}
      }
      const newNode: Node<CanvasNodeData> = {
        id: nextNodeId(),
        type: 'conversation',
        position: computeAttachedPosition(source, 'conversation', commitQuickOffset),
        data: {
          entryId: `CONV-${nodeCounter}`,
          title: `Conversation from ${source.data.entryId}`,
          summary: 'Capture the next exchange after this commit.',
          status: 'raw-input',
          timestamp: 'just now',
          tags: ['conversation'],
          kind: 'conversation',
        },
      }
      const newEdge: Edge = {
        id: nextEdgeId(),
        source: source.id,
        target: newNode.id,
        type: edgeType,
        animated: false,
        style: edgeStyle,
      }
      return {
        nodes: [...state.nodes, newNode],
        edges: [...state.edges, newEdge],
      }
    }),

  addPendingCommitFromCommit: (commitId) =>
    set((state) => {
      const source = state.nodes.find(
        (node) => node.id === commitId && node.data.kind === 'commit' && node.data.commitStatus === 'committed',
      )
      if (!source) {
        return {}
      }
      const newNode: Node<CanvasNodeData> = {
        id: nextNodeId(),
        type: 'commit',
        position: computeAttachedPosition(source, 'commit', commitQuickOffset),
        data: {
          entryId: `COMMIT-${nodeCounter}`,
          title: `Commit from ${source.data.entryId}`,
          summary: '',
          status: 'in progress',
          timestamp: 'just now',
          tags: ['commit'],
          kind: 'commit',
          bridgePrompt: 'prose',
          pendingBranch: 'branch',
          pendingBranchName: '',
          commitStatus: 'pending',
          // Pass upstream content to pending commit
          baselineSummary: source.data.summary,
        },
      }
      const newEdge: Edge = {
        id: nextEdgeId(),
        source: source.id,
        target: newNode.id,
        type: edgeType,
        animated: false,
        style: edgeStyle,
      }
      return {
        nodes: [...state.nodes, newNode],
        edges: [...state.edges, newEdge],
      }
    }),

  createMergePendingCommit: (commitId) =>
    set((state) => {
      const nodes = state.nodes
      const edges = state.edges
      const nodeMap = new Map(nodes.map((node) => [node.id, node]))
      const branchCommit = nodeMap.get(commitId)
      if (
        !branchCommit ||
        branchCommit.data.kind !== 'commit' ||
        branchCommit.data.branchType !== 'branch'
      ) {
        return {}
      }
      const latestMainId = resolveLatestMainCommitId(nodes, state.latestMainCommitId)
      if (!latestMainId) {
        return {}
      }
      const latestMainCommit = nodeMap.get(latestMainId)
      if (!latestMainCommit) {
        return {}
      }
      const outgoingMap = buildOutgoingMap(edges)
      const hasPendingMergeCommit =
        outgoingMap
          .get(commitId)
          ?.some((targetId) => {
            const targetNode = nodeMap.get(targetId)
            return targetNode?.data.kind === 'commit' && targetNode.data.commitStatus === 'pending' && targetNode.data.bridgePrompt === '/merge'
          }) ?? false
      if (hasPendingMergeCommit) {
        return {}
      }
      const tone = computeCommitTone(nodes, edges, state.latestMainCommitId, commitId)
      if (tone !== 'branch-latest') {
        return {}
      }
      const baseCommit = findNearestMainAncestorCommit(commitId, nodes, edges)
      const mergeNodeId = nextNodeId()
      const mergeLabel =
        branchCommit.data.branchName?.trim() || branchCommit.data.title || 'branch'
      const mergeConfig = {
        targetCommitId: latestMainCommit.id,
        targetCommitTitle: latestMainCommit.data.title,
        targetContent: latestMainCommit.data.summary,
        sourceCommitId: branchCommit.id,
        sourceCommitTitle: branchCommit.data.title,
        sourceContent: branchCommit.data.summary,
        baseCommitId: baseCommit?.id,
        baseCommitTitle: baseCommit?.data.title,
        baseContent: baseCommit?.data.summary,
      }
      const mergePendingCommit: Node<CanvasNodeData> = {
        id: mergeNodeId,
        type: 'commit',
        position: computeAttachedPosition(latestMainCommit, 'commit', commitQuickOffset),
        data: {
          entryId: `MERGE-${getNumericId(mergeNodeId)}`,
          title: `Merge · ${mergeLabel}`,
          summary: 'Resolve semantic conflicts before committing to main.',
          status: 'merge in progress',
          timestamp: 'just now',
          tags: ['commit', 'merge'],
          kind: 'commit',
          bridgePrompt: '/merge',
          pendingBranch: 'main',
          mergeConfig,
          commitStatus: 'pending',
        },
      }

      const mainEdge: Edge = {
        id: nextEdgeId(),
        source: latestMainCommit.id,
        target: mergeNodeId,
        type: edgeType,
        animated: false,
        style: edgeStyle,
      }

      const branchEdge: Edge = {
        id: nextEdgeId(),
        source: branchCommit.id,
        target: mergeNodeId,
        type: edgeType,
        animated: false,
        style: edgeStyle,
        markerEnd: mergeArrowMarker,
      }

      return {
        nodes: [...nodes, mergePendingCommit],
        edges: [...edges, mainEdge, branchEdge],
      }
    }),

  getPendingCommitBranchMode: (commitId) => determinePendingCommitBranchMode(get(), commitId),
  canCreatePendingCommitFromConversation: (conversationId) => {
    const state = get()
    const node = state.nodes.find(
      (candidate) => candidate.id === conversationId && candidate.data.kind === 'conversation',
    )
    if (!node) {
      return false
    }
    return canConversationSeedPendingCommit(conversationId, state.nodes, state.edges, state.hasMainCommit)
  },

  onNodesChange: (changes) =>
    set((state) => {
      if (changes.length === 0) {
        return {}
      }

      // Debug logging
      console.log('[onNodesChange] changes:', changes)

      const nodeMap = new Map(state.nodes.map((n) => [n.id, n]))
      const lockedNodes = getLockedNodeIds(state.nodes, state.edges)
      console.log('[onNodesChange] lockedNodes:', Array.from(lockedNodes))

      // Separate remove changes from other changes
      const removeChanges = changes.filter((c) => c.type === 'remove')
      const otherChanges = changes.filter((c) => c.type !== 'remove')
      console.log('[onNodesChange] removeChanges:', removeChanges)

      // Filter out locked nodes from removal
      const allowedRemoves = removeChanges.filter((c) => !lockedNodes.has(c.id))
      console.log('[onNodesChange] allowedRemoves:', allowedRemoves)

      if (allowedRemoves.length === 0) {
        // No removes, just apply other changes
        if (otherChanges.length === 0) return {}
        return {
          nodes: applyNodeChanges(otherChanges, state.nodes).map((node) => ({
            ...node,
            position: snapPosition(node.position),
          })),
        }
      }

      // Check if any of the nodes to be removed need confirmation
      const nodeIdsToRemove = allowedRemoves.map((c) => c.id)
      const needsConfirmation: string[] = []
      const directDeletes: string[] = []

      nodeIdsToRemove.forEach((nodeId) => {
        const node = nodeMap.get(nodeId)
        if (!node) return

        // Pending commit needs confirmation
        if (node.data.kind === 'commit' && node.data.commitStatus === 'pending') {
          needsConfirmation.push(nodeId)
          return
        }

        // Node upstream of pending commit needs confirmation
        if (isUpstreamOfPendingCommit(nodeId, state.nodes, state.edges)) {
          needsConfirmation.push(nodeId)
          return
        }

        // Otherwise, can delete directly
        directDeletes.push(nodeId)
      })

      console.log('[onNodesChange] needsConfirmation:', needsConfirmation)
      console.log('[onNodesChange] directDeletes:', directDeletes)

      // If there are nodes needing confirmation, show dialog
      if (needsConfirmation.length > 0) {
        // Build confirmation message
        const pendingCommitsInSelection = needsConfirmation.filter((id) => {
          const n = nodeMap.get(id)
          return n?.data.kind === 'commit' && n?.data.commitStatus === 'pending'
        })
        const upstreamNodes = needsConfirmation.filter((id) => !pendingCommitsInSelection.includes(id))
        const affectedDownstream = collectAffectedPendingCommits(needsConfirmation, state.nodes, state.edges)

        let message = ''
        if (pendingCommitsInSelection.length > 0) {
          message += `Discard ${pendingCommitsInSelection.length} pending commit(s)?`
        }
        if (upstreamNodes.length > 0) {
          if (message) message += '\n'
          message += `Delete ${upstreamNodes.length} upstream node(s)?`
        }
        if (affectedDownstream.length > 0) {
          if (message) message += '\n'
          message += `This will also affect ${affectedDownstream.length} downstream pending commit(s).`
        }

        // Collect edges that connect to/from nodes being deleted
        const edgesToRemove = state.edges
          .filter((e) => needsConfirmation.includes(e.source) || needsConfirmation.includes(e.target))
          .map((e) => e.id)

        // Apply direct deletes immediately, but defer confirmation nodes
        const directRemoveChanges = allowedRemoves.filter((c) => directDeletes.includes(c.id))
        const newNodes = directRemoveChanges.length > 0
          ? applyNodeChanges([...otherChanges, ...directRemoveChanges], state.nodes).map((node) => ({
              ...node,
              position: snapPosition(node.position),
            }))
          : otherChanges.length > 0
            ? applyNodeChanges(otherChanges, state.nodes).map((node) => ({
                ...node,
                position: snapPosition(node.position),
              }))
            : state.nodes

        return {
          nodes: newNodes,
          deletionConfirmation: {
            nodeIds: needsConfirmation,
            edgeIds: edgesToRemove,
            message,
            onConfirm: () => {
              // This will be called when user confirms
              set((s) => {
                const nodesToDelete = new Set(needsConfirmation)
                const edgesToDelete = new Set(edgesToRemove)
                return {
                  nodes: s.nodes.filter((n) => !nodesToDelete.has(n.id)),
                  edges: s.edges.filter((e) => !edgesToDelete.has(e.id) && !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target)),
                  deletionConfirmation: null,
                }
              })
            },
          },
        }
      }

      // No confirmation needed, apply all changes
      return {
        nodes: applyNodeChanges([...otherChanges, ...allowedRemoves], state.nodes).map((node) => ({
          ...node,
          position: snapPosition(node.position),
        })),
      }
    }),

  onEdgesChange: (changes) =>
    set((state) => {
      if (changes.length === 0) {
        return {}
      }

      const nodeMap = new Map(state.nodes.map((n) => [n.id, n]))
      const lockedNodes = getLockedNodeIds(state.nodes, state.edges)

      // Separate remove changes from other changes
      const removeChanges = changes.filter((c) => c.type === 'remove')
      const otherChanges = changes.filter((c) => c.type !== 'remove')

      // Filter out edges between locked nodes
      const allowedRemoves = removeChanges.filter((c) => {
        const edge = state.edges.find((e) => e.id === c.id)
        if (!edge) return false
        const sourceLocked = lockedNodes.has(edge.source)
        const targetLocked = lockedNodes.has(edge.target)
        // Only block if BOTH ends are locked (committed commits)
        return !(sourceLocked && targetLocked)
      })

      if (allowedRemoves.length === 0) {
        if (otherChanges.length === 0) return {}
        return { edges: applyEdgeChanges(otherChanges, state.edges) }
      }

      // Check if any edge removal needs confirmation
      // An edge needs confirmation if it connects to a pending commit
      const needsConfirmation: string[] = []
      const directDeletes: string[] = []

      allowedRemoves.forEach((c) => {
        const edge = state.edges.find((e) => e.id === c.id)
        if (!edge) return

        const targetNode = nodeMap.get(edge.target)

        // Edge going INTO a pending commit needs confirmation
        if (targetNode?.data.kind === 'commit' && targetNode?.data.commitStatus === 'pending') {
          needsConfirmation.push(c.id)
          return
        }

        // Edge from a node that feeds into pending commit downstream
        if (isUpstreamOfPendingCommit(edge.source, state.nodes, state.edges)) {
          needsConfirmation.push(c.id)
          return
        }

        directDeletes.push(c.id)
      })

      if (needsConfirmation.length > 0) {
        // Find affected pending commits
        const affectedPendingCommits = new Set<string>()
        needsConfirmation.forEach((edgeId) => {
          const edge = state.edges.find((e) => e.id === edgeId)
          if (!edge) return

          const targetNode = nodeMap.get(edge.target)
          if (targetNode?.data.kind === 'commit' && targetNode?.data.commitStatus === 'pending') {
            affectedPendingCommits.add(edge.target)
          }

          // Also check downstream
          const downstream = collectAffectedPendingCommits([edge.source], state.nodes, state.edges)
          downstream.forEach((id) => affectedPendingCommits.add(id))
        })

        const message = affectedPendingCommits.size > 0
          ? `This will disconnect ${affectedPendingCommits.size} pending commit(s) from their source. Continue?`
          : `Delete ${needsConfirmation.length} connection(s)?`

        // Apply direct deletes immediately
        const directRemoveChanges = allowedRemoves.filter((c) => directDeletes.includes(c.id))
        const newEdges = directRemoveChanges.length > 0
          ? applyEdgeChanges([...otherChanges, ...directRemoveChanges], state.edges)
          : otherChanges.length > 0
            ? applyEdgeChanges(otherChanges, state.edges)
            : state.edges

        return {
          edges: newEdges,
          deletionConfirmation: {
            nodeIds: [],
            edgeIds: needsConfirmation,
            message,
            onConfirm: () => {
              set((s) => {
                const edgesToDelete = new Set(needsConfirmation)
                return {
                  edges: s.edges.filter((e) => !edgesToDelete.has(e.id)),
                  deletionConfirmation: null,
                }
              })
            },
          },
        }
      }

      // No confirmation needed
      return {
        edges: applyEdgeChanges([...otherChanges, ...allowedRemoves], state.edges),
      }
    }),

  onConnect: (connection) => {
    const { nodes, edges, hasMainCommit } = get()
    const source = nodes.find((node) => node.id === connection.source)
    const target = nodes.find((node) => node.id === connection.target)

    if (!canConnect(source, target)) {
      return
    }
    // Check if connecting conversation to pending commit
    if (
      source?.data.kind === 'conversation' &&
      target?.data.kind === 'commit' &&
      target?.data.commitStatus === 'pending' &&
      !canAttachConversationToPendingCommit(
        source.id,
        target.id,
        nodes,
        edges,
        hasMainCommit,
      )
    ) {
      return
    }

    const exists = edges.some(
      (edge) => edge.source === connection.source && edge.target === connection.target,
    )

    if (exists) {
      return
    }

    const newEdge: Edge = {
      id: nextEdgeId(),
      source: connection.source!,
      target: connection.target!,
      type: edgeType,
      animated: false,
      style: edgeStyle,
    }

    set({ edges: [...edges, newEdge] })
  },
  getCommitTone: (commitId) => {
    const state = get()
    return computeCommitTone(state.nodes, state.edges, state.latestMainCommitId, commitId)
  },
  resetToSingleConversation: () => {
    nodeCounter = 1
    edgeCounter = 1
    const starter = buildSeedConversationNode()
    set({
      nodes: [starter],
      edges: [],
      hasMainCommit: false,
      latestMainCommitId: undefined,
    })
  },

  // Save constraints to a conversation node
  saveConversationConstraints: (conversationId, constraints) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === conversationId && node.data.kind === 'conversation'
          ? { ...node, data: { ...node.data, constraints } }
          : node
      ),
    })),

  // Get constraints from a conversation node
  getConversationConstraints: (conversationId) => {
    const state = get()
    const node = state.nodes.find(
      (n) => n.id === conversationId && n.data.kind === 'conversation'
    )
    return node?.data.constraints
  },

  // Update pending commit constraint overrides
  updatePendingCommitConstraintOverrides: (commitId, overrides) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== commitId || node.data.kind !== 'commit' || node.data.commitStatus !== 'pending') {
          return node
        }
        const currentOverrides = node.data.constraintOverrides ?? {
          disabledClauseIds: [],
          additionalMustHave: [],
          additionalMustntHave: [],
          removedMustHave: [],
          removedMustntHave: [],
        }
        return {
          ...node,
          data: {
            ...node.data,
            constraintOverrides: { ...currentOverrides, ...overrides },
          },
        }
      }),
    })),

  // Get source conversation for a pending commit (follows edges backward)
  getSourceConversationForPendingCommit: (commitId) => {
    const state = get()
    const incomingMap = buildIncomingMap(state.edges)
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]))

    // BFS to find the first conversation ancestor
    const visited = new Set<string>()
    const queue = [...(incomingMap.get(commitId) ?? [])]

    while (queue.length > 0) {
      const currentId = queue.shift()!
      if (visited.has(currentId)) continue
      visited.add(currentId)

      const node = nodeMap.get(currentId)
      if (node?.data.kind === 'conversation') {
        return node
      }

      const parents = incomingMap.get(currentId) ?? []
      parents.forEach((p) => {
        if (!visited.has(p)) queue.push(p)
      })
    }
    return undefined
  },

  // Get effective constraints for a pending commit (conversation constraints + overrides)
  getPendingCommitEffectiveConstraints: (commitId) => {
    const state = get()
    const pendingNode = state.nodes.find(
      (n) => n.id === commitId && n.data.kind === 'commit' && n.data.commitStatus === 'pending'
    )
    if (!pendingNode) return undefined

    // Find source conversation
    const sourceConv = get().getSourceConversationForPendingCommit(commitId)
    const baseConstraints = sourceConv?.data.constraints
    if (!baseConstraints) return undefined

    const overrides = pendingNode.data.constraintOverrides

    // Apply overrides
    const clauses = baseConstraints.clauses.filter(
      (c) => !overrides?.disabledClauseIds?.includes(c.id)
    )

    const must_have = [
      ...baseConstraints.must_have.filter(
        (kw) => !overrides?.removedMustHave?.includes(kw)
      ),
      ...(overrides?.additionalMustHave ?? []),
    ]

    const mustnt_have = [
      ...baseConstraints.mustnt_have.filter(
        (kw) => !overrides?.removedMustntHave?.includes(kw)
      ),
      ...(overrides?.additionalMustntHave ?? []),
    ]

    return { clauses, must_have, mustnt_have }
  },

  // Check if a conversation has any downstream pending commits (for locking editing)
  hasDownstreamPendingCommits: (conversationId) => {
    const state = get()
    const outgoingMap = buildOutgoingMap(state.edges)
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]))

    // BFS to find any pending commit descendant
    const visited = new Set<string>()
    const queue = [...(outgoingMap.get(conversationId) ?? [])]

    while (queue.length > 0) {
      const currentId = queue.shift()!
      if (visited.has(currentId)) continue
      visited.add(currentId)

      const node = nodeMap.get(currentId)
      if (node?.data.kind === 'commit' && node?.data.commitStatus === 'pending') {
        return true
      }

      const children = outgoingMap.get(currentId) ?? []
      children.forEach((c) => {
        if (!visited.has(c)) queue.push(c)
      })
    }
    return false
  },

  // Leaf panel methods
  openLeafPanel: (commitId) => set({ leafPanelOpen: true, leafPanelCommitId: commitId }),
  closeLeafPanel: () => set({ leafPanelOpen: false, leafPanelCommitId: undefined }),

  addLeafNode: (leafType) =>
    set((state) => {
      const commitId = state.leafPanelCommitId
      if (!commitId) return {}

      const commitNode = state.nodes.find(
        (node) => node.id === commitId && node.data.kind === 'commit'
      )
      if (!commitNode) return {}

      // Count existing leaf nodes connected to this commit to offset position
      const existingLeafCount = state.edges.filter((edge) => {
        if (edge.source !== commitId) return false
        const targetNode = state.nodes.find((n) => n.id === edge.target)
        return targetNode?.data.kind === 'leaf'
      }).length

      const newNodeId = nextNodeId()
      const leafLabels: Record<LeafType, string> = {
        twitter: 'Twitter',
        weibo: '微博',
        wechat: '朋友圈',
        article: '文章',
        email: 'Email',
        slack: 'Slack',
      }

      // Position leaf above the commit node
      const newNode: Node<CanvasNodeData> = {
        id: newNodeId,
        type: 'leaf',
        position: snapPosition({
          x: commitNode.position.x + commitQuickOffset,
          y: commitNode.position.y - leafNodeHeight - leafNodeOffset - (existingLeafCount * (leafNodeHeight + 20)),
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
        },
      }

      const newEdge: Edge = {
        id: nextEdgeId(),
        source: commitId,
        target: newNodeId,
        type: edgeType,
        animated: false,
        style: edgeStyle,
      }

      return {
        nodes: [...state.nodes, newNode],
        edges: [...state.edges, newEdge],
        leafPanelOpen: false,
        leafPanelCommitId: undefined,
      }
    }),

  // Deletion confirmation methods
  confirmDeletion: () => {
    const state = get()
    if (state.deletionConfirmation?.onConfirm) {
      state.deletionConfirmation.onConfirm()
    }
  },

  cancelDeletion: () => set({ deletionConfirmation: null }),
}))
