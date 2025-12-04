import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { X, Settings, PenSquare, MessageSquarePlus, Check, GitBranch, Clock, Tag, Link2, Send, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import type { Node } from 'reactflow'
import type { CanvasNodeData, ConversationConstraints, DraftConstraintOverrides } from '../types/nodes'

const bridgeTemplates = [
  { id: 'prose', name: 'prose', description: 'General prose extraction' },
  { id: 'plan', name: 'plan', description: 'Extract action items and planning structure' },
  { id: 'story', name: 'story', description: 'Narrative extraction with flow preservation' },
  { id: 'merge', name: 'merge', description: 'Combine multiple sources into unified view' },
  { id: 'refine', name: 'refine', description: 'Polish and tighten existing content' },
]

// Phrase type for extraction results
interface Phrase {
  id: string
  text: string
  included: boolean
  sourceBoxId: string
}

// Source box type for SOURCE column
interface SourceBox {
  id: string
  title: string
  type: 'commit' | 'conversation'
  content: string
  expanded: boolean
  phrases: Phrase[]
}

// Linked keyword type for RESULT column
interface LinkedKeyword {
  id: string
  text: string
  phraseId: string
  sourceBoxId: string
  sourceBoxTitle: string
  originalWord: string
}

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

// Mock phrase extraction from text (in real app this would come from backend)
function extractPhrasesFromText(text: string, sourceBoxId: string): Phrase[] {
  if (!text) return []
  // Split into sentences and create phrases
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10)
  return sentences.slice(0, 8).map((sentence, idx) => ({
    id: `phrase-${sourceBoxId}-${idx}`,
    text: sentence.trim(),
    included: true, // default to included
    sourceBoxId,
  }))
}

// Mock keyword extraction from phrases with threshold control
function extractKeywordsFromPhrases(
  phrases: Phrase[],
  sourceBoxes: SourceBox[],
  keywordsThreshold: number = 0.6
): LinkedKeyword[] {
  const keywords: LinkedKeyword[] = []
  const stopWords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'been', 'will', 'would', 'could', 'should', 'about', 'which', 'their', 'there', 'where', 'when', 'what', 'were', 'they', 'into', 'also', 'more', 'some', 'than', 'very', 'just', 'only', 'over', 'such', 'like', 'then', 'most', 'your', 'other', 'first'])

  // Minimum word length based on threshold (higher threshold = longer words)
  const minWordLength = Math.floor(3 + keywordsThreshold * 3) // 3-6 chars

  phrases.filter(p => p.included).forEach(phrase => {
    const words = phrase.text.split(/\s+/)
    const sourceBox = sourceBoxes.find(sb => sb.id === phrase.sourceBoxId)
    words.forEach((word, idx) => {
      const cleanWord = word.toLowerCase().replace(/[^\w]/g, '')
      if (cleanWord.length >= minWordLength && !stopWords.has(cleanWord) && !keywords.some(k => k.text.toLowerCase() === cleanWord)) {
        keywords.push({
          id: `kw-${phrase.id}-${idx}`,
          text: cleanWord,
          phraseId: phrase.id,
          sourceBoxId: phrase.sourceBoxId,
          sourceBoxTitle: sourceBox?.title || 'Unknown',
          // Store original word position for highlighting in source
          originalWord: word,
        })
      }
    })
  })

  // Max keywords based on threshold (higher threshold = fewer keywords)
  const maxKeywords = Math.floor(5 + (1 - keywordsThreshold) * 20) // 5-25 keywords
  return keywords.slice(0, maxKeywords)
}

// Generate mock draft text from included phrases
function generateDraftText(phrases: Phrase[], template: string): string {
  const includedPhrases = phrases.filter(p => p.included)
  if (includedPhrases.length === 0) return ''

  const content = includedPhrases.map(p => p.text).join('. ')

  if (template === 'plan') {
    return `Key priorities:\n• ${includedPhrases.map(p => p.text).join('\n• ')}`
  }
  return content + '.'
}

// Helper to render text with keyword highlighting
function renderTextWithKeywords(
  text: string,
  keywords: LinkedKeyword[],
  hoveredKeyword: LinkedKeyword | null,
  onKeywordHover: (kw: LinkedKeyword | null) => void
): React.ReactNode[] {
  if (!text || keywords.length === 0) {
    return [text]
  }

  // Create a map of keyword texts (lowercase) to their LinkedKeyword objects
  const keywordMap = new Map<string, LinkedKeyword>()
  keywords.forEach(kw => {
    keywordMap.set(kw.text.toLowerCase(), kw)
  })

  // Split text into words while preserving spaces and punctuation
  const parts: React.ReactNode[] = []
  const regex = /(\s+|[^\s\w]|\w+)/g
  let match
  let idx = 0

  while ((match = regex.exec(text)) !== null) {
    const part = match[0]
    const cleanPart = part.toLowerCase().replace(/[^\w]/g, '')
    const keyword = keywordMap.get(cleanPart)

    if (keyword && cleanPart.length >= 3) {
      const isHovered = hoveredKeyword?.text.toLowerCase() === cleanPart
      parts.push(
        <span
          key={`kw-${idx}`}
          className={`draft-svtz__inline-keyword ${isHovered ? 'draft-svtz__inline-keyword--hovered' : ''}`}
          onMouseEnter={() => onKeywordHover(keyword)}
          onMouseLeave={() => onKeywordHover(null)}
        >
          {part}
        </span>
      )
    } else {
      parts.push(part)
    }
    idx++
  }

  return parts
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
  const isMergeDraft = isDraft && data.bridgePrompt === 'merge' && !!data.mergeConfig
  const shouldShowBranchSelect =
    (draftBranchMode === 'select' || draftBranchMode === 'branch-only') && !isMergeDraft
  const requireBranchName =
    !isMergeDraft &&
    ((draftBranchMode === 'select' && data.pendingBranch === 'branch') ||
      draftBranchMode === 'branch-only')

  // ========== Single View Two Zones State ==========
  // Config state (STEP 1)
  const [template, setTemplate] = useState(data.bridgePrompt || 'prose')
  const [cosineThreshold, setCosineThreshold] = useState(0.75)
  const [keywordsThreshold, setKeywordsThreshold] = useState(0.60)

  // Source boxes with phrases (SOURCE column)
  const [sourceBoxes, setSourceBoxes] = useState<SourceBox[]>([])

  // Generated draft text and linked keywords (RESULT column)
  const [draftText, setDraftText] = useState('')
  const [linkedKeywords, setLinkedKeywords] = useState<LinkedKeyword[]>([])

  // Loading state for Refresh
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Divider positions
  const [sidebarSourceDividerPos, setSidebarSourceDividerPos] = useState(240) // pixels for sidebar width
  const [sourceResultDividerPos, setSourceResultDividerPos] = useState(50) // percentage for SOURCE | RESULT

  // Hovered keyword for tooltip
  const [hoveredKeyword, setHoveredKeyword] = useState<LinkedKeyword | null>(null)

  // Refs
  const mainContentRef = useRef<HTMLDivElement>(null)
  const draftBodyRef = useRef<HTMLDivElement>(null)

  // Computed: all phrases from all source boxes
  const allPhrases = useMemo(() => sourceBoxes.flatMap(sb => sb.phrases), [sourceBoxes])

  // Computed: included phrases/keywords count
  const includedPhrasesCount = useMemo(() => allPhrases.filter(p => p.included).length, [allPhrases])
  const includedKeywordsCount = linkedKeywords.length

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

  // ========== Single View Two Zones Handlers ==========

  // Sidebar | SOURCE divider handler
  const handleSidebarSourceDivider = (e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draftBodyRef.current) return
      const rect = draftBodyRef.current.getBoundingClientRect()
      const newWidth = moveEvent.clientX - rect.left
      // Min 220px to ensure Branch Name input is fully visible
      setSidebarSourceDividerPos(Math.max(220, Math.min(400, newWidth)))
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

  // SOURCE | RESULT divider handler
  const handleSourceResultDivider = (e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!mainContentRef.current) return
      const rect = mainContentRef.current.getBoundingClientRect()
      const percentage = ((moveEvent.clientX - rect.left) / rect.width) * 100
      setSourceResultDividerPos(Math.max(30, Math.min(70, percentage)))
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

  // Toggle source box expansion
  const toggleSourceBoxExpand = useCallback((boxId: string) => {
    setSourceBoxes(prev => prev.map(sb =>
      sb.id === boxId ? { ...sb, expanded: !sb.expanded } : sb
    ))
  }, [])

  // Toggle phrase include/exclude
  const togglePhraseInclude = useCallback((phraseId: string) => {
    setSourceBoxes(prev => prev.map(sb => ({
      ...sb,
      phrases: sb.phrases.map(p =>
        p.id === phraseId ? { ...p, included: !p.included } : p
      )
    })))
  }, [])

  // Update draft text and keywords when phrases or threshold change
  useEffect(() => {
    if (isDraft && sourceBoxes.length > 0) {
      const newDraftText = generateDraftText(allPhrases, template)
      setDraftText(newDraftText)
      const newKeywords = extractKeywordsFromPhrases(allPhrases, sourceBoxes, keywordsThreshold)
      setLinkedKeywords(newKeywords)
    }
  }, [isDraft, sourceBoxes, allPhrases, template, keywordsThreshold])

  // Initialize source boxes from baseline summary
  useEffect(() => {
    if (isDraft && data.baselineSummary) {
      // Determine source type based on title or sourceConversationId
      const isFromCommit = data.title?.includes('Commit') || (!data.sourceConversationId && data.title?.includes('COMMIT'))
      const sourceType: 'commit' | 'conversation' = isFromCommit ? 'commit' : 'conversation'
      const sourceTitle = isFromCommit
        ? `Commit – ${data.title?.replace('Draft from ', '') || 'Source'}`
        : `Conversation – ${data.title?.replace('Draft from ', '') || 'Source'}`

      const initialBox: SourceBox = {
        id: 'source-1',
        title: sourceTitle,
        type: sourceType,
        content: data.baselineSummary,
        expanded: true,
        phrases: extractPhrasesFromText(data.baselineSummary, 'source-1'),
      }
      setSourceBoxes([initialBox])
    }
  }, [isDraft, data.baselineSummary, data.title, data.sourceConversationId])

  // Handle Refresh - re-extract with current config
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 800))

    // Re-extract phrases based on new config
    setSourceBoxes(prev => prev.map(sb => ({
      ...sb,
      phrases: extractPhrasesFromText(sb.content, sb.id),
    })))

    setIsRefreshing(false)
  }, [])

  // Handle Commit - create commit node
  const handleCommit = useCallback(() => {
    // Update data with final values
    onUpdate({
      summary: draftText,
      bridgePrompt: template,
      isGenerated: true,
    })
    // Trigger convert to commit
    onConvertDraft?.()
  }, [draftText, template, onUpdate, onConvertDraft])

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
  // DRAFT NODE - Single View Two Zones Design
  // ============================================
  if (isDraft) {
    return (
      <div className="node-modal__overlay" role="dialog" aria-modal="true">
        <div className="modal-v2 modal-v2--draft modal-v2--draft-svtz">
          {/* Top Bar */}
          <header className="modal-v2__topbar">
            <div className="modal-v2__topbar-left">
              <div className="draft-svtz__logo">t3x</div>
              <h2 className="modal-v2__title">Draft: {data.title || 'Untitled'}</h2>
              <span className="modal-v2__id">{data.entryId}</span>
            </div>
            <div className="modal-v2__topbar-right">
              <button className="modal-v2__close-btn" onClick={onClose} aria-label="Close">
                <X size={20} />
              </button>
            </div>
          </header>

          <div className="modal-v2__body draft-svtz__body" ref={draftBodyRef}>
            {/* ========== LEFT SIDEBAR: Config Zone (STEP 1 + STEP 2) ========== */}
            <aside className="draft-svtz__sidebar" style={{ width: sidebarSourceDividerPos }}>
              {/* STEP 1: Configure */}
              <div className="draft-svtz__step">
                <div className="draft-svtz__step-header">
                  <span className="draft-svtz__step-number">STEP 1</span>
                  <span className="draft-svtz__step-label">
                    <span className="draft-svtz__step-dot draft-svtz__step-dot--active" />
                    Configure
                  </span>
                </div>

                <div className="draft-svtz__config-controls">
                  {/* Branch Selection */}
                  {shouldShowBranchSelect && (
                    <div className="draft-svtz__control-group">
                      <label className="draft-svtz__control-label">Branch</label>
                      <select
                        className="draft-svtz__select draft-svtz__select--full"
                        value={data.pendingBranch || 'branch'}
                        onChange={(e) => onBranchChange?.(e.target.value as 'main' | 'branch')}
                      >
                        <option value="main">main</option>
                        <option value="branch">branch</option>
                      </select>
                    </div>
                  )}

                  {/* Branch Name - only shown when branch is selected */}
                  {requireBranchName && (
                    <div className="draft-svtz__control-group">
                      <label className="draft-svtz__control-label">Branch Name</label>
                      <input
                        type="text"
                        className="draft-svtz__input draft-svtz__input--full"
                        value={data.pendingBranchName || ''}
                        onChange={(e) => onBranchNameChange?.(e.target.value)}
                        placeholder="Enter branch name"
                      />
                    </div>
                  )}

                  {/* Template */}
                  <div className="draft-svtz__control-group">
                    <label className="draft-svtz__control-label">Template</label>
                    <select
                      className="draft-svtz__select draft-svtz__select--full"
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                    >
                      {bridgeTemplates.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Cosine Threshold */}
                  <div className="draft-svtz__control-group">
                    <label className="draft-svtz__control-label">Cosine</label>
                    <input
                      type="range"
                      className="draft-svtz__slider"
                      min="0"
                      max="1"
                      step="0.05"
                      value={cosineThreshold}
                      onChange={(e) => setCosineThreshold(parseFloat(e.target.value))}
                    />
                    <span className="draft-svtz__slider-value">{cosineThreshold.toFixed(2)}</span>
                  </div>

                  {/* Keywords Threshold */}
                  <div className="draft-svtz__control-group">
                    <label className="draft-svtz__control-label">Keywords</label>
                    <input
                      type="range"
                      className="draft-svtz__slider"
                      min="0"
                      max="1"
                      step="0.05"
                      value={keywordsThreshold}
                      onChange={(e) => setKeywordsThreshold(parseFloat(e.target.value))}
                    />
                    <span className="draft-svtz__slider-value">{keywordsThreshold.toFixed(2)}</span>
                  </div>

                  {/* Refresh Button */}
                  <button
                    className="draft-svtz__refresh-btn"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                  >
                    <RefreshCw size={16} className={isRefreshing ? 'draft-svtz__spin' : ''} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              <div className="draft-svtz__step-divider" />

              {/* STEP 2: Curate */}
              <div className="draft-svtz__step">
                <div className="draft-svtz__step-header">
                  <span className="draft-svtz__step-number">STEP 2</span>
                  <span className="draft-svtz__step-label">Curate</span>
                </div>

                <div className="draft-svtz__stats">
                  <span className="draft-svtz__stat">{includedPhrasesCount} phrases</span>
                  <span className="draft-svtz__stat">{includedKeywordsCount} keywords</span>
                </div>

                {/* Commit Button */}
                <button
                  className="draft-svtz__commit-btn"
                  onClick={handleCommit}
                  disabled={includedPhrasesCount === 0}
                >
                  <Check size={16} />
                  <span>Commit</span>
                </button>
              </div>
            </aside>

            {/* Sidebar | SOURCE Divider */}
            <div
              className="draft-svtz__divider"
              onMouseDown={handleSidebarSourceDivider}
            >
              <div className="draft-svtz__divider-handle" />
            </div>

            {/* ========== MAIN CONTENT: SOURCE + RESULT ========== */}
            <div className="draft-svtz__main" ref={mainContentRef}>
              {/* SOURCE Column */}
              <div className="draft-svtz__source" style={{ width: `${sourceResultDividerPos}%` }}>
                <div className="draft-svtz__column-header">
                  <h3>SOURCE</h3>
                </div>
                <div className="draft-svtz__source-content">
                  {sourceBoxes.length === 0 ? (
                    <div className="draft-svtz__source-empty">
                      <MessageSquarePlus size={32} strokeWidth={1} />
                      <p>No source content</p>
                      <span>Connect upstream conversation or commit</span>
                    </div>
                  ) : (
                    sourceBoxes.map((box) => (
                      <div key={box.id} className="draft-svtz__source-box">
                        {/* Source Box Header */}
                        <div
                          className="draft-svtz__source-box-header"
                          onClick={() => toggleSourceBoxExpand(box.id)}
                        >
                          <span className="draft-svtz__source-box-toggle">
                            {box.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                          <span className="draft-svtz__source-box-title">{box.title}</span>
                          <span className={`draft-svtz__source-box-badge draft-svtz__source-box-badge--${box.type}`}>
                            {box.type}
                          </span>
                        </div>
                        {/* Source Box Body with Phrases and Keyword Highlighting */}
                        {box.expanded && (
                          <div className="draft-svtz__source-box-body">
                            {box.phrases.map((phrase) => (
                              <span
                                key={phrase.id}
                                className={`draft-svtz__phrase ${phrase.included ? 'draft-svtz__phrase--included' : 'draft-svtz__phrase--excluded'}`}
                                onClick={() => togglePhraseInclude(phrase.id)}
                                title={phrase.included ? 'Click to exclude' : 'Click to include'}
                              >
                                {renderTextWithKeywords(
                                  phrase.text,
                                  linkedKeywords.filter(kw => kw.phraseId === phrase.id),
                                  hoveredKeyword,
                                  setHoveredKeyword
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Draggable Divider */}
              <div
                className="draft-svtz__divider"
                onMouseDown={handleSourceResultDivider}
              >
                <div className="draft-svtz__divider-handle" />
              </div>

              {/* RESULT Column */}
              <div className="draft-svtz__result" style={{ width: `${100 - sourceResultDividerPos}%` }}>
                <div className="draft-svtz__column-header">
                  <h3>RESULT</h3>
                </div>
                <div className="draft-svtz__result-content">
                  {/* Draft Text with Highlighted Keywords */}
                  <div className="draft-svtz__draft-text">
                    {allPhrases.filter(p => p.included).length > 0 ? (
                      <div className="draft-svtz__draft-text-content">
                        {allPhrases.filter(p => p.included).map((phrase, idx) => (
                          <span key={phrase.id}>
                            {renderTextWithKeywords(
                              phrase.text,
                              linkedKeywords.filter(kw => kw.phraseId === phrase.id),
                              hoveredKeyword,
                              setHoveredKeyword
                            )}
                            {idx < allPhrases.filter(p => p.included).length - 1 ? '. ' : '.'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="draft-svtz__draft-empty">
                        <p>No content generated yet</p>
                        <span>Click Refresh to extract content</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Legend */}
          <footer className="draft-svtz__legend">
            <span className="draft-svtz__legend-item">
              <span className="draft-svtz__legend-swatch draft-svtz__legend-swatch--included" />
              light green = included phrase (click to exclude)
            </span>
            <span className="draft-svtz__legend-item">
              <span className="draft-svtz__legend-swatch draft-svtz__legend-swatch--keyword" />
              dark green = keyword (hover to see source)
            </span>
          </footer>
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
