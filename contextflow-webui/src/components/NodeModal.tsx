import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { X, Settings, MessageSquarePlus, Check, GitBranch, GitCommit, Clock, Tag, Link2, Send, ChevronDown, ChevronRight, Lock, RotateCcw } from 'lucide-react'
import type { Node } from 'reactflow'
import type { CanvasNodeData, ConversationConstraints, DraftConstraintOverrides, SourceTextBlock } from '../types/nodes'
import { PendingSourceEditor, SourceExcerptViewer } from './SelectableTextBlock'
import {
  getSelectedText,
  getMustHaveKeywords as getMustHaveKeywordsFromBlocks,
  getMustntHaveKeywords as getMustntHaveKeywordsFromBlocks,
  extractWithThresholds,
} from '../utils/tokenizer'

const bridgeTemplates = [
  { id: 'prose', name: 'prose', description: 'General prose extraction' },
  { id: 'plan', name: 'plan', description: 'Extract action items and planning structure' },
  { id: 'story', name: 'story', description: 'Narrative extraction with flow preservation' },
  { id: 'summary', name: 'summary', description: 'Concise summary of key points' },
  { id: 'refine', name: 'refine', description: 'Polish and tighten existing content' },
]

// Phrase type for extraction results
// Two states: included (浅绿) or excluded (浅红)
interface Phrase {
  id: string
  text: string
  included: boolean  // true = include (浅绿), false = exclude (浅红)
  sourceBoxId: string
  keywords: PhraseKeyword[]  // Keywords within this phrase
}

// Keyword within a phrase
// Two states: must (深绿) or mustnt (深红)
// Only editable when parent phrase is included
interface PhraseKeyword {
  id: string
  text: string
  originalWord: string  // Original word with punctuation
  startIndex: number    // Position in phrase text
  isMustnt: boolean     // false = must_have (深绿), true = mustnt_have (深红)
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

// Stop words for keyword extraction
const STOP_WORDS = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'been', 'will', 'would', 'could', 'should', 'about', 'which', 'their', 'there', 'where', 'when', 'what', 'were', 'they', 'into', 'also', 'more', 'some', 'than', 'very', 'just', 'only', 'over', 'such', 'like', 'then', 'most', 'your', 'other', 'first', 'can', 'are', 'was', 'has', 'had', 'but', 'not', 'you', 'all', 'any', 'its', 'may', 'how', 'out', 'who', 'get', 'our', 'one', 'two'])

// Extract keywords from a single phrase
function extractKeywordsFromPhrase(
  phraseText: string,
  phraseId: string,
  minWordLength: number = 4
): PhraseKeyword[] {
  const keywords: PhraseKeyword[] = []
  const seenWords = new Set<string>()

  // Match words with their positions
  const wordRegex = /\b\w+\b/g
  let match

  while ((match = wordRegex.exec(phraseText)) !== null) {
    const word = match[0]
    const cleanWord = word.toLowerCase()

    if (
      cleanWord.length >= minWordLength &&
      !STOP_WORDS.has(cleanWord) &&
      !seenWords.has(cleanWord)
    ) {
      seenWords.add(cleanWord)
      keywords.push({
        id: `kw-${phraseId}-${match.index}`,
        text: cleanWord,
        originalWord: word,
        startIndex: match.index,
        isMustnt: false,  // Default to must_have (深绿)
      })
    }
  }

  return keywords
}

// Mock phrase extraction from text (in real app this would come from backend)
function extractPhrasesFromText(
  text: string,
  sourceBoxId: string,
  keywordsThreshold: number = 0.6
): Phrase[] {
  if (!text) return []

  // Minimum word length based on threshold (higher threshold = longer words)
  const minWordLength = Math.floor(3 + keywordsThreshold * 3) // 3-6 chars

  // Split into sentences and create phrases
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10)
  return sentences.slice(0, 8).map((sentence, idx) => {
    const phraseId = `phrase-${sourceBoxId}-${idx}`
    const trimmedText = sentence.trim()
    return {
      id: phraseId,
      text: trimmedText,
      included: true, // default to included (浅绿)
      sourceBoxId,
      keywords: extractKeywordsFromPhrase(trimmedText, phraseId, minWordLength),
    }
  })
}

// Generate result text from included phrases (excludes mustnt keywords)
function generateResultText(phrases: Phrase[]): string {
  const includedPhrases = phrases.filter(p => p.included)
  if (includedPhrases.length === 0) return ''

  return includedPhrases.map(p => p.text).join('. ') + '.'
}

// Get all must_have keywords from included phrases (legacy phrase-based system)
function getMustHaveKeywordsLegacy(phrases: Phrase[]): PhraseKeyword[] {
  return phrases
    .filter(p => p.included)
    .flatMap(p => p.keywords.filter(kw => !kw.isMustnt))
}

// Get all mustnt_have keywords from included phrases (legacy phrase-based system)
function getMustntHaveKeywordsLegacy(phrases: Phrase[]): PhraseKeyword[] {
  return phrases
    .filter(p => p.included)
    .flatMap(p => p.keywords.filter(kw => kw.isMustnt))
}

// Helper to render phrase text with clickable keywords
// - Click on non-keyword text: toggle phrase include/exclude
// - Click on keyword: toggle keyword must/mustnt (only when phrase is included)
function renderPhraseWithKeywords(
  phrase: Phrase,
  canToggle: boolean,
  onPhraseClick: () => void,
  onKeywordClick: (keywordId: string) => void,
  hoveredKeywordText: string | null,
  onKeywordHover: (text: string | null) => void
): React.ReactNode[] {
  const { text, keywords, included } = phrase

  if (keywords.length === 0) {
    // No keywords, entire phrase is clickable
    return [
      <span
        key="text"
        className="draft-svtz__phrase-text"
        onClick={(e) => {
          e.stopPropagation()
          if (canToggle) onPhraseClick()
        }}
        title={!canToggle ? 'Complete Step 1 to edit' : (included ? 'Click to exclude phrase' : 'Click to include phrase')}
      >
        {text}
      </span>
    ]
  }

  // Sort keywords by position
  const sortedKeywords = [...keywords].sort((a, b) => a.startIndex - b.startIndex)

  const parts: React.ReactNode[] = []
  let lastIndex = 0

  sortedKeywords.forEach((kw, idx) => {
    // Add text before this keyword (clickable to toggle phrase)
    if (kw.startIndex > lastIndex) {
      const beforeText = text.slice(lastIndex, kw.startIndex)
      parts.push(
        <span
          key={`text-${idx}`}
          className="draft-svtz__phrase-text"
          onClick={(e) => {
            e.stopPropagation()
            if (canToggle) onPhraseClick()
          }}
          title={!canToggle ? 'Complete Step 1 to edit' : (included ? 'Click to exclude phrase' : 'Click to include phrase')}
        >
          {beforeText}
        </span>
      )
    }

    // Add keyword (clickable to toggle must/mustnt, only when phrase is included)
    const keywordEndIndex = kw.startIndex + kw.originalWord.length
    const isHovered = hoveredKeywordText === kw.text.toLowerCase()
    parts.push(
      <span
        key={`kw-${kw.id}`}
        className={`draft-svtz__keyword ${kw.isMustnt ? 'draft-svtz__keyword--mustnt' : 'draft-svtz__keyword--must'} ${!included ? 'draft-svtz__keyword--disabled' : ''} ${isHovered ? 'draft-svtz__keyword--hovered' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          if (canToggle && included) onKeywordClick(kw.id)
        }}
        onMouseEnter={() => onKeywordHover(kw.text.toLowerCase())}
        onMouseLeave={() => onKeywordHover(null)}
        title={
          !canToggle ? 'Complete Step 1 to edit' :
          !included ? 'Include phrase first to edit keywords' :
          (kw.isMustnt ? 'Click to change to must-have' : 'Click to change to mustnt-have')
        }
      >
        {text.slice(kw.startIndex, keywordEndIndex)}
      </span>
    )

    lastIndex = keywordEndIndex
  })

  // Add remaining text after last keyword
  if (lastIndex < text.length) {
    parts.push(
      <span
        key="text-end"
        className="draft-svtz__phrase-text"
        onClick={(e) => {
          e.stopPropagation()
          if (canToggle) onPhraseClick()
        }}
        title={!canToggle ? 'Complete Step 1 to edit' : (included ? 'Click to exclude phrase' : 'Click to include phrase')}
      >
        {text.slice(lastIndex)}
      </span>
    )
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
  // ========== ALL HOOKS MUST BE AT THE TOP - before any conditional returns ==========

  // ========== Single View Two Zones State ==========
  // Config state (STEP 1)
  const [template, setTemplate] = useState(node?.data.bridgePrompt || 'prose')
  const [cosineThreshold, setCosineThreshold] = useState(0.75)
  const [keywordsThreshold, setKeywordsThreshold] = useState(0.60)

  // Step 1 locked state - when true, config is frozen and Step 2 becomes editable
  const [configLocked, setConfigLocked] = useState(false)

  // Source boxes with phrases (SOURCE column) - baseline from Step 1
  const [sourceBoxes, setSourceBoxes] = useState<SourceBox[]>([])

  // New: Text blocks for free-form selection (from pendingSource)
  const [textBlocks, setTextBlocks] = useState<SourceTextBlock[]>(
    node?.data.pendingSource?.textBlocks || []
  )

  // Divider positions
  const [sidebarSourceDividerPos, setSidebarSourceDividerPos] = useState(240) // pixels for sidebar width

  // Hovered keyword (for cross-area highlighting)
  const [hoveredKeywordText, setHoveredKeywordText] = useState<string | null>(null)

  // Sidebar state for conversation
  const [showSettings, setShowSettings] = useState(false)

  // Chat state for conversation
  const [chatMessages, setChatMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string }[]>([])
  const [chatInput, setChatInput] = useState('')

  // Resizable sidebar state (conversation)
  const [sidebarWidth, setSidebarWidth] = useState(280)

  // Commit resizable state
  const [commitLeftWidth, setCommitLeftWidth] = useState(280)
  const [commitRightWidth, setCommitRightWidth] = useState(280)

  // Refs
  const mainContentRef = useRef<HTMLDivElement>(null)
  const draftBodyRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const commitContainerRef = useRef<HTMLDivElement>(null)

  // Handler for keyword hover
  const handleKeywordHover = useCallback((text: string | null) => {
    setHoveredKeywordText(text)
  }, [])

  // Computed: all phrases from all source boxes (legacy system)
  const allPhrases = useMemo(() => sourceBoxes.flatMap(sb => sb.phrases), [sourceBoxes])

  // Computed: included phrases count (legacy)
  const includedPhrasesCount = useMemo(() => allPhrases.filter(p => p.included).length, [allPhrases])

  // Computed: must_have and mustnt_have keywords (legacy)
  const mustHaveKeywordsLegacy = useMemo(() => getMustHaveKeywordsLegacy(allPhrases), [allPhrases])
  const mustntHaveKeywordsLegacy = useMemo(() => getMustntHaveKeywordsLegacy(allPhrases), [allPhrases])

  // Computed: result text from included phrases (legacy)
  const resultText = useMemo(() => generateResultText(allPhrases), [allPhrases])

  // ========== New free-form selection computed values ==========
  // Check if we have new-style pendingSource data
  const hasNewSourceData = textBlocks.length > 0

  // Computed: selected text from all blocks
  const selectedTextNew = useMemo(() => {
    return textBlocks.map(block => getSelectedText(block.tokens, block.selections)).join('\n\n')
  }, [textBlocks])

  // Computed: must_have keywords from all blocks
  const mustHaveKeywordsNew = useMemo(() => {
    return textBlocks.flatMap(block => getMustHaveKeywordsFromBlocks(block.tokens, block.keywords))
  }, [textBlocks])

  // Computed: mustnt_have keywords from all blocks
  const mustntHaveKeywordsNew = useMemo(() => {
    return textBlocks.flatMap(block => getMustntHaveKeywordsFromBlocks(block.tokens, block.keywords))
  }, [textBlocks])

  // Computed: total selections count
  const selectionsCount = useMemo(() => {
    return textBlocks.reduce((acc, block) => acc + block.selections.length, 0)
  }, [textBlocks])

  // Persist text block edits (selections/keywords) back to canvas store
  const handleTextBlocksChange = useCallback(
    (updatedBlocks: SourceTextBlock[]) => {
      setTextBlocks(updatedBlocks)
      onUpdate({
        pendingSource: {
          textBlocks: updatedBlocks,
        },
      })
    },
    [onUpdate]
  )

  // Toggle source box expansion
  const toggleSourceBoxExpand = useCallback((boxId: string) => {
    setSourceBoxes(prev => prev.map(sb =>
      sb.id === boxId ? { ...sb, expanded: !sb.expanded } : sb
    ))
  }, [])

  // Toggle phrase include/exclude (only in Step 2 when configLocked)
  // Phrase: include (浅绿) ↔ exclude (浅红)
  const togglePhraseInclude = useCallback((phraseId: string) => {
    if (!configLocked) return // Only allow in Step 2

    setSourceBoxes(prev => prev.map(sb => ({
      ...sb,
      phrases: sb.phrases.map(p =>
        p.id === phraseId ? { ...p, included: !p.included } : p
      )
    })))
  }, [configLocked])

  // Toggle keyword must/mustnt (only when parent phrase is included)
  // Keyword: must_have (深绿) ↔ mustnt_have (深红)
  const toggleKeywordMustnt = useCallback((phraseId: string, keywordId: string) => {
    if (!configLocked) return // Only allow in Step 2

    setSourceBoxes(prev => prev.map(sb => ({
      ...sb,
      phrases: sb.phrases.map(p => {
        if (p.id !== phraseId || !p.included) return p // Only toggle if phrase is included
        return {
          ...p,
          keywords: p.keywords.map(kw =>
            kw.id === keywordId ? { ...kw, isMustnt: !kw.isMustnt } : kw
          )
        }
      })
    })))
  }, [configLocked])

  // Handle Proceed - lock Step 1 config and enable Step 2 editing
  const handleProceed = useCallback(() => {
    // Check for either new textBlocks or legacy sourceBoxes
    if (textBlocks.length === 0 && sourceBoxes.length === 0) return
    setConfigLocked(true)
  }, [textBlocks.length, sourceBoxes.length])

  // Handle Reset - unlock Step 1 config and reset phrases to default
  const handleReset = useCallback(() => {
    setConfigLocked(false)
    // Re-extract to reset all phrase/keyword states
    setSourceBoxes(prev => prev.map(sb => ({
      ...sb,
      phrases: extractPhrasesFromText(sb.content, sb.id, keywordsThreshold),
    })))
  }, [keywordsThreshold])

  // Derive node-dependent values
  const data = node?.data
  const isCommit = data?.kind === 'commit'
  const isConversation = data?.kind === 'conversation'
  const isPendingCommit = isCommit && data?.commitStatus === 'pending'
  const isCommittedCommit = isCommit && data?.commitStatus !== 'pending'
  const isMergeDraft = isPendingCommit && data?.bridgePrompt === 'merge' && !!data?.mergeConfig
  const shouldShowBranchSelect =
    (draftBranchMode === 'select' || draftBranchMode === 'branch-only') && !isMergeDraft
  const requireBranchName =
    !isMergeDraft &&
    ((draftBranchMode === 'select' && data?.pendingBranch === 'branch') ||
      draftBranchMode === 'branch-only')

  // Handle Commit - create commit node
  const handleCommit = useCallback(() => {
    if (!data) return
    const selectionSummary = selectedTextNew.trim()
    const summaryToSave = hasNewSourceData
      ? selectionSummary || data.summary
      : resultText

    // Update data with final values
    onUpdate({
      summary: summaryToSave,
      bridgePrompt: template,
      isGenerated: true,
      pendingSource: hasNewSourceData ? { textBlocks } : data.pendingSource,
    })
    // Trigger convert to commit
    onConvertDraft?.()
  }, [selectedTextNew, hasNewSourceData, data, resultText, template, onUpdate, onConvertDraft, textBlocks])

  // Initialize source boxes and textBlocks from baseline summary
  // Note: setState in effect is intentional here for initialization based on props
  useEffect(() => {
    if (isPendingCommit && data?.baselineSummary) {
      // Determine source type based on title or sourceConversationId
      const isFromCommit = data.title?.includes('Commit') || (!data.sourceConversationId && data.title?.includes('COMMIT'))
      const sourceType: 'commit' | 'conversation' = isFromCommit ? 'commit' : 'conversation'
      const sourceTitle = isFromCommit
        ? `Commit – ${data.title?.replace('Draft from ', '') || 'Source'}`
        : `Conversation – ${data.title?.replace('Draft from ', '') || 'Source'}`

      // Legacy: Initialize sourceBoxes
      const initialBox: SourceBox = {
        id: 'source-1',
        title: sourceTitle,
        type: sourceType,
        content: data.baselineSummary,
        expanded: true,
        phrases: extractPhrasesFromText(data.baselineSummary, 'source-1', keywordsThreshold),
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSourceBoxes([initialBox])

      // New: Initialize textBlocks with model extraction based on thresholds
      // Only initialize if not already set from data.pendingSource
      if (!data.pendingSource?.textBlocks?.length) {
        const initialTextBlock = extractWithThresholds(
          'block-1',
          data.baselineSummary,
          cosineThreshold,
          keywordsThreshold
        )
        setTextBlocks([initialTextBlock])
      }
    }
  }, [isPendingCommit, data?.baselineSummary, data?.title, data?.sourceConversationId, data?.pendingSource?.textBlocks?.length, keywordsThreshold, cosineThreshold])

  // Auto re-extract when thresholds change (only when not locked)
  // Note: setState in effect is intentional here to sync derived state with props
  useEffect(() => {
    if (isPendingCommit && data?.baselineSummary && !configLocked) {
      const updatedTextBlock = extractWithThresholds(
        'block-1',
        data.baselineSummary,
        cosineThreshold,
        keywordsThreshold
      )
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTextBlocks([updatedTextBlock])
    }
  }, [cosineThreshold, keywordsThreshold, configLocked, isPendingCommit, data?.baselineSummary])

  // Scroll to bottom when new messages added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const addCommitAction = useMemo(() => quickActions?.find(a => a.key === 'add-commit'), [quickActions])

  const handleSendMessage = useCallback(() => {
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
  }, [chatInput])

  const handleChatKeyDown = useCallback((e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }, [handleSendMessage])

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

  // ============================================
  // Early return - must be after all hooks
  // ============================================
  if (!node || !data) {
    return null
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
              {addCommitAction && (
                <button
                  className="modal-v2__primary-btn"
                  onClick={() => {
                    addCommitAction.onClick()
                    onClose()
                  }}
                  disabled={addCommitAction.disabled}
                  title="Create a pending commit node from this conversation"
                >
                  <GitCommit size={16} />
                  <span>Create Commit</span>
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
  // PENDING COMMIT - Single View Two Zones Design (editable)
  // ============================================
  if (isPendingCommit) {
    return (
      <div className="node-modal__overlay" role="dialog" aria-modal="true">
        <div className="modal-v2 modal-v2--commit modal-v2--commit-pending modal-v2--draft-svtz">
          {/* Top Bar */}
          <header className="modal-v2__topbar">
            <div className="modal-v2__topbar-left">
              <div className="draft-svtz__logo">t3x</div>
              <h2 className="modal-v2__title">Commit: {data.title || 'Untitled'}</h2>
              <span className="modal-v2__id">{data.entryId}</span>
              <span className="modal-v2__pending-badge">pending</span>
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
              <div className={`draft-svtz__step ${configLocked ? 'draft-svtz__step--locked' : ''}`}>
                <div className="draft-svtz__step-header">
                  <span className="draft-svtz__step-number">STEP 1</span>
                  <span className="draft-svtz__step-label">
                    <span className={`draft-svtz__step-dot ${!configLocked ? 'draft-svtz__step-dot--active' : 'draft-svtz__step-dot--completed'}`} />
                    Configure
                    {configLocked && <Lock size={12} className="draft-svtz__lock-icon" />}
                  </span>
                </div>

                {!configLocked ? (
                  /* Unlocked state: Show editable controls */
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

                    {/* Proceed Button */}
                    <div className="draft-svtz__step-actions">
                      <button
                        className="draft-svtz__proceed-btn"
                        onClick={handleProceed}
                        disabled={textBlocks.length === 0 && sourceBoxes.length === 0}
                        title="Lock configuration and proceed to curation"
                      >
                        <Check size={16} />
                        <span>Proceed</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Locked state: Show read-only summary */
                  <div className="draft-svtz__config-locked">
                    <div className="draft-svtz__config-summary">
                      {shouldShowBranchSelect && (
                        <div className="draft-svtz__config-item">
                          <span className="draft-svtz__config-item-label">Branch:</span>
                          <span className="draft-svtz__config-item-value">{data.pendingBranch || 'branch'}</span>
                        </div>
                      )}
                      {requireBranchName && (
                        <div className="draft-svtz__config-item">
                          <span className="draft-svtz__config-item-label">Name:</span>
                          <span className="draft-svtz__config-item-value">{data.pendingBranchName || '-'}</span>
                        </div>
                      )}
                      <div className="draft-svtz__config-item">
                        <span className="draft-svtz__config-item-label">Template:</span>
                        <span className="draft-svtz__config-item-value">{template}</span>
                      </div>
                      <div className="draft-svtz__config-item">
                        <span className="draft-svtz__config-item-label">Cosine:</span>
                        <span className="draft-svtz__config-item-value">{cosineThreshold.toFixed(2)}</span>
                      </div>
                      <div className="draft-svtz__config-item">
                        <span className="draft-svtz__config-item-label">Keywords:</span>
                        <span className="draft-svtz__config-item-value">{keywordsThreshold.toFixed(2)}</span>
                      </div>
                    </div>
                    <button
                      className="draft-svtz__reset-btn"
                      onClick={handleReset}
                      title="Unlock configuration (will reset Step 2 changes)"
                    >
                      <RotateCcw size={16} />
                      <span>Reset</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="draft-svtz__step-divider" />

              {/* STEP 2: Curate */}
              <div className={`draft-svtz__step ${!configLocked ? 'draft-svtz__step--disabled' : ''}`}>
                <div className="draft-svtz__step-header">
                  <span className="draft-svtz__step-number">STEP 2</span>
                  <span className="draft-svtz__step-label">
                    <span className={`draft-svtz__step-dot ${configLocked ? 'draft-svtz__step-dot--active' : ''}`} />
                    Curate
                  </span>
                </div>

                {!configLocked ? (
                  /* Disabled state: Show hint */
                  <div className="draft-svtz__step-disabled-hint">
                    <Lock size={16} />
                    <span>Complete Step 1 first</span>
                  </div>
                ) : (
                  /* Enabled state: Show stats and commit button */
                  <>
                    <div className="draft-svtz__stats">
                      {hasNewSourceData ? (
                        <>
                          <span className="draft-svtz__stat">{selectionsCount} selections</span>
                          <span className="draft-svtz__stat">{mustHaveKeywordsNew.length} must</span>
                          <span className="draft-svtz__stat">{mustntHaveKeywordsNew.length} mustnt</span>
                        </>
                      ) : (
                        <>
                          <span className="draft-svtz__stat">{includedPhrasesCount} phrases</span>
                          <span className="draft-svtz__stat">{mustHaveKeywordsLegacy.length} must</span>
                          <span className="draft-svtz__stat">{mustntHaveKeywordsLegacy.length} mustnt</span>
                        </>
                      )}
                    </div>

                    <p className="draft-svtz__step-hint">
                      {hasNewSourceData
                        ? 'Drag to select text · Click to mark keywords'
                        : 'Click phrases in SOURCE to toggle inclusion'}
                    </p>

                    {/* Commit Button */}
                    <button
                      className="draft-svtz__commit-btn"
                      onClick={handleCommit}
                      disabled={hasNewSourceData ? selectionsCount === 0 : includedPhrasesCount === 0}
                    >
                      <Check size={16} />
                      <span>Commit</span>
                    </button>
                  </>
                )}
              </div>
            </aside>

            {/* Sidebar | SOURCE Divider */}
            <div
              className="draft-svtz__divider"
              onMouseDown={handleSidebarSourceDivider}
            >
              <div className="draft-svtz__divider-handle" />
            </div>

            {/* ========== MAIN CONTENT: SOURCE ========== */}
            <div className="draft-svtz__main draft-svtz__main--full" ref={mainContentRef}>
              {/* SOURCE Column - Full Width */}
              <div className="draft-svtz__source draft-svtz__source--full">
                <div className="draft-svtz__column-header">
                  <h3>SOURCE</h3>
                </div>
                <div className="draft-svtz__source-content">
                  {/* New free-form text selection UI */}
                  {hasNewSourceData ? (
                    <PendingSourceEditor
                      blocks={textBlocks}
                      onChange={handleTextBlocksChange}
                      readOnly={!configLocked}
                    />
                  ) : sourceBoxes.length === 0 ? (
                    <div className="draft-svtz__source-empty">
                      <MessageSquarePlus size={32} strokeWidth={1} />
                      <p>No source content</p>
                      <span>Connect upstream conversation or commit</span>
                    </div>
                  ) : (
                    /* Legacy phrase-based UI */
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
                            {box.phrases.map((phrase) => {
                              const canToggle = configLocked // Only allow toggling when Step 1 is locked
                              return (
                                <div
                                  key={phrase.id}
                                  className={`draft-svtz__phrase ${phrase.included ? 'draft-svtz__phrase--included' : 'draft-svtz__phrase--excluded'} ${!canToggle ? 'draft-svtz__phrase--disabled' : ''}`}
                                  onClick={(e) => {
                                    // Only toggle if clicking the phrase background (not a keyword)
                                    if (canToggle && e.target === e.currentTarget) {
                                      togglePhraseInclude(phrase.id)
                                    }
                                  }}
                                  title={!canToggle ? 'Complete Step 1 to edit' : (phrase.included ? 'Click to exclude phrase' : 'Click to include phrase')}
                                >
                                  {/* Render phrase text with clickable keywords */}
                                  {renderPhraseWithKeywords(
                                    phrase,
                                    canToggle,
                                    () => togglePhraseInclude(phrase.id),
                                    (kwId) => toggleKeywordMustnt(phrase.id, kwId),
                                    hoveredKeywordText,
                                    handleKeywordHover
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Legend */}
          <footer className="draft-svtz__legend">
            <span className="draft-svtz__legend-item">
              <span className="draft-svtz__legend-swatch draft-svtz__legend-swatch--included" />
              green bg = included phrase
            </span>
            <span className="draft-svtz__legend-item">
              <span className="draft-svtz__legend-swatch draft-svtz__legend-swatch--excluded" />
              red bg = excluded phrase
            </span>
            <span className="draft-svtz__legend-item">
              <span className="draft-svtz__legend-swatch draft-svtz__legend-swatch--keyword-must" />
              green text = must-have keyword
            </span>
            <span className="draft-svtz__legend-item">
              <span className="draft-svtz__legend-swatch draft-svtz__legend-swatch--keyword-mustnt" />
              red text = mustnt-have keyword
            </span>
          </footer>
        </div>
      </div>
    )
  }

  // ============================================
  // COMMITTED COMMIT - Read-only frozen version
  // ============================================
  if (isCommittedCommit) {
    const branchLabel = data.branchType === 'branch' ? data.branchName?.trim() || 'branch' : 'main'

    // Get keywords from pendingSource textBlocks
    const commitTextBlocks = data.pendingSource?.textBlocks || []
    const commitMustHave = commitTextBlocks.flatMap(block =>
      getMustHaveKeywordsFromBlocks(block.tokens, block.keywords)
    )
    const commitMustntHave = commitTextBlocks.flatMap(block =>
      getMustntHaveKeywordsFromBlocks(block.tokens, block.keywords)
    )

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

            {/* Main Content - Source Excerpt & Generated Output */}
            <div className="modal-v2__main">
              {/* Source Excerpt - User's semantic selections */}
              <div className="commit-v2__section">
                <div className="commit-v2__section-header">
                  <h3>Source Excerpt</h3>
                  <span className="commit-v2__readonly-badge">Read-only</span>
                </div>
                <div className="commit-v2__source-excerpt">
                  {data.pendingSource?.textBlocks && data.pendingSource.textBlocks.length > 0 ? (
                    <SourceExcerptViewer blocks={data.pendingSource.textBlocks} />
                  ) : (
                    <div className="commit-v2__empty-state">
                      <span>No source excerpt recorded</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Generated Output - LLM generated content */}
              <div className="commit-v2__section">
                <div className="commit-v2__section-header">
                  <h3>Generated Output</h3>
                </div>
                <div className="commit-v2__generated-output">
                  {data.summary || 'No generated content.'}
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
