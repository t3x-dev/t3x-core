import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { X, Settings, MessageSquarePlus, Check, GitBranch, GitCommit, Clock, Tag, Link2, Send, ChevronDown, ChevronRight, Lock, RotateCcw, AlertCircle, Loader2 } from 'lucide-react'
import type { Node } from 'reactflow'
import type { CanvasNodeData, ConversationConstraints, DraftConstraintOverrides, SourceTextBlock, TurnBoundary } from '../types/nodes'
import { useCanvasStore } from '../store/canvasStore'
import * as api from '../services/api'
import { PendingSourceEditor } from './SelectableTextBlock'
import {
  getMustHaveKeywords as getMustHaveKeywordsFromBlocks,
  getMustntHaveKeywords as getMustntHaveKeywordsFromBlocks,
  getSelectedText,
  tokenizeText,
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

  // Commit state
  const [isCommitting, setIsCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<{
    missing: string[]
    forbidden: string[]
  } | null>(null)

  // Get projectId and edges from canvasStore
  const projectId = useCanvasStore((state) => state.projectId)
  const edges = useCanvasStore((state) => state.edges)
  const getUpstreamSourceNodes = useCanvasStore((state) => state.getUpstreamSourceNodes)

  // Divider positions
  const [sidebarSourceDividerPos, setSidebarSourceDividerPos] = useState(240) // pixels for sidebar width

  // Hovered keyword (for cross-area highlighting)
  const [hoveredKeywordText, setHoveredKeywordText] = useState<string | null>(null)

  // Sidebar state for conversation
  const [showSettings, setShowSettings] = useState(false)

  // Chat state for conversation
  const [chatMessages, setChatMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Chat pagination state
  const CHAT_PAGE_SIZE = 100
  const [chatOffset, setChatOffset] = useState(0)
  const [chatHasMore, setChatHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const loadMoreAbortRef = useRef<AbortController | null>(null)

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

  // Derive node-dependent values
  const data = node?.data
  const isCommit = data?.kind === 'commit'
  const isConversation = data?.kind === 'conversation'
  const isPendingCommit = isCommit && data?.commitStatus === 'pending'
  const isCommittedCommit = isCommit && data?.commitStatus !== 'pending'
  const isMergeDraft = isPendingCommit && data?.bridgePrompt === '/merge' && !!data?.mergeConfig
  const shouldShowBranchSelect =
    (draftBranchMode === 'select' || draftBranchMode === 'branch-only') && !isMergeDraft
  const requireBranchName =
    !isMergeDraft &&
    ((draftBranchMode === 'select' && data?.pendingBranch === 'branch') ||
      draftBranchMode === 'branch-only')

  // Initialize source boxes (legacy) from baseline summary
  useEffect(() => {
    if (isPendingCommit && data?.baselineSummary) {
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
        phrases: extractPhrasesFromText(data.baselineSummary, 'source-1', keywordsThreshold),
      }

      setSourceBoxes([initialBox])
    }
  }, [isPendingCommit, data?.baselineSummary, data?.title, data?.sourceConversationId, keywordsThreshold])

  // Build textBlocks from upstream source nodes (reactive to edge changes)
  // This effect runs whenever edges change, rebuilding textBlocks from all connected source nodes
  useEffect(() => {
    if (!isPendingCommit || !node?.id || !projectId) return

    const buildTextBlocks = async () => {
      const upstreamNodes = getUpstreamSourceNodes(node.id)

      if (upstreamNodes.length === 0) {
        // No upstream nodes, clear textBlocks
        setTextBlocks([])
        return
      }

      const newBlocks: SourceTextBlock[] = []

      for (const sourceNode of upstreamNodes) {
        if (sourceNode.data.kind === 'conversation') {
          // Fetch turns for conversation
          const conversationId = sourceNode.data.conversationId || sourceNode.id
          try {
            const turnsData = await api.listTurns(projectId, conversationId)
            if (turnsData.turns && turnsData.turns.length > 0) {
              const fullText = turnsData.turns.map((turn) => turn.content).join('\n')
              const tokens = tokenizeText(fullText)

              // Build turn boundaries
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
                currentTokenIndex += turnTokenCount + 1
              }

              // Try to preserve existing selections for this block
              const existingBlock = textBlocks.find(b => b.sourceNodeId === conversationId)

              newBlocks.push({
                id: `block-conv-${conversationId}`,
                originalText: fullText,
                tokens,
                selections: existingBlock?.selections || [],
                keywords: existingBlock?.keywords || [],
                sourceNodeId: conversationId,
                sourceNodeType: 'conversation',
                sourceNodeTitle: sourceNode.data.title || 'Conversation',
                turnBoundaries,
              })
            }
          } catch (err) {
            console.warn('Failed to fetch turns for conversation:', err)
          }
        } else if (sourceNode.data.kind === 'commit' && sourceNode.data.commitStatus === 'committed') {
          // Use sourceExcerpt from committed commit
          const commitId = sourceNode.data.commitHash || sourceNode.id
          const sourceExcerptArray = sourceNode.data.sourceExcerpt || []
          const sourceExcerptText = sourceExcerptArray.join('\n')

          if (sourceExcerptText) {
            const tokens = tokenizeText(sourceExcerptText)

            // Try to preserve existing selections for this block
            const existingBlock = textBlocks.find(b => b.sourceNodeId === commitId)

            newBlocks.push({
              id: `block-commit-${commitId}`,
              originalText: sourceExcerptText,
              tokens,
              selections: existingBlock?.selections || [],
              keywords: existingBlock?.keywords || [],
              sourceNodeId: commitId,
              sourceNodeType: 'commit',
              sourceNodeTitle: sourceNode.data.title || `Commit ${sourceNode.data.entryId}`,
            })
          }
        }
      }

      setTextBlocks(newBlocks)
    }

    buildTextBlocks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPendingCommit, node?.id, projectId, edges, getUpstreamSourceNodes])

  // Scroll to bottom when new messages added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const addCommitAction = useMemo(() => quickActions?.find(a => a.key === 'add-commit'), [quickActions])

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

  // Initialize source boxes from baseline summary
  useEffect(() => {
    if (isPendingCommit && data.baselineSummary) {
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
        phrases: extractPhrasesFromText(data.baselineSummary, 'source-1', keywordsThreshold),
      }
      setSourceBoxes([initialBox])
    }
  }, [isPendingCommit, data?.baselineSummary, data?.title, data?.sourceConversationId, keywordsThreshold])

  // Handle Proceed - lock Step 1 config and enable Step 2 editing
  const handleProceed = useCallback(() => {
    if (sourceBoxes.length === 0) return
    setConfigLocked(true)
  }, [sourceBoxes])

  // Handle Reset - unlock Step 1 config and reset phrases to default
  const handleReset = useCallback(() => {
    setConfigLocked(false)
    // Re-extract to reset all phrase/keyword states
    setSourceBoxes(prev => prev.map(sb => ({
      ...sb,
      phrases: extractPhrasesFromText(sb.content, sb.id, keywordsThreshold),
    })))
  }, [keywordsThreshold])

  // Handle Commit - create commit via API
  const handleCommit = useCallback(async () => {
    if (!projectId || !data) {
      setCommitError('No project selected')
      return
    }

    // Get source conversation ID
    const sourceConversationId = data.sourceConversationId
    if (!sourceConversationId) {
      setCommitError('No source conversation found')
      return
    }

    setIsCommitting(true)
    setCommitError(null)
    setValidationErrors(null)

    try {
      // 1. Get conversation's turns to determine turn_window
      const turnsResponse = await api.listTurns(projectId, sourceConversationId)
      const turns = turnsResponse.turns

      if (turns.length === 0) {
        setCommitError('Conversation has no turns')
        setIsCommitting(false)
        return
      }

      // Determine turn_window (first to last turn)
      const startTurnHash = turns[0].turn_hash
      const endTurnHash = turns[turns.length - 1].turn_hash

      // 2. Determine branch
      const branch = data.pendingBranch === 'branch' && data.pendingBranchName
        ? data.pendingBranchName
        : 'main'

      // 3. Collect user selections
      // Get source excerpts (included phrases) from textBlocks or legacy allPhrases
      let sourceExcerpt: string[] = []
      let mustHave: string[] = []
      let mustntHave: string[] = []

      if (textBlocks.length > 0) {
        // New system: get selected text from each block
        sourceExcerpt = textBlocks
          .map(block => getSelectedText(block.tokens, block.selections))
          .filter(text => text.length > 0)
        mustHave = [...mustHaveKeywordsNew]
        mustntHave = [...mustntHaveKeywordsNew]
      } else {
        // Legacy system: get included phrases
        sourceExcerpt = allPhrases.filter(p => p.included).map(p => p.text)
        mustHave = mustHaveKeywordsLegacy.map(kw => kw.text)
        mustntHave = mustntHaveKeywordsLegacy.map(kw => kw.text)
      }

      // 4. Build source_refs from all upstream source nodes
      const sourceRefs: api.SourceRef[] = []

      // Primary source: the conversation with turn_window
      sourceRefs.push({
        type: 'conversation',
        conversation_id: sourceConversationId,
        turn_window: { start_turn_hash: startTurnHash, end_turn_hash: endTurnHash },
      })

      // Debug: Log textBlocks info
      console.log('[handleCommit] Building sourceRefs:', {
        sourceConversationId,
        textBlocksCount: textBlocks.length,
        textBlocks: textBlocks.map(b => ({
          id: b.id,
          sourceNodeId: b.sourceNodeId,
          sourceNodeType: b.sourceNodeType,
          sourceNodeTitle: b.sourceNodeTitle,
        })),
      })

      // Additional sources from textBlocks (for multi-source commits)
      if (textBlocks.length > 0) {
        textBlocks.forEach(block => {
          console.log('[handleCommit] Checking block:', {
            blockSourceNodeId: block.sourceNodeId,
            sourceConversationId,
            isMatch: block.sourceNodeId === sourceConversationId,
            willAdd: block.sourceNodeId && block.sourceNodeId !== sourceConversationId,
          })
          if (block.sourceNodeId && block.sourceNodeId !== sourceConversationId) {
            if (block.sourceNodeType === 'conversation') {
              sourceRefs.push({
                type: 'conversation',
                conversation_id: block.sourceNodeId,
              })
            } else if (block.sourceNodeType === 'commit') {
              sourceRefs.push({
                type: 'commit',
                commit_hash: block.sourceNodeId,
              })
            }
          }
        })
      }

      console.log('[handleCommit] Final sourceRefs:', sourceRefs)

      // 5. Create Commit directly (Ring data already extracted during turn creation)
      const commit = await api.createCommit(
        projectId,
        { start_turn_hash: startTurnHash, end_turn_hash: endTurnHash },
        branch,
        data.title,
        {
          sourceExcerpt,
          mustHave,
          mustntHave,
          sourceRefs,
        }
      )

      // 6. Update local node ID to match API commit_hash (before refresh)
      // This ensures edges are preserved when loadProjectData rebuilds the canvas
      if (node && commit.commit_hash) {
        useCanvasStore.getState().updateNodeId(node.id, commit.commit_hash)
      }

      // 7. Update local state with final values
      onUpdate({
        summary: resultText,
        bridgePrompt: template,
        isGenerated: true,
        commitHash: commit.commit_hash,
      })

      // 8. Trigger convert to committed state
      onConvertDraft?.()

      // 9. Refresh canvas data
      useCanvasStore.getState().loadProjectData(projectId)

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setCommitError(error.message)
      console.error('Failed to create commit:', error)
    } finally {
      setIsCommitting(false)
    }
  }, [projectId, node, data, template, resultText, onUpdate, onConvertDraft, textBlocks, allPhrases, mustHaveKeywordsNew, mustntHaveKeywordsNew, mustHaveKeywordsLegacy, mustntHaveKeywordsLegacy])

  // Scroll to bottom when new messages added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Chat loading state - disable send while loading history
  const [isChatLoading, setIsChatLoading] = useState(false)

  // Track previous conversationId to detect first-time assignment
  const prevConversationIdRef = useRef<string | undefined>(undefined)

  // Load chat history from backend when modal opens for conversation
  useEffect(() => {
    const abortController = new AbortController()
    const currentConversationId = data?.conversationId
    const prevConversationId = prevConversationIdRef.current
    prevConversationIdRef.current = currentConversationId

    const loadChatHistory = async () => {
      if (!data || data.kind !== 'conversation' || !projectId || !currentConversationId) return

      // If conversationId just changed from undefined to a value and we already have messages,
      // this means we just created the conversation during an active chat session.
      // Don't reload - the messages are already in state.
      if (prevConversationId === undefined && chatMessagesRef.current.length > 0) {
        console.log('[loadChatHistory] Skipping reload - conversation just created during active chat')
        return
      }

      // Cancel any pending loadMore request when switching conversations
      loadMoreAbortRef.current?.abort()
      loadMoreAbortRef.current = null

      // Clear old messages and reset pagination state
      setChatMessages([])
      setChatOffset(0)
      setChatHasMore(false)
      setIsChatLoading(true)
      try {
        // Fetch newest CHAT_PAGE_SIZE messages first (order=desc), then reverse for display
        const response = await api.listTurns(projectId, currentConversationId, CHAT_PAGE_SIZE, 0, {
          signal: abortController.signal,
          order: 'desc',
        })

        // Check if conversation changed during request (race condition fix)
        if (abortController.signal.aborted || data?.conversationId !== currentConversationId) {
          return
        }

        // Reverse the array since we fetched newest first (order=desc)
        // but need to display oldest first in the chat UI
        const messages = response.turns
          .filter(turn => turn.role === 'user' || turn.role === 'assistant')
          .map(turn => ({
            id: turn.turn_hash,
            role: turn.role as 'user' | 'assistant',
            content: turn.content,
          }))
          .reverse()
        setChatMessages(messages)

        // Check if there are more messages to load
        // If we got exactly CHAT_PAGE_SIZE turns, there might be more
        setChatHasMore(response.turns.length >= CHAT_PAGE_SIZE)
        setChatOffset(response.turns.length)
      } catch (err) {
        // Only log non-abort errors (ABORTED is expected when switching conversations)
        const isAbortError = abortController.signal.aborted ||
          (err instanceof api.ApiError && err.code === 'ABORTED')
        if (!isAbortError) {
          console.error('Failed to load chat history:', err)
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsChatLoading(false)
        }
      }
    }

    loadChatHistory()

    return () => {
      abortController.abort()
      loadMoreAbortRef.current?.abort()
    }
  }, [data?.kind, data?.conversationId, projectId])

  // Load more (older) messages when scrolling to top
  const loadMoreMessages = useCallback(async () => {
    if (!projectId || !data?.conversationId || isLoadingMore || !chatHasMore) return

    // Cancel any pending load more request
    loadMoreAbortRef.current?.abort()
    const abortController = new AbortController()
    loadMoreAbortRef.current = abortController

    const currentConversationId = data?.conversationId
    const container = messagesContainerRef.current

    // Capture scroll position before loading
    const scrollHeightBefore = container?.scrollHeight ?? 0

    setIsLoadingMore(true)
    try {
      const response = await api.listTurns(projectId, currentConversationId, CHAT_PAGE_SIZE, chatOffset, {
        order: 'desc',
        signal: abortController.signal,
      })

      // Check for race condition: conversation changed or request aborted
      if (abortController.signal.aborted || data?.conversationId !== currentConversationId) {
        return
      }

      if (response.turns.length === 0) {
        setChatHasMore(false)
        return
      }

      // Older messages (fetched in desc order, need to reverse)
      const olderMessages = response.turns
        .filter(turn => turn.role === 'user' || turn.role === 'assistant')
        .map(turn => ({
          id: turn.turn_hash,
          role: turn.role as 'user' | 'assistant',
          content: turn.content,
        }))
        .reverse()

      // Prepend older messages to the beginning
      setChatMessages(prev => [...olderMessages, ...prev])
      setChatOffset(prev => prev + response.turns.length)
      setChatHasMore(response.turns.length >= CHAT_PAGE_SIZE)

      // Preserve scroll position after prepending
      // Use requestAnimationFrame to wait for DOM update
      requestAnimationFrame(() => {
        if (container && data?.conversationId === currentConversationId) {
          const scrollHeightAfter = container.scrollHeight
          const heightDiff = scrollHeightAfter - scrollHeightBefore
          container.scrollTop = container.scrollTop + heightDiff
        }
      })
    } catch (err) {
      // Ignore abort errors
      const isAbortError = abortController.signal.aborted ||
        (err instanceof api.ApiError && err.code === 'ABORTED')
      if (!isAbortError) {
        console.error('Failed to load more messages:', err)
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoadingMore(false)
      }
    }
  }, [projectId, data?.conversationId, chatOffset, chatHasMore, isLoadingMore])

  // Handle scroll to detect when user reaches top
  const handleChatScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    // Load more when scrolled near the top (within 50px)
    if (target.scrollTop < 50 && chatHasMore && !isLoadingMore && !isChatLoading) {
      loadMoreMessages()
    }
  }, [chatHasMore, isLoadingMore, isChatLoading, loadMoreMessages])

  // Chat streaming state
  const [isChatStreaming, setIsChatStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [chatError, setChatError] = useState<string | null>(null)

  // Capture current values for use in async callback (avoid stale closures)
  const conversationIdRef = useRef(data?.conversationId)
  const nodeKindRef = useRef(data?.kind)
  const chatMessagesRef = useRef(chatMessages)
  useEffect(() => {
    conversationIdRef.current = data?.conversationId
    nodeKindRef.current = data?.kind
  }, [data?.conversationId, data?.kind])
  useEffect(() => {
    chatMessagesRef.current = chatMessages
  }, [chatMessages])

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || isChatStreaming || isChatLoading) return

    const userMessage = chatInput.trim()
    setChatInput('')
    setChatError(null)

    // Add user message to chat
    const newUserMessage = {
      id: `msg-${Date.now()}`,
      role: 'user' as const,
      content: userMessage,
    }
    setChatMessages(prev => [...prev, newUserMessage])

    // If no projectId, we can still chat (just won't save turns)
    // For now, we'll use the chat API directly

    setIsChatStreaming(true)
    setStreamingContent('')

    try {
      // Build messages array from chat history (use ref to get latest)
      const currentMessages = chatMessagesRef.current
      const messages: api.ChatMessage[] = [
        ...currentMessages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user' as const, content: userMessage },
      ]

      // Use streaming chat
      let fullResponse = ''
      let addedFinalMessage = false

      for await (const event of api.chatStream({ messages })) {
        if (event.type === 'token' && event.content) {
          fullResponse += event.content
          setStreamingContent(fullResponse)
        } else if (event.type === 'done') {
          // Update fullResponse with done event content if available (ensures we have complete response)
          if (event.content) {
            fullResponse = event.content
          }
          // Add assistant message to chat (only once)
          if (!addedFinalMessage) {
            setChatMessages(prev => [...prev, {
              id: `msg-${Date.now()}`,
              role: 'assistant' as const,
              content: fullResponse,
            }])
            setStreamingContent('')
            addedFinalMessage = true
          }
        } else if (event.type === 'error') {
          setChatError(event.message || 'Unknown error')
        }
      }

      // If we didn't get a done event but have content, add it
      if (fullResponse && !addedFinalMessage) {
        setChatMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          role: 'assistant' as const,
          content: fullResponse,
        }])
        setStreamingContent('')
      }

      // If projectId is available and this is a conversation node, save the turns
      // Use refs to get current values (avoiding stale closure)
      let currentConversationId = conversationIdRef.current
      const currentKind = nodeKindRef.current
      console.log('[handleSendMessage] Save turns check:', {
        projectId,
        currentKind,
        currentConversationId,
        fullResponseLength: fullResponse.length,
        fullResponsePreview: fullResponse.slice(0, 100),
        addedFinalMessage
      })
      if (projectId && currentKind === 'conversation') {
        try {
          // If no conversationId yet, create one first
          if (!currentConversationId) {
            console.log('[handleSendMessage] Creating new conversation...')
            const newConv = await api.createConversation(projectId, data?.title || 'Untitled Conversation')
            currentConversationId = newConv.conversation_id
            // Update the node with the new conversationId
            onUpdate({ conversationId: currentConversationId })
            conversationIdRef.current = currentConversationId
            console.log('[handleSendMessage] Created conversation:', currentConversationId)
          }

          // Save user turn
          console.log('[handleSendMessage] Saving user turn...')
          await api.createTurn(projectId, currentConversationId, 'user', userMessage)
          console.log('[handleSendMessage] User turn saved')
          // Save assistant turn
          if (fullResponse) {
            console.log('[handleSendMessage] Saving assistant turn...', { length: fullResponse.length })
            try {
              await api.createTurn(projectId, currentConversationId, 'assistant', fullResponse)
              console.log('[handleSendMessage] Assistant turn saved successfully')
            } catch (assistantErr) {
              console.error('[handleSendMessage] Failed to save assistant turn:', assistantErr)
            }
          } else {
            console.warn('[handleSendMessage] No fullResponse to save as assistant turn')
          }
        } catch (err) {
          console.error('[handleSendMessage] Failed to save turns:', err)
          // Don't show error to user - chat still worked
        }
      } else {
        console.log('[handleSendMessage] Skipping turn save - conditions not met')
      }

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setChatError(error.message)
      console.error('Chat error:', error)
    } finally {
      setIsChatStreaming(false)
      setStreamingContent('') // Clear any residual streaming content
    }
  }, [chatInput, isChatStreaming, isChatLoading, projectId, data?.title, onUpdate]) // chatMessages accessed via ref to avoid frequent rebuilds

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
              <div
                ref={messagesContainerRef}
                className="conversation-v2__chat-messages"
                onScroll={handleChatScroll}
              >
                {chatMessages.length === 0 && !isChatStreaming ? (
                  <div className="conversation-v2__chat-empty">
                    <MessageSquarePlus size={48} strokeWidth={1} />
                    <p>Start a conversation with the LLM</p>
                    <span>Type a message below to begin</span>
                  </div>
                ) : (
                  <>
                    {/* Load more indicator at top */}
                    {isLoadingMore && (
                      <div className="conversation-v2__chat-loading-more">
                        <Loader2 size={16} className="conversation-v2__spinner" />
                        <span>Loading older messages...</span>
                      </div>
                    )}
                    {chatHasMore && !isLoadingMore && (
                      <div className="conversation-v2__chat-load-more">
                        <button onClick={loadMoreMessages} className="conversation-v2__load-more-btn">
                          Load older messages
                        </button>
                      </div>
                    )}
                    {chatMessages.map((msg) => (
                      <div key={msg.id} className={`conversation-v2__chat-message conversation-v2__chat-message--${msg.role}`}>
                        <div className="conversation-v2__chat-message-content">
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {/* Streaming response */}
                    {isChatStreaming && streamingContent && (
                      <div className="conversation-v2__chat-message conversation-v2__chat-message--assistant conversation-v2__chat-message--streaming">
                        <div className="conversation-v2__chat-message-content">
                          {streamingContent}
                          <span className="conversation-v2__streaming-cursor">▊</span>
                        </div>
                      </div>
                    )}
                    {/* Loading indicator when streaming starts */}
                    {isChatStreaming && !streamingContent && (
                      <div className="conversation-v2__chat-message conversation-v2__chat-message--assistant">
                        <div className="conversation-v2__chat-message-content conversation-v2__chat-loading">
                          <Loader2 size={16} className="conversation-v2__spinner" />
                          <span>Thinking...</span>
                        </div>
                      </div>
                    )}
                    {/* Chat error */}
                    {chatError && (
                      <div className="conversation-v2__chat-error">
                        <AlertCircle size={16} />
                        <span>{chatError}</span>
                      </div>
                    )}
                  </>
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
                  disabled={isChatStreaming || isChatLoading}
                />
                <button
                  className="conversation-v2__chat-send-btn"
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || isChatStreaming || isChatLoading}
                >
                  {isChatStreaming || isChatLoading ? <Loader2 size={20} className="conversation-v2__spinner" /> : <Send size={20} />}
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

                    {/* Validation errors */}
                    {validationErrors && (
                      <div className="draft-svtz__validation-error">
                        <AlertCircle size={14} />
                        <div className="draft-svtz__validation-error-content">
                          <span className="draft-svtz__validation-error-title">Validation Failed</span>
                          {validationErrors.missing.length > 0 && (
                            <div className="draft-svtz__validation-error-list">
                              <span>Missing: {validationErrors.missing.join(', ')}</span>
                            </div>
                          )}
                          {validationErrors.forbidden.length > 0 && (
                            <div className="draft-svtz__validation-error-list">
                              <span>Forbidden: {validationErrors.forbidden.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Commit error */}
                    {commitError && !validationErrors && (
                      <div className="draft-svtz__commit-error">
                        <AlertCircle size={14} />
                        <span>{commitError}</span>
                      </div>
                    )}

                    {/* Commit Button */}
                    <button
                      className="draft-svtz__commit-btn"
                      onClick={handleCommit}
                      disabled={(hasNewSourceData ? selectionsCount === 0 : includedPhrasesCount === 0) || isCommitting}
                    >
                      {isCommitting ? (
                        <>
                          <Loader2 size={16} className="draft-svtz__spinner" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <Check size={16} />
                          <span>Commit</span>
                        </>
                      )}
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

    // Get keywords and source excerpt from committed data (stored in database)
    // These come from data.mustHave, data.mustntHave, data.sourceExcerpt fields
    const commitMustHave = data.mustHave || []
    const commitMustntHave = data.mustntHave || []
    const commitSourceExcerpt = data.sourceExcerpt || []

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
                  {commitSourceExcerpt.length > 0 ? (
                    <div className="commit-v2__source-list">
                      {commitSourceExcerpt.map((excerpt, idx) => (
                        <div key={idx} className="commit-v2__source-item">
                          <span className="commit-v2__source-marker">•</span>
                          <span className="commit-v2__source-text">{excerpt}</span>
                        </div>
                      ))}
                    </div>
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
            <h2 className="modal-v2__title">{data?.title || 'Node'}</h2>
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
