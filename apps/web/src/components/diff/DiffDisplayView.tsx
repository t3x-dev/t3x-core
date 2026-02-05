'use client';

/**
 * DiffDisplayView - Display diff between two commits with source context
 *
 * Features:
 * - Side-by-side layout comparing two commits
 * - Word-level diff within modified sentences
 * - Color coding: red (removed), green (added), yellow/amber (modified)
 * - Source context around diffed sentences
 * - "Trace to source" links for both sides
 * - Unified diff view (single column with inline changes)
 *
 * @see https://github.com/t3x-dev/T3X/issues/220
 */

import { CheckCircle, Columns2, Expand, FileText, Loader2, MapPin } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { WordDiffDisplay } from '@/components/merge/WordDiffDisplay';
import { Button } from '@/components/ui/button';
import { EmptyStateInline } from '@/components/ui/empty-state';
import type { CommitV3Sentence, TurnContextData } from '@/lib/api';
import * as api from '@/lib/api';
import {
  type CommitDiff,
  type DiffableSentence,
  diffCommits,
  type WordDiffSegment,
} from '@/lib/diffUtils';
import { cn } from '@/lib/utils';

import { DiffSourceContextModal, TurnBubble } from './DiffSourceContextModal';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** View mode for the diff display */
type DiffViewMode = 'side-by-side' | 'unified';

/** Extended sentence with source info */
interface SentenceWithSource extends DiffableSentence {
  source?: {
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
}

/** Diff line for unified view */
interface UnifiedDiffLine {
  type: 'context' | 'added' | 'removed' | 'modified';
  sourceText?: string;
  targetText?: string;
  wordDiff?: WordDiffSegment[];
  similarity?: number;
  sourceSentence?: SentenceWithSource;
  targetSentence?: SentenceWithSource;
}

interface DiffDisplayViewProps {
  /** Sentences from source commit (base/old version) */
  sourceSentences: CommitV3Sentence[];
  /** Sentences from target commit (new version) */
  targetSentences: CommitV3Sentence[];
  /** Source commit hash (for display) */
  sourceCommitHash?: string;
  /** Target commit hash (for display) */
  targetCommitHash?: string;
  /** Optional: source commit label */
  sourceLabel?: string;
  /** Optional: target commit label */
  targetLabel?: string;
  /** Show context toggle (default: true) */
  showContextToggle?: boolean;
  /** Initial view mode (default: 'side-by-side') */
  initialViewMode?: DiffViewMode;
  /** Optional class name */
  className?: string;
  /** Loading state */
  loading?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════════════════════════════════════

interface DiffStatsBadgeProps {
  diff: CommitDiff;
}

function DiffStatsBadge({ diff }: DiffStatsBadgeProps) {
  const total =
    diff.identical.length +
    diff.similar.length +
    diff.onlyInSource.length +
    diff.onlyInTarget.length;

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-muted-foreground">{total} sentences</span>
      {diff.identical.length > 0 && (
        <span className="text-slate-500 dark:text-slate-400">
          {diff.identical.length} unchanged
        </span>
      )}
      {diff.similar.length > 0 && (
        <span className="text-amber-600 dark:text-amber-400">{diff.similar.length} modified</span>
      )}
      {diff.onlyInSource.length > 0 && (
        <span className="text-red-600 dark:text-red-400">-{diff.onlyInSource.length} removed</span>
      )}
      {diff.onlyInTarget.length > 0 && (
        <span className="text-green-600 dark:text-green-400">
          +{diff.onlyInTarget.length} added
        </span>
      )}
    </div>
  );
}

interface TraceToSourceButtonProps {
  sentence: SentenceWithSource;
  onClick: (sentence: SentenceWithSource) => void;
}

function TraceToSourceButton({ sentence, onClick }: TraceToSourceButtonProps) {
  const hasSource = !!sentence.source?.turn_hash;

  return (
    <button
      type="button"
      onClick={hasSource ? () => onClick(sentence) : undefined}
      disabled={!hasSource}
      className={`inline-flex items-center gap-1 text-[0.65rem] ml-2 transition-colors ${
        hasSource
          ? 'text-blue-600 dark:text-blue-400 hover:text-blue-700'
          : 'text-muted-foreground/30 cursor-not-allowed'
      }`}
      title={hasSource ? 'View source context' : 'Source context not available'}
    >
      <MapPin size={10} />
      <span>Source</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Inline Source Context
// ═══════════════════════════════════════════════════════════════════════════

interface InlineSourceContextProps {
  data: TurnContextData | null;
  loading: boolean;
  onOpenModal: () => void;
}

function InlineSourceContext({ data, loading, onOpenModal }: InlineSourceContextProps) {
  return (
    <div className="mt-1 mb-2 ml-4 mr-2 rounded-lg border border-border/60 bg-muted/30 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/50">
        <span className="text-[0.65rem] font-medium text-muted-foreground uppercase tracking-wide">
          Source Context
        </span>
        <button
          type="button"
          onClick={onOpenModal}
          className="inline-flex items-center gap-1 text-[0.6rem] text-muted-foreground hover:text-primary transition-colors"
          title="Open in full modal"
        >
          <Expand size={10} />
          Expand
        </button>
      </div>

      {/* Content */}
      <div className="px-3 py-2 max-h-[200px] overflow-y-auto">
        {loading && (
          <div className="flex items-center gap-2 py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading context...</span>
          </div>
        )}

        {!loading && data && (
          <div className="space-y-2">
            {data.context.map((turn, idx) => (
              <TurnBubble key={turn.turn_hash || idx} turn={turn} />
            ))}
          </div>
        )}

        {!loading && !data && (
          <div className="text-xs text-muted-foreground py-3 text-center">
            Could not load conversation context.
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Side-by-Side View
// ═══════════════════════════════════════════════════════════════════════════

interface SideBySideRowProps {
  type: 'identical' | 'modified' | 'removed' | 'added';
  sourceSentence?: SentenceWithSource;
  targetSentence?: SentenceWithSource;
  wordDiff?: WordDiffSegment[];
  similarity?: number;
  onTraceSource: (sentence: SentenceWithSource) => void;
  expandedSentenceId?: string | null;
  inlineContextData?: TurnContextData | null;
  inlineContextLoading?: boolean;
  onOpenModal?: () => void;
}

function SideBySideRow({
  type,
  sourceSentence,
  targetSentence,
  wordDiff: wordDiffSegments,
  similarity,
  onTraceSource,
  expandedSentenceId,
  inlineContextData,
  inlineContextLoading,
  onOpenModal,
}: SideBySideRowProps) {
  const leftBg =
    type === 'removed'
      ? 'bg-red-50 dark:bg-red-950/30'
      : type === 'modified'
        ? 'bg-amber-50/50 dark:bg-amber-950/30'
        : type === 'identical'
          ? 'bg-slate-50/50 dark:bg-slate-950/30'
          : 'bg-transparent';

  const rightBg =
    type === 'added'
      ? 'bg-green-50 dark:bg-green-950/30'
      : type === 'modified'
        ? 'bg-amber-50/50 dark:bg-amber-950/30'
        : type === 'identical'
          ? 'bg-slate-50/50 dark:bg-slate-950/30'
          : 'bg-transparent';

  const leftBorder =
    type === 'removed'
      ? 'border-l-2 border-red-300 dark:border-red-700'
      : type === 'modified'
        ? 'border-l-2 border-amber-300 dark:border-amber-700'
        : '';

  const rightBorder =
    type === 'added'
      ? 'border-l-2 border-green-300 dark:border-green-700'
      : type === 'modified'
        ? 'border-l-2 border-amber-300 dark:border-amber-700'
        : '';

  // Check if either sentence is currently expanded inline
  const isSourceExpanded = sourceSentence && expandedSentenceId === sourceSentence.id;
  const isTargetExpanded = targetSentence && expandedSentenceId === targetSentence.id;
  const isExpanded = isSourceExpanded || isTargetExpanded;

  return (
    <div>
      <div className="grid grid-cols-2 gap-1">
        {/* Left (Source) Side */}
        <div className={cn('p-2 rounded-l text-sm', leftBg, leftBorder)}>
          {sourceSentence ? (
            <div className="flex flex-col gap-1">
              {type === 'modified' && wordDiffSegments ? (
                <div>
                  <WordDiffDisplay segments={wordDiffSegments.filter((s) => s.type !== 'added')} />
                  {similarity !== undefined && (
                    <span className="text-[0.6rem] text-amber-600 dark:text-amber-400 ml-2">
                      ({Math.round(similarity * 100)}% similar)
                    </span>
                  )}
                </div>
              ) : (
                <span className={type === 'removed' ? 'text-red-800 dark:text-red-200' : ''}>
                  {sourceSentence.text}
                </span>
              )}
              <TraceToSourceButton sentence={sourceSentence} onClick={onTraceSource} />
            </div>
          ) : (
            <span className="text-slate-300 dark:text-slate-600 italic">—</span>
          )}
        </div>

        {/* Right (Target) Side */}
        <div className={cn('p-2 rounded-r text-sm', rightBg, rightBorder)}>
          {targetSentence ? (
            <div className="flex flex-col gap-1">
              {type === 'modified' && wordDiffSegments ? (
                <div>
                  <WordDiffDisplay
                    segments={wordDiffSegments.filter((s) => s.type !== 'removed')}
                  />
                  {similarity !== undefined && (
                    <span className="text-[0.6rem] text-amber-600 dark:text-amber-400 ml-2">
                      ({Math.round(similarity * 100)}% similar)
                    </span>
                  )}
                </div>
              ) : (
                <span className={type === 'added' ? 'text-green-800 dark:text-green-200' : ''}>
                  {targetSentence.text}
                </span>
              )}
              <TraceToSourceButton sentence={targetSentence} onClick={onTraceSource} />
            </div>
          ) : (
            <span className="text-slate-300 dark:text-slate-600 italic">—</span>
          )}
        </div>
      </div>

      {/* Inline source context (expanded below the row) */}
      {isExpanded && (
        <InlineSourceContext
          data={inlineContextData ?? null}
          loading={inlineContextLoading ?? false}
          onOpenModal={onOpenModal ?? (() => {})}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Unified View
// ═══════════════════════════════════════════════════════════════════════════

interface UnifiedRowProps {
  line: UnifiedDiffLine;
  onTraceSource: (sentence: SentenceWithSource) => void;
  expandedSentenceId?: string | null;
  inlineContextData?: TurnContextData | null;
  inlineContextLoading?: boolean;
  onOpenModal?: () => void;
}

function UnifiedRow({
  line,
  onTraceSource,
  expandedSentenceId,
  inlineContextData,
  inlineContextLoading,
  onOpenModal,
}: UnifiedRowProps) {
  const getBgClass = () => {
    switch (line.type) {
      case 'added':
        return 'bg-green-50 dark:bg-green-950/30 border-l-2 border-green-300 dark:border-green-700';
      case 'removed':
        return 'bg-red-50 dark:bg-red-950/30 border-l-2 border-red-300 dark:border-red-700';
      case 'modified':
        return 'bg-amber-50 dark:bg-amber-950/30 border-l-2 border-amber-300 dark:border-amber-700';
      default:
        return 'bg-slate-50/50 dark:bg-slate-950/30';
    }
  };

  const getPrefix = () => {
    switch (line.type) {
      case 'added':
        return <span className="text-green-600 dark:text-green-400 font-mono mr-2">+</span>;
      case 'removed':
        return <span className="text-red-600 dark:text-red-400 font-mono mr-2">−</span>;
      case 'modified':
        return <span className="text-amber-600 dark:text-amber-400 font-mono mr-2">~</span>;
      default:
        return <span className="text-slate-400 dark:text-slate-500 font-mono mr-2"> </span>;
    }
  };

  const relevantSentence = line.sourceSentence || line.targetSentence;
  const isExpanded = relevantSentence && expandedSentenceId === relevantSentence.id;

  return (
    <div>
      <div className={cn('p-2 rounded text-sm flex items-start', getBgClass())}>
        {getPrefix()}
        <div className="flex-1">
          {line.type === 'modified' && line.wordDiff ? (
            <div>
              <WordDiffDisplay segments={line.wordDiff} />
              {line.similarity !== undefined && (
                <span className="text-[0.6rem] text-amber-600 dark:text-amber-400 ml-2">
                  ({Math.round(line.similarity * 100)}% similar)
                </span>
              )}
            </div>
          ) : (
            <span
              className={
                line.type === 'added'
                  ? 'text-green-800 dark:text-green-200'
                  : line.type === 'removed'
                    ? 'text-red-800 dark:text-red-200'
                    : ''
              }
            >
              {line.sourceText || line.targetText}
            </span>
          )}
        </div>
        {line.sourceSentence && (
          <TraceToSourceButton sentence={line.sourceSentence} onClick={onTraceSource} />
        )}
        {line.targetSentence && !line.sourceSentence && (
          <TraceToSourceButton sentence={line.targetSentence} onClick={onTraceSource} />
        )}
      </div>

      {/* Inline source context */}
      {isExpanded && (
        <InlineSourceContext
          data={inlineContextData ?? null}
          loading={inlineContextLoading ?? false}
          onOpenModal={onOpenModal ?? (() => {})}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

export function DiffDisplayView({
  sourceSentences,
  targetSentences,
  sourceCommitHash,
  targetCommitHash,
  sourceLabel = 'Source (Base)',
  targetLabel = 'Target (New)',
  showContextToggle = true,
  initialViewMode = 'side-by-side',
  className,
  loading = false,
}: DiffDisplayViewProps) {
  const [viewMode, setViewMode] = useState<DiffViewMode>(initialViewMode);

  // Modal context state (fallback / expanded view)
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [contextSentence, setContextSentence] = useState<SentenceWithSource | null>(null);
  const [contextData, setContextData] = useState<TurnContextData | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  // Inline context state
  const [expandedSentenceId, setExpandedSentenceId] = useState<string | null>(null);
  const [inlineContextData, setInlineContextData] = useState<TurnContextData | null>(null);
  const [inlineContextLoading, setInlineContextLoading] = useState(false);

  // Build maps from id to full sentence for source info lookup
  const sourceMap = useMemo(() => {
    const map = new Map<string, SentenceWithSource>();
    for (const s of sourceSentences) {
      map.set(s.id, { id: s.id, text: s.text, source: s.source });
    }
    return map;
  }, [sourceSentences]);

  const targetMap = useMemo(() => {
    const map = new Map<string, SentenceWithSource>();
    for (const s of targetSentences) {
      map.set(s.id, { id: s.id, text: s.text, source: s.source });
    }
    return map;
  }, [targetSentences]);

  // Build text-to-target map for finding identical sentences in target
  // Fix: identical array contains source sentences, need to find matching target by text
  const textToTargetMap = useMemo(() => {
    const map = new Map<string, SentenceWithSource>();
    for (const s of targetSentences) {
      map.set(s.text, { id: s.id, text: s.text, source: s.source });
    }
    return map;
  }, [targetSentences]);

  // Compute diff
  const diff = useMemo(() => {
    const sourceForDiff = sourceSentences.map((s) => ({ id: s.id, text: s.text }));
    const targetForDiff = targetSentences.map((s) => ({ id: s.id, text: s.text }));
    return diffCommits(sourceForDiff, targetForDiff);
  }, [sourceSentences, targetSentences]);

  // Build unified diff lines in document order
  // Fix: Previously grouped by type, now interleaves based on source sentence order
  const unifiedLines = useMemo((): UnifiedDiffLine[] => {
    const lines: UnifiedDiffLine[] = [];

    // Build lookup maps for quick access
    const identicalTexts = new Set(diff.identical.map((s) => s.text));
    const similarSourceIds = new Map(diff.similar.map((p) => [p.source.id, p]));
    const removedIds = new Set(diff.onlyInSource.map((s) => s.id));

    // Process source sentences in order
    for (const s of sourceSentences) {
      if (identicalTexts.has(s.text)) {
        // Identical sentence (context)
        lines.push({
          type: 'context',
          sourceText: s.text,
          sourceSentence: sourceMap.get(s.id),
          targetSentence: textToTargetMap.get(s.text),
        });
      } else if (similarSourceIds.has(s.id)) {
        // Modified sentence
        const pair = similarSourceIds.get(s.id)!;
        lines.push({
          type: 'modified',
          sourceText: pair.source.text,
          targetText: pair.target.text,
          wordDiff: pair.wordDiff,
          similarity: pair.similarity,
          sourceSentence: sourceMap.get(pair.source.id),
          targetSentence: targetMap.get(pair.target.id),
        });
      } else if (removedIds.has(s.id)) {
        // Removed sentence
        lines.push({
          type: 'removed',
          sourceText: s.text,
          sourceSentence: sourceMap.get(s.id),
        });
      }
    }

    // Add sentences only in target (at the end, or could be interleaved with more complex logic)
    for (const s of diff.onlyInTarget) {
      lines.push({
        type: 'added',
        targetText: s.text,
        targetSentence: targetMap.get(s.id),
      });
    }

    return lines;
  }, [diff, sourceSentences, sourceMap, targetMap, textToTargetMap]);

  // Handle trace to source — toggles inline context
  const handleTraceSource = useCallback(
    async (sentence: SentenceWithSource) => {
      if (!sentence.source?.turn_hash) return;

      // Toggle: if already expanded, collapse
      if (expandedSentenceId === sentence.id) {
        setExpandedSentenceId(null);
        setInlineContextData(null);
        return;
      }

      // Expand inline
      setExpandedSentenceId(sentence.id);
      setContextSentence(sentence); // keep for modal fallback
      setInlineContextLoading(true);
      setInlineContextData(null);

      try {
        const data = await api.fetchTurnContextCached(sentence.source.turn_hash, {
          before: 2,
          after: 2,
          highlightStart: sentence.source.start_char,
          highlightEnd: sentence.source.end_char,
        });
        setInlineContextData(data);
      } catch {
        setInlineContextData(null);
      } finally {
        setInlineContextLoading(false);
      }
    },
    [expandedSentenceId]
  );

  // Open modal from inline context "Expand" button
  const handleOpenModal = useCallback(() => {
    setContextData(inlineContextData);
    setContextModalOpen(true);
    setContextLoading(false);
  }, [inlineContextData]);

  const closeContextModal = useCallback(() => {
    setContextModalOpen(false);
    setContextSentence(null);
    setContextData(null);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Computing diff...</span>
      </div>
    );
  }

  // Empty state
  if (sourceSentences.length === 0 && targetSentences.length === 0) {
    return (
      <EmptyStateInline
        icon={CheckCircle}
        message="Documents are identical -- no sentences to compare."
        className={cn('py-12', className)}
      />
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <DiffStatsBadge diff={diff} />

        {showContextToggle && (
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <Button
              variant={viewMode === 'side-by-side' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setViewMode('side-by-side')}
            >
              <Columns2 className="h-3.5 w-3.5 mr-1" />
              Split
            </Button>
            <Button
              variant={viewMode === 'unified' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setViewMode('unified')}
            >
              <FileText className="h-3.5 w-3.5 mr-1" />
              Unified
            </Button>
          </div>
        )}
      </div>

      {/* Column Headers (side-by-side only) */}
      {viewMode === 'side-by-side' && (
        <div className="grid grid-cols-2 gap-1">
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-b">
            {sourceLabel}
            {sourceCommitHash && (
              <span className="ml-2 font-mono text-[0.6rem] opacity-60">
                {sourceCommitHash.slice(0, 12)}
              </span>
            )}
          </div>
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-b">
            {targetLabel}
            {targetCommitHash && (
              <span className="ml-2 font-mono text-[0.6rem] opacity-60">
                {targetCommitHash.slice(0, 12)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Diff Content */}
      <div className="space-y-1">
        {viewMode === 'side-by-side' ? (
          <>
            {/* Identical sentences */}
            {diff.identical.map((s) => (
              <SideBySideRow
                key={`identical-${s.id}`}
                type="identical"
                sourceSentence={sourceMap.get(s.id)}
                targetSentence={textToTargetMap.get(s.text)}
                onTraceSource={handleTraceSource}
                expandedSentenceId={expandedSentenceId}
                inlineContextData={inlineContextData}
                inlineContextLoading={inlineContextLoading}
                onOpenModal={handleOpenModal}
              />
            ))}

            {/* Modified pairs */}
            {diff.similar.map((pair) => (
              <SideBySideRow
                key={`modified-${pair.source.id}-${pair.target.id}`}
                type="modified"
                sourceSentence={sourceMap.get(pair.source.id)}
                targetSentence={targetMap.get(pair.target.id)}
                wordDiff={pair.wordDiff}
                similarity={pair.similarity}
                onTraceSource={handleTraceSource}
                expandedSentenceId={expandedSentenceId}
                inlineContextData={inlineContextData}
                inlineContextLoading={inlineContextLoading}
                onOpenModal={handleOpenModal}
              />
            ))}

            {/* Removed sentences */}
            {diff.onlyInSource.map((s) => (
              <SideBySideRow
                key={`removed-${s.id}`}
                type="removed"
                sourceSentence={sourceMap.get(s.id)}
                onTraceSource={handleTraceSource}
                expandedSentenceId={expandedSentenceId}
                inlineContextData={inlineContextData}
                inlineContextLoading={inlineContextLoading}
                onOpenModal={handleOpenModal}
              />
            ))}

            {/* Added sentences */}
            {diff.onlyInTarget.map((s) => (
              <SideBySideRow
                key={`added-${s.id}`}
                type="added"
                targetSentence={targetMap.get(s.id)}
                onTraceSource={handleTraceSource}
                expandedSentenceId={expandedSentenceId}
                inlineContextData={inlineContextData}
                inlineContextLoading={inlineContextLoading}
                onOpenModal={handleOpenModal}
              />
            ))}
          </>
        ) : (
          /* Unified view */
          unifiedLines.map((line, idx) => (
            <UnifiedRow
              key={`unified-${idx}-${line.sourceText || line.targetText}`}
              line={line}
              onTraceSource={handleTraceSource}
              expandedSentenceId={expandedSentenceId}
              inlineContextData={inlineContextData}
              inlineContextLoading={inlineContextLoading}
              onOpenModal={handleOpenModal}
            />
          ))
        )}
      </div>

      {/* Source Context Modal */}
      <DiffSourceContextModal
        open={contextModalOpen}
        onClose={closeContextModal}
        sentence={contextSentence}
        data={contextData}
        loading={contextLoading}
      />
    </div>
  );
}
