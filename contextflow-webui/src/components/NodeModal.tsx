import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { X, Settings, PenSquare, MessageSquarePlus, Check, Sparkles, GitBranch, Clock, Tag, Link2, Send } from 'lucide-react'
import type { Node } from 'reactflow'
import type { CanvasNodeData, ConversationConstraints, DraftConstraintOverrides } from '../types/nodes'

const bridgeTemplates = [
  { id: '/plan', name: 'Plan', description: 'Extract action items and planning structure' },
  { id: '/story', name: 'Story', description: 'Narrative extraction with flow preservation' },
  { id: '/merge', name: 'Merge', description: 'Combine multiple sources into unified view' },
  { id: '/refine', name: 'Refine', description: 'Polish and tighten existing content' },
]

export type NodeQuickAction = {
  key: string
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}

interface NodeModalProps {
  node?: Node<CanvasNodeData>
  onClose: () => void
  onUpdate: (patch: Partial<CanvasNodeData>) => void
  onConvertDraft?: () => void
  draftBranchMode?: 'force-main' | 'select' | 'branch-only' | 'blocked'
  onBranchChange?: (branch: 'main' | 'branch') => void
  onBranchNameChange?: (name: string) => void
  quickActions?: NodeQuickAction[]
  onSaveConstraints?: (constraints: ConversationConstraints) => void
  effectiveConstraints?: { clauses: ConversationConstraints['clauses'], must_have: string[], mustnt_have: string[] }
  onUpdateConstraintOverrides?: (overrides: Partial<DraftConstraintOverrides>) => void
  isConversationLocked?: boolean
}

// Keywords extraction from text (mock - in real app this would come from backend)
function extractKeywords(text: string): string[] {
  if (!text) return []
  const words = text.split(/\s+/)
  const keywords = words.filter(w => w.length > 4).slice(0, 20)
  return [...new Set(keywords)]
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
  const isMergeDraft = isDraft && data.bridgePrompt === '/merge' && !!data.mergeConfig
  const shouldShowBranchSelect =
    (draftBranchMode === 'select' || draftBranchMode === 'branch-only') && !isMergeDraft
  const requireBranchName =
    !isMergeDraft &&
    ((draftBranchMode === 'select' && data.pendingBranch === 'branch') ||
      draftBranchMode === 'branch-only')

  // Draft state - use isGenerated flag from data
  const [draftGenerated, setDraftGenerated] = useState(!!data.isGenerated)
  const [patchKeywords, setPatchKeywords] = useState<{ word: string; status: 'none' | 'must' | 'mustnt' }[]>([])

  // Sidebar state for conversation
  const [showSettings, setShowSettings] = useState(false)

  // Chat state for conversation
  const [chatMessages, setChatMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Resizable sidebar state (conversation)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Draft Phase A resizable state
  const [draftPhaseALeftWidth, setDraftPhaseALeftWidth] = useState(40) // percentage
  const draftPhaseARef = useRef<HTMLDivElement>(null)

  // Draft Phase B resizable state (two dividers)
  const [draftPhaseBLeftWidth, setDraftPhaseBLeftWidth] = useState(260) // pixels
  const [draftPhaseBRightWidth, setDraftPhaseBRightWidth] = useState(300) // pixels
  const draftPhaseBRef = useRef<HTMLDivElement>(null)

  // Commit resizable state
  const [commitLeftWidth, setCommitLeftWidth] = useState(280)
  const [commitRightWidth, setCommitRightWidth] = useState(280)
  const commitContainerRef = useRef<HTMLDivElement>(null)

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const newWidth = moveEvent.clientX - containerRect.left
      // Clamp between 200 and 500px
      setSidebarWidth(Math.max(200, Math.min(500, newWidth)))
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Draft Phase A divider handler
  const handleDraftPhaseADivider = (e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draftPhaseARef.current) return
      const rect = draftPhaseARef.current.getBoundingClientRect()
      const percentage = ((moveEvent.clientX - rect.left) / rect.width) * 100
      setDraftPhaseALeftWidth(Math.max(25, Math.min(65, percentage)))
    }

    const handleMouseUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Draft Phase B left divider handler
  const handleDraftPhaseBLeftDivider = (e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draftPhaseBRef.current) return
      const rect = draftPhaseBRef.current.getBoundingClientRect()
      const newWidth = moveEvent.clientX - rect.left
      setDraftPhaseBLeftWidth(Math.max(180, Math.min(400, newWidth)))
    }

    const handleMouseUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Draft Phase B right divider handler
  const handleDraftPhaseBRightDivider = (e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draftPhaseBRef.current) return
      const rect = draftPhaseBRef.current.getBoundingClientRect()
      const newWidth = rect.right - moveEvent.clientX
      setDraftPhaseBRightWidth(Math.max(200, Math.min(450, newWidth)))
    }

    const handleMouseUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Commit left divider handler
  const handleCommitLeftDivider = (e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!commitContainerRef.current) return
      const rect = commitContainerRef.current.getBoundingClientRect()
      const newWidth = moveEvent.clientX - rect.left
      setCommitLeftWidth(Math.max(200, Math.min(400, newWidth)))
    }

    const handleMouseUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Commit right divider handler
  const handleCommitRightDivider = (e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!commitContainerRef.current) return
      const rect = commitContainerRef.current.getBoundingClientRect()
      const newWidth = rect.right - moveEvent.clientX
      setCommitRightWidth(Math.max(200, Math.min(400, newWidth)))
    }

    const handleMouseUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Initialize patch keywords when draft is generated
  useEffect(() => {
    if (isDraft && draftGenerated && data.summary) {
      const keywords = extractKeywords(data.summary)
      setPatchKeywords(keywords.map(word => ({ word, status: 'none' })))
    }
  }, [isDraft, draftGenerated, data.summary])

  // Scroll to bottom when new messages added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const conversationAction = useMemo(() => quickActions?.find(a => a.key === 'add-draft'), [quickActions])

  const handleSendMessage = () => {
    if (!chatInput.trim()) return

    const newUserMessage = {
      id: `msg-${Date.now()}`,
      role: 'user' as const,
      content: chatInput.trim(),
    }

    setChatMessages(prev => [...prev, newUserMessage])
    setChatInput('')

    // Simulate assistant response (mock - not connected to LLM)
    setTimeout(() => {
      const mockResponse = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant' as const,
        content: 'This is a placeholder response. LLM integration coming soon.',
      }
      setChatMessages(prev => [...prev, mockResponse])
    }, 500)
  }

  const handleChatKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleGenerate = () => {
    // In real app, this would call backend API
    // For now, just mark as generated and persist to data
    setDraftGenerated(true)
    onUpdate({ isGenerated: true })
  }

  const toggleKeywordStatus = (index: number) => {
    setPatchKeywords(prev => {
      const newKeywords = [...prev]
      const current = newKeywords[index].status
      // Cycle: none -> must -> mustnt -> none
      if (current === 'none') {
        newKeywords[index] = { ...newKeywords[index], status: 'must' }
      } else if (current === 'must') {
        newKeywords[index] = { ...newKeywords[index], status: 'mustnt' }
      } else {
        newKeywords[index] = { ...newKeywords[index], status: 'none' }
      }
      return newKeywords
    })
  }

  const mustHaveKeywords = patchKeywords.filter(k => k.status === 'must').map(k => k.word)
  const mustntHaveKeywords = patchKeywords.filter(k => k.status === 'mustnt').map(k => k.word)

  // ============================================
  // CONVERSATION NODE - Sidebar left, Chat interface right
  // ============================================
  if (isConversation) {
    return (
      <div className="node-modal__overlay" role="dialog" aria-modal="true">
        <div className="modal-v2 modal-v2--conversation">
          {/* Top Bar */}
          <header className="modal-v2__topbar">
            <div className="modal-v2__topbar-left">
              <h2 className="modal-v2__title">Conversation: {data.title || 'Untitled'}</h2>
              <span className="modal-v2__id">{data.entryId}</span>
            </div>
            <div className="modal-v2__topbar-right">
              <button
                className="modal-v2__icon-btn"
                onClick={() => setShowSettings(!showSettings)}
                title="Edit Meta"
              >
                <Settings size={18} />
              </button>
              {conversationAction && (
                <button
                  className="modal-v2__primary-btn"
                  onClick={() => {
                    conversationAction.onClick()
                    onClose()
                  }}
                  disabled={conversationAction.disabled}
                >
                  <PenSquare size={16} />
                  <span>Create Draft</span>
                </button>
              )}
              <button className="modal-v2__close-btn" onClick={onClose} aria-label="Close">
                <X size={20} />
              </button>
            </div>
          </header>

          <div className="modal-v2__body" ref={containerRef}>
            {/* Left Sidebar - Metadata */}
            <aside
              className={`modal-v2__sidebar modal-v2__sidebar--left ${showSettings ? 'modal-v2__sidebar--open' : ''}`}
              style={{ width: sidebarWidth }}
            >
              <div className="modal-v2__sidebar-section">
                <h4>Metadata</h4>
                <div className="modal-v2__field">
                  <label>Title</label>
                  <input
                    type="text"
                    value={data.title}
                    onChange={(e) => onUpdate({ title: e.target.value })}
                  />
                </div>
                <div className="modal-v2__field">
                  <label>Tags</label>
                  <input
                    type="text"
                    value={data.tags.join(', ')}
                    onChange={(e) => onUpdate({
                      tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                    })}
                    placeholder="tag1, tag2, ..."
                  />
                </div>
              </div>

              <div className="modal-v2__sidebar-divider" />

              <div className="modal-v2__sidebar-section">
                <h4>Info</h4>
                <div className="modal-v2__info-row">
                  <Clock size={14} />
                  <span>Created: {data.timestamp}</span>
                </div>
                <div className="modal-v2__info-row">
                  <Link2 size={14} />
                  <span>Upstream: {data.baselineSummary ? 'Connected' : 'None (root)'}</span>
                </div>
              </div>
            </aside>

            {/* Draggable Divider */}
            <div
              className="modal-v2__resize-divider"
              onMouseDown={handleDividerMouseDown}
            />

            {/* Main Content - Chat Interface */}
            <div className="modal-v2__main conversation-v2__chat-container">
              <div className="conversation-v2__chat-messages">
                {chatMessages.length === 0 ? (
                  <div className="conversation-v2__chat-empty">
                    <MessageSquarePlus size={48} strokeWidth={1} />
                    <p>Start a conversation with the LLM</p>
                    <span>Type a message below to begin</span>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className={`conversation-v2__chat-message conversation-v2__chat-message--${msg.role}`}>
                      <div className="conversation-v2__chat-message-content">
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="conversation-v2__chat-input-container">
                <textarea
                  className="conversation-v2__chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                  rows={3}
                />
                <button
                  className="conversation-v2__chat-send-btn"
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim()}
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // DRAFT NODE - Two phases: Config (A) & Patch (B)
  // ============================================
  if (isDraft) {
    return (
      <div className="node-modal__overlay" role="dialog" aria-modal="true">
        <div className={`modal-v2 modal-v2--draft ${draftGenerated ? 'modal-v2--draft-phase-b' : 'modal-v2--draft-phase-a'}`}>
          {/* Top Bar */}
          <header className="modal-v2__topbar">
            <div className="modal-v2__topbar-left">
              <h2 className="modal-v2__title">{draftGenerated ? 'Patch' : 'Draft'}: {data.title || 'Untitled'}</h2>
              <span className="modal-v2__id">{data.entryId}</span>
              <span className={`draft-v2__phase-badge ${draftGenerated ? 'draft-v2__phase-badge--b' : 'draft-v2__phase-badge--a'}`}>
                {draftGenerated ? 'Patch Phase' : 'Draft Phase'}
              </span>
            </div>
            <div className="modal-v2__topbar-right">
              {draftGenerated && onConvertDraft && (
                <button className="modal-v2__primary-btn" onClick={onConvertDraft}>
                  <Check size={16} />
                  <span>Commit</span>
                </button>
              )}
              <button className="modal-v2__close-btn" onClick={onClose} aria-label="Close">
                <X size={20} />
              </button>
            </div>
          </header>

          <div className={`modal-v2__body draft-v2__body ${draftGenerated ? 'draft-v2__body--phase-b' : 'draft-v2__body--phase-a'}`}>
            {!draftGenerated ? (
              // ========== Phase A: Draft Configuration (2 panels) ==========
              <div className="draft-v2__phase-a" ref={draftPhaseARef}>
                {/* Left: Source Lineage */}
                <div className="draft-v2__phase-a-left" style={{ width: `${draftPhaseALeftWidth}%` }}>
                  <div className="draft-v2__section-header">
                    <h3>Source Lineage</h3>
                    <span className="draft-v2__section-desc">Upstream input for this draft</span>
                  </div>
                  <div className="draft-v2__lineage-content">
                    {data.baselineSummary ? (
                      <div className="draft-v2__lineage-blocks">
                        <div className="draft-v2__lineage-block">
                          <div className="draft-v2__lineage-block-header">
                            <Link2 size={14} />
                            <span>From Conversation/Commit</span>
                          </div>
                          <p>{data.baselineSummary}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="draft-v2__upstream-empty">
                        <MessageSquarePlus size={32} strokeWidth={1} />
                        <p>No upstream connected</p>
                        <span>This draft will start fresh.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Draggable Divider */}
                <div
                  className="modal-v2__resize-divider"
                  onMouseDown={handleDraftPhaseADivider}
                />

                {/* Right: Configuration (Branch, Bridge, Preference, Generate) */}
                <div className="draft-v2__phase-a-right">
                  <div className="draft-v2__section-header">
                    <h3>Draft Configuration</h3>
                    <span className="draft-v2__section-desc">Set up extraction parameters</span>
                  </div>

                  <div className="draft-v2__config-form">
                    {/* Branch Selection */}
                    {shouldShowBranchSelect && (
                      <div className="draft-v2__config-group">
                        <div className="draft-v2__config-label">Target Branch</div>
                        <div className="draft-v2__config-row">
                          <select
                            className="draft-v2__config-select"
                            value={data.pendingBranch || 'branch'}
                            onChange={(e) => onBranchChange?.(e.target.value as 'main' | 'branch')}
                          >
                            <option value="main">main</option>
                            <option value="branch">branch</option>
                          </select>
                          {requireBranchName && (
                            <input
                              type="text"
                              className="draft-v2__config-input"
                              value={data.pendingBranchName || ''}
                              onChange={(e) => onBranchNameChange?.(e.target.value)}
                              placeholder="Branch name"
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {/* Bridge Template */}
                    <div className="draft-v2__config-group">
                      <div className="draft-v2__config-label">Bridge Template</div>
                      <select
                        className="draft-v2__config-select draft-v2__config-select--full"
                        value={data.bridgePrompt || bridgeTemplates[0].id}
                        onChange={(e) => onUpdate({ bridgePrompt: e.target.value })}
                      >
                        {bridgeTemplates.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Preference */}
                    <div className="draft-v2__config-group draft-v2__config-group--flex">
                      <div className="draft-v2__config-label">Preference</div>
                      <textarea
                        className="draft-v2__preference-input"
                        value={data.draftInstructions || ''}
                        onChange={(e) => onUpdate({ draftInstructions: e.target.value })}
                        placeholder="Describe your extraction preferences...&#10;&#10;Examples:&#10;• Focus on risks and potential issues&#10;• Preserve all numbers and statistics&#10;• Tighten the tone, make it concise&#10;• Extract action items only"
                      />
                    </div>

                    {/* Generate Button */}
                    <div className="draft-v2__generate-action">
                      <button className="draft-v2__generate-btn" onClick={handleGenerate}>
                        <Sparkles size={18} />
                        <span>Generate Draft</span>
                      </button>
                      <span className="draft-v2__generate-hint">
                        This will extract content based on Bridge + Preference
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // ========== Phase B: Patch (3 panels) ==========
              <div className="draft-v2__phase-b" ref={draftPhaseBRef}>
                {/* Left: Source Lineage */}
                <div className="draft-v2__phase-b-left" style={{ width: draftPhaseBLeftWidth }}>
                  <div className="draft-v2__section-header">
                    <h3>Source Lineage</h3>
                    <span className="draft-v2__section-desc">Traceability</span>
                  </div>
                  <div className="draft-v2__lineage-content">
                    {data.baselineSummary ? (
                      <div className="draft-v2__lineage-blocks">
                        <div className="draft-v2__lineage-block draft-v2__lineage-block--hoverable">
                          <div className="draft-v2__lineage-block-header">
                            <span>Source Fragment</span>
                          </div>
                          <p>{data.baselineSummary}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="draft-v2__lineage-empty">
                        <p>No upstream source</p>
                      </div>
                    )}
                    <div className="draft-v2__lineage-hint">
                      <span>Hover on draft content to highlight source</span>
                    </div>
                  </div>
                </div>

                {/* Left Divider */}
                <div
                  className="modal-v2__resize-divider"
                  onMouseDown={handleDraftPhaseBLeftDivider}
                />

                {/* Center: Semantic Draft Content */}
                <div className="draft-v2__phase-b-center">
                  <div className="draft-v2__section-header">
                    <h3>Semantic Draft</h3>
                    <span className="draft-v2__generated-badge">
                      <Check size={12} />
                      Generated · To change, create new Draft
                    </span>
                  </div>
                  <div className="draft-v2__content-area">
                    <textarea
                      className="draft-v2__content-textarea"
                      value={data.summary || ''}
                      onChange={(e) => onUpdate({ summary: e.target.value })}
                      placeholder="Generated semantic content..."
                    />
                  </div>
                </div>

                {/* Right Divider */}
                <div
                  className="modal-v2__resize-divider"
                  onMouseDown={handleDraftPhaseBRightDivider}
                />

                {/* Right: Patch Panel */}
                <div className="draft-v2__phase-b-right" style={{ width: draftPhaseBRightWidth }}>
                  <div className="draft-v2__section-header">
                    <h3>Patch: Constraints</h3>
                    <span className="draft-v2__section-desc">must-have / mustn't-have</span>
                  </div>

                  <div className="draft-v2__patch-keywords">
                    {patchKeywords.length === 0 ? (
                      <p className="draft-v2__patch-empty">No keywords extracted yet</p>
                    ) : (
                      <div className="draft-v2__patch-keyword-grid">
                        {patchKeywords.map((kw, idx) => (
                          <button
                            key={idx}
                            className={`draft-v2__keyword draft-v2__keyword--${kw.status}`}
                            onClick={() => toggleKeywordStatus(idx)}
                            title={kw.status === 'none' ? 'Click to mark as must-have' :
                                   kw.status === 'must' ? 'Click to mark as mustn\'t-have' :
                                   'Click to clear'}
                          >
                            {kw.word}
                            {kw.status === 'must' && <Check size={12} />}
                            {kw.status === 'mustnt' && <X size={12} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="draft-v2__patch-divider" />

                  <div className="draft-v2__patch-summary">
                    <div className="draft-v2__patch-list">
                      <h5 className="draft-v2__patch-list-title draft-v2__patch-list-title--must">
                        <Check size={14} />
                        Must-have ({mustHaveKeywords.length})
                      </h5>
                      {mustHaveKeywords.length > 0 ? (
                        <div className="draft-v2__patch-tags draft-v2__patch-tags--must">
                          {mustHaveKeywords.map((w, i) => <span key={i}>{w}</span>)}
                        </div>
                      ) : (
                        <span className="draft-v2__patch-none">None selected</span>
                      )}
                    </div>
                    <div className="draft-v2__patch-list">
                      <h5 className="draft-v2__patch-list-title draft-v2__patch-list-title--mustnt">
                        <X size={14} />
                        Mustn't-have ({mustntHaveKeywords.length})
                      </h5>
                      {mustntHaveKeywords.length > 0 ? (
                        <div className="draft-v2__patch-tags draft-v2__patch-tags--mustnt">
                          {mustntHaveKeywords.map((w, i) => <span key={i}>{w}</span>)}
                        </div>
                      ) : (
                        <span className="draft-v2__patch-none">None selected</span>
                      )}
                    </div>
                  </div>

                  <div className="draft-v2__patch-action">
                    <button className="draft-v2__patch-confirm-btn">
                      <Check size={16} />
                      <span>Confirm Constraints</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // COMMIT NODE - Read-only frozen version
  // ============================================
  if (isCommit) {
    const branchLabel = data.branchType === 'branch' ? data.branchName?.trim() || 'branch' : 'main'

    // Mock constraints - in real app these would come from data
    const commitMustHave = data.tags.slice(0, 3)
    const commitMustntHave = data.tags.slice(3, 5)

    return (
      <div className="node-modal__overlay" role="dialog" aria-modal="true">
        <div className="modal-v2 modal-v2--commit">
          {/* Top Bar */}
          <header className="modal-v2__topbar">
            <div className="modal-v2__topbar-left">
              <h2 className="modal-v2__title">Commit: {data.title || 'Untitled'}</h2>
              <span className="modal-v2__id">{data.entryId}</span>
              <span className={`modal-v2__branch-badge modal-v2__branch-badge--${branchLabel === 'main' ? 'main' : 'branch'}`}>
                <GitBranch size={12} />
                {branchLabel}
              </span>
            </div>
            <div className="modal-v2__topbar-right">
              {quickActions?.map((action) => (
                <button
                  key={action.key}
                  className="modal-v2__secondary-btn"
                  onClick={() => {
                    action.onClick()
                    onClose()
                  }}
                  disabled={action.disabled}
                >
                  {action.icon}
                  <span>{action.label}</span>
                </button>
              ))}
              <button className="modal-v2__close-btn" onClick={onClose} aria-label="Close">
                <X size={20} />
              </button>
            </div>
          </header>

          <div className="modal-v2__body" ref={commitContainerRef}>
            {/* Left Sidebar - Meta & Lineage */}
            <aside className="modal-v2__sidebar modal-v2__sidebar--left" style={{ width: commitLeftWidth }}>
              <div className="modal-v2__sidebar-section">
                <h4>Version Info</h4>
                <div className="modal-v2__info-row">
                  <GitBranch size={14} />
                  <span>Branch: <strong>{branchLabel}</strong></span>
                </div>
                <div className="modal-v2__info-row">
                  <Clock size={14} />
                  <span>{data.timestamp}</span>
                </div>
                <div className="modal-v2__info-row">
                  <Tag size={14} />
                  <span>{data.tags.length > 0 ? data.tags.join(', ') : 'No tags'}</span>
                </div>
              </div>

              <div className="modal-v2__sidebar-divider" />

              <div className="modal-v2__sidebar-section">
                <h4>Lineage</h4>
                <div className="commit-v2__lineage">
                  <div className="commit-v2__lineage-item">
                    <span className="commit-v2__lineage-label">From Draft:</span>
                    <span className="commit-v2__lineage-value">{data.entryId}</span>
                  </div>
                  {data.baselineSummary && (
                    <div className="commit-v2__lineage-item">
                      <span className="commit-v2__lineage-label">Upstream:</span>
                      <span className="commit-v2__lineage-value">Connected</span>
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* Left Divider */}
            <div
              className="modal-v2__resize-divider"
              onMouseDown={handleCommitLeftDivider}
            />

            {/* Main Content - Semantic Snapshot */}
            <div className="modal-v2__main">
              <div className="commit-v2__section">
                <div className="commit-v2__section-header">
                  <h3>Semantic Content</h3>
                  <span className="commit-v2__readonly-badge">Read-only</span>
                </div>
                <div className="commit-v2__content">
                  {data.summary || 'No content recorded.'}
                </div>
              </div>

              {data.status && (
                <div className="commit-v2__section">
                  <div className="commit-v2__section-header">
                    <h3>Intent</h3>
                  </div>
                  <div className="commit-v2__intent">
                    {data.status}
                  </div>
                </div>
              )}
            </div>

            {/* Right Divider */}
            <div
              className="modal-v2__resize-divider"
              onMouseDown={handleCommitRightDivider}
            />

            {/* Right Sidebar - Constraints Summary */}
            <aside className="modal-v2__sidebar modal-v2__sidebar--right" style={{ width: commitRightWidth }}>
              <div className="modal-v2__sidebar-section">
                <h4>Constraints</h4>

                <div className="commit-v2__constraints-group">
                  <h5 className="commit-v2__constraints-label commit-v2__constraints-label--must">
                    Must-have
                  </h5>
                  {commitMustHave.length > 0 ? (
                    <div className="commit-v2__constraints-tags">
                      {commitMustHave.map((w, i) => (
                        <span key={i} className="commit-v2__constraint-tag commit-v2__constraint-tag--must">
                          {w}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="commit-v2__constraints-empty">None</span>
                  )}
                </div>

                <div className="commit-v2__constraints-group">
                  <h5 className="commit-v2__constraints-label commit-v2__constraints-label--mustnt">
                    Mustn't-have
                  </h5>
                  {commitMustntHave.length > 0 ? (
                    <div className="commit-v2__constraints-tags">
                      {commitMustntHave.map((w, i) => (
                        <span key={i} className="commit-v2__constraint-tag commit-v2__constraint-tag--mustnt">
                          {w}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="commit-v2__constraints-empty">None</span>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    )
  }

  // Fallback for unknown node types
  return (
    <div className="node-modal__overlay" role="dialog" aria-modal="true">
      <div className="modal-v2">
        <header className="modal-v2__topbar">
          <div className="modal-v2__topbar-left">
            <h2 className="modal-v2__title">{data.title || 'Node'}</h2>
          </div>
          <div className="modal-v2__topbar-right">
            <button className="modal-v2__close-btn" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </header>
        <div className="modal-v2__body">
          <p>Unknown node type</p>
        </div>
      </div>
    </div>
  )
}
