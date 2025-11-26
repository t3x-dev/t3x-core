import { useEffect, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { GitCommit, PenSquare, Sparkles, MessageSquare, MessageSquarePlus } from 'lucide-react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { useCanvasStore } from '../store/canvasStore'
import type { CanvasNodeData } from '../types/nodes'

type Props = NodeProps<CanvasNodeData>

const targetHandleStyle = {
  width: 22,
  height: 14,
  borderRadius: 8,
  background: '#fff',
  border: '3px solid #6d6f76',
  top: '50%',
  transform: 'translateY(-50%)',
  left: -6,
}

const sourceHandleStyle = {
  width: 18,
  height: 18,
  borderRadius: 999,
  background: '#fff',
  border: '3px solid #6d6f76',
  top: '50%',
  transform: 'translateY(-50%)',
  right: -9,
}

function NodeShell({
  children,
  kind,
  Icon,
  selected,
  onToggle,
  expanded,
  meta,
  variantClass,
  highlightMode,
  dropdownContent,
  customHeader,
  bodyClassName,
}: {
  children: ReactNode
  kind: CanvasNodeData['kind']
  Icon: ComponentType<{ size?: number }>
  selected?: boolean
  onToggle: () => void
  expanded: boolean
  meta?: ReactNode
  variantClass?: string
  highlightMode?: CanvasNodeData['highlightMode']
  dropdownContent?: ReactNode
  customHeader?: ReactNode
  bodyClassName?: string
}) {
  const classes = ['canvas-node', `canvas-node--${kind}`]
  if (selected) {
    classes.push('canvas-node--selected')
  }
  if (variantClass) {
    classes.push(variantClass)
  }
  if (highlightMode) {
    classes.push(`canvas-node--path-${highlightMode}`)
  }

  const expandButtonClass = expanded ? 'node-expand-btn node-expand-btn--open' : 'node-expand-btn'
  const bodyClasses = ['canvas-node__content']
  if (bodyClassName) {
    bodyClasses.push(bodyClassName)
  }

  const headerContent =
    customHeader !== undefined ? (
      customHeader
    ) : (
      <header>
        <div className="node-header__title">
          <Icon size={16} />
          <strong>{kind.toUpperCase()}</strong>
        </div>
        <div className="node-header__actions">
          {meta}
          <button
            className={expandButtonClass}
            onClick={onToggle}
            aria-label="Toggle node text"
            aria-expanded={expanded}
          >
            <svg className="node-expand-icon" width="16" height="16" viewBox="0 0 16 16" role="presentation" aria-hidden="true">
              <path
                d="M4 6l4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>
    )

  return (
    <div className={classes.join(' ')}>
      {headerContent}
      <div className={bodyClasses.join(' ')}>{children}</div>
      {expanded && dropdownContent && <div className="node-dropdown">{dropdownContent}</div>}
    </div>
  )
}

function ConversationNode(props: Props) {
  const { data, selected, id } = props
  const [expanded, setExpanded] = useState(false)
  const updateNode = useCanvasStore((state) => state.updateNode)
  const addDraftFromConversation = useCanvasStore((state) => state.addDraftFromConversation)
  const canSeedDraft = useCanvasStore((state) => state.canCreateDraftFromConversation(id))
  const [showHandleActions, setShowHandleActions] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)
  const showActions = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = undefined
    }
    setShowHandleActions(true)
  }
  const hideActions = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current)
    }
    hideTimer.current = window.setTimeout(() => {
      setShowHandleActions(false)
      hideTimer.current = undefined
    }, 250)
  }
  useEffect(
    () => () => {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current)
      }
    },
    [],
  )
  const handleAddDraft = () => {
    if (!canSeedDraft) {
      return
    }
    addDraftFromConversation(id)
  }

  return (
    <>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <NodeShell
        kind="conversation"
        Icon={MessageSquare}
        selected={selected}
        expanded={expanded}
        onToggle={() => setExpanded((previous) => !previous)}
        highlightMode={data.highlightMode}
        dropdownContent={
          <>
            <textarea
              className="node-summary-field"
              value={data.summary}
              onChange={(event) => updateNode(id, { summary: event.target.value })}
            />
            <footer>
              <span>{data.timestamp}</span>
              <span>{data.status}</span>
            </footer>
          </>
        }
      >
        <h4>{data.title}</h4>
        <footer>
          <span>{data.timestamp}</span>
          <span>{data.status}</span>
        </footer>
      </NodeShell>
      <Handle
        type="source"
        position={Position.Right}
        style={sourceHandleStyle}
        onMouseEnter={showActions}
        onMouseLeave={hideActions}
      />
      <div
        className={
          showHandleActions ? 'node-handle-actions node-handle-actions--visible' : 'node-handle-actions'
        }
        onMouseEnter={showActions}
        onMouseLeave={hideActions}
      >
        <button
          className="node-handle-action-btn"
          onClick={handleAddDraft}
          disabled={!canSeedDraft}
          aria-label="Add Draft"
          type="button"
        >
          <PenSquare size={14} />
        </button>
      </div>
    </>
  )
}

function DraftNode(props: Props) {
  const { data, selected, id } = props
  const [expanded, setExpanded] = useState(false)
  const updateNode = useCanvasStore((state) => state.updateNode)

  return (
    <>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <NodeShell
        kind="draft"
        Icon={PenSquare}
        selected={selected}
        expanded={expanded}
        onToggle={() => setExpanded((previous) => !previous)}
        meta={
          <span className="draft-node__corner-icon" aria-hidden="true">
            <PenSquare size={12} />
          </span>
        }
        highlightMode={data.highlightMode}
        dropdownContent={
          <>
            <textarea
              className="node-summary-field"
              value={data.summary}
              onChange={(event) => updateNode(id, { summary: event.target.value })}
            />
            <footer>
              <span>{data.status}</span>
              <span>{data.bridgePrompt}</span>
            </footer>
          </>
        }
      >
        <h4>{data.title}</h4>
        <footer>
          <span>{data.status}</span>
          <span>{data.bridgePrompt}</span>
        </footer>
      </NodeShell>
      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />
    </>
  )
}

function CommitNode(props: Props) {
  const { data, selected, id } = props
  const [expanded, setExpanded] = useState(false)
  const updateNode = useCanvasStore((state) => state.updateNode)
  const tone = useCanvasStore((state) => state.getCommitTone(id))
  const addConversationFromCommit = useCanvasStore((state) => state.addConversationFromCommit)
  const addDraftFromCommit = useCanvasStore((state) => state.addDraftFromCommit)
  const [showHandleActions, setShowHandleActions] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)
  const branchLabel =
    data.branchType === 'branch' ? data.branchName?.trim() || 'branch' : 'MAIN'
  const handleAddConversation = () => {
    addConversationFromCommit(id)
  }
  const handleAddDraft = () => {
    addDraftFromCommit(id)
  }
  const showActions = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = undefined
    }
    setShowHandleActions(true)
  }
  const hideActions = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current)
    }
    hideTimer.current = window.setTimeout(() => {
      setShowHandleActions(false)
      hideTimer.current = undefined
    }, 250)
  }
  useEffect(
    () => () => {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current)
      }
    },
    [],
  )

  return (
    <>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <NodeShell
        kind="commit"
        Icon={GitCommit}
        selected={selected}
        expanded={expanded}
        onToggle={() => setExpanded((previous) => !previous)}
        variantClass={tone ? `canvas-node--commit-${tone}` : undefined}
        customHeader={null}
        bodyClassName="commit-node__body"
        highlightMode={data.highlightMode}
        dropdownContent={
          <>
            <textarea
              className="node-summary-field"
              value={data.summary}
              onChange={(event) => updateNode(id, { summary: event.target.value })}
            />
            <footer>
              <Sparkles size={14} />
              <span>{data.status}</span>
            </footer>
          </>
        }
      >
        <div className="commit-node__top-row">
          <span className="commit-node__badge">{data.entryId}</span>
          <div className="commit-node__top-actions">
            <span className="node-branch-badge">{branchLabel}</span>
            <button
              className={
                expanded ? 'node-expand-btn node-expand-btn--open commit-node__toggle' : 'node-expand-btn commit-node__toggle'
              }
              onClick={() => setExpanded((previous) => !previous)}
              aria-label="Toggle node text"
              aria-expanded={expanded}
            >
              <svg className="node-expand-icon" width="16" height="16" viewBox="0 0 16 16" role="presentation" aria-hidden="true">
                <path
                  d="M4 6l4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className="commit-node__title-row">
          <h4>{data.title}</h4>
        </div>
        <p className="commit-node__summary">{data.summary}</p>
        <footer className="commit-node__meta">
          <div className="commit-node__signal">
            <Sparkles size={14} />
            <span>{data.status}</span>
          </div>
          <span>{data.timestamp}</span>
        </footer>
      </NodeShell>
      <Handle
        type="source"
        position={Position.Right}
        style={sourceHandleStyle}
        onMouseEnter={showActions}
        onMouseLeave={hideActions}
      />
      <div
        className={
          showHandleActions
            ? 'node-handle-actions node-handle-actions--commit node-handle-actions--visible'
            : 'node-handle-actions node-handle-actions--commit'
        }
        onMouseEnter={showActions}
        onMouseLeave={hideActions}
      >
        <button
          className="node-handle-action-btn"
          onClick={handleAddConversation}
          aria-label="Add Conversation"
          type="button"
        >
          <MessageSquarePlus size={14} />
        </button>
        <button className="node-handle-action-btn" onClick={handleAddDraft} aria-label="Add Draft" type="button">
          <PenSquare size={14} />
        </button>
      </div>
    </>
  )
}

export const canvasNodeTypes = {
  conversation: ConversationNode,
  draft: DraftNode,
  commit: CommitNode,
}
