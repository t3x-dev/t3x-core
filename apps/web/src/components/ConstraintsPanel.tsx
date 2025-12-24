import { useState, useCallback } from 'react'
import { Check, X, ChevronDown, ChevronRight, Plus, Eye, EyeOff } from 'lucide-react'
import type { Clause, ConversationConstraints, DraftConstraintOverrides } from '../types/nodes'

interface ConstraintsPanelProps {
  constraints: {
    clauses: ConversationConstraints['clauses']
    must_have: string[]
    mustnt_have: string[]
  }
  overrides?: DraftConstraintOverrides
  onUpdateOverrides?: (overrides: Partial<DraftConstraintOverrides>) => void
}

export default function ConstraintsPanel({
  constraints,
  overrides,
  onUpdateOverrides,
}: ConstraintsPanelProps) {
  const [expandedSections, setExpandedSections] = useState({
    clauses: true,
    mustHave: true,
    mustntHave: true,
  })
  const [newMustHave, setNewMustHave] = useState('')
  const [newMustntHave, setNewMustntHave] = useState('')

  const toggleSection = (section: 'clauses' | 'mustHave' | 'mustntHave') => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  // Check if a clause is disabled
  const isClauseDisabled = useCallback(
    (clauseId: string) => {
      return overrides?.disabledClauseIds?.includes(clauseId) ?? false
    },
    [overrides]
  )

  // Toggle clause enabled/disabled
  const toggleClause = useCallback(
    (clauseId: string) => {
      if (!onUpdateOverrides) return
      const currentDisabled = overrides?.disabledClauseIds ?? []
      const isDisabled = currentDisabled.includes(clauseId)
      const newDisabled = isDisabled
        ? currentDisabled.filter((id) => id !== clauseId)
        : [...currentDisabled, clauseId]
      onUpdateOverrides({ disabledClauseIds: newDisabled })
    },
    [overrides, onUpdateOverrides]
  )

  // Check if a must-have keyword is removed
  const isMustHaveRemoved = useCallback(
    (keyword: string) => {
      return overrides?.removedMustHave?.includes(keyword) ?? false
    },
    [overrides]
  )

  // Toggle must-have keyword
  const toggleMustHave = useCallback(
    (keyword: string) => {
      if (!onUpdateOverrides) return
      const currentRemoved = overrides?.removedMustHave ?? []
      const isRemoved = currentRemoved.includes(keyword)
      const newRemoved = isRemoved
        ? currentRemoved.filter((k) => k !== keyword)
        : [...currentRemoved, keyword]
      onUpdateOverrides({ removedMustHave: newRemoved })
    },
    [overrides, onUpdateOverrides]
  )

  // Check if a mustn't-have keyword is removed
  const isMustntHaveRemoved = useCallback(
    (keyword: string) => {
      return overrides?.removedMustntHave?.includes(keyword) ?? false
    },
    [overrides]
  )

  // Toggle mustn't-have keyword
  const toggleMustntHave = useCallback(
    (keyword: string) => {
      if (!onUpdateOverrides) return
      const currentRemoved = overrides?.removedMustntHave ?? []
      const isRemoved = currentRemoved.includes(keyword)
      const newRemoved = isRemoved
        ? currentRemoved.filter((k) => k !== keyword)
        : [...currentRemoved, keyword]
      onUpdateOverrides({ removedMustntHave: newRemoved })
    },
    [overrides, onUpdateOverrides]
  )

  // Add new must-have keyword
  const addMustHave = useCallback(() => {
    const trimmed = newMustHave.trim()
    if (!trimmed || !onUpdateOverrides) return
    const current = overrides?.additionalMustHave ?? []
    if (!current.includes(trimmed) && !constraints.must_have.includes(trimmed)) {
      onUpdateOverrides({ additionalMustHave: [...current, trimmed] })
    }
    setNewMustHave('')
  }, [newMustHave, overrides, constraints.must_have, onUpdateOverrides])

  // Remove additional must-have keyword
  const removeAdditionalMustHave = useCallback(
    (keyword: string) => {
      if (!onUpdateOverrides) return
      const current = overrides?.additionalMustHave ?? []
      onUpdateOverrides({ additionalMustHave: current.filter((k) => k !== keyword) })
    },
    [overrides, onUpdateOverrides]
  )

  // Add new mustn't-have keyword
  const addMustntHave = useCallback(() => {
    const trimmed = newMustntHave.trim()
    if (!trimmed || !onUpdateOverrides) return
    const current = overrides?.additionalMustntHave ?? []
    if (!current.includes(trimmed) && !constraints.mustnt_have.includes(trimmed)) {
      onUpdateOverrides({ additionalMustntHave: [...current, trimmed] })
    }
    setNewMustntHave('')
  }, [newMustntHave, overrides, constraints.mustnt_have, onUpdateOverrides])

  // Remove additional mustn't-have keyword
  const removeAdditionalMustntHave = useCallback(
    (keyword: string) => {
      if (!onUpdateOverrides) return
      const current = overrides?.additionalMustntHave ?? []
      onUpdateOverrides({ additionalMustntHave: current.filter((k) => k !== keyword) })
    },
    [overrides, onUpdateOverrides]
  )

  // Get active clauses (keep status only, not disabled)
  const activeClauses = constraints.clauses.filter(
    (c) => c.status === 'keep' && !isClauseDisabled(c.id)
  )
  const totalKeepClauses = constraints.clauses.filter((c) => c.status === 'keep').length

  // Get active must-have keywords
  const activeMustHave = [
    ...constraints.must_have.filter((kw) => !isMustHaveRemoved(kw)),
    ...(overrides?.additionalMustHave ?? []),
  ]

  // Get active mustn't-have keywords
  const activeMustntHave = [
    ...constraints.mustnt_have.filter((kw) => !isMustntHaveRemoved(kw)),
    ...(overrides?.additionalMustntHave ?? []),
  ]

  return (
    <div className="constraints-panel">
      <div className="constraints-panel__header">
        <strong>Constraints</strong>
        <span>From Conversation</span>
      </div>

      {/* Clauses Section */}
      <div className="constraints-panel__section">
        <button
          className="constraints-panel__section-header"
          onClick={() => toggleSection('clauses')}
        >
          {expandedSections.clauses ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>Sentence Candidates</span>
          <span className="constraints-panel__count">
            {activeClauses.length}/{totalKeepClauses}
          </span>
        </button>
        {expandedSections.clauses && (
          <div className="constraints-panel__content">
            {constraints.clauses
              .filter((c) => c.status === 'keep')
              .map((clause) => (
                <ClauseItem
                  key={clause.id}
                  clause={clause}
                  isDisabled={isClauseDisabled(clause.id)}
                  onToggle={() => toggleClause(clause.id)}
                  canToggle={!!onUpdateOverrides}
                />
              ))}
            {totalKeepClauses === 0 && (
              <div className="constraints-panel__empty">
                No sentences marked as "keep" in Conversation.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Must-Have Section */}
      <div className="constraints-panel__section">
        <button
          className="constraints-panel__section-header constraints-panel__section-header--must-have"
          onClick={() => toggleSection('mustHave')}
        >
          {expandedSections.mustHave ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Check size={12} className="constraints-panel__icon--must-have" />
          <span>Must-Have Keywords</span>
          <span className="constraints-panel__count">{activeMustHave.length}</span>
        </button>
        {expandedSections.mustHave && (
          <div className="constraints-panel__content">
            <div className="constraints-panel__keywords">
              {constraints.must_have.map((kw) => (
                <KeywordTag
                  key={kw}
                  keyword={kw}
                  type="must_have"
                  isRemoved={isMustHaveRemoved(kw)}
                  onToggle={() => toggleMustHave(kw)}
                  canToggle={!!onUpdateOverrides}
                />
              ))}
              {overrides?.additionalMustHave?.map((kw) => (
                <KeywordTag
                  key={`add-${kw}`}
                  keyword={kw}
                  type="must_have"
                  isAdditional
                  onRemove={() => removeAdditionalMustHave(kw)}
                  canToggle={!!onUpdateOverrides}
                />
              ))}
            </div>
            {onUpdateOverrides && (
              <div className="constraints-panel__add-keyword">
                <input
                  type="text"
                  placeholder="Add keyword..."
                  value={newMustHave}
                  onChange={(e) => setNewMustHave(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMustHave()}
                />
                <button onClick={addMustHave} disabled={!newMustHave.trim()}>
                  <Plus size={12} />
                </button>
              </div>
            )}
            {activeMustHave.length === 0 && !onUpdateOverrides && (
              <div className="constraints-panel__empty">No must-have keywords defined.</div>
            )}
          </div>
        )}
      </div>

      {/* Mustn't-Have Section */}
      <div className="constraints-panel__section">
        <button
          className="constraints-panel__section-header constraints-panel__section-header--mustnt-have"
          onClick={() => toggleSection('mustntHave')}
        >
          {expandedSections.mustntHave ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <X size={12} className="constraints-panel__icon--mustnt-have" />
          <span>Mustn't-Have Keywords</span>
          <span className="constraints-panel__count">{activeMustntHave.length}</span>
        </button>
        {expandedSections.mustntHave && (
          <div className="constraints-panel__content">
            <div className="constraints-panel__keywords">
              {constraints.mustnt_have.map((kw) => (
                <KeywordTag
                  key={kw}
                  keyword={kw}
                  type="mustnt_have"
                  isRemoved={isMustntHaveRemoved(kw)}
                  onToggle={() => toggleMustntHave(kw)}
                  canToggle={!!onUpdateOverrides}
                />
              ))}
              {overrides?.additionalMustntHave?.map((kw) => (
                <KeywordTag
                  key={`add-${kw}`}
                  keyword={kw}
                  type="mustnt_have"
                  isAdditional
                  onRemove={() => removeAdditionalMustntHave(kw)}
                  canToggle={!!onUpdateOverrides}
                />
              ))}
            </div>
            {onUpdateOverrides && (
              <div className="constraints-panel__add-keyword">
                <input
                  type="text"
                  placeholder="Add keyword..."
                  value={newMustntHave}
                  onChange={(e) => setNewMustntHave(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMustntHave()}
                />
                <button onClick={addMustntHave} disabled={!newMustntHave.trim()}>
                  <Plus size={12} />
                </button>
              </div>
            )}
            {activeMustntHave.length === 0 && !onUpdateOverrides && (
              <div className="constraints-panel__empty">No mustn't-have keywords defined.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Clause item component
interface ClauseItemProps {
  clause: Clause
  isDisabled: boolean
  onToggle: () => void
  canToggle: boolean
}

function ClauseItem({ clause, isDisabled, onToggle, canToggle }: ClauseItemProps) {
  return (
    <div
      className={`constraints-panel__clause ${isDisabled ? 'constraints-panel__clause--disabled' : ''}`}
    >
      <span className="constraints-panel__clause-text">{clause.text}</span>
      {canToggle && (
        <button
          className="constraints-panel__clause-toggle"
          onClick={onToggle}
          title={isDisabled ? 'Enable this clause' : 'Disable this clause'}
        >
          {isDisabled ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      )}
    </div>
  )
}

// Keyword tag component
interface KeywordTagProps {
  keyword: string
  type: 'must_have' | 'mustnt_have'
  isRemoved?: boolean
  isAdditional?: boolean
  onToggle?: () => void
  onRemove?: () => void
  canToggle: boolean
}

function KeywordTag({
  keyword,
  type,
  isRemoved,
  isAdditional,
  onToggle,
  onRemove,
  canToggle,
}: KeywordTagProps) {
  const baseClass = `constraints-panel__keyword constraints-panel__keyword--${type === 'must_have' ? 'must-have' : 'mustnt-have'}`
  const classes = `${baseClass} ${isRemoved ? 'constraints-panel__keyword--removed' : ''} ${isAdditional ? 'constraints-panel__keyword--additional' : ''}`

  return (
    <span className={classes}>
      <span>{keyword}</span>
      {canToggle && !isAdditional && onToggle && (
        <button onClick={onToggle} title={isRemoved ? 'Restore' : 'Remove'}>
          {isRemoved ? <Plus size={10} /> : <X size={10} />}
        </button>
      )}
      {isAdditional && onRemove && (
        <button onClick={onRemove} title="Remove">
          <X size={10} />
        </button>
      )}
    </span>
  )
}
