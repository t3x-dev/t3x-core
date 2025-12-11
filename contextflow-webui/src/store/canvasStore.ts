import { create } from 'zustand'
import { applyEdgeChanges, applyNodeChanges, MarkerType } from 'reactflow'
import type { Connection, Edge, EdgeChange, Node, NodeChange } from 'reactflow'
import type { BranchType, CanvasNodeData, NodeKind, ConversationConstraints, DraftConstraintOverrides, LeafType, CommitStatus, SourceTextBlock, TurnBoundary } from '../types/nodes'
import * as api from '../services/api'
import { tokenizeText } from '../utils/tokenizer'

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
  // Project data loading state
  projectId: string | null
  loading: boolean
  loadError: Error | null
  // Leaf panel state
  leafPanelOpen: boolean
  leafPanelCommitId?: string
  // Data loading
  loadProjectData: (projectId: string) => Promise<void>
  clearCanvas: () => void
  // Deletion confirmation state
  deletionConfirmation: DeletionConfirmation
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => void
  updateNode: (id: string, patch: Partial<CanvasNodeData>) => void
  commitPendingCommit: (id: string) => void
  addPendingCommitFromConversation: (conversationId: string) => Promise<void>
  addConversationFromCommit: (commitId: string) => Promise<void>
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
  // Update node ID (for syncing local pending commit with API commit_hash)
  updateNodeId: (oldId: string, newId: string) => void
  // Get direct upstream source nodes (conversations and committed commits) for a pending commit
  getUpstreamSourceNodes: (nodeId: string) => Node<CanvasNodeData>[]
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

// Layout constants for API data
const LAYOUT = {
  CONVERSATION_START_X: 120,
  CONVERSATION_START_Y: 120,
  CONVERSATION_SPACING_Y: 200,
  COMMIT_OFFSET_X: 400,
  COMMIT_SPACING_Y: 150,
}

// Debounced position save - collect position changes and save after 500ms of no changes
const positionSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingPositionSaves = new Map<string, { kind: NodeKind; position: { x: number; y: number } }>()

function saveNodePosition(nodeId: string, kind: NodeKind, position: { x: number; y: number }) {
  // Cancel existing timer for this node
  const existingTimer = positionSaveTimers.get(nodeId)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  // Store the pending position
  pendingPositionSaves.set(nodeId, { kind, position })

  // Set a new timer
  const timer = setTimeout(() => {
    const pending = pendingPositionSaves.get(nodeId)
    if (!pending) return

    pendingPositionSaves.delete(nodeId)
    positionSaveTimers.delete(nodeId)

    // Call appropriate API based on node kind
    if (pending.kind === 'conversation') {
      api.updateConversation(nodeId, {
        position_x: pending.position.x,
        position_y: pending.position.y,
      }).catch((err) => {
        console.warn('Failed to save conversation position:', err)
      })
    } else if (pending.kind === 'commit') {
      api.updateCommitPosition(nodeId, {
        x: pending.position.x,
        y: pending.position.y,
      }).catch((err) => {
        console.warn('Failed to save commit position:', err)
      })
    }
  }, 500)

  positionSaveTimers.set(nodeId, timer)
}

// Convert API Conversation to Canvas Node
const conversationToNode = (
  conv: api.Conversation,
  index: number
): Node<CanvasNodeData> => {
  // Use saved position if available, otherwise calculate default position
  const position = (conv.position_x != null && conv.position_y != null)
    ? { x: conv.position_x, y: conv.position_y }
    : {
        x: LAYOUT.CONVERSATION_START_X,
        y: LAYOUT.CONVERSATION_START_Y + index * LAYOUT.CONVERSATION_SPACING_Y,
      }
  return {
    id: conv.conversation_id,
    type: 'conversation',
    position: snapPosition(position),
    data: {
      entryId: conv.conversation_id.slice(0, 8),
      title: conv.title || 'Untitled Conversation',
      summary: `${conv.turns_count || 0} turns`,
      status: 'active',
      timestamp: conv.created_at,
      tags: ['conversation'],
      kind: 'conversation',
      conversationId: conv.conversation_id, // Full ID for API calls
    },
  }
}

// Convert API Commit to Canvas Node
const commitToNode = (
  commit: api.Commit,
  index: number,
  baseY: number
): Node<CanvasNodeData> => {
  const facetCount = commit.facet_snapshot?.length || 0
  // Use saved position if available, otherwise calculate default position
  const position = (commit.position_x != null && commit.position_y != null)
    ? { x: commit.position_x, y: commit.position_y }
    : {
        x: LAYOUT.CONVERSATION_START_X + LAYOUT.COMMIT_OFFSET_X,
        y: baseY + index * LAYOUT.COMMIT_SPACING_Y,
      }
  return {
    id: commit.commit_hash,
    type: 'commit',
    position: snapPosition(position),
    data: {
      entryId: commit.commit_hash.slice(0, 12),
      title: commit.message || 'Commit',
      summary: facetCount > 0 ? `${facetCount} facets` : 'No facets',
      status: 'committed',
      timestamp: commit.created_at,
      tags: ['commit'],
      kind: 'commit',
      branchType: commit.branch === 'main' ? 'main' : 'branch',
      branchName: commit.branch !== 'main' ? commit.branch : undefined,
      commitStatus: 'committed',
      commitHash: commit.commit_hash, // Full hash for API calls
      // User selections from committed commit
      sourceExcerpt: commit.source_excerpt ?? undefined,
      mustHave: commit.must_have ?? undefined,
      mustntHave: commit.mustnt_have ?? undefined,
    },
  }
}


const leafNodeHeight = reactFlowGridSize * 5
const leafNodeOffset = 80

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  hasMainCommit: false,
  latestMainCommitId: undefined,
  projectId: null,
  loading: false,
  loadError: null,
  leafPanelOpen: false,
  leafPanelCommitId: undefined,
  deletionConfirmation: null,

  loadProjectData: async (projectId: string) => {
    // Skip if already loading the same project
    const state = get()
    if (state.projectId === projectId && state.loading) {
      return
    }

    set({ loading: true, loadError: null, projectId })

    try {
      // Fetch conversations and commits in parallel
      const [convResponse, commitResponse] = await Promise.all([
        api.listConversations(projectId, 100, 0),
        api.listCommits(projectId, undefined, 100, 0),
      ])

      const conversations = convResponse.conversations
      const commits = commitResponse.commits

      // Preserve existing node positions
      const existingNodePositions = new Map<string, { x: number; y: number }>()
      get().nodes.forEach((node) => {
        existingNodePositions.set(node.id, node.position)
      })

      // Build turn_hash → conversation_id map
      // Optimization: Only fetch turns for commits that have turn_window
      // Instead of fetching all turns for all conversations
      const turnToConvMap = new Map<string, string>()

      // Collect unique turn hashes we need to look up (both start and end)
      const turnHashesToLookup = new Set<string>()
      commits.forEach((commit) => {
        if (commit.turn_window) {
          turnHashesToLookup.add(commit.turn_window.start_turn_hash)
          turnHashesToLookup.add(commit.turn_window.end_turn_hash)
        }
      })

      // If we have turns to look up, fetch them via individual turn detail API
      // This is more efficient than fetching all turns for all conversations
      if (turnHashesToLookup.size > 0) {
        await Promise.all(
          Array.from(turnHashesToLookup).map(async (turnHash) => {
            try {
              const turn = await api.getTurn(turnHash)
              turnToConvMap.set(turn.turn_hash, turn.conversation_id)
            } catch {
              // Skip if turn fetch fails
            }
          })
        )
      }

      // Convert to canvas nodes, preserving existing positions
      const convNodes = conversations.map((conv, i) => {
        const node = conversationToNode(conv, i)
        const existingPos = existingNodePositions.get(node.id)
        if (existingPos) {
          node.position = existingPos
        }
        return node
      })

      const commitNodes = commits.map((commit, i) => {
        const node = commitToNode(commit, i, LAYOUT.CONVERSATION_START_Y)
        const existingPos = existingNodePositions.get(node.id)
        if (existingPos) {
          node.position = existingPos
        }
        return node
      })

      const nodes = [...convNodes, ...commitNodes]

      const edges: Edge[] = []
      const convIds = new Set(conversations.map(c => c.conversation_id))
      const commitHashes = new Set(commits.map(c => c.commit_hash))

      // Build a map: commit_hash -> conversation_id (if commit was created from a conversation)
      const commitSourceConvMap = new Map<string, string>()
      commits.forEach((commit) => {
        if (commit.turn_window) {
          const startConvId = turnToConvMap.get(commit.turn_window.start_turn_hash)
          const endConvId = turnToConvMap.get(commit.turn_window.end_turn_hash)
          if (startConvId && startConvId === endConvId && convIds.has(startConvId)) {
            commitSourceConvMap.set(commit.commit_hash, startConvId)
          }
        }
      })

      // Build a map: conversation_id -> parent_commit_hash
      const convParentCommitMap = new Map<string, string>()
      conversations.forEach((conv) => {
        if (conv.parent_commit_hash) {
          convParentCommitMap.set(conv.conversation_id, conv.parent_commit_hash)
        }
      })

      // Build commit→commit edges, but skip if there's an intermediate conversation
      // i.e., skip edge parentCommit→childCommit if:
      //   - childCommit was created from a conversation (has source conversation)
      //   - AND that conversation's parent_commit_hash is parentCommit
      commits.forEach((commit) => {
        commit.parent_hashes.forEach((parentHash) => {
          if (!commitHashes.has(parentHash)) return

          const sourceConvId = commitSourceConvMap.get(commit.commit_hash)
          if (sourceConvId) {
            const convParentHash = convParentCommitMap.get(sourceConvId)
            // If there's an intermediate conversation connecting parent to child, skip direct edge
            if (convParentHash === parentHash) {
              return
            }
          }

          edges.push({
            id: `${parentHash}-${commit.commit_hash}`,
            source: parentHash,
            target: commit.commit_hash,
            type: edgeType,
            animated: false,
            style: edgeStyle,
          })
        })
      })

      // Add conversation → commit edges based on turn_window
      commits.forEach((commit) => {
        const sourceConvId = commitSourceConvMap.get(commit.commit_hash)
        if (sourceConvId) {
          edges.push({
            id: `conv-${sourceConvId}-${commit.commit_hash}`,
            source: sourceConvId,
            target: commit.commit_hash,
            type: edgeType,
            animated: false,
            style: edgeStyle,
          })
        }
      })

      // Add commit → conversation edges based on parent_commit_hash
      conversations.forEach((conv) => {
        if (conv.parent_commit_hash && commitHashes.has(conv.parent_commit_hash)) {
          edges.push({
            id: `commit-conv-${conv.parent_commit_hash}-${conv.conversation_id}`,
            source: conv.parent_commit_hash,
            target: conv.conversation_id,
            type: edgeType,
            animated: false,
            style: edgeStyle,
          })
        }
      })

      // Check for main commits
      const hasMainCommit = commits.some(c => c.branch === 'main')
      const latestMainCommitId = resolveLatestMainCommitId(nodes)

      set({
        nodes,
        edges,
        hasMainCommit,
        latestMainCommitId,
        loading: false,
        loadError: null,
      })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      set({
        loading: false,
        loadError: error,
      })
      console.error('Failed to load project data:', error)
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
    })
  },

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

  addPendingCommitFromConversation: async (conversationId) => {
    const state = get()
    const source = state.nodes.find((node) => node.id === conversationId)
    if (!source || source.data.kind !== 'conversation') {
      return
    }
    const canSeed = canConversationSeedPendingCommit(
      conversationId,
      state.nodes,
      state.edges,
      state.hasMainCommit,
    )
    if (!canSeed) {
      return
    }

    // Fetch actual chat content from upstream conversation
    let baselineSummary = ''
    let pendingSourceBlock: SourceTextBlock | undefined
    const projectId = state.projectId
    if (projectId && source.data.conversationId) {
      try {
        const turnsData = await api.listTurns(projectId, source.data.conversationId)
        if (turnsData.turns && turnsData.turns.length > 0) {
          // Build full text with turn separator (newline between turns)
          const fullText = turnsData.turns.map((turn) => turn.content).join('\n')

          // Tokenize the full text
          const tokens = tokenizeText(fullText)

          // Build turn boundaries by tracking token positions
          const turnBoundaries: TurnBoundary[] = []
          let currentTokenIndex = 0

          for (const turn of turnsData.turns) {
            const turnTokens = tokenizeText(turn.content)
            const turnTokenCount = turnTokens.length

            if (turnTokenCount > 0) {
              turnBoundaries.push({
                role: turn.role as 'user' | 'assistant',
                startTokenIndex: currentTokenIndex,
                endTokenIndex: currentTokenIndex + turnTokenCount - 1,
              })
            }

            // Account for the newline separator token between turns (+1)
            // But not after the last turn
            currentTokenIndex += turnTokenCount + 1
          }

          // Create the SourceTextBlock with source info and turn boundaries
          pendingSourceBlock = {
            id: 'block-conv-1',
            originalText: fullText,
            tokens,
            selections: [],
            keywords: [],
            sourceNodeId: source.data.conversationId,
            sourceNodeType: 'conversation',
            sourceNodeTitle: source.data.title || 'Conversation',
            turnBoundaries,
          }

          // Also keep baselineSummary for backward compatibility
          baselineSummary = fullText
        }
      } catch (err) {
        console.warn('Failed to fetch turns for baselineSummary:', err)
      }
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
        // Pass upstream chat content to pending commit
        baselineSummary,
        sourceConversationId: source.data.conversationId,
        // New: pendingSource with structured text blocks
        pendingSource: pendingSourceBlock ? { textBlocks: [pendingSourceBlock] } : undefined,
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

    set({
      nodes: [...state.nodes, newNode],
      edges: [...state.edges, newEdge],
    })
  },

  addConversationFromCommit: async (commitId) => {
    const state = get()
    const source = state.nodes.find(
      (node) => node.id === commitId && node.data.kind === 'commit',
    )
    if (!source || !state.projectId) {
      console.warn('addConversationFromCommit: source commit not found or no projectId')
      return
    }

    try {
      // Create conversation via API with parent_commit_hash
      const title = `Conversation from ${source.data.entryId}`
      const parentCommitHash = source.data.commitHash || source.id
      const conversation = await api.createConversation(state.projectId, title, parentCommitHash)

      // Add node using the real conversation ID from API
      const newNode: Node<CanvasNodeData> = {
        id: conversation.conversation_id,
        type: 'conversation',
        position: computeAttachedPosition(source, 'conversation', commitQuickOffset),
        data: {
          entryId: conversation.conversation_id.slice(0, 12),
          title: conversation.title || title,
          summary: '0 turns',
          status: 'raw-input',
          timestamp: conversation.created_at,
          tags: ['conversation'],
          kind: 'conversation',
          conversationId: conversation.conversation_id, // Full ID for API calls
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

      set({
        nodes: [...get().nodes, newNode],
        edges: [...get().edges, newEdge],
      })
    } catch (err) {
      console.error('Failed to create conversation:', err)
    }
  },

  addPendingCommitFromCommit: (commitId) =>
    set((state) => {
      const source = state.nodes.find(
        (node) => node.id === commitId && node.data.kind === 'commit' && node.data.commitStatus === 'committed',
      )
      if (!source) {
        return {}
      }

      // Build pending source block from commit's sourceExcerpt (semantic selections)
      // Not from summary which is the generated output
      const sourceExcerptArray = source.data.sourceExcerpt || []
      const sourceExcerptText = sourceExcerptArray.join('\n')
      const tokens = tokenizeText(sourceExcerptText)
      const pendingSourceBlock: SourceTextBlock = {
        id: 'block-commit-1',
        originalText: sourceExcerptText,
        tokens,
        selections: [],
        keywords: [],
        sourceNodeId: source.data.commitHash || source.id,
        sourceNodeType: 'commit',
        sourceNodeTitle: source.data.title || `Commit ${source.data.entryId}`,
        // No turnBoundaries for commit type
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
          // Pass upstream content to pending commit (use sourceExcerpt)
          baselineSummary: sourceExcerptText,
          // New: pendingSource with structured text block
          pendingSource: tokens.length > 0 ? { textBlocks: [pendingSourceBlock] } : undefined,
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

      const nodeMap = new Map(state.nodes.map((n) => [n.id, n]))
      const lockedNodes = getLockedNodeIds(state.nodes, state.edges)

      // Handle position changes - save to database (debounced)
      const positionChanges = changes.filter((c) => c.type === 'position' && c.position)
      if (positionChanges.length > 0) {
        positionChanges.forEach((change) => {
          if (change.type !== 'position' || !change.position) return
          const node = nodeMap.get(change.id)
          if (!node) return

          const snappedPos = snapPosition(change.position)
          // Save position to database (fire and forget, debounced internally)
          saveNodePosition(node.id, node.data.kind, snappedPos)
        })
      }

      // Separate remove changes from other changes
      const removeChanges = changes.filter((c) => c.type === 'remove')
      const otherChanges = changes.filter((c) => c.type !== 'remove')

      // Filter out locked nodes from removal
      const allowedRemoves = removeChanges.filter((c) => !lockedNodes.has(c.id))

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

        // Delete conversations from database for directly deleted nodes
        directDeletes.forEach((nodeId) => {
          const node = nodeMap.get(nodeId)
          if (node?.data.kind === 'conversation' && node.data.conversationId) {
            api.deleteConversation(node.data.conversationId).catch((err) => {
              console.warn('Failed to delete conversation from database:', err)
            })
          }
        })

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
              const currentState = get()
              const nodesToDelete = new Set(needsConfirmation)
              const edgesToDelete = new Set(edgesToRemove)

              // Delete conversations from database
              needsConfirmation.forEach((nodeId) => {
                const node = currentState.nodes.find((n) => n.id === nodeId)
                if (node?.data.kind === 'conversation' && node.data.conversationId) {
                  api.deleteConversation(node.data.conversationId).catch((err) => {
                    console.warn('Failed to delete conversation from database:', err)
                  })
                }
              })

              set((s) => ({
                nodes: s.nodes.filter((n) => !nodesToDelete.has(n.id)),
                edges: s.edges.filter((e) => !edgesToDelete.has(e.id) && !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target)),
                deletionConfirmation: null,
              }))
            },
          },
        }
      }

      // No confirmation needed, apply all changes
      // Delete conversations from database for removed nodes
      allowedRemoves.forEach((change) => {
        const node = nodeMap.get(change.id)
        if (node?.data.kind === 'conversation' && node.data.conversationId) {
          api.deleteConversation(node.data.conversationId).catch((err) => {
            console.warn('Failed to delete conversation from database:', err)
          })
        }
      })

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

  // Update node ID and all related edges (for syncing local pending commit with API commit_hash)
  updateNodeId: (oldId, newId) =>
    set((state) => {
      // Update nodes
      const updatedNodes = state.nodes.map((node) =>
        node.id === oldId ? { ...node, id: newId } : node
      )

      // Update edges (both source and target references)
      const updatedEdges = state.edges.map((edge) => {
        let updated = edge
        if (edge.source === oldId) {
          updated = { ...updated, source: newId }
        }
        if (edge.target === oldId) {
          updated = { ...updated, target: newId }
        }
        // Update edge ID if it contains the old node ID
        if (edge.id.includes(oldId)) {
          updated = { ...updated, id: edge.id.replace(oldId, newId) }
        }
        return updated
      })

      // Update latestMainCommitId if it matches
      const latestMainCommitId =
        state.latestMainCommitId === oldId ? newId : state.latestMainCommitId

      return {
        nodes: updatedNodes,
        edges: updatedEdges,
        latestMainCommitId,
      }
    }),

  // Get direct upstream source nodes (conversations and committed commits) for a node
  // Returns nodes that can provide source content for a pending commit
  getUpstreamSourceNodes: (nodeId) => {
    const state = get()
    const incomingMap = buildIncomingMap(state.edges)
    const nodeMap = new Map(state.nodes.map((n) => [n.id, n]))

    const sourceNodeIds = incomingMap.get(nodeId) ?? []
    const sourceNodes: Node<CanvasNodeData>[] = []

    for (const sourceId of sourceNodeIds) {
      const node = nodeMap.get(sourceId)
      if (!node) continue

      // Include conversations
      if (node.data.kind === 'conversation') {
        sourceNodes.push(node)
      }
      // Include committed commits (not pending)
      else if (node.data.kind === 'commit' && node.data.commitStatus === 'committed') {
        sourceNodes.push(node)
      }
    }

    return sourceNodes
  },
}))
