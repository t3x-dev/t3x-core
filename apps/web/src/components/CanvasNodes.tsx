import { useEffect, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { GitCommit, GitMerge, PenSquare, Sparkles, MessageSquare, MessageSquarePlus, Plus, Twitter, FileText, Mail, MessageCircle, Rocket, FlaskConical, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { useCanvasStore } from '../store/canvasStore'
import { useProjectStore } from '../store/projectStore'
import type { CanvasNodeData, LeafType } from '../types/nodes'

// Leaf type definitions with icons and labels
export const LEAF_TYPES: { type: LeafType; label: string; icon: ComponentType<{ size?: number; className?: string }>; category?: 'output' | 'runner' }[] = [
  // Runner category - deploy and eval
  { type: 'deploy', label: 'Deploy', icon: Rocket, category: 'runner' },
  { type: 'eval', label: 'Eval', icon: FlaskConical, category: 'runner' },
  // Output category - social and content
  { type: 'twitter', label: 'Twitter', icon: Twitter, category: 'output' },
  { type: 'weibo', label: '微博', icon: ({ size, className }) => (
    <svg width={size || 16} height={size || 16} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.739 5.443zM9.05 17.219c-.384.616-1.208.884-1.829.602-.612-.279-.793-.991-.406-1.593.379-.595 1.176-.861 1.793-.601.622.263.82.972.442 1.592zm1.27-1.627c-.141.237-.449.353-.689.253-.236-.09-.313-.361-.177-.586.138-.227.436-.346.672-.24.239.09.315.36.194.573zm.176-2.719c-1.893-.493-4.033.45-4.857 2.118-.836 1.704-.026 3.591 1.886 4.21 1.983.64 4.318-.341 5.132-2.179.8-1.793-.201-3.642-2.161-4.149zm7.563-1.224c-.346-.105-.579-.18-.405-.649.381-1.017.422-1.896-.002-2.521-.789-1.161-2.948-1.098-5.418-.032 0 0-.776.34-.577-.277.379-1.207.324-2.218-.267-2.799-1.344-1.32-4.91.051-7.97 3.06C1.87 10.54.5 12.8.5 14.81c0 3.85 4.943 6.19 9.779 6.19 6.332 0 10.546-3.674 10.546-6.587 0-1.762-1.484-2.762-2.766-3.164z"/>
    </svg>
  ), category: 'output' },
  { type: 'wechat', label: '朋友圈', icon: MessageCircle, category: 'output' },
  { type: 'article', label: '文章', icon: FileText, category: 'output' },
  { type: 'email', label: 'Email', icon: Mail, category: 'output' },
  { type: 'slack', label: 'Slack', icon: ({ size, className }) => (
    <svg width={size || 16} height={size || 16} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  ), category: 'output' },
]

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

// Unit Node - Combined Conversation + Commit
function UnitNode(props: Props) {
  const { data, selected, id } = props
  const [expanded, setExpanded] = useState(false)
  const tone = useCanvasStore((state) => state.getCommitTone(id))
  const addUnitFromUnit = useCanvasStore((state) => state.addUnitFromUnit)
  const startMergeFromCommit = useCanvasStore((state) => state.createMergePendingCommit)
  const hasMainCommit = useCanvasStore((state) => state.hasMainCommit)
  const openLeafPanel = useCanvasStore((state) => state.openLeafPanel)
  const notify = useProjectStore((state) => state.notifyCallback)
  const [showHandleActions, setShowHandleActions] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)

  // Check if commit is in staging state
  const isStaging = data.commitStatus === 'staging'
  const isCommitted = data.commitStatus === 'committed'

  const branchLabel =
    data.branchType === 'branch' ? data.branchName?.trim() || 'branch' : 'MAIN'

  const handleAddUnit = () => {
    try {
      addUnitFromUnit(id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create unit'
      notify?.(message, 'error')
      console.error('Failed to create unit:', err)
    }
  }

  const canTriggerMerge =
    data.branchType === 'branch' && tone === 'branch-latest' && hasMainCommit
  const handleMerge = () => {
    if (!canTriggerMerge) {
      return
    }
    startMergeFromCommit(id)
  }

  const handleOpenLeafPanel = () => {
    openLeafPanel(id)
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

  // Build variant classes
  const classes = ['canvas-node', 'canvas-node--unit']
  if (selected) {
    classes.push('canvas-node--selected')
  }
  if (tone) {
    classes.push(`canvas-node--unit-${tone}`)
  }
  if (isStaging) {
    classes.push('canvas-node--unit-staging')
  }
  if (data.highlightMode) {
    classes.push(`canvas-node--path-${data.highlightMode}`)
  }
  if (expanded) {
    classes.push('canvas-node--locked', 'nodrag')
  }

  return (
    <>
      {/* Top Add Leaf Button - only for committed units */}
      {isCommitted && (
        <button
          className="unit-node__add-leaf-btn"
          onClick={handleOpenLeafPanel}
          aria-label="Add Leaf Node"
          type="button"
        >
          <Plus size={12} />
        </button>
      )}
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />

      <div className={classes.join(' ')}>
        {/* Conversation Section (Top) */}
        <div className="unit-node__conversation">
          <div className="unit-node__conv-header">
            <MessageSquare size={14} />
            <span className="unit-node__conv-label">CONVERSATION</span>
          </div>
          <h4 className="unit-node__conv-title">{data.title}</h4>
          <div className="unit-node__conv-meta">
            <span>{data.timestamp}</span>
            <span>{data.status}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="unit-node__divider" />

        {/* Commit Section (Bottom) */}
        <div className="unit-node__commit">
          <div className="unit-node__commit-header">
            <div className="unit-node__commit-left">
              {isStaging ? <PenSquare size={14} /> : <GitCommit size={14} />}
              <span className="unit-node__commit-badge">
                {data.commitHash ? data.commitHash.slice(0, 8) : data.entryId}
              </span>
            </div>
            <div className="unit-node__commit-right">
              {isStaging && (
                <span className="unit-node__staging-flag">staging</span>
              )}
              {data.isMergeCommit && (
                <span className="unit-node__merge-flag">merge</span>
              )}
              <span className="unit-node__branch-badge">{branchLabel}</span>
              <button
                className={expanded ? 'node-expand-btn node-expand-btn--open' : 'node-expand-btn'}
                onClick={() => setExpanded((prev) => !prev)}
                aria-label="Toggle details"
                aria-expanded={expanded}
                type="button"
              >
                <svg className="node-expand-icon" width="16" height="16" viewBox="0 0 16 16">
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

          <div className="unit-node__commit-meta">
            <div className="unit-node__signal">
              <Sparkles size={14} />
              <span>{isStaging ? 'Staging' : 'Committed'}</span>
            </div>
            {isStaging ? (
              <span className="unit-node__constraints-count">
                {(data.mustHave?.length || 0) + (data.mustntHave?.length || 0) > 0
                  ? `${data.mustHave?.length || 0}✓ ${data.mustntHave?.length || 0}✗`
                  : 'No constraints'}
              </span>
            ) : (
              <span>{data.summary || data.timestamp}</span>
            )}
          </div>
        </div>

        {/* Expanded Dropdown */}
        {expanded && (
          <div className="unit-node__dropdown nodrag">
            <div className="unit-node__summary">
              <p>{data.summary || (isStaging ? 'Staging - click to edit' : 'No summary recorded.')}</p>
            </div>
          </div>
        )}
      </div>

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
            ? 'node-handle-actions node-handle-actions--unit node-handle-actions--visible'
            : 'node-handle-actions node-handle-actions--unit'
        }
        onMouseEnter={showActions}
        onMouseLeave={hideActions}
      >
        <button
          className="node-handle-action-btn"
          onClick={handleAddUnit}
          aria-label="Add Unit"
          type="button"
        >
          <MessageSquarePlus size={14} />
        </button>
        {data.branchType === 'branch' && (
          <button
            className="node-handle-action-btn"
            onClick={handleMerge}
            aria-label="Start Merge"
            type="button"
            disabled={!canTriggerMerge}
          >
            <GitMerge size={14} />
          </button>
        )}
      </div>
    </>
  )
}

// Status indicator for deploy/eval leaves
function LeafStatusIndicator({ leafType, data }: { leafType: LeafType; data: CanvasNodeData }) {
  if (leafType === 'deploy') {
    const status = (data.leafConfig as { status?: string })?.status || 'idle'
    switch (status) {
      case 'running':
        return <span className="leaf-status leaf-status--running"><Loader2 size={12} className="animate-spin" /> Running</span>
      case 'stopped':
        return <span className="leaf-status leaf-status--stopped">Stopped</span>
      case 'error':
        return <span className="leaf-status leaf-status--error"><XCircle size={12} /> Error</span>
      default:
        return <span className="leaf-status leaf-status--idle">Ready</span>
    }
  }

  if (leafType === 'eval') {
    const status = (data.leafConfig as { status?: string })?.status || 'pending'
    const config = data.leafConfig as { passedCount?: number; failedCount?: number } | undefined
    switch (status) {
      case 'running':
        return <span className="leaf-status leaf-status--running"><Loader2 size={12} className="animate-spin" /> Running</span>
      case 'passed':
        return <span className="leaf-status leaf-status--passed"><CheckCircle size={12} /> {config?.passedCount || 0} passed</span>
      case 'failed':
        return <span className="leaf-status leaf-status--failed"><XCircle size={12} /> {config?.failedCount || 0} failed</span>
      default:
        return <span className="leaf-status leaf-status--pending">Pending</span>
    }
  }

  return null
}

// Leaf Node - Output destination node
function LeafNode(props: Props) {
  const { data, selected } = props
  const leafTypeInfo = LEAF_TYPES.find(l => l.type === data.leafType) || LEAF_TYPES[0]
  const Icon = leafTypeInfo.icon
  const isRunnerLeaf = data.leafType === 'deploy' || data.leafType === 'eval'

  return (
    <>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <div className={`canvas-node canvas-node--leaf ${selected ? 'canvas-node--selected' : ''} ${isRunnerLeaf ? 'canvas-node--leaf-runner' : ''}`}>
        <div className="leaf-node__content">
          <div className={`leaf-node__icon ${isRunnerLeaf ? 'leaf-node__icon--runner' : ''}`}>
            <Icon size={20} />
          </div>
          <div className="leaf-node__info">
            <span className="leaf-node__type">{leafTypeInfo.label}</span>
            <span className="leaf-node__title">{data.title || 'Untitled'}</span>
            {isRunnerLeaf && <LeafStatusIndicator leafType={data.leafType!} data={data} />}
          </div>
        </div>
      </div>
    </>
  )
}

export const canvasNodeTypes = {
  unit: UnitNode,
  leaf: LeafNode,
}
