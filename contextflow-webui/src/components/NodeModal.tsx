import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type FormEvent,
} from 'react'
import { X, Sparkles, Database, Settings, WandSparkles, Check } from 'lucide-react'
import type { Node } from 'reactflow'
import type { CanvasNodeData } from '../types/nodes'

const bridgePrompts = ['/plan', '/story', '/merge', '/refine']

export type NodeQuickAction = {
  key: string
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}

type DiffDecisionMap = Record<string, 'accept' | 'reject' | undefined>

interface NodeModalProps {
  node?: Node<CanvasNodeData>
  onClose: () => void
  onUpdate: (patch: Partial<CanvasNodeData>) => void
  onConvertDraft?: () => void
  draftBranchMode?: 'force-main' | 'select' | 'branch-only' | 'blocked'
  onBranchChange?: (branch: 'main' | 'branch') => void
  onBranchNameChange?: (name: string) => void
  quickActions?: NodeQuickAction[]
}

export function NodeModal({
  node,
  onClose,
  onUpdate,
  onConvertDraft,
  draftBranchMode,
  onBranchChange,
  onBranchNameChange,
  quickActions,
}: NodeModalProps) {
  if (!node) {
    return null
  }

  const { data } = node
  const isDraft = data.kind === 'draft'
  const isCommit = data.kind === 'commit'
  const isConversation = data.kind === 'conversation'
  const shouldShowBranchSelect = draftBranchMode === 'select' || draftBranchMode === 'branch-only'
  const requireBranchName =
    (draftBranchMode === 'select' && data.pendingBranch === 'branch') ||
    draftBranchMode === 'branch-only'

  const [paneRatio, setPaneRatio] = useState(0.3)
  const [isResizing, setIsResizing] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [draftPaneSizes, setDraftPaneSizes] = useState({ left: 0.22, center: 0.26 })
  const [activeDraftResizer, setActiveDraftResizer] = useState<'left' | 'center' | null>(null)
  const draftContainerRef = useRef<HTMLDivElement | null>(null)
  const [draftTab, setDraftTab] = useState<'editor' | 'diff'>('editor')
  const [diffSplit, setDiffSplit] = useState(0.5)
  const [diffDrag, setDiffDrag] = useState(false)
  const [diffDecisions, setDiffDecisions] = useState<DiffDecisionMap>({})
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<
    { id: string; role: 'user' | 'ai'; content: string }[]
  >([])

  const conversationAction = useMemo(() => quickActions?.[0], [quickActions])
  const MIN_DRAFT_LEFT = 0.18
  const MIN_DRAFT_CENTER = 0.22
  const MIN_DRAFT_RIGHT = 0.35
  const chatHistory = useMemo(
    () => [
      { id: `${node.id}-user`, role: 'user' as const, content: data.status || 'No status description added yet.' },
      { id: `${node.id}-ai`, role: 'ai' as const, content: data.summary || 'No summary available.' },
    ],
    [data.status, data.summary, node.id],
  )
  const diffData = useMemo(() => {
    const baselineLines =
      data.baselineSummary && data.baselineSummary.length > 0
        ? data.baselineSummary.split('\n')
        : []
    const draftLines = (data.summary ?? '').split('\n')
    const m = baselineLines.length
    const n = draftLines.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = m - 1; i >= 0; i -= 1) {
      for (let j = n - 1; j >= 0; j -= 1) {
        if (baselineLines[i] === draftLines[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1
        } else {
          dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
        }
      }
    }
    const baselineStatuses: Array<'same' | 'removed'> = Array(m).fill('same')
    const draftStatuses: Array<'same' | 'added'> = Array(n).fill('same')
    const removals: { key: string; text: string }[] = []
    let i = 0
    let j = 0
    while (i < m && j < n) {
      if (baselineLines[i] === draftLines[j]) {
        baselineStatuses[i] = 'same'
        draftStatuses[j] = 'same'
        i += 1
        j += 1
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        baselineStatuses[i] = 'removed'
        removals.push({ key: `rem-${i}`, text: baselineLines[i] })
        i += 1
      } else {
        draftStatuses[j] = 'added'
        j += 1
      }
    }
    while (i < m) {
      baselineStatuses[i] = 'removed'
      removals.push({ key: `rem-${i}`, text: baselineLines[i] })
      i += 1
    }
    while (j < n) {
      draftStatuses[j] = 'added'
      j += 1
    }
    return { baselineLines, draftLines, baselineStatuses, draftStatuses, removals }
  }, [data.baselineSummary, data.summary])
  const { baselineLines, draftLines, baselineStatuses, draftStatuses, removals } = diffData

  useEffect(() => {
    if (!isConversation) {
      return
    }
    setChatMessages([
      {
        id: `${node.id}-ai`,
        role: 'ai',
        content: data.summary || 'No summary available, start conversation to capture context.',
      },
      {
        id: `${node.id}-user`,
        role: 'user',
        content: data.status || 'No status set yet',
      },
    ])
  }, [isConversation, data.summary, data.status, node.id])

  useEffect(() => {
    if (!isConversation) {
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isConversation])

  useEffect(() => {
    if (!isConversation || !isResizing) {
      return
    }
    const handleMove = (event: MouseEvent) => {
      if (!containerRef.current) {
        return
      }
      const bounds = containerRef.current.getBoundingClientRect()
      const relativeX = (event.clientX - bounds.left) / bounds.width
      const clamped = Math.min(0.7, Math.max(0.2, relativeX))
      setPaneRatio(clamped)
    }
    const handleUp = () => setIsResizing(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isConversation, isResizing])

  const handleSplitMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsResizing(true)
  }

  useEffect(() => {
    if (!isDraft || !activeDraftResizer) {
      return
    }
    const handleMove = (event: MouseEvent) => {
      if (!draftContainerRef.current) {
        return
      }
      const bounds = draftContainerRef.current.getBoundingClientRect()
      const ratio = (event.clientX - bounds.left) / bounds.width
      if (activeDraftResizer === 'left') {
        setDraftPaneSizes((prev) => {
          const maxLeft = 1 - prev.center - MIN_DRAFT_RIGHT
          const nextLeft = Math.min(maxLeft, Math.max(MIN_DRAFT_LEFT, ratio))
          return { ...prev, left: nextLeft }
        })
      } else {
        setDraftPaneSizes((prev) => {
          const maxCenter = 1 - prev.left - MIN_DRAFT_RIGHT
          const desiredCenter = ratio - prev.left
          const nextCenter = Math.min(maxCenter, Math.max(MIN_DRAFT_CENTER, desiredCenter))
          return { ...prev, center: nextCenter }
        })
      }
    }
    const handleUp = () => setActiveDraftResizer(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [MIN_DRAFT_CENTER, MIN_DRAFT_LEFT, MIN_DRAFT_RIGHT, activeDraftResizer, isDraft])

  useEffect(() => {
    if (!diffDrag) {
      return
    }
    const handleMove = (event: MouseEvent) => {
      if (!draftContainerRef.current) {
        return
      }
      const bounds = draftContainerRef.current.getBoundingClientRect()
      const start = (draftPaneSizes.left + draftPaneSizes.center) * bounds.width
      const available = bounds.width - start
      if (available <= 0) {
        return
      }
      const ratio = (event.clientX - bounds.left - start) / available
      const clamped = Math.min(0.8, Math.max(0.2, ratio))
      setDiffSplit(clamped)
    }
    const handleUp = () => setDiffDrag(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [diffDrag, draftPaneSizes.center, draftPaneSizes.left])

  useEffect(() => {
    setDraftPaneSizes({ left: 0.22, center: 0.26 })
    setDraftTab('editor')
    setDiffSplit(0.5)
    setDiffDecisions({})
  }, [node.id])

  const handleSendMessage = (event?: FormEvent) => {
    event?.preventDefault()
    if (!chatInput.trim()) {
      return
    }
    setChatMessages((messages) => [
      ...messages,
      { id: `${node.id}-user-${messages.length}`, role: 'user', content: chatInput.trim() },
    ])
    setChatInput('')
  }

  if (isConversation) {
    return (
      <div className="node-modal__overlay" role="dialog" aria-modal="true">
        <div className="conversation-modal" ref={containerRef}>
          <header className="conversation-modal__header">
            <div className="conversation-modal__title">
              <input
                value={data.title}
                onChange={(event) => onUpdate({ title: event.target.value })}
              />
              <span>{data.entryId}</span>
            </div>
            <div className="conversation-modal__actions">
              {conversationAction && (
                <button
                  className="primary-btn conversation-modal__primary-action"
                  onClick={() => {
                    conversationAction.onClick()
                    onClose()
                  }}
                  disabled={conversationAction.disabled}
                  type="button"
                >
                  {conversationAction.icon}
                  <span>Extract to Draft</span>
                </button>
              )}
              <button className="text-btn" onClick={onClose} aria-label="Close">
                <X size={20} />
              </button>
            </div>
          </header>
          <div className="conversation-modal__body">
            <section
              className="conversation-modal__pane conversation-modal__pane--context"
              style={{ flexBasis: `${paneRatio * 100}%` }}
            >
              <div className="conversation-context__header">
                <Database size={18} />
                <div>
                  <strong>Upstream Context</strong>
                  <span>Library / Documentation</span>
                </div>
              </div>
              <div className="conversation-context__cards">
                <article className="context-card">
                  <span>Source</span>
                  <strong>{data.entryId}</strong>
                  <p>{data.timestamp}</p>
                </article>
                <article className="context-card">
                  <span>Status</span>
                  <strong>{data.status}</strong>
                  <p>Current tracking marker</p>
                </article>
                <article className="context-card">
                  <span>Active Tags</span>
                  <div className="context-card__tags">
                    {data.tags.length > 0 ? (
                      data.tags.map((tag) => (
                        <span key={tag} className="context-tag">
                          {tag}
                        </span>
                      ))
                    ) : (
                      <em>None</em>
                    )}
                  </div>
                </article>
              </div>
              <div className="conversation-context__note">
                <label>
                  Summary
                  <textarea
                    value={data.summary}
                    onChange={(event) => onUpdate({ summary: event.target.value })}
                  />
                </label>
                <label>
                  Notes
                  <input
                    value={data.status}
                    onChange={(event) => onUpdate({ status: event.target.value })}
                  />
                </label>
                <label>
                  Tags
                  <input
                    value={data.tags.join(', ')}
                    onChange={(event) =>
                      onUpdate({
                        tags: event.target.value
                          .split(',')
                          .map((token) => token.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
              </div>
            </section>
            <div
              className={
                isResizing
                  ? 'conversation-modal__splitter conversation-modal__splitter--active'
                  : 'conversation-modal__splitter'
              }
              onMouseDown={handleSplitMouseDown}
            />
            <section
              className="conversation-modal__pane conversation-modal__pane--chat"
              style={{ flexBasis: `${(1 - paneRatio) * 100}%` }}
            >
              <div className="conversation-chat__header">
                <div>
                  <strong>{data.title}</strong>
                  <span>Workspace / Chat</span>
                </div>
                <button className="conversation-chat__settings-btn" type="button">
                  <Settings size={18} />
                </button>
              </div>
              <div className="conversation-chat__messages">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.role === 'user'
                        ? 'conversation-chat__bubble conversation-chat__bubble--user'
                        : 'conversation-chat__bubble conversation-chat__bubble--ai'
                    }
                  >
                    <p>{message.content}</p>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form className="conversation-chat__composer" onSubmit={handleSendMessage}>
                <textarea
                  placeholder="Summarize or add new context..."
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                />
                <button className="primary-btn" type="submit">
                  Send
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    )
  }

  if (isDraft) {
    const leftBasis = draftPaneSizes.left
    const centerBasis = draftPaneSizes.center
    const rightBasis = Math.max(MIN_DRAFT_RIGHT, 1 - leftBasis - centerBasis)
    const evidenceCards: Array<{
      id: string
      title: string
      subtitle: string
      content: ReactNode
    }> = [
      {
        id: 'commit',
        title: `Commit Snapshot`,
        subtitle: data.branchType === 'main' ? 'Main' : 'Feature',
        content: <p>{data.baselineSummary || 'No upstream commit summary yet.'}</p>,
      },
      {
        id: 'conversation',
        title: 'Conversation (Raw)',
        subtitle: 'Last two messages',
        content: (
          <div className="draft-chat-thread">
            {chatHistory.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === 'user'
                    ? 'draft-chat__bubble draft-chat__bubble--user'
                    : 'draft-chat__bubble draft-chat__bubble--ai'
                }
              >
                <span>{message.role === 'user' ? 'User' : 'AI'}</span>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
        ),
      },
      ...(data.validationChecks ?? []).map((check) => ({
        id: check.id,
        title: check.label,
        subtitle: `Validation · ${check.status}`,
        content: <p>{data.summary || 'No description available.'}</p>,
      })),
    ]

    return (
      <div className="node-modal__overlay" role="dialog" aria-modal="true">
        <div className="draft-modal">
          <header className="draft-modal__header">
            <div className="draft-modal__title">
              <span>{data.entryId}</span>
              <input value={data.title} onChange={(event) => onUpdate({ title: event.target.value })} />
            </div>
            <div className="draft-modal__actions">
              {quickActions?.map((action) => (
                <button
                  key={action.key}
                  className="secondary-btn"
                  onClick={() => {
                    action.onClick()
                    onClose()
                  }}
                  type="button"
                >
                  {action.icon}
                  <span>{action.label}</span>
                </button>
              ))}
              <button className="text-btn" onClick={onClose} aria-label="Close draft modal">
                <X size={18} />
              </button>
            </div>
          </header>
          <div className="draft-layout" ref={draftContainerRef}>
            <section className="draft-section draft-section--sidebar" style={{ flexBasis: `${leftBasis * 100}%` }}>
              <div className="draft-sidebar__header">
                <span>Upstream Context</span>
                <p>Reference upstream evidence for comparison</p>
              </div>
              <div className="draft-evidence__list">
                {evidenceCards.map((card) => (
                  <details key={card.id} open={card.id === 'commit'}>
                    <summary>
                      <div>
                        <strong>{card.title}</strong>
                        <small>{card.subtitle}</small>
                      </div>
                    </summary>
                    <div className="draft-evidence__body">{card.content}</div>
                  </details>
                ))}
              </div>
            </section>
            <div
              className="draft-section__resizer"
              role="separator"
              aria-orientation="vertical"
              onMouseDown={(event) => {
                event.preventDefault()
                setActiveDraftResizer('left')
              }}
            />
            <section
              className="draft-section draft-section--config"
              style={{ flexBasis: `${centerBasis * 100}%` }}
            >
              <div className="draft-config__header">
                <strong>Draft Settings</strong>
                <span>Configure bridge logic and targets</span>
              </div>
              <div className="draft-config__form">
                <label>
                  Title
                  <input
                    value={data.title}
                    onChange={(event) => onUpdate({ title: event.target.value })}
                    placeholder="Enter draft title"
                  />
                </label>
                <label>
                  Branch
                  <div className="draft-select">
                    <select
                      value={
                        shouldShowBranchSelect
                          ? data.pendingBranch ?? 'branch'
                          : 'branch'
                      }
                      onChange={(event) =>
                        shouldShowBranchSelect &&
                        onBranchChange?.(event.target.value as 'main' | 'branch')
                      }
                      disabled={!shouldShowBranchSelect}
                    >
                      <option value="main">main</option>
                      <option value="branch">branch</option>
                    </select>
                    <span className="draft-select__chevron" aria-hidden="true">▾</span>
                  </div>
                </label>
                {requireBranchName && (
                  <label>
                    Branch Name
                    <input
                      value={data.pendingBranchName ?? ''}
                      placeholder="e.g. osaka-nightlife"
                      onChange={(event) => onBranchNameChange?.(event.target.value)}
                    />
                  </label>
                )}
                <label>
                  Mode
                  <div className="bridge-mode-select">
                    <select
                      value={data.bridgePrompt ?? bridgePrompts[0]}
                      onChange={(event) => onUpdate({ bridgePrompt: event.target.value })}
                    >
                      {bridgePrompts.map((prompt) => (
                        <option key={prompt} value={prompt}>
                          {prompt}
                        </option>
                      ))}
                    </select>
                    <Sparkles size={16} aria-hidden="true" />
                  </div>
                </label>
                <label>
                  Draft Instructions
                  <textarea
                    rows={5}
                    value={data.draftInstructions ?? ''}
                    onChange={(event) => onUpdate({ draftInstructions: event.target.value })}
                    placeholder="e.g.: More formal tone, highlight key validation points..."
                  />
                </label>
                <button
                  className="secondary-btn draft-config__regenerate"
                  type="button"
                  onClick={() => onUpdate({ summary: `${data.summary}\n\nRegenerated draft...` })}
                >
                  <WandSparkles size={16} />
                  <span>Regenerate</span>
                </button>
              </div>
            </section>
            <div
              className="draft-section__resizer"
              role="separator"
              aria-orientation="vertical"
              onMouseDown={(event) => {
                event.preventDefault()
                setActiveDraftResizer('center')
              }}
            />
            <section
              className="draft-section draft-section--editor"
              style={{ flexBasis: `${rightBasis * 100}%` }}
            >
              <div className="draft-editor__header">
                <div className="draft-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={draftTab === 'editor'}
                    className={draftTab === 'editor' ? 'active' : undefined}
                    onClick={() => setDraftTab('editor')}
                  >
                    Editor
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={draftTab === 'diff'}
                    className={draftTab === 'diff' ? 'active' : undefined}
                    onClick={() => setDraftTab('diff')}
                  >
                    Diff
                  </button>
                </div>
                {onConvertDraft && (
                  <button className="primary-btn" onClick={() => onConvertDraft()}>
                    Commit Changes
                  </button>
                )}
              </div>
              {draftTab === 'editor' ? (
                <textarea
                  className="draft-editor__textarea"
                  value={data.summary}
                  onChange={(event) => onUpdate({ summary: event.target.value })}
                  placeholder="Edit draft here, supports Markdown / rich text..."
                />
              ) : (
                <div className="draft-diff">
                  <div
                    className="draft-diff__pane"
                    style={{ flexBasis: `${diffSplit * 100}%` }}
                  >
                    <header>
                      <strong>Previous Commit</strong>
                    </header>
                    <div className="draft-diff__lines">
                      {baselineLines.length === 0 ? (
                        <div className="diff-line diff-line--neutral">(No upstream commit)</div>
                      ) : (
                        baselineLines.map((text, index) => {
                          const status = baselineStatuses[index]
                          const classes =
                            status === 'removed'
                              ? 'diff-line diff-line--removed'
                              : 'diff-line diff-line--neutral'
                          return (
                            <div key={`commit-${index}`} className={classes}>
                              {text || '(Empty line)'}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                  <div
                    className="draft-diff__resizer"
                    role="separator"
                    aria-orientation="vertical"
                    onMouseDown={() => setDiffDrag(true)}
                  />
                  <div
                    className="draft-diff__pane draft-diff__pane--changes"
                    style={{ flexBasis: `${(1 - diffSplit) * 100}%` }}
                  >
                    <header>
                      <strong>Draft Changes</strong>
                    </header>
                    <div className="draft-diff__lines draft-diff__lines--interactive">
                      {draftLines.length === 0 ? (
                        <div className="diff-line diff-line--neutral">(No draft content)</div>
                      ) : (
                        draftLines.map((text, index) => {
                          const status = draftStatuses[index]
                          const key = status === 'added' ? `add-${index}` : `same-${index}`
                          const classes =
                            status === 'added' ? 'diff-line diff-line--added' : 'diff-line diff-line--neutral'
                          const decision = diffDecisions[key]
                          return (
                            <div key={`draft-${key}`} className={classes}>
                              <span>{text || '(Empty line)'}</span>
                              {status === 'added' && (
                                <div className="diff-line__actions">
                                  <button
                                    type="button"
                                    className={decision === 'accept' ? 'active' : undefined}
                                    onClick={() =>
                                      setDiffDecisions((current) => {
                                        const next: DiffDecisionMap = { ...current }
                                        if (next[key] === 'accept') {
                                          delete next[key]
                                        } else {
                                          next[key] = 'accept'
                                        }
                                        return next
                                      })
                                    }
                                    aria-label="Accept change"
                                  >
                                    <Check size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className={decision === 'reject' ? 'active' : undefined}
                                    onClick={() =>
                                      setDiffDecisions((current) => {
                                        const next: DiffDecisionMap = { ...current }
                                        if (next[key] === 'reject') {
                                          delete next[key]
                                        } else {
                                          next[key] = 'reject'
                                        }
                                        return next
                                      })
                                    }
                                    aria-label="Reject change"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                      {removals.map((segment) => {
                        const decision = diffDecisions[segment.key]
                        return (
                          <div key={`draft-${segment.key}`} className="diff-line diff-line--ghost">
                            <span>(delete) {segment.text || '(Empty line)'}</span>
                            <div className="diff-line__actions">
                              <button
                                type="button"
                                className={decision === 'accept' ? 'active' : undefined}
                                onClick={() =>
                                  setDiffDecisions((current) => {
                                    const next: DiffDecisionMap = { ...current }
                                    if (next[segment.key] === 'accept') {
                                      delete next[segment.key]
                                    } else {
                                      next[segment.key] = 'accept'
                                    }
                                    return next
                                  })
                                }
                                aria-label="Accept deletion"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                type="button"
                                className={decision === 'reject' ? 'active' : undefined}
                                onClick={() =>
                                  setDiffDecisions((current) => {
                                    const next: DiffDecisionMap = { ...current }
                                    if (next[segment.key] === 'reject') {
                                      delete next[segment.key]
                                    } else {
                                      next[segment.key] = 'reject'
                                    }
                                    return next
                                  })
                                }
                                aria-label="Reject deletion"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="node-modal__overlay" role="dialog" aria-modal="true">
      <div className="node-modal">
        <header>
          <div>
            <span>{data.entryId}</span>
            <strong>{data.title}</strong>
          </div>
          <button className="text-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="node-modal__body">
          <label>
            Title
            <input
              value={data.title}
              onChange={(event) => onUpdate({ title: event.target.value })}
            />
          </label>

          <label>
            Summary
            <textarea
              rows={5}
              value={data.summary}
              onChange={(event) => onUpdate({ summary: event.target.value })}
            />
          </label>

          <label>
            Status
            <input
              value={data.status}
              onChange={(event) => onUpdate({ status: event.target.value })}
            />
          </label>

          <label>
            Tags
            <input
              value={data.tags.join(', ')}
              onChange={(event) =>
                onUpdate({
                  tags: event.target.value
                    .split(',')
                    .map((token) => token.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>

          {isDraft && (
            <>
              <label>
                Bridge Prompt
                <select
                  value={data.bridgePrompt ?? bridgePrompts[0]}
                  onChange={(event) => onUpdate({ bridgePrompt: event.target.value })}
                >
                  {bridgePrompts.map((prompt) => (
                    <option key={prompt} value={prompt}>
                      {prompt}
                    </option>
                  ))}
                </select>
              </label>
              {shouldShowBranchSelect && (
                <label>
                  Branch Target
                  {draftBranchMode === 'select' ? (
                    <select
                      value={data.pendingBranch ?? 'branch'}
                      onChange={(event) => onBranchChange?.(event.target.value as 'main' | 'branch')}
                    >
                      <option value="main">main</option>
                      <option value="branch">branch</option>
                    </select>
                  ) : (
                    <select value="branch" disabled>
                      <option value="branch">branch</option>
                    </select>
                  )}
                </label>
              )}
              {requireBranchName && (
                <label className="branch-name-field">
                  Branch Name
                  <input
                    value={data.pendingBranchName ?? ''}
                    placeholder="e.g. osaka-nightlife"
                    onChange={(event) => onBranchNameChange?.(event.target.value)}
                  />
                </label>
              )}
            </>
          )}

          {isCommit && (
            <div className="node-modal__note">
              <Sparkles size={16} />
              <span>This commit is validator-signed. Use the ledger to diff changes.</span>
            </div>
          )}
        </div>

        <footer>
          {isDraft && (
            <div className="draft-actions">
              {draftBranchMode === 'branch-only' && (
                <span className="branch-note">latest main locked · branch only</span>
              )}
              {draftBranchMode === 'force-main' && <span className="branch-note">will create MAIN</span>}
              {draftBranchMode === 'blocked' && (
                <span className="branch-note">connect to main/branch commit to continue</span>
              )}
              <button
                className="secondary-btn"
                onClick={() => onConvertDraft?.()}
                disabled={!onConvertDraft}
              >
                Commit
              </button>
            </div>
          )}
          {quickActions && quickActions.length > 0 && (
            <div className="node-modal__quick-actions">
              {quickActions.map((action) => (
                <button
                  key={action.key}
                  className="text-btn node-modal__create-btn"
                  onClick={() => {
                    action.onClick()
                    onClose()
                  }}
                  disabled={action.disabled}
                  type="button"
                >
                  {action.icon}
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </footer>
      </div>
    </div>
  )
}
