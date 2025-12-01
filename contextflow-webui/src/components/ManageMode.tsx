import { useState, useCallback, useMemo } from 'react'
import { Check, X, Save, Trash2, Bookmark } from 'lucide-react'
import type { Clause, Keyword, ClauseStatus, KeywordConstraintType, ConversationConstraints } from '../types/nodes'

interface ManageModeProps {
  text: string
  initialConstraints?: ConversationConstraints
  onSave: (constraints: ConversationConstraints) => void
  onExit: () => void
  isLocked?: boolean // When conversation has drafts, editing is locked
}

// Simple sentence splitter (can be enhanced with NLP later)
const splitIntoSentences = (text: string): string[] => {
  if (!text.trim()) return []
  // Split by common sentence terminators, keeping the terminator
  const sentences = text
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return sentences.length > 0 ? sentences : [text]
}

// Stop words set
const stopWords = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
  'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'about', 'into', 'over', 'after', 'before', 'between', 'under',
  '的', '是', '在', '了', '和', '与', '或', '但', '也', '都', '就', '而',
  '及', '等', '着', '过', '要', '会', '能', '可', '有', '没', '不', '这',
  '那', '他', '她', '它', '我', '你', '们', '很', '最', '已', '还', '把',
])

// Check if a word is a keyword (not a stop word and long enough)
const isKeyword = (word: string): boolean => {
  const cleanWord = word.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '')
  return cleanWord.length >= 2 && !stopWords.has(cleanWord)
}

// Tokenize sentence into words while preserving structure
interface Token {
  text: string
  isKeyword: boolean
  keywordId?: string
}

const tokenizeSentence = (sentence: string, existingKeywords?: Keyword[]): { tokens: Token[], keywords: Keyword[] } => {
  // Split by word boundaries while keeping punctuation and spaces
  const parts = sentence.split(/(\s+|[^\w\u4e00-\u9fa5]+)/g).filter(p => p.length > 0)

  const keywordMap = new Map<string, Keyword>()
  existingKeywords?.forEach(kw => {
    keywordMap.set(kw.text.toLowerCase(), kw)
  })

  const keywords: Keyword[] = []
  const tokens: Token[] = parts.map(part => {
    const isKw = isKeyword(part)
    if (isKw) {
      const lowerPart = part.toLowerCase()
      let keyword = keywordMap.get(lowerPart)
      if (!keyword) {
        keyword = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          text: lowerPart,
          constraint: 'neutral' as KeywordConstraintType,
        }
        keywordMap.set(lowerPart, keyword)
      }
      if (!keywords.find(k => k.id === keyword!.id)) {
        keywords.push(keyword)
      }
      return { text: part, isKeyword: true, keywordId: keyword.id }
    }
    return { text: part, isKeyword: false }
  })

  return { tokens, keywords }
}

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

export default function ManageMode({ text, initialConstraints, onSave, onExit, isLocked = false }: ManageModeProps) {
  // Initialize clauses from text or existing constraints
  const initClauses = useMemo((): Clause[] => {
    if (initialConstraints?.clauses?.length) {
      return initialConstraints.clauses
    }
    const sentences = splitIntoSentences(text)
    return sentences.map((sentence) => {
      const { keywords } = tokenizeSentence(sentence)
      return {
        id: generateId(),
        text: sentence,
        status: 'neutral' as ClauseStatus,
        keywords,
      }
    })
  }, [text, initialConstraints])

  const [clauses, setClauses] = useState<Clause[]>(initClauses)
  const [selectedClauseIds, setSelectedClauseIds] = useState<Set<string>>(new Set())
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Toggle clause selection
  const toggleClauseSelection = useCallback((clauseId: string) => {
    if (isLocked) return
    setSelectedClauseIds((prev) => {
      const next = new Set(prev)
      if (next.has(clauseId)) {
        next.delete(clauseId)
      } else {
        next.add(clauseId)
      }
      return next
    })
  }, [isLocked])

  // Select/deselect all clauses
  const toggleSelectAll = useCallback(() => {
    if (isLocked) return
    if (selectedClauseIds.size === clauses.length) {
      setSelectedClauseIds(new Set())
    } else {
      setSelectedClauseIds(new Set(clauses.map((c) => c.id)))
    }
  }, [clauses, selectedClauseIds, isLocked])

  // Mark selected clauses as keep
  const markSelectedAsKeep = useCallback(() => {
    if (selectedClauseIds.size === 0 || isLocked) return
    setClauses((prev) =>
      prev.map((clause) =>
        selectedClauseIds.has(clause.id)
          ? { ...clause, status: clause.status === 'keep' ? 'neutral' : 'keep' }
          : clause
      )
    )
    setHasUnsavedChanges(true)
    setSelectedClauseIds(new Set())
  }, [selectedClauseIds, isLocked])

  // Mark selected clauses as discard
  const markSelectedAsDiscard = useCallback(() => {
    if (selectedClauseIds.size === 0 || isLocked) return
    setClauses((prev) =>
      prev.map((clause) =>
        selectedClauseIds.has(clause.id)
          ? { ...clause, status: clause.status === 'discard' ? 'neutral' : 'discard' }
          : clause
      )
    )
    setHasUnsavedChanges(true)
    setSelectedClauseIds(new Set())
  }, [selectedClauseIds, isLocked])

  // Toggle keyword constraint
  const toggleKeywordConstraint = useCallback(
    (clauseId: string, keywordId: string, targetConstraint: 'must_have' | 'mustnt_have') => {
      if (isLocked) return
      setClauses((prev) =>
        prev.map((clause) => {
          if (clause.id !== clauseId) return clause
          return {
            ...clause,
            keywords: clause.keywords.map((kw) => {
              if (kw.id !== keywordId) return kw
              const newConstraint: KeywordConstraintType =
                kw.constraint === targetConstraint ? 'neutral' : targetConstraint
              return { ...kw, constraint: newConstraint }
            }),
          }
        })
      )
      setHasUnsavedChanges(true)
    },
    [isLocked]
  )

  // Handle save
  const handleSave = useCallback(() => {
    if (isLocked) return
    const must_have = clauses
      .flatMap((c) => c.keywords)
      .filter((kw) => kw.constraint === 'must_have')
      .map((kw) => kw.text)
    const mustnt_have = clauses
      .flatMap((c) => c.keywords)
      .filter((kw) => kw.constraint === 'mustnt_have')
      .map((kw) => kw.text)

    const constraints: ConversationConstraints = {
      clauses,
      must_have: [...new Set(must_have)],
      mustnt_have: [...new Set(mustnt_have)],
    }
    onSave(constraints)
    setHasUnsavedChanges(false)
  }, [clauses, onSave, isLocked])

  // Handle exit with unsaved changes warning
  const handleExit = useCallback(() => {
    if (hasUnsavedChanges && !isLocked) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to exit?')
      if (!confirmed) return
    }
    onExit()
  }, [hasUnsavedChanges, onExit, isLocked])

  // Count stats
  const stats = useMemo(() => {
    const keepCount = clauses.filter((c) => c.status === 'keep').length
    const discardCount = clauses.filter((c) => c.status === 'discard').length
    const mustHaveCount = clauses
      .flatMap((c) => c.keywords)
      .filter((kw) => kw.constraint === 'must_have').length
    const mustntHaveCount = clauses
      .flatMap((c) => c.keywords)
      .filter((kw) => kw.constraint === 'mustnt_have').length
    return { keepCount, discardCount, mustHaveCount, mustntHaveCount }
  }, [clauses])

  // Get keyword by ID from a clause
  const getKeywordById = (clause: Clause, keywordId: string): Keyword | undefined => {
    return clause.keywords.find(kw => kw.id === keywordId)
  }

  // Render sentence with inline keywords
  const renderSentenceWithKeywords = (clause: Clause) => {
    const { tokens } = tokenizeSentence(clause.text, clause.keywords)

    return (
      <span className="manage-mode__sentence">
        {tokens.map((token, idx) => {
          if (!token.isKeyword || !token.keywordId) {
            return <span key={idx}>{token.text}</span>
          }

          const keyword = getKeywordById(clause, token.keywordId)
          if (!keyword) {
            return <span key={idx}>{token.text}</span>
          }

          return (
            <span
              key={idx}
              className={`manage-mode__inline-keyword ${
                keyword.constraint === 'must_have'
                  ? 'manage-mode__inline-keyword--must-have'
                  : keyword.constraint === 'mustnt_have'
                    ? 'manage-mode__inline-keyword--mustnt-have'
                    : ''
              } ${isLocked ? 'manage-mode__inline-keyword--locked' : ''}`}
            >
              <span className="manage-mode__inline-keyword-text">{token.text}</span>
              {!isLocked && (
                <span className="manage-mode__inline-keyword-actions">
                  <button
                    className={`manage-mode__inline-keyword-btn manage-mode__inline-keyword-btn--check ${
                      keyword.constraint === 'must_have' ? 'active' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleKeywordConstraint(clause.id, keyword.id, 'must_have')
                    }}
                    title="Must-have"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    className={`manage-mode__inline-keyword-btn manage-mode__inline-keyword-btn--x ${
                      keyword.constraint === 'mustnt_have' ? 'active' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleKeywordConstraint(clause.id, keyword.id, 'mustnt_have')
                    }}
                    title="Mustn't-have"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
            </span>
          )
        })}
      </span>
    )
  }

  return (
    <div className="manage-mode">
      {/* Locked banner */}
      {isLocked && (
        <div className="manage-mode__locked-banner">
          <span>This conversation has been used in drafts. Editing is locked. You can only adjust in the Draft view.</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="manage-mode__toolbar">
        <div className="manage-mode__toolbar-left">
          <label className={`manage-mode__select-all ${isLocked ? 'disabled' : ''}`}>
            <input
              type="checkbox"
              checked={selectedClauseIds.size === clauses.length && clauses.length > 0}
              onChange={toggleSelectAll}
              disabled={isLocked}
            />
            <span>Select All</span>
          </label>
          <span className="manage-mode__selected-count">
            {selectedClauseIds.size > 0 && `${selectedClauseIds.size} selected`}
          </span>
        </div>
        <div className="manage-mode__toolbar-actions">
          <button
            className="manage-mode__btn manage-mode__btn--keep"
            onClick={markSelectedAsKeep}
            disabled={selectedClauseIds.size === 0 || isLocked}
            title="Mark as Keep"
          >
            <Bookmark size={14} />
            <span>Keep</span>
          </button>
          <button
            className="manage-mode__btn manage-mode__btn--discard"
            onClick={markSelectedAsDiscard}
            disabled={selectedClauseIds.size === 0 || isLocked}
            title="Mark as Discard"
          >
            <Trash2 size={14} />
            <span>Discard</span>
          </button>
          <div className="manage-mode__toolbar-divider" />
          <button
            className="manage-mode__btn manage-mode__btn--save"
            onClick={handleSave}
            disabled={isLocked}
            title="Save constraints"
          >
            <Save size={14} />
            <span>Save</span>
          </button>
          <button
            className="manage-mode__btn manage-mode__btn--exit"
            onClick={handleExit}
            title="Exit Manage mode"
          >
            <X size={14} />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="manage-mode__stats">
        <span className="manage-mode__stat manage-mode__stat--keep">
          <Bookmark size={12} /> {stats.keepCount} kept
        </span>
        <span className="manage-mode__stat manage-mode__stat--discard">
          <Trash2 size={12} /> {stats.discardCount} discarded
        </span>
        <span className="manage-mode__stat manage-mode__stat--must-have">
          <Check size={12} /> {stats.mustHaveCount} must-have
        </span>
        <span className="manage-mode__stat manage-mode__stat--mustnt-have">
          <X size={12} /> {stats.mustntHaveCount} mustn't-have
        </span>
      </div>

      {/* Clause list */}
      <div className="manage-mode__clauses">
        {clauses.map((clause) => (
          <div
            key={clause.id}
            className={`manage-mode__clause ${
              clause.status === 'keep'
                ? 'manage-mode__clause--keep'
                : clause.status === 'discard'
                  ? 'manage-mode__clause--discard'
                  : ''
            } ${selectedClauseIds.has(clause.id) ? 'manage-mode__clause--selected' : ''} ${isLocked ? 'manage-mode__clause--locked' : ''}`}
          >
            <div className="manage-mode__clause-header">
              <label className="manage-mode__clause-checkbox">
                <input
                  type="checkbox"
                  checked={selectedClauseIds.has(clause.id)}
                  onChange={() => toggleClauseSelection(clause.id)}
                  disabled={isLocked}
                />
              </label>
              <div className="manage-mode__clause-content">
                {renderSentenceWithKeywords(clause)}
              </div>
              {clause.status !== 'neutral' && (
                <span
                  className={`manage-mode__clause-badge ${
                    clause.status === 'keep'
                      ? 'manage-mode__clause-badge--keep'
                      : 'manage-mode__clause-badge--discard'
                  }`}
                >
                  {clause.status}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {clauses.length === 0 && (
        <div className="manage-mode__empty">
          No sentences found. Add some content to the conversation first.
        </div>
      )}
    </div>
  )
}
