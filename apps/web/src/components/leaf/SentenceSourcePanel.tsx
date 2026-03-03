'use client';

import { MessageSquare, User } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { SentenceCoverageEntry, WorkspaceMode } from '@/hooks/useLeafPageData';
import type { Constraint } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { SentenceWithSource } from '@/types/sourceContext';

// ============================================================================
// Types
// ============================================================================

interface SentenceSourcePanelProps {
  sentences: SentenceWithSource[];
  constraints: Constraint[];
  mode: WorkspaceMode;
  sentenceCoverage: Map<string, SentenceCoverageEntry>;
  sentenceConfidence: Map<string, number>;
  saving: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onAddConstraintFromSource: (
    type: 'require' | 'exclude',
    value: string,
    sourceSentenceId: string
  ) => void;
  onHoverSentence?: (sentenceId: string | null) => void;
  hoveredSentenceId?: string | null;
  /** Active sentence ID from keyboard navigation */
  activeSentenceId?: string | null;
}

type SourceTab = 'sentences' | 'turns';

// ============================================================================
// Helpers
// ============================================================================

function groupByTurn(sentences: SentenceWithSource[]): Map<string, SentenceWithSource[]> {
  const groups = new Map<string, SentenceWithSource[]>();
  for (const s of sentences) {
    const key = s.source?.turn_hash ?? '__no_source__';
    const group = groups.get(key) ?? [];
    group.push(s);
    groups.set(key, group);
  }
  return groups;
}

// ============================================================================
// SentenceCard
// ============================================================================

function SentenceCard({
  sentence,
  mode,
  coverage,
  confidence,
  saving,
  isHovered,
  onAddConstraintFromSource,
  onHover,
}: {
  sentence: SentenceWithSource;
  mode: WorkspaceMode;
  coverage?: SentenceCoverageEntry;
  confidence?: number;
  saving: boolean;
  isHovered: boolean;
  onAddConstraintFromSource: (
    type: 'require' | 'exclude',
    value: string,
    sourceSentenceId: string
  ) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-2.5 transition-all',
        'border-[var(--stroke-default)] bg-[var(--surface-card)]',
        'hover:border-[var(--stroke-strong)] hover:shadow-[var(--fx-shadow-sm)]',
        isHovered && 'border-[var(--status-success)] shadow-[var(--fx-shadow-sm)]'
      )}
      onMouseEnter={() => onHover(sentence.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] bg-[var(--surface-elevated)] px-1.5 py-0.5 rounded">
            {sentence.id}
          </span>
          {confidence != null && (
            <span className="text-[10px] font-semibold text-[var(--accent-leaf)]">
              {Math.round(confidence * 100)}%
            </span>
          )}
        </div>

        {/* Generate mode: quick actions */}
        {mode === 'generate' && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-transparent hover:border-[var(--status-success)]/30 hover:bg-[var(--status-success-muted)] text-[var(--status-success)] transition-colors"
              onClick={() => onAddConstraintFromSource('require', sentence.text, sentence.id)}
              disabled={saving}
            >
              Require
            </button>
            <button
              type="button"
              className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-transparent hover:border-[var(--status-error)]/30 hover:bg-[var(--status-error-muted)] text-[var(--status-error)] transition-colors"
              onClick={() => onAddConstraintFromSource('exclude', sentence.text, sentence.id)}
              disabled={saving}
            >
              Exclude
            </button>
          </div>
        )}

        {/* Display mode: coverage badge */}
        {mode === 'display' &&
          coverage &&
          (coverage.reflected ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--status-success-muted)] text-[var(--status-success)]">
              REFLECTED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-[var(--stroke-default)] text-[var(--text-tertiary)]">
              NOT USED
            </span>
          ))}
      </div>

      {/* Sentence text */}
      <p className="text-[13px] leading-relaxed text-[var(--text-secondary)] break-words">
        {sentence.text}
      </p>

      {/* Display mode: mapping snippet */}
      {mode === 'display' && coverage?.reflected && coverage.snippet && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--stroke-divider)]">
          <span className="text-[10px] text-[var(--text-tertiary)]">&rarr; </span>
          <span className="text-[11px] text-[var(--status-success)] italic">
            &ldquo;{coverage.snippet}&rdquo;
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SentenceSourcePanel
// ============================================================================

export function SentenceSourcePanel({
  sentences,
  constraints: _constraints,
  mode,
  sentenceCoverage,
  sentenceConfidence,
  saving,
  collapsed,
  onToggle: _onToggle,
  onAddConstraintFromSource,
  onHoverSentence,
  hoveredSentenceId,
  activeSentenceId,
}: SentenceSourcePanelProps) {
  const [tab, setTab] = useState<SourceTab>('sentences');
  const turnGroups = groupByTurn(sentences);

  const handleHover = useCallback(
    (id: string | null) => {
      onHoverSentence?.(id);
    },
    [onHoverSentence]
  );

  const reflectedCount = Array.from(sentenceCoverage.values()).filter((c) => c.reflected).length;

  if (collapsed) return null;

  return (
    <aside
      className={cn(
        'hidden md:flex w-[320px] min-w-[320px] shrink-0 flex-col overflow-y-auto border-r',
        'bg-[color-mix(in_srgb,var(--surface-panel)_88%,transparent)]',
        'backdrop-blur-[var(--fx-blur-panel)]'
      )}
    >
      {/* Tab bar */}
      <div className="flex border-b border-[var(--stroke-divider)] shrink-0">
        <button
          type="button"
          className={cn(
            'flex-1 py-2 text-xs font-medium border-b-2 transition-colors',
            tab === 'sentences'
              ? 'border-[var(--accent-leaf)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          )}
          onClick={() => setTab('sentences')}
        >
          Sentences
        </button>
        <button
          type="button"
          className={cn(
            'flex-1 py-2 text-xs font-medium border-b-2 transition-colors',
            tab === 'turns'
              ? 'border-[var(--accent-leaf)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          )}
          onClick={() => setTab('turns')}
        >
          Turns
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Coverage header (Display Mode) */}
        {mode === 'display' && (
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Coverage
              </span>
              <span className="text-[11px] font-medium text-[var(--status-success)]">
                {reflectedCount}/{sentences.length} reflected
              </span>
            </div>
            <div className="flex gap-0.5 h-1 rounded-sm overflow-hidden">
              {reflectedCount > 0 && (
                <div
                  className="bg-[var(--status-success)] rounded-sm"
                  style={{ flex: reflectedCount }}
                />
              )}
              {sentences.length - reflectedCount > 0 && (
                <div
                  className="bg-[var(--stroke-default)] rounded-sm"
                  style={{ flex: sentences.length - reflectedCount }}
                />
              )}
            </div>
          </div>
        )}

        {/* Sentences tab */}
        {tab === 'sentences' && (
          <div className="flex flex-col gap-2">
            {sentences.map((s) => (
              <div key={s.id} className="group" data-sentence-id={s.id}>
                <SentenceCard
                  sentence={s}
                  mode={mode}
                  coverage={sentenceCoverage.get(s.id)}
                  confidence={sentenceConfidence.get(s.id)}
                  saving={saving}
                  isHovered={hoveredSentenceId === s.id || activeSentenceId === s.id}
                  onAddConstraintFromSource={onAddConstraintFromSource}
                  onHover={handleHover}
                />
              </div>
            ))}
            {sentences.length === 0 && (
              <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">
                No sentences in this commit.
              </p>
            )}
          </div>
        )}

        {/* Turns tab */}
        {tab === 'turns' && (
          <div className="flex flex-col gap-3">
            {Array.from(turnGroups.entries()).map(([turnHash, turnSentences]) => (
              <div key={turnHash}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-5 h-5 rounded-full bg-[var(--accent-conversation)] flex items-center justify-center shrink-0">
                    {turnSentences[0]?.source?.turn_hash ? (
                      <User className="h-2.5 w-2.5 text-white" />
                    ) : (
                      <MessageSquare className="h-2.5 w-2.5 text-white" />
                    )}
                  </div>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    {turnHash === '__no_source__'
                      ? 'Unknown Source'
                      : `Turn ${turnHash.slice(0, 8)}`}
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    {turnSentences.length} sentence{turnSentences.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="pl-7 flex flex-col gap-1">
                  {turnSentences.map((s) => (
                    <div
                      key={s.id}
                      className="text-xs text-[var(--text-secondary)] px-2 py-1.5 bg-[var(--status-success-muted)] rounded border-l-2 border-[var(--status-success)]"
                    >
                      <span className="text-[10px] font-mono text-[var(--text-tertiary)] mr-1">
                        {s.id}
                      </span>
                      {s.text.length > 80 ? `${s.text.slice(0, 80)}...` : s.text}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
