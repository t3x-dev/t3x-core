'use client';

import { CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { EmptyStateInline } from '@/components/ui/empty-state';
import type { CommitV4Sentence, TurnContextData } from '@/lib/api';
import * as api from '@/lib/api';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { WordDiffSegment } from '@/types/merge';
import { DiffSentenceLine } from './DiffSentenceLine';

// ============================================================================
// Types
// ============================================================================

interface SegmentDiffItem {
  segmentId: string;
  text: string;
  diffType: 'same' | 'added' | 'removed' | 'modified';
  matchedSegmentId?: string;
  matchedText?: string;
  similarity?: number;
  wordDiff?: WordDiffSegment[];
}

interface DiffSideBySideProps {
  segmentDiffs: SegmentDiffItem[];
  baseSentences: CommitV4Sentence[];
  targetSentences: CommitV4Sentence[];
  projectId?: string;
}

export interface DiffSideBySideHandle {
  jumpToSection: (section: string) => void;
}

/** Unified line for Git-like display */
interface UnifiedLine {
  type: 'context' | 'modified' | 'removed' | 'added' | 'collapsed';
  baseIndex?: number;
  baseSentence?: CommitV4Sentence;
  targetSentence?: CommitV4Sentence;
  wordDiff?: WordDiffSegment[];
  collapsedCount?: number;
}

// ============================================================================
// Helpers
// ============================================================================

/** Number of context lines to show before/after changes */
const CONTEXT_LINES = 2;

/**
 * Build unified lines in position order with context folding
 */
function buildUnifiedLines(
  baseSentences: CommitV4Sentence[],
  targetSentences: CommitV4Sentence[],
  segmentDiffs: SegmentDiffItem[]
): UnifiedLine[] {
  // Step 1: Build lookup tables
  const diffByBaseId = new Map<string, SegmentDiffItem>();
  const addedItems: SegmentDiffItem[] = [];

  for (const diff of segmentDiffs) {
    if (diff.diffType === 'added') {
      addedItems.push(diff);
    } else {
      diffByBaseId.set(diff.segmentId, diff);
    }
  }

  const targetMap = new Map(targetSentences.map((s) => [s.id, s]));

  // Step 2: Build raw lines in baseSentences order
  const rawLines: UnifiedLine[] = [];

  for (let i = 0; i < baseSentences.length; i++) {
    const baseSentence = baseSentences[i];
    const diff = diffByBaseId.get(baseSentence.id);

    if (!diff || diff.diffType === 'same') {
      // Unchanged line
      rawLines.push({
        type: 'context',
        baseIndex: i,
        baseSentence,
        targetSentence: baseSentence,
      });
    } else if (diff.diffType === 'modified') {
      rawLines.push({
        type: 'modified',
        baseIndex: i,
        baseSentence,
        targetSentence: diff.matchedSegmentId ? targetMap.get(diff.matchedSegmentId) : undefined,
        wordDiff: diff.wordDiff,
      });
    } else if (diff.diffType === 'removed') {
      rawLines.push({
        type: 'removed',
        baseIndex: i,
        baseSentence,
      });
    }
  }

  // Step 3: Add target-only sentences at the end
  for (const added of addedItems) {
    const targetSentence = targetMap.get(added.segmentId);
    if (targetSentence) {
      rawLines.push({
        type: 'added',
        targetSentence,
      });
    }
  }

  // Step 4: Mark which lines to show (changes + N lines of context)
  const showLine = new Array(rawLines.length).fill(false);

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.type !== 'context') {
      // Show the change itself
      showLine[i] = true;
      // Show N lines before and after
      for (
        let j = Math.max(0, i - CONTEXT_LINES);
        j <= Math.min(rawLines.length - 1, i + CONTEXT_LINES);
        j++
      ) {
        showLine[j] = true;
      }
    }
  }

  // Step 5: Build final lines with collapsed sections
  const finalLines: UnifiedLine[] = [];
  let collapsedCount = 0;

  for (let i = 0; i < rawLines.length; i++) {
    if (showLine[i]) {
      if (collapsedCount > 0) {
        finalLines.push({ type: 'collapsed', collapsedCount });
        collapsedCount = 0;
      }
      finalLines.push(rawLines[i]);
    } else {
      collapsedCount++;
    }
  }

  if (collapsedCount > 0) {
    finalLines.push({ type: 'collapsed', collapsedCount });
  }

  return finalLines;
}

// ============================================================================
// Sub-components
// ============================================================================

interface CollapsedRowProps {
  count: number;
  onExpand: () => void;
}

function CollapsedRow({ count, onExpand }: CollapsedRowProps) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="w-full grid grid-cols-2 divide-x divide-[var(--stroke-divider)] bg-[var(--surface-app)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
    >
      <div className="px-3 py-1.5 text-xs text-[var(--text-tertiary)] flex items-center gap-1">
        <ChevronRight className="h-3 w-3" />
        <span>··· {count} unchanged ···</span>
      </div>
      <div className="px-3 py-1.5 text-xs text-[var(--text-tertiary)] flex items-center gap-1">
        <ChevronRight className="h-3 w-3" />
        <span>··· {count} unchanged ···</span>
      </div>
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export const DiffSideBySide = forwardRef<DiffSideBySideHandle, DiffSideBySideProps>(
  function DiffSideBySide({ segmentDiffs, baseSentences, targetSentences, projectId }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // Build unified lines
    const unifiedLines = useMemo(
      () => buildUnifiedLines(baseSentences, targetSentences, segmentDiffs),
      [baseSentences, targetSentences, segmentDiffs]
    );

    // Track expanded collapsed sections
    const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

    const toggleSection = useCallback((index: number) => {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      });
    }, []);

    // Jump to section (for stats bar)
    useImperativeHandle(ref, () => ({
      jumpToSection: (section: string) => {
        // Find first line of the requested type
        const targetType =
          section === 'identical' ? 'context' : section === 'added' ? 'added' : section;
        const index = unifiedLines.findIndex(
          (line) => line.type === targetType || (section === 'identical' && line.type === 'context')
        );
        if (index >= 0 && containerRef.current) {
          const rows = containerRef.current.querySelectorAll('[data-line-index]');
          const targetRow = Array.from(rows).find(
            (r) => r.getAttribute('data-line-index') === String(index)
          );
          targetRow?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      },
    }));

    // Inline context state
    const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);
    const [inlineContextData, setInlineContextData] = useState<TurnContextData | null>(null);
    const [inlineContextLoading, setInlineContextLoading] = useState(false);
    // Store source ref info for the expanded sentence
    const [expandedTurnHash, setExpandedTurnHash] = useState<string | undefined>();
    const [expandedHighlightStart, setExpandedHighlightStart] = useState<number | undefined>();
    const [expandedHighlightEnd, setExpandedHighlightEnd] = useState<number | undefined>();

    const handleSourceToggle = useCallback(
      async (segmentId: string, sentence: CommitV4Sentence) => {
        if (expandedSegmentId === segmentId) {
          setExpandedSegmentId(null);
          setInlineContextData(null);
          setExpandedTurnHash(undefined);
          setExpandedHighlightStart(undefined);
          setExpandedHighlightEnd(undefined);
          return;
        }

        if (!sentence.source_ref?.turn_hash) return;

        const turnHash = sentence.source_ref.turn_hash;
        const startChar = sentence.source_ref.start_char;
        const endChar = sentence.source_ref.end_char;

        setExpandedSegmentId(segmentId);
        setExpandedTurnHash(turnHash);
        setExpandedHighlightStart(startChar);
        setExpandedHighlightEnd(endChar);
        setInlineContextLoading(true);
        setInlineContextData(null);

        try {
          const data = await api.fetchTurnContextCached(turnHash, {
            before: 2,
            after: 2,
            highlightStart: startChar,
            highlightEnd: endChar,
          });
          setInlineContextData(data);
        } catch {
          setInlineContextData(null);
        } finally {
          setInlineContextLoading(false);
        }
      },
      [expandedSegmentId]
    );

    const handleJumpToConversation = useCallback(
      (conversationId: string) => {
        if (projectId) {
          router.push(`/project/${projectId}/conversation/${conversationId}`);
        }
      },
      [projectId, router]
    );

    // Render a unified line row
    const renderLine = (line: UnifiedLine, index: number) => {
      if (line.type === 'collapsed') {
        if (expandedSections.has(index)) {
          // When expanded, we need to show the actual collapsed content
          // For now, just show the collapse button differently
          return (
            <button
              key={`collapsed-${index}`}
              type="button"
              onClick={() => toggleSection(index)}
              className="w-full grid grid-cols-2 divide-x divide-[var(--stroke-divider)] bg-[var(--surface-app)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
              data-line-index={index}
            >
              <div className="px-3 py-1 text-xs text-[var(--text-tertiary)] flex items-center gap-1">
                <ChevronDown className="h-3 w-3" />
                <span>··· {line.collapsedCount} unchanged (click to collapse) ···</span>
              </div>
              <div className="px-3 py-1 text-xs text-[var(--text-tertiary)] flex items-center gap-1">
                <ChevronDown className="h-3 w-3" />
                <span>··· {line.collapsedCount} unchanged ···</span>
              </div>
            </button>
          );
        }
        return (
          <CollapsedRow
            key={`collapsed-${index}`}
            count={line.collapsedCount || 0}
            onExpand={() => toggleSection(index)}
          />
        );
      }

      const baseId = line.baseSentence?.id;
      const targetId = line.targetSentence?.id;

      return (
        <div key={`line-${index}-${baseId || targetId}`} data-line-index={index}>
          <div className="grid grid-cols-2 divide-x divide-[var(--stroke-divider)]">
            {/* Left (Base) side */}
            {line.type === 'added' ? (
              <div className="bg-[var(--surface-app)] px-3 py-2 min-h-[2.5rem]" />
            ) : (
              <DiffSentenceLine
                text={line.baseSentence?.text || ''}
                type={line.type === 'context' ? 'context' : 'removed'}
                wordDiff={
                  line.type === 'modified'
                    ? line.wordDiff?.filter((seg) => seg.type !== 'added')
                    : undefined
                }
                hasSource={!!line.baseSentence?.source_ref?.turn_hash}
                onSourceClick={() => {
                  if (line.baseSentence) {
                    handleSourceToggle(line.baseSentence.id, line.baseSentence);
                  }
                }}
                expanded={expandedSegmentId === baseId}
                inlineContextData={inlineContextData}
                inlineContextLoading={inlineContextLoading}
                turnHash={expandedSegmentId === baseId ? expandedTurnHash : undefined}
                highlightStart={expandedSegmentId === baseId ? expandedHighlightStart : undefined}
                highlightEnd={expandedSegmentId === baseId ? expandedHighlightEnd : undefined}
                onJumpToConversation={projectId ? handleJumpToConversation : undefined}
              />
            )}

            {/* Right (Target) side */}
            {line.type === 'removed' ? (
              <div className="bg-[var(--surface-app)] px-3 py-2 min-h-[2.5rem]" />
            ) : (
              <DiffSentenceLine
                text={line.targetSentence?.text || ''}
                type={line.type === 'context' ? 'context' : 'added'}
                wordDiff={
                  line.type === 'modified'
                    ? line.wordDiff?.filter((seg) => seg.type !== 'removed')
                    : undefined
                }
                hasSource={!!line.targetSentence?.source_ref?.turn_hash}
                onSourceClick={() => {
                  if (line.targetSentence) {
                    handleSourceToggle(`target-${line.targetSentence.id}`, line.targetSentence);
                  }
                }}
                expanded={expandedSegmentId === `target-${targetId}`}
                inlineContextData={inlineContextData}
                inlineContextLoading={inlineContextLoading}
                turnHash={expandedSegmentId === `target-${targetId}` ? expandedTurnHash : undefined}
                highlightStart={
                  expandedSegmentId === `target-${targetId}` ? expandedHighlightStart : undefined
                }
                highlightEnd={
                  expandedSegmentId === `target-${targetId}` ? expandedHighlightEnd : undefined
                }
                onJumpToConversation={projectId ? handleJumpToConversation : undefined}
              />
            )}
          </div>
        </div>
      );
    };

    return (
      <div className={cn('flex-1 overflow-auto', glass.reading)} ref={containerRef}>
        {/* Column Headers */}
        <div className="grid grid-cols-2 divide-x divide-[var(--stroke-divider)] border-b border-[var(--stroke-divider)] bg-[var(--glass-bg-reading)] sticky top-0 z-10">
          <div className="px-4 py-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-[var(--diff-removed-line)]/40 text-[var(--diff-removed-line)] bg-transparent px-2 py-0.5 text-[10px] font-medium">
              Base (Source)
            </span>
          </div>
          <div className="px-4 py-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-[var(--diff-added-line)]/40 text-[var(--diff-added-line)] bg-transparent px-2 py-0.5 text-[10px] font-medium">
              Target
            </span>
          </div>
        </div>

        {/* Unified diff lines */}
        <div className="divide-y divide-[var(--stroke-divider)]">
          {unifiedLines.map((line, i) => renderLine(line, i))}
        </div>

        {/* Empty state */}
        {segmentDiffs.length === 0 && (
          <EmptyStateInline
            icon={CheckCircle}
            message="Documents are identical -- no differences found between these commits."
            className="py-20"
          />
        )}
      </div>
    );
  }
);
