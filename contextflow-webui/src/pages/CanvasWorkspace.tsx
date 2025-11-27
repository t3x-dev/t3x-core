import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquarePlus, PenSquare } from 'lucide-react'
import { Background, Controls, MiniMap, ReactFlow } from 'reactflow'
import type { Edge, Node, ReactFlowInstance } from 'reactflow'
import 'reactflow/dist/style.css'
import { canvasNodeTypes } from '../components/CanvasNodes'
import { NodeModal, type NodeQuickAction } from '../components/NodeModal'
import { useCanvasStore } from '../store/canvasStore'
import type { CanvasNodeData, NodeKind } from '../types/nodes'

const GRID_SIZE = 16

type PathHighlight =
  | { mode: 'main' }
  | { mode: 'branch'; branch?: string }
  | null

export default function CanvasWorkspace() {
  const [openNodeId, setOpenNodeId] = useState<string>()
  const [isPanMode, setIsPanMode] = useState(false)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [highlight, setHighlight] = useState<PathHighlight>(null)
  const [branchFilter, setBranchFilter] = useState<'all' | string>('all')
  const canvasRef = useRef<HTMLDivElement>(null)
  const {
    nodes,
    edges,
    addNode,
    updateNode,
    convertDraftToCommit,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addDraftFromConversation,
    addConversationFromCommit,
    addDraftFromCommit,
  } = useCanvasStore()

  const modalNode = nodes.find((node) => node.id === openNodeId)
  const draftBranchMode = useCanvasStore((state) => {
    if (!openNodeId) {
      return undefined
    }
    const draftNode = state.nodes.find((node) => node.id === openNodeId && node.data.kind === 'draft')
    if (!draftNode) {
      return undefined
    }
    return state.getDraftBranchMode(openNodeId)
  })

  const canSeedDraftFromConversation = useCanvasStore((state) => {
    if (!openNodeId) {
      return false
    }
    return state.canCreateDraftFromConversation(openNodeId)
  })

  const modalQuickActions = useMemo<NodeQuickAction[] | undefined>(() => {
    if (!modalNode) {
      return undefined
    }
    if (modalNode.data.kind === 'conversation') {
      return [
        {
          key: 'add-draft',
          label: 'Create Draft',
          icon: <PenSquare size={14} />,
          onClick: () => addDraftFromConversation(modalNode.id),
          disabled: !canSeedDraftFromConversation,
        },
      ]
    }
    if (modalNode.data.kind === 'commit') {
      return [
        {
          key: 'add-conversation',
          label: 'Create Conversation',
          icon: <MessageSquarePlus size={14} />,
          onClick: () => addConversationFromCommit(modalNode.id),
        },
        {
          key: 'add-draft',
          label: 'Create Draft',
          icon: <PenSquare size={14} />,
          onClick: () => addDraftFromCommit(modalNode.id),
        },
      ]
    }
    return undefined
  }, [
    modalNode,
    addDraftFromConversation,
    canSeedDraftFromConversation,
    addConversationFromCommit,
    addDraftFromCommit,
  ])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Meta' || event.key === 'Control') {
        setIsPanMode(true)
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Meta' || event.key === 'Control') {
        setIsPanMode(false)
      }
    }
    const handleBlur = () => setIsPanMode(false)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  const branchNames = useMemo(() => {
    const names = new Set<string>()
    nodes.forEach((node) => {
      if (node.data.kind === 'commit' && node.data.branchType === 'branch' && node.data.branchName) {
        names.add(node.data.branchName)
      }
    })
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [nodes])

  useEffect(() => {
    if (branchFilter !== 'all' && !branchNames.includes(branchFilter)) {
      setBranchFilter('all')
      if (highlight?.mode === 'branch') {
        setHighlight({ mode: 'branch' })
      }
    }
  }, [branchFilter, branchNames, highlight])

  const getViewportCenter = () => {
    if (!reactFlowInstance || !canvasRef.current) {
      return undefined
    }
    const bounds = canvasRef.current.getBoundingClientRect()
    return reactFlowInstance.project({
      x: bounds.width / 2,
      y: bounds.height / 2,
    })
  }

  const handleAddNode = (kind: NodeKind) => {
    const position = getViewportCenter()
    addNode(kind, position)
  }

  const matchesHighlightCommit = (node: Node<CanvasNodeData>, mode: PathHighlight) => {
    if (!mode || node.data.kind !== 'commit') {
      return false
    }
    if (mode.mode === 'main') {
      return node.data.branchType === 'main'
    }
    if (mode.mode === 'branch') {
      if (node.data.branchType !== 'branch') {
        return false
      }
      if (!mode.branch) {
        return true
      }
      return (node.data.branchName ?? '').toLowerCase() === mode.branch.toLowerCase()
    }
    return false
  }

  const computeHighlightSets = (
    graphNodes: Node<CanvasNodeData>[],
    graphEdges: Edge[],
    mode: PathHighlight,
  ) => {
    if (!mode) {
      return {
        nodes: new Set<string>(),
        edges: new Set<string>(),
      }
    }

    const nodeMap = new Map(graphNodes.map((node) => [node.id, node]))
    const adjacency = new Map<string, Set<string>>()
    graphEdges.forEach((edge) => {
      const out = adjacency.get(edge.source) ?? new Set<string>()
      out.add(edge.target)
      adjacency.set(edge.source, out)

      const inbound = adjacency.get(edge.target) ?? new Set<string>()
      inbound.add(edge.source)
      adjacency.set(edge.target, inbound)
    })

    const startNodes = graphNodes.filter((node) => matchesHighlightCommit(node, mode)).map((node) => node.id)

    if (startNodes.length === 0) {
      return {
        nodes: new Set<string>(),
        edges: new Set<string>(),
      }
    }

    const visited = new Set<string>(startNodes)
    const commitStarts = new Set(startNodes)
    const queue = [...startNodes]
    while (queue.length > 0) {
      const current = queue.shift()!
      const neighbors = adjacency.get(current)
      if (!neighbors) {
        continue
      }
      neighbors.forEach((neighborId) => {
        if (visited.has(neighborId)) {
          return
        }
        const neighborNode = nodeMap.get(neighborId)
        if (!neighborNode) {
          return
        }
        if (neighborNode.data.kind === 'commit' && !matchesHighlightCommit(neighborNode, mode)) {
          return
        }
        visited.add(neighborId)
        queue.push(neighborId)
      })
    }

    const highlightedEdges = new Set<string>()
    graphEdges.forEach((edge) => {
      const bothVisited = visited.has(edge.source) && visited.has(edge.target)
      if (bothVisited) {
        highlightedEdges.add(edge.id)
        return
      }
      if (
        mode.mode !== 'main' &&
        (commitStarts.has(edge.source) || commitStarts.has(edge.target))
      ) {
        highlightedEdges.add(edge.id)
      }
    })

    return {
      nodes: visited,
      edges: highlightedEdges,
    }
  }

  const highlightSets = useMemo(
    () => computeHighlightSets(nodes, edges, highlight),
    [nodes, edges, highlight],
  )

  const highlightColor =
    highlight?.mode === 'main'
      ? '#1f2fb5'
      : highlight?.mode === 'branch'
        ? '#f28c1a'
        : undefined

  const nodesForRender = useMemo(() => {
    if (!highlight) {
      return nodes
    }

    return nodes.map((node) => {
      if (!highlightSets.nodes.has(node.id)) {
        return node
      }
      return {
        ...node,
        data: {
          ...node.data,
          highlightMode: highlight.mode,
        },
      }
    })
  }, [nodes, highlight, highlightSets.nodes])

  const edgesForRender = useMemo(() => {
    if (!highlight || !highlightColor || highlightSets.edges.size === 0) {
      return edges
    }
    return edges.map((edge) => {
      if (!highlightSets.edges.has(edge.id)) {
        return edge
      }
      return {
        ...edge,
        style: {
          ...edge.style,
          stroke: highlightColor,
          strokeWidth: 4.5,
        },
      }
    })
  }, [edges, highlight, highlightSets.edges, highlightColor])

  const toggleHighlight = (mode: PathHighlight) => {
    setHighlight((current) => {
      if (!mode) {
        return null
      }
      if (!current) {
        return mode
      }
      if (current.mode === mode.mode) {
        if (current.mode === 'branch' && mode.mode === 'branch') {
          const prevBranch = current.branch ?? 'all'
          const nextBranch = mode.branch ?? 'all'
          if (prevBranch === nextBranch) {
            return null
          }
        } else {
          return null
        }
      }
      return mode
    })
  }

  const hasMainCommits = nodes.some(
    (node) => node.data.kind === 'commit' && node.data.branchType === 'main',
  )
  const hasBranchCommits = nodes.some(
    (node) => node.data.kind === 'commit' && node.data.branchType === 'branch',
  )
  return (
    <div className="workspace">
      <div className="workspace__toolbar">
        <div className="path-controls">
          <button
            className={highlight?.mode === 'main' ? 'path-btn path-btn--active' : 'path-btn'}
            onClick={() => toggleHighlight({ mode: 'main' })}
            disabled={!hasMainCommits}
          >
            <span>Main</span>
          </button>
          <div className="branch-picker">
            <button
              className={highlight?.mode === 'branch' ? 'path-btn path-btn--active' : 'path-btn'}
              onClick={() =>
                hasBranchCommits &&
                toggleHighlight({
                  mode: 'branch',
                  branch: branchFilter === 'all' ? undefined : branchFilter,
                })
              }
              disabled={!hasBranchCommits}
            >
              <span>Branch</span>
            </button>
            <select
              value={branchFilter}
              onChange={(event) => {
                const value = event.target.value
                setBranchFilter(value)
                if (highlight?.mode === 'branch') {
                  setHighlight({
                    mode: 'branch',
                    branch: value === 'all' ? undefined : value,
                  })
                }
              }}
              disabled={!hasBranchCommits}
            >
              <option value="all">All branches</option>
              {branchNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="text-btn" onClick={() => handleAddNode('conversation')}>
            <MessageSquarePlus size={16} />
            Add Conversation
          </button>
          <button className="text-btn" onClick={() => handleAddNode('draft')}>
            <PenSquare size={16} />
            Add Draft
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className={isPanMode ? 'workspace__canvas workspace__canvas--pan' : 'workspace__canvas'}
      >
        <ReactFlow
          nodes={nodesForRender}
          edges={edgesForRender}
          nodeTypes={canvasNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={(_, node) => setOpenNodeId(node.id)}
          onInit={setReactFlowInstance}
          panOnDrag={isPanMode}
          selectionOnDrag={!isPanMode}
          snapToGrid
          snapGrid={[GRID_SIZE, GRID_SIZE]}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          {isPanMode && <MiniMap />}
          <Controls />
          <Background gap={GRID_SIZE} size={1} color="#cbd5e1" />
        </ReactFlow>
      </div>
      {modalNode && (
        <NodeModal
          node={modalNode}
          onClose={() => setOpenNodeId(undefined)}
          onUpdate={(patch) => updateNode(modalNode.id, patch)}
          onConvertDraft={
            modalNode.data.kind === 'draft' && draftBranchMode !== 'blocked'
              ? () => {
                  convertDraftToCommit(modalNode.id)
                  setOpenNodeId(undefined)
                }
              : undefined
          }
          draftBranchMode={draftBranchMode}
          onBranchChange={
            modalNode.data.kind === 'draft'
              ? (branch) => updateNode(modalNode.id, { pendingBranch: branch })
              : undefined
          }
          onBranchNameChange={
            modalNode.data.kind === 'draft'
              ? (name) => updateNode(modalNode.id, { pendingBranchName: name })
              : undefined
          }
          quickActions={modalQuickActions}
        />
      )}
    </div>
  )
}
