import { create } from 'zustand'
import { applyEdgeChanges, applyNodeChanges, MarkerType } from 'reactflow'
import type { Connection, Edge, EdgeChange, Node, NodeChange } from 'reactflow'
import type { BranchType, CanvasNodeData, NodeKind, ConversationConstraints, DraftConstraintOverrides, LeafType } from '../types/nodes'

type DraftBranchMode = 'force-main' | 'select' | 'branch-only' | 'blocked'
type CommitTone = 'main-latest' | 'main-history' | 'branch-latest' | 'branch-history'

type CanvasState = {
  nodes: Node<CanvasNodeData>[]
  edges: Edge[]
  hasMainCommit: boolean
  latestMainCommitId?: string
  // Leaf panel state
  leafPanelOpen: boolean
  leafPanelCommitId?: string
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => void
  updateNode: (id: string, patch: Partial<CanvasNodeData>) => void
  convertDraftToCommit: (id: string) => void
  addDraftFromConversation: (conversationId: string) => void
  addConversationFromCommit: (commitId: string) => void
  addDraftFromCommit: (commitId: string) => void
  createMergeDraftFromCommit: (commitId: string) => void
  getDraftBranchMode: (draftId: string) => DraftBranchMode
  canCreateDraftFromConversation: (conversationId: string) => boolean
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  getCommitTone: (commitId: string) => CommitTone
  resetToSingleConversation: () => void
  // Conversation constraints management
  saveConversationConstraints: (conversationId: string, constraints: ConversationConstraints) => void
  getConversationConstraints: (conversationId: string) => ConversationConstraints | undefined
  // Draft constraint overrides
  updateDraftConstraintOverrides: (draftId: string, overrides: Partial<DraftConstraintOverrides>) => void
  getDraftEffectiveConstraints: (draftId: string) => { clauses: ConversationConstraints['clauses'], must_have: string[], mustnt_have: string[] } | undefined
  // Get source conversation for a draft
  getSourceConversationForDraft: (draftId: string) => Node<CanvasNodeData> | undefined
  // Check if a conversation has any downstream drafts (for locking)
  hasDownstreamDrafts: (conversationId: string) => boolean
  // Leaf panel methods
  openLeafPanel: (commitId: string) => void
  closeLeafPanel: () => void
  addLeafNode: (leafType: LeafType) => void
}

const connectionMatrix: Record<NodeKind, NodeKind[]> = {
  conversation: ['draft', 'conversation'],
  draft: ['commit'],
  commit: ['conversation', 'draft', 'leaf'],
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

  return connectionMatrix[source.data.kind]?.includes(target.data.kind) ?? false
}

let nodeCounter = 4
let edgeCounter = 3

const nextNodeId = () => `node-${nodeCounter++}`
const nextEdgeId = () => `edge-${edgeCounter++}`
const edgeStyle = { stroke: '#8a8c92', strokeWidth: 3.6 }
const edgeType: Edge['type'] = 'default'
const conversationDraftOffset = 300
const commitQuickOffset = conversationDraftOffset + 40
const reactFlowGridSize = 16
const conversationNodeHeight = reactFlowGridSize * 8
const draftNodeHeight = reactFlowGridSize * 10
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
  if (kind === 'draft') {
    return draftNodeHeight
  }
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

const collectAncestors = (startId: string, incomingMap: Map<string, string[]>) => {
  const visited = new Set<string>()
  const stack = [startId]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (visited.has(current)) {
      continue
    }
    visited.add(current)
    const sources = incomingMap.get(current) ?? []
    sources.forEach((sourceId) => {
      if (!visited.has(sourceId)) {
        stack.push(sourceId)
      }
    })
  }
  return visited
}

const getLatestCommitIdsByBranch = (nodes: Node<CanvasNodeData>[]) => {
  const latest = new Map<string, Node<CanvasNodeData>>()
  nodes.forEach((node) => {
    if (node.data.kind !== 'commit') {
      return
    }
    const key =
      node.data.branchType === 'main'
        ? 'main'
        : `branch:${(node.data.branchName ?? 'branch').toLowerCase()}`
    const current = latest.get(key)
    if (!current || getNumericId(node.id) > getNumericId(current.id)) {
      latest.set(key, node)
    }
  })
  return Array.from(latest.values()).map((node) => node.id)
}

const getLockedNodeIds = (nodes: Node<CanvasNodeData>[], edges: Edge[]) => {
  const incomingMap = buildIncomingMap(edges)
  const locked = new Set<string>()
  const latestCommits = getLatestCommitIdsByBranch(nodes)
  latestCommits.forEach((commitId) => {
    const ancestors = collectAncestors(commitId, incomingMap)
    ancestors.forEach((nodeId) => locked.add(nodeId))
  })
  return locked
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

const determineDraftBranchMode = (state: CanvasState, draftId: string): DraftBranchMode => {
  if (!state.hasMainCommit) {
    return 'force-main'
  }
  const nodeMap = new Map(state.nodes.map((node) => [node.id, node]))
  const incomingMap = buildIncomingMap(state.edges)
  const latestMainId = resolveLatestMainCommitId(state.nodes, state.latestMainCommitId)
  const attachedToLatestMain =
    latestMainId !== undefined && isDescendantOf(draftId, latestMainId, incomingMap)
  if (attachedToLatestMain) {
    return 'select'
  }
  return hasPrimaryAncestor(draftId, nodeMap, incomingMap) ? 'branch-only' : 'blocked'
}

const canConversationSeedDraft = (
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

const canAttachConversationToDraft = (
  conversationId: string,
  draftId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  hasMainCommit: boolean,
): boolean => {
  if (!hasMainCommit) {
    return true
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incomingMap = buildIncomingMap(edges)
  if (hasPrimaryAncestor(draftId, nodeMap, incomingMap)) {
    return true
  }
  return hasPrimaryAncestor(conversationId, nodeMap, incomingMap)
}

const seedNodes: Node<CanvasNodeData>[] = [
  {
    id: 'node-1',
    type: 'conversation',
    position: snapPosition({ x: 120, y: 120 }),
    data: {
      entryId: 'CONV-18',
      title: 'Conversation: food-heavy reiteration',
      summary: '“I want neon, late-night ramen alleys, and buzzing markets.”',
      status: 'ready for extraction',
      timestamp: '14m ago',
      tags: ['conversation', 'preference'],
      kind: 'conversation',
    },
  },
  {
    id: 'node-2',
    type: 'draft',
    position: snapPosition({ x: 360, y: 240 }),
    data: {
      entryId: 'DRAFT-42',
      title: 'Draft: Osaka nightlife shard',
      summary: 'Includes Dotonbori, Kuromon, and Namba Yasaka blend.',
      status: 'needs validator',
      timestamp: '10m ago',
      tags: ['draft', 'nightlife'],
      kind: 'draft',
      bridgePrompt: '/plan',
      pendingBranch: 'branch',
      pendingBranchName: '',
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
            : kind === 'draft'
              ? 'New Draft'
              : 'New Commit',
        summary:
          kind === 'conversation'
            ? 'Capture the latest exchange before structuring.'
            : kind === 'draft'
              ? 'Blend conversations and commits, then validate.'
              : 'Snapshot that passed validator.',
        status:
          kind === 'conversation'
            ? 'raw-input'
            : kind === 'draft'
              ? 'working'
              : 'stable',
        timestamp: 'just now',
        tags: [kind],
        kind,
        ...(kind === 'draft'
          ? {
              bridgePrompt: '/plan',
              pendingBranch: 'branch' as const,
              pendingBranchName: '',
            }
          : {}),
        ...(kind === 'commit'
          ? {
              branchType: 'branch' as const,
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

  convertDraftToCommit: (id) =>
    set((state) => {
      const draftNode = state.nodes.find((node) => node.id === id && node.data.kind === 'draft')
      if (!draftNode) {
        return {}
      }

      const branchMode = determineDraftBranchMode(state, id)
      if (branchMode === 'blocked') {
        return {}
      }
      const isMergeDraft = draftNode.data.bridgePrompt === '/merge' && !!draftNode.data.mergeConfig
      let branchType: BranchType = 'branch'

      if (branchMode === 'force-main' || isMergeDraft) {
        branchType = 'main'
      } else if (branchMode === 'select') {
        branchType = draftNode.data.pendingBranch ?? 'branch'
      }

      const branchName =
        branchType === 'branch'
          ? draftNode.data.pendingBranchName?.trim() || `branch-${getNumericId(id)}`
          : undefined

      const latestMainId = resolveLatestMainCommitId(state.nodes, state.latestMainCommitId)

      const updatedNodes = state.nodes.map<Node<CanvasNodeData>>((node) => {
        if (node.id !== id || node.data.kind !== 'draft') {
          return node
        }
        const nextData: CanvasNodeData = {
          ...node.data,
          kind: 'commit',
          entryId: `COMMIT-${getNumericId(id)}`,
          status: 'Committed · awaiting diff',
          tags: Array.from(
            new Set([
              ...node.data.tags.filter((tag) => tag !== 'draft'),
              'commit',
              ...(isMergeDraft ? ['merge'] : []),
            ]),
          ),
          branchType,
          branchName,
          pendingBranch: undefined,
          pendingBranchName: undefined,
          mergeConfig: undefined,
          isMergeCommit: isMergeDraft,
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

  addDraftFromConversation: (conversationId) =>
    set((state) => {
      const source = state.nodes.find((node) => node.id === conversationId)
      if (!source || source.data.kind !== 'conversation') {
        return {}
      }
      const canSeed = canConversationSeedDraft(
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
        type: 'draft',
        position: computeAttachedPosition(source, 'draft', conversationDraftOffset),
        data: {
          entryId: `DRAFT-${nodeCounter}`,
          title: `Draft from ${source.data.entryId}`,
          summary: '',
          status: 'in progress',
          timestamp: 'just now',
          tags: ['draft'],
          kind: 'draft',
          bridgePrompt: 'prose',
          pendingBranch: 'branch',
          pendingBranchName: '',
          // Pass upstream content to draft
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

  addDraftFromCommit: (commitId) =>
    set((state) => {
      const source = state.nodes.find(
        (node) => node.id === commitId && node.data.kind === 'commit',
      )
      if (!source) {
        return {}
      }
      const newNode: Node<CanvasNodeData> = {
        id: nextNodeId(),
        type: 'draft',
        position: computeAttachedPosition(source, 'draft', commitQuickOffset),
        data: {
          entryId: `DRAFT-${nodeCounter}`,
          title: `Draft from ${source.data.entryId}`,
          summary: '',
          status: 'in progress',
          timestamp: 'just now',
          tags: ['draft'],
          kind: 'draft',
          bridgePrompt: 'prose',
          pendingBranch: 'branch',
          pendingBranchName: '',
          // Pass upstream content to draft
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

  createMergeDraftFromCommit: (commitId) =>
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
      const hasPendingMergeDraft =
        outgoingMap
          .get(commitId)
          ?.some((targetId) => {
            const targetNode = nodeMap.get(targetId)
            return targetNode?.data.kind === 'draft' && targetNode.data.bridgePrompt === '/merge'
          }) ?? false
      if (hasPendingMergeDraft) {
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
      const mergeDraft: Node<CanvasNodeData> = {
        id: mergeNodeId,
        type: 'draft',
        position: computeAttachedPosition(latestMainCommit, 'draft', commitQuickOffset),
        data: {
          entryId: `MERGE-${getNumericId(mergeNodeId)}`,
          title: `Merge · ${mergeLabel}`,
          summary: 'Resolve semantic conflicts before committing to main.',
          status: 'merge in progress',
          timestamp: 'just now',
          tags: ['draft', 'merge'],
          kind: 'draft',
          bridgePrompt: '/merge',
          pendingBranch: 'main',
          mergeConfig,
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
        nodes: [...nodes, mergeDraft],
        edges: [...edges, mainEdge, branchEdge],
      }
    }),

  getDraftBranchMode: (draftId) => determineDraftBranchMode(get(), draftId),
  canCreateDraftFromConversation: (conversationId) => {
    const state = get()
    const node = state.nodes.find(
      (candidate) => candidate.id === conversationId && candidate.data.kind === 'conversation',
    )
    if (!node) {
      return false
    }
    return canConversationSeedDraft(conversationId, state.nodes, state.edges, state.hasMainCommit)
  },

  onNodesChange: (changes) =>
    set((state) => {
      if (changes.length === 0) {
        return {}
      }
      const lockedNodes = getLockedNodeIds(state.nodes, state.edges)
      const filteredChanges = changes.filter((change) => {
        if (change.type !== 'remove') {
          return true
        }
        return !lockedNodes.has(change.id)
      })
      if (filteredChanges.length === 0) {
        return {}
      }
      return {
        nodes: applyNodeChanges(filteredChanges, state.nodes).map((node) => ({
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
      const lockedNodes = getLockedNodeIds(state.nodes, state.edges)
      const filtered = changes.filter((change) => {
        if (change.type !== 'remove') {
          return true
        }
        const edge = state.edges.find((candidate) => candidate.id === change.id)
        if (!edge) {
          return false
        }
        const sourceLocked = lockedNodes.has(edge.source)
        const targetLocked = lockedNodes.has(edge.target)
        if (sourceLocked && targetLocked) {
          return false
        }
        return true
      })
      if (filtered.length === 0) {
        return {}
      }
      return {
        edges: applyEdgeChanges(filtered, state.edges),
      }
    }),

  onConnect: (connection) => {
    const { nodes, edges, hasMainCommit } = get()
    const source = nodes.find((node) => node.id === connection.source)
    const target = nodes.find((node) => node.id === connection.target)

    if (!canConnect(source, target)) {
      return
    }
    if (
      source?.data.kind === 'conversation' &&
      target?.data.kind === 'draft' &&
      !canAttachConversationToDraft(
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

  // Update draft constraint overrides
  updateDraftConstraintOverrides: (draftId, overrides) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== draftId || node.data.kind !== 'draft') {
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

  // Get source conversation for a draft (follows edges backward)
  getSourceConversationForDraft: (draftId) => {
    const state = get()
    const incomingMap = buildIncomingMap(state.edges)
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]))

    // BFS to find the first conversation ancestor
    const visited = new Set<string>()
    const queue = [...(incomingMap.get(draftId) ?? [])]

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

  // Get effective constraints for a draft (conversation constraints + draft overrides)
  getDraftEffectiveConstraints: (draftId) => {
    const state = get()
    const draftNode = state.nodes.find(
      (n) => n.id === draftId && n.data.kind === 'draft'
    )
    if (!draftNode) return undefined

    // Find source conversation
    const sourceConv = get().getSourceConversationForDraft(draftId)
    const baseConstraints = sourceConv?.data.constraints
    if (!baseConstraints) return undefined

    const overrides = draftNode.data.constraintOverrides

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

  // Check if a conversation has any downstream drafts (for locking editing)
  hasDownstreamDrafts: (conversationId) => {
    const state = get()
    const outgoingMap = buildOutgoingMap(state.edges)
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]))

    // BFS to find any draft descendant
    const visited = new Set<string>()
    const queue = [...(outgoingMap.get(conversationId) ?? [])]

    while (queue.length > 0) {
      const currentId = queue.shift()!
      if (visited.has(currentId)) continue
      visited.add(currentId)

      const node = nodeMap.get(currentId)
      if (node?.data.kind === 'draft') {
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
}))
