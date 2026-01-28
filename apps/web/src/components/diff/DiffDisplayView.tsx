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

import { AlertCircle, Columns2, FileText, Loader2, MapPin } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { WordDiffDisplay } from '@/components/merge/WordDiffDisplay';
import { Button } from '@/components/ui/button';
import type { CommitV3Sentence, TurnContextData } from '@/lib/api';
import * as api from '@/lib/api';
import { type CommitDiff, diffCommits, type WordDiffSegment } from '@/lib/diffUtils';
import { cn } from '@/lib/utils';

import { DiffSourceContextModal } from './DiffSourceContextModal';

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
        <span className="text-slate-500">{diff.identical.length} unchanged</span>
      )}
      {diff.similar.length > 0 && (
        <span className="text-amber-600">{diff.similar.length} modified</span>
      )}
      {diff.onlyInSource.length > 0 && (
        <span className="text-red-600">-{diff.onlyInSource.length} removed</span>
      )}
      {diff.onlyInTarget.length > 0 && (
        <span className="text-green-600">+{diff.onlyInTarget.length} added</span>
      )}
    </div>
  );
}

interface TraceToSourceButtonProps {
  sentence: SentenceWithSource;
  onClick: (sentence: SentenceWithSource) => void;
}

function TraceToSourceButton({ sentence, onClick }: TraceToSourceButtonProps) {
  if (!sentence.source?.turn_hash) return null;

  return (
    <button
      type="button"
      onClick={() => onClick(sentence)}
      className="inline-flex items-center gap-1 text-[0.65rem] text-blue-600 hover:text-blue-700 transition-colors ml-2"
      title="View source context"
    >
      <MapPin size={10} />
      <span>Source</span>
    </button>
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
}

function SideBySideRow({
  type,
  sourceSentence,
  targetSentence,
  wordDiff: wordDiffSegments,
  similarity,
  onTraceSource,
}: SideBySideRowProps) {
  const leftBg =
    type === 'removed'
      ? 'bg-red-50'
      : type === 'modified'
        ? 'bg-amber-50/50'
        : type === 'identical'
          ? 'bg-slate-50/50'
          : 'bg-transparent';

  const rightBg =
    type === 'added'
      ? 'bg-green-50'
      : type === 'modified'
        ? 'bg-amber-50/50'
        : type === 'identical'
          ? 'bg-slate-50/50'
          : 'bg-transparent';

  const leftBorder =
    type === 'removed'
      ? 'border-l-2 border-red-300'
      : type === 'modified'
        ? 'border-l-2 border-amber-300'
        : '';

  const rightBorder =
    type === 'added'
      ? 'border-l-2 border-green-300'
      : type === 'modified'
        ? 'border-l-2 border-amber-300'
        : '';

  return (
    <div className="grid grid-cols-2 gap-1">
      {/* Left (Source) Side */}
      <div className={cn('p-2 rounded-l text-sm', leftBg, leftBorder)}>
        {sourceSentence ? (
          <div className="flex flex-col gap-1">
            {type === 'modified' && wordDiffSegments ? (
              <div>
                <WordDiffDisplay segments={wordDiffSegments.filter((s) => s.type !== 'added')} />
                {similarity !== undefined && (
                  <span className="text-[0.6rem] text-amber-600 ml-2">
                    ({Math.round(similarity * 100)}% similar)
                  </span>
                )}
              </div>
            ) : (
              <span className={type === 'removed' ? 'text-red-800' : ''}>
                {sourceSentence.text}
              </span>
            )}
            <TraceToSourceButton sentence={sourceSentence} onClick={onTraceSource} />
          </div>
        ) : (
          <span className="text-slate-300 italic">—</span>
        )}
      </div>

      {/* Right (Target) Side */}
      <div className={cn('p-2 rounded-r text-sm', rightBg, rightBorder)}>
        {targetSentence ? (
          <div className="flex flex-col gap-1">
            {type === 'modified' && wordDiffSegments ? (
              <div>
                <WordDiffDisplay segments={wordDiffSegments.filter((s) => s.type !== 'removed')} />
                {similarity !== undefined && (
                  <span className="text-[0.6rem] text-amber-600 ml-2">
                    ({Math.round(similarity * 100)}% similar)
                  </span>
                )}
              </div>
            ) : (
              <span className={type === 'added' ? 'text-green-800' : ''}>
                {targetSentence.text}
              </span>
            )}
            <TraceToSourceButton sentence={targetSentence} onClick={onTraceSource} />
          </div>
        ) : (
          <span className="text-slate-300 italic">—</span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Unified View
// ═══════════════════════════════════════════════════════════════════════════

interface UnifiedRowProps {
  line: UnifiedDiffLine;
  onTraceSource: (sentence: SentenceWithSource) => void;
}

function UnifiedRow({ line, onTraceSource }: UnifiedRowProps) {
  const getBgClass = () => {
    switch (line.type) {
      case 'added':
        return 'bg-green-50 border-l-2 border-green-300';
      case 'removed':
        return 'bg-red-50 border-l-2 border-red-300';
      case 'modified':
        return 'bg-amber-50 border-l-2 border-amber-300';
      default:
        return 'bg-slate-50/50';
    }
  };

  const getPrefix = () => {
    switch (line.type) {
      case 'added':
        return <span className="text-green-600 font-mono mr-2">+</span>;
      case 'removed':
        return <span className="text-red-600 font-mono mr-2">−</span>;
      case 'modified':
        return <span className="text-amber-600 font-mono mr-2">~</span>;
      default:
        return <span className="text-slate-400 font-mono mr-2"> </span>;
    }
  };

  return (
    <div className={cn('p-2 rounded text-sm flex items-start', getBgClass())}>
      {getPrefix()}
      <div className="flex-1">
        {line.type === 'modified' && line.wordDiff ? (
          <div>
            <WordDiffDisplay segments={line.wordDiff} />
            {line.similarity !== undefined && (
              <span className="text-[0.6rem] text-amber-600 ml-2">
                ({Math.round(line.similarity * 100)}% similar)
              </span>
            )}
          </div>
        ) : (
          <span
            className={
              line.type === 'added'
                ? 'text-green-800'
                : line.type === 'removed'
                  ? 'text-red-800'
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
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [contextSentence, setContextSentence] = useState<SentenceWithSource | null>(null);
  const [contextData, setContextData] = useState<TurnContextData | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

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

  // Handle trace to source
  const handleTraceSource = useCallback(async (sentence: SentenceWithSource) => {
    if (!sentence.source?.turn_hash) return;

    setContextSentence(sentence);
    setContextModalOpen(true);
    setContextLoading(true);

    try {
      const data = await api.fetchTurnContext(sentence.source.turn_hash, {
        before: 2,
        after: 2,
        highlightStart: sentence.source.start_char,
        highlightEnd: sentence.source.end_char,
      });
      setContextData(data);
    } catch {
      // Context load failed - modal will show fallback UI
      setContextData(null);
    } finally {
      setContextLoading(false);
    }
  }, []);

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
      <div
        className={cn('flex items-center justify-center py-12 text-muted-foreground', className)}
      >
        <AlertCircle className="h-5 w-5 mr-2" />
        No sentences to compare
      </div>
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
              />
            ))}

            {/* Removed sentences */}
            {diff.onlyInSource.map((s) => (
              <SideBySideRow
                key={`removed-${s.id}`}
                type="removed"
                sourceSentence={sourceMap.get(s.id)}
                onTraceSource={handleTraceSource}
              />
            ))}

            {/* Added sentences */}
            {diff.onlyInTarget.map((s) => (
              <SideBySideRow
                key={`added-${s.id}`}
                type="added"
                targetSentence={targetMap.get(s.id)}
                onTraceSource={handleTraceSource}
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
            />
          ))
        )}
      </div>

      {/* Source Context Modal */}
      <DiffSourceContextModal
        open={contextModalOpen}
        onOpenChange={(open) => !open && closeContextModal()}
        sentence={contextSentence}
        contextData={contextData}
        loading={contextLoading}
      />
    </div>
  );
}
