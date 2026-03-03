'use client';

/**
 * LeafConstraintSourceContext - Displays commit source context with constraint highlights
 *
 * Reuses the same source context pattern as CommitSourceContext, but overlays
 * constraint matches onto the text:
 * - green: sentence excerpt (default, same as Commit view)
 * - deepGreen: require constraint match
 * - deepRed: exclude constraint match
 *
 * Constraint highlights override sentence highlights where they overlap.
 */

import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  ShieldCheck,
  ShieldX,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TurnBubble } from '@/components/shared/TurnBubble';
import { Button } from '@/components/ui/button';
import type { Constraint, TurnContextData } from '@/lib/api';
import * as api from '@/lib/api';
import {
  adjustColoredHighlightsForTruncation,
  checkContentIntegrity,
  DEFAULT_CONTEXT_CHARS,
  DEFAULT_MAX_LENGTH,
  truncateLongContent,
} from '@/lib/truncationUtils';
import { cn } from '@/lib/utils';
import type {
  ColoredHighlightRange,
  ContentIntegrityStatus,
  HighlightColor,
  HighlightRange,
  SentenceWithSource,
  TurnBubbleData,
} from '@/types/sourceContext';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const MAX_TURN_LENGTH = DEFAULT_MAX_LENGTH;
const TRUNCATION_CONTEXT = DEFAULT_CONTEXT_CHARS;

// ═══════════════════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════════════════

type SelectionMode = 'require' | 'exclude';

interface LeafConstraintSourceContextProps {
  /** Sentences from commit content */
  sentences: SentenceWithSource[];
  /** Constraints from leaf */
  constraints: Constraint[];
  /** Callback to add a new constraint (type, value, sourceSentenceId) */
  onAdd?: (type: 'require' | 'exclude', value: string, sourceSentenceId: string) => void;
  /** Callback to remove a constraint by id */
  onRemove?: (constraintId: string) => void;
  /** Whether a save is in progress */
  saving?: boolean;
  /** Compact mode (default: false) */
  compact?: boolean;
  /** Hide header, mode toggle, and legend (for use inside sidebar sections) */
  hideChrome?: boolean;
  /** Default expanded state (default: first turn expanded) */
  defaultExpanded?: boolean;
  /** User instruction (soft prompt) for LLM generation */
  userInstruction?: string;
  /** Callback when user instruction changes */
  onUpdateUserInstruction?: (value: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal Types
// ═══════════════════════════════════════════════════════════════════════════

interface SentenceWithHighlight {
  sentence: SentenceWithSource;
  turnHash: string;
  highlight: HighlightRange;
}

interface TurnWithHighlights {
  turnHash: string;
  context: TurnContextData | null;
  highlights: HighlightRange[];
  sentences: SentenceWithHighlight[];
  loading: boolean;
  error: string | null;
  integrityStatus: Map<string, ContentIntegrityStatus>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function groupSentencesByTurn(sentences: SentenceWithSource[]): {
  byTurn: Map<string, SentenceWithHighlight[]>;
  withoutSource: SentenceWithSource[];
} {
  const byTurn = new Map<string, SentenceWithHighlight[]>();
  const withoutSource: SentenceWithSource[] = [];

  for (const sentence of sentences) {
    if (!sentence.source || !sentence.source.turn_hash) {
      withoutSource.push(sentence);
      continue;
    }

    const turnHash = sentence.source.turn_hash;
    const group = byTurn.get(turnHash) || [];
    group.push({
      sentence,
      turnHash,
      highlight: {
        start: sentence.source.start_char,
        end: sentence.source.end_char,
      },
    });
    byTurn.set(turnHash, group);
  }

  return { byTurn, withoutSource };
}

/**
 * Build ColoredHighlightRange[] for a single turn, merging sentence highlights
 * with constraint highlights. Constraint colors override sentence green.
 */
export function buildColoredHighlights(
  turnContent: string,
  sentenceHighlights: SentenceWithHighlight[],
  constraints: Constraint[],
  sentences: SentenceWithSource[]
): ColoredHighlightRange[] {
  // Step 1: Find constraint match ranges within this turn
  const constraintRanges: { start: number; end: number; color: HighlightColor }[] = [];

  for (const c of constraints) {
    const color: HighlightColor = c.type === 'require' ? 'deepGreen' : 'deepRed';
    let found = false;

    // Strategy 1: Try linked sentence first (most precise)
    const linkedId = (c.type === 'require' && c.source_sentence_id) || null;
    const linkedByDesc = c.description
      ? sentences.find((s) => c.description?.includes(s.id))?.id
      : null;
    const linkedByReason =
      c.type === 'exclude' && c.reason ? sentences.find((s) => c.reason?.includes(s.id))?.id : null;
    const targetSentenceId = linkedId || linkedByDesc || linkedByReason;

    if (targetSentenceId) {
      const sh = sentenceHighlights.find((s) => s.sentence.id === targetSentenceId);
      if (sh) {
        const sentenceText = turnContent.slice(sh.highlight.start, sh.highlight.end);
        let searchFrom = 0;
        while (searchFrom < sentenceText.length) {
          const idx = sentenceText.indexOf(c.value, searchFrom);
          if (idx === -1) break;
          constraintRanges.push({
            start: sh.highlight.start + idx,
            end: sh.highlight.start + idx + c.value.length,
            color,
          });
          found = true;
          searchFrom = idx + c.value.length;
        }
      }
    }

    // Strategy 2: Search all sentence ranges in this turn
    if (!found) {
      for (const sh of sentenceHighlights) {
        const sentenceText = turnContent.slice(sh.highlight.start, sh.highlight.end);
        let searchFrom = 0;
        while (searchFrom < sentenceText.length) {
          const idx = sentenceText.indexOf(c.value, searchFrom);
          if (idx === -1) break;
          constraintRanges.push({
            start: sh.highlight.start + idx,
            end: sh.highlight.start + idx + c.value.length,
            color,
          });
          found = true;
          searchFrom = idx + c.value.length;
        }
      }
    }

    // Strategy 3: Search entire turn content (last resort, for text between sentences)
    if (!found) {
      let searchFrom = 0;
      while (searchFrom < turnContent.length) {
        const idx = turnContent.indexOf(c.value, searchFrom);
        if (idx === -1) break;
        constraintRanges.push({
          start: idx,
          end: idx + c.value.length,
          color,
        });
        searchFrom = idx + c.value.length;
      }
    }
  }

  // Step 2: Build base green ranges from sentence highlights
  const baseRanges: { start: number; end: number }[] = sentenceHighlights.map((sh) => ({
    start: sh.highlight.start,
    end: sh.highlight.end,
  }));

  // Step 3: Split base green ranges, removing portions covered by constraints
  const result: ColoredHighlightRange[] = [];

  for (const base of baseRanges) {
    // Collect constraint ranges that overlap with this base range
    const overlapping = constraintRanges
      .filter((cr) => cr.start < base.end && cr.end > base.start)
      .sort((a, b) => a.start - b.start);

    if (overlapping.length === 0) {
      // No constraints overlap — entire range stays green
      result.push({ start: base.start, end: base.end, color: 'green' });
      continue;
    }

    // Walk through the base range, filling gaps with green
    let cursor = base.start;
    for (const cr of overlapping) {
      const crStart = Math.max(cr.start, base.start);
      const crEnd = Math.min(cr.end, base.end);

      if (crStart > cursor) {
        result.push({ start: cursor, end: crStart, color: 'green' });
      }
      result.push({ start: crStart, end: crEnd, color: cr.color });
      cursor = Math.max(cursor, crEnd);
    }
    if (cursor < base.end) {
      result.push({ start: cursor, end: base.end, color: 'green' });
    }
  }

  // Step 4: Add constraint ranges not fully inside any sentence range
  // (from Strategy 3 — full turn content search)
  // Partial overlaps with base ranges may cause duplicate coverage, but
  // TurnBubble's overlap handling (Math.max(rawStart, lastEnd)) resolves this.
  for (const cr of constraintRanges) {
    const insideBase = baseRanges.some((b) => cr.start >= b.start && cr.end <= b.end);
    if (!insideBase) {
      result.push({ start: cr.start, end: cr.end, color: cr.color });
    }
  }

  // Sort by start position
  result.sort((a, b) => a.start - b.start);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find which sentence a character offset belongs to within a turn.
 * Returns the sentence ID or null if not within any sentence range.
 */
function findSentenceAtTurnOffset(
  offset: number,
  sentenceHighlights: SentenceWithHighlight[]
): string | null {
  for (const sh of sentenceHighlights) {
    if (offset >= sh.highlight.start && offset < sh.highlight.end) {
      return sh.sentence.id;
    }
  }
  return null;
}

/**
 * Calculate the absolute character offset of a DOM selection point
 * within a container element. Handles text split across <mark> tags.
 */
function getAbsoluteOffset(container: Node, targetNode: Node, targetOffset: number): number {
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node === targetNode) {
      return offset + targetOffset;
    }
    offset += node.textContent?.length ?? 0;
    node = walker.nextNode();
  }
  return offset + targetOffset;
}

export function LeafConstraintSourceContext({
  sentences,
  constraints,
  onAdd,
  onRemove,
  saving,
  compact = false,
  hideChrome = false,
  defaultExpanded = true,
  userInstruction,
  onUpdateUserInstruction,
}: LeafConstraintSourceContextProps) {
  const [turnData, setTurnData] = useState<Map<string, TurnWithHighlights>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());
  const hasUserInteracted = useRef(false);
  const [mode, setMode] = useState<SelectionMode>('require');
  const [_hoveredConstraintId, setHoveredConstraintId] = useState<string | null>(null);

  // Refs for each turn's bubble container (for offset calculation)
  const turnBubbleRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const isEditable = !!onAdd;

  const { byTurn, withoutSource } = useMemo(() => groupSentencesByTurn(sentences), [sentences]);
  const hasLegacyData = withoutSource.length > 0;
  const allLegacy = withoutSource.length === sentences.length;

  const turnHashes = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const sentence of sentences) {
      if (!sentence.source?.turn_hash) continue;
      const hash = sentence.source.turn_hash;
      if (!seen.has(hash)) {
        seen.add(hash);
        ordered.push(hash);
      }
    }
    return ordered;
  }, [sentences]);

  useEffect(() => {
    if (!hasUserInteracted.current && defaultExpanded && turnHashes.length > 0) {
      setExpandedTurns(new Set([turnHashes[0]]));
    }
  }, [turnHashes, defaultExpanded]);

  const toggleTurn = useCallback((turnHash: string) => {
    hasUserInteracted.current = true;
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnHash)) {
        next.delete(turnHash);
      } else {
        next.add(turnHash);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    hasUserInteracted.current = true;
    setExpandedTurns(new Set(turnHashes));
  }, [turnHashes]);

  const collapseAll = useCallback(() => {
    hasUserInteracted.current = true;
    setExpandedTurns(new Set());
  }, []);

  // Handle text selection on a TurnBubble
  const handleTurnMouseUp = useCallback(
    (turnHash: string) => {
      if (!onAdd) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const selectedText = selection.toString().trim();
      if (!selectedText) return;

      const data = turnData.get(turnHash);
      if (!data?.context?.target_turn) {
        selection.removeAllRanges();
        return;
      }

      const turnContent = data.context.target_turn.content;

      // Try to calculate precise offset from DOM
      const containerEl = turnBubbleRefs.current.get(turnHash);
      let charOffset = -1;
      if (containerEl && selection.anchorNode) {
        charOffset = getAbsoluteOffset(containerEl, selection.anchorNode, selection.anchorOffset);
      }

      // Find position in turn content
      let idx: number;
      if (charOffset >= 0) {
        // Verify the text at this offset matches
        const textAtOffset = turnContent.slice(charOffset, charOffset + selectedText.length);
        idx = textAtOffset === selectedText ? charOffset : turnContent.indexOf(selectedText);
      } else {
        idx = turnContent.indexOf(selectedText);
      }

      if (idx === -1) {
        selection.removeAllRanges();
        return;
      }

      // Find which sentence this offset belongs to
      const sentenceId = findSentenceAtTurnOffset(idx, data.sentences);
      if (!sentenceId) {
        selection.removeAllRanges();
        return;
      }

      onAdd(mode, selectedText, sentenceId);
      selection.removeAllRanges();
    },
    [onAdd, mode, turnData]
  );

  // Fetch context for each unique turn
  useEffect(() => {
    if (turnHashes.length === 0) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchAllContexts = async () => {
      setIsLoading(true);
      const newData = new Map<string, TurnWithHighlights>();
      const hashesToFetch = compact ? turnHashes.slice(0, 2) : turnHashes;

      await Promise.all(
        hashesToFetch.map(async (turnHash) => {
          const sentenceGroup = byTurn.get(turnHash) || [];
          const highlights = sentenceGroup.map((s) => s.highlight);

          try {
            const context = await api.fetchTurnContextCached(turnHash, {
              before: 0,
              after: 0,
            });

            const integrityStatus = new Map<string, ContentIntegrityStatus>();
            if (context?.target_turn?.content) {
              for (const sg of sentenceGroup) {
                const status = checkContentIntegrity(
                  sg.sentence.text,
                  context.target_turn.content,
                  sg.highlight.start,
                  sg.highlight.end
                );
                integrityStatus.set(sg.sentence.id, status);
              }
            }

            if (!cancelled) {
              newData.set(turnHash, {
                turnHash,
                context,
                highlights,
                sentences: sentenceGroup,
                loading: false,
                error: null,
                integrityStatus,
              });
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to load context';
            if (!cancelled) {
              newData.set(turnHash, {
                turnHash,
                context: null,
                highlights,
                sentences: sentenceGroup,
                loading: false,
                error: errorMsg,
                integrityStatus: new Map(),
              });
            }
          }
        })
      );

      if (!cancelled) {
        setTurnData(newData);
        setIsLoading(false);
      }
    };

    fetchAllContexts();
    return () => {
      cancelled = true;
    };
  }, [turnHashes, byTurn, compact]);

  // Empty
  if (sentences.length === 0) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-[var(--color-text-muted)]" />
          <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">
            Source Context
          </h3>
        </div>
        <p className="text-center py-4 text-[var(--color-text-muted)] text-sm">No sentences</p>
      </div>
    );
  }

  // All legacy
  if (allLegacy) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-[var(--color-text-muted)]" />
            <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">Sentences</h3>
          </div>
          <span className="px-2 py-0.5 bg-[var(--hover-bg)] text-[var(--color-text-secondary)] text-xs rounded">
            Legacy format
          </span>
        </div>
        <ul className="space-y-[var(--space-item)]">
          {sentences.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-2 p-2 bg-[var(--color-bg-white)] rounded border border-[var(--color-border-light)]"
            >
              <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded shrink-0">
                {s.id}
              </span>
              <span className="text-[0.875rem] leading-relaxed text-[var(--color-text-secondary)] break-words">
                {s.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-[var(--color-text-muted)]" />
          <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">
            Source Context
          </h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading source context...</span>
        </div>
      </div>
    );
  }

  const hasAnyContext = Array.from(turnData.values()).some((data) => data.context !== null);
  const hasIntegrityIssues = Array.from(turnData.values()).some((data) =>
    Array.from(data.integrityStatus.values()).includes('mismatch')
  );

  // Fallback
  if (!hasAnyContext) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <XCircle size={14} className="text-[var(--color-text-muted)]" />
            <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">Sentences</h3>
          </div>
          <span className="px-2 py-0.5 bg-[var(--hover-bg)] text-[var(--color-text-secondary)] text-xs rounded">
            Source unavailable
          </span>
        </div>
        <ul className="space-y-[var(--space-item)]">
          {sentences.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-2 p-2 bg-[var(--color-bg-white)] rounded border border-[var(--color-border-light)]"
            >
              <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded shrink-0">
                {s.id}
              </span>
              <span className="text-[0.875rem] leading-relaxed text-[var(--color-text-secondary)] break-words">
                {s.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Render turns with constraint highlights
  const hashesToRender = compact ? turnHashes.slice(0, 2) : turnHashes;
  const showCollapseControls = !compact && turnHashes.length > 1;
  const constraintCount = constraints.length;

  return (
    <div
      className={cn(
        hideChrome
          ? ''
          : 'p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]'
      )}
    >
      {/* Header (hidden when inside sidebar section) */}
      {!hideChrome && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-[var(--status-success)]" />
            <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">
              Source Context
            </h3>
            {constraintCount > 0 && (
              <span className="px-1.5 py-0.5 bg-[var(--status-success-muted)] text-[var(--status-success)] text-[0.65rem] rounded">
                {constraintCount} constraint{constraintCount !== 1 ? 's' : ''} highlighted
              </span>
            )}
            {hasIntegrityIssues && (
              <span
                className="px-1.5 py-0.5 bg-[var(--status-warning-muted)] text-[var(--status-warning)] text-[0.65rem] rounded flex items-center gap-1"
                title="Some source content may have changed since this commit"
              >
                <AlertTriangle size={10} />
                Modified
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showCollapseControls && (
              <div className="flex items-center gap-1 text-[0.65rem]">
                <button
                  type="button"
                  onClick={expandAll}
                  className="text-[var(--status-info)] hover:text-[var(--status-info)] hover:underline"
                >
                  Expand all
                </button>
                <span className="text-[var(--color-border)]">|</span>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="text-[var(--status-info)] hover:text-[var(--status-info)] hover:underline"
                >
                  Collapse
                </button>
              </div>
            )}
            <span className="text-xs text-[var(--color-text-muted)]">
              {sentences.length} sentence{sentences.length !== 1 ? 's' : ''} from{' '}
              {turnHashes.length} turn{turnHashes.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Mode toggle (hidden when inside sidebar section) */}
      {!hideChrome && isEditable && (
        <div className="flex items-center gap-2 mb-3">
          <Button
            size="sm"
            variant={mode === 'require' ? 'default' : 'outline'}
            className={cn(mode === 'require' && 'bg-green-600 hover:bg-green-700 text-white')}
            onClick={() => setMode('require')}
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
            Must Have
          </Button>
          <Button
            size="sm"
            variant={mode === 'exclude' ? 'default' : 'outline'}
            className={cn(mode === 'exclude' && 'bg-red-600 hover:bg-red-700 text-white')}
            onClick={() => setMode('exclude')}
          >
            <ShieldX className="h-3.5 w-3.5 mr-1.5" />
            Must Not Have
          </Button>
          <span className="text-xs text-[var(--color-text-muted)] ml-2">
            Select text below to add a constraint
          </span>
        </div>
      )}

      {/* Legend (hidden when inside sidebar section) */}
      {!hideChrome && (
        <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)] mb-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-[var(--status-success-muted)]" />
            Sentence
          </span>
          {constraintCount > 0 && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-emerald-200 dark:bg-emerald-800" />
                Must Have
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-red-200 dark:bg-red-800" />
                Must Not Have
              </span>
            </>
          )}
        </div>
      )}

      {/* Turns list */}
      <div className="space-y-[var(--space-item)]">
        {hashesToRender.map((turnHash, idx) => {
          const data = turnData.get(turnHash);
          const isExpanded = expandedTurns.has(turnHash) || compact;

          // Error state
          if (!data || data.error) {
            const sentencesForTurn = byTurn.get(turnHash) || [];
            return (
              <div
                key={turnHash}
                className="rounded-lg border border-[var(--color-border)] overflow-hidden elevation-1"
              >
                <button
                  type="button"
                  onClick={() => toggleTurn(turnHash)}
                  className="w-full flex items-center gap-2 p-2 bg-[var(--color-bg-subtle)] hover:bg-[var(--hover-bg)] transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-[var(--color-text-muted)] shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-[var(--color-text-muted)] shrink-0" />
                  )}
                  <span className="flex-1 text-sm text-[var(--color-text-secondary)]">
                    Turn {idx + 1}
                  </span>
                  <span className="px-1.5 py-0.5 bg-[var(--color-border)] text-[var(--color-text-secondary)] text-[0.65rem] rounded">
                    Source unavailable
                  </span>
                </button>
                {isExpanded && (
                  <div className="p-3 bg-[var(--color-bg-white)]">
                    <ul className="space-y-[var(--space-item)]">
                      {sentencesForTurn.map((sg) => (
                        <li
                          key={sg.sentence.id}
                          className="flex items-start gap-2 p-2 bg-[var(--status-success-muted)] rounded border border-[var(--status-success)]/20"
                        >
                          <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded shrink-0">
                            {sg.sentence.id}
                          </span>
                          <span className="text-[0.875rem] leading-relaxed text-[var(--color-text-secondary)] break-words">
                            {sg.sentence.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          }

          const targetTurn = data.context?.target_turn;
          if (!targetTurn) return null;

          const turnHasIntegrityIssues = Array.from(data.integrityStatus.values()).includes(
            'mismatch'
          );
          const isLongTurn = targetTurn.content.length > MAX_TURN_LENGTH;
          const shouldTruncate = isLongTurn && (compact || !expandedTurns.has(turnHash));

          // Build colored highlights (sentence green + constraint deepGreen/deepRed)
          const coloredHighlights = buildColoredHighlights(
            targetTurn.content,
            data.sentences,
            constraints,
            sentences
          );

          const truncationOpts = {
            maxLength: MAX_TURN_LENGTH,
            contextChars: TRUNCATION_CONTEXT,
          };

          const turnBubbleData: TurnBubbleData = {
            turn_hash: targetTurn.turn_hash,
            role: targetTurn.role,
            content: shouldTruncate
              ? truncateLongContent(targetTurn.content, data.highlights, truncationOpts)
              : targetTurn.content,
            created_at: targetTurn.created_at,
            is_target: true,
            coloredHighlights: shouldTruncate
              ? adjustColoredHighlightsForTruncation(
                  coloredHighlights,
                  targetTurn.content,
                  data.highlights,
                  truncationOpts
                )
              : coloredHighlights,
          };

          return (
            <div
              key={turnHash}
              className="rounded-lg border border-[var(--color-border)] overflow-hidden elevation-1"
            >
              {!compact && (
                <button
                  type="button"
                  onClick={() => toggleTurn(turnHash)}
                  className="w-full flex items-center gap-2 p-2 bg-[var(--color-bg-subtle)] hover:bg-[var(--hover-bg)] transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-[var(--color-text-muted)] shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-[var(--color-text-muted)] shrink-0" />
                  )}
                  <span className="flex-1 text-sm text-[var(--color-text-secondary)]">
                    {data.context?.conversation_title || `Turn ${idx + 1}`}
                    <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                      ({targetTurn.role})
                    </span>
                  </span>
                  {turnHasIntegrityIssues && (
                    <span
                      className="px-1.5 py-0.5 bg-[var(--status-warning-muted)] text-[var(--status-warning)] text-[0.65rem] rounded flex items-center gap-1"
                      title="Source content may have changed"
                    >
                      <AlertTriangle size={10} />
                      Changed
                    </span>
                  )}
                  {isLongTurn && (
                    <span className="px-1.5 py-0.5 bg-[var(--status-info-muted)] text-[var(--status-info)] text-[0.65rem] rounded">
                      Long turn
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {data.sentences.length} sentence{data.sentences.length !== 1 ? 's' : ''}
                  </span>
                </button>
              )}

              {isExpanded && (
                <div
                  className={cn(
                    'p-2 bg-[var(--color-bg-white)]',
                    isEditable && 'cursor-text select-text'
                  )}
                  ref={(el) => {
                    turnBubbleRefs.current.set(turnHash, el);
                  }}
                  onMouseUp={() => handleTurnMouseUp(turnHash)}
                >
                  <TurnBubble turn={turnBubbleData} highlightColor="green" showTargetRing={false} />

                  {turnHasIntegrityIssues && (
                    <div className="mt-2 p-2 bg-[var(--status-warning-muted)] rounded border border-[var(--status-warning)]/25">
                      <div className="flex items-start gap-2 text-[var(--status-warning)] text-xs">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">Source may have changed</p>
                          <p className="text-[var(--status-warning)] mt-0.5">
                            The highlighted text positions may not match the original content.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {shouldTruncate && (
                    <div className="mt-2 text-center text-xs text-[var(--color-text-muted)]">
                      Showing truncated content ({targetTurn.content.length.toLocaleString()} chars
                      total)
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {compact && turnHashes.length > 2 && (
          <div className="text-center py-2 text-xs text-[var(--color-text-muted)]">
            +{turnHashes.length - 2} more turn{turnHashes.length - 2 !== 1 ? 's' : ''}
          </div>
        )}

        {hasLegacyData && !allLegacy && (
          <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-[var(--space-item)]">
              <span className="text-xs text-[var(--color-text-muted)]">
                {withoutSource.length} sentence{withoutSource.length !== 1 ? 's' : ''} without
                source info
              </span>
              <span className="px-1.5 py-0.5 bg-[var(--hover-bg)] text-[var(--color-text-secondary)] text-[0.65rem] rounded">
                Legacy
              </span>
            </div>
            <ul className="space-y-1">
              {withoutSource.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start gap-2 p-2 bg-[var(--color-bg-white)] rounded border border-[var(--color-border-light)]"
                >
                  <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded shrink-0">
                    {s.id}
                  </span>
                  <span className="text-[0.875rem] leading-relaxed text-[var(--color-text-secondary)] break-words">
                    {s.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Constraint list */}
      {isEditable && constraintCount > 0 && (
        <ConstraintList
          constraints={constraints}
          onRemove={onRemove}
          onHover={setHoveredConstraintId}
          saving={saving}
        />
      )}

      {isEditable && constraintCount === 0 && (
        <p className="mt-3 text-xs text-[var(--color-text-muted)] italic">
          Select text above to create constraints. Switch mode with the buttons.
        </p>
      )}

      {/* User instruction textarea */}
      {isEditable && onUpdateUserInstruction && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
          <label
            htmlFor="user-instruction"
            className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5"
          >
            Custom Instruction
          </label>
          <textarea
            id="user-instruction"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-white)] px-3 py-2 text-sm text-[var(--color-text-secondary)] placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 dark:focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-600 resize-y"
            rows={3}
            placeholder="Add custom guidance for the LLM (e.g., tone, format, focus areas)..."
            value={userInstruction ?? ''}
            onChange={(e) => onUpdateUserInstruction(e.target.value)}
          />
          <p className="mt-1 text-[0.65rem] text-[var(--color-text-muted)]">
            This instruction is included in the generation prompt as additional guidance.
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Constraint List (inline, for viewing and deleting)
// ═══════════════════════════════════════════════════════════════════════════

function ConstraintList({
  constraints,
  onRemove,
  onHover,
  saving,
}: {
  constraints: Constraint[];
  onRemove?: (id: string) => void;
  onHover: (id: string | null) => void;
  saving?: boolean;
}) {
  const requireConstraints = constraints.filter((c) => c.type === 'require');
  const excludeConstraints = constraints.filter((c) => c.type === 'exclude');

  return (
    <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-3">
      {requireConstraints.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--status-success)] uppercase tracking-wide mb-1.5">
            Must Have ({requireConstraints.length})
          </h4>
          <div className="space-y-1">
            {requireConstraints.map((c) => (
              <ConstraintRow
                key={c.id}
                constraint={c}
                onRemove={onRemove ? () => onRemove(c.id) : undefined}
                onHover={onHover}
                disabled={saving}
              />
            ))}
          </div>
        </div>
      )}
      {excludeConstraints.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--status-error)] uppercase tracking-wide mb-1.5">
            Must Not Have ({excludeConstraints.length})
          </h4>
          <div className="space-y-1">
            {excludeConstraints.map((c) => (
              <ConstraintRow
                key={c.id}
                constraint={c}
                onRemove={onRemove ? () => onRemove(c.id) : undefined}
                onHover={onHover}
                disabled={saving}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConstraintRow({
  constraint,
  onRemove,
  onHover,
  disabled,
}: {
  constraint: Constraint;
  onRemove?: () => void;
  onHover: (id: string | null) => void;
  disabled?: boolean;
}) {
  const isRequire = constraint.type === 'require';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm',
        isRequire
          ? 'border-[var(--status-success)]/20 bg-[var(--status-success-muted)]'
          : 'border-[var(--status-error)]/20 bg-[var(--status-error-muted)]'
      )}
      onMouseEnter={() => onHover(constraint.id)}
      onMouseLeave={() => onHover(null)}
    >
      {isRequire ? (
        <CheckCircle className="h-3.5 w-3.5 text-[var(--status-success)] shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-[var(--status-error)] shrink-0" />
      )}
      <span
        className={cn(
          'flex-1 truncate font-medium',
          isRequire ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'
        )}
      >
        {constraint.value}
      </span>
      <span className="text-xs px-1.5 py-0.5 bg-[var(--color-bg-white)]/60 rounded text-[var(--color-text-muted)]">
        {constraint.match_mode}
      </span>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={onRemove}
          disabled={disabled}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
