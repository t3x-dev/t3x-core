'use client';

import { CheckCircle, ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { EmptyStateInline } from '@/components/ui/empty-state';
import type { CommitV4Sentence, TurnContextData } from '@/lib/api';
import * as api from '@/lib/api';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { WordDiffSegment } from '@/types/merge';
import { DiffContextSnippet } from './DiffContextSnippet';
import { DiffSentenceLine } from './DiffSentenceLine';
import { DiffSourceGroupHeader } from './DiffSourceGroupHeader';

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
  /** View mode: split (side-by-side) or unified (single column) */
  viewMode?: 'split' | 'unified';
  /** Show context snippets below changed lines */
  showSnippets?: boolean;
  /** Group sentences by source conversation */
  groupBySource?: boolean;
  /** Map of conversation ID → title from commit-level source_refs */
  sourceRefTitles?: Map<string, string>;
}

export interface DiffSideBySideHandle {
  jumpToSection: (section: string) => void;
  scrollToSource?: (conversationId: string) => void;
}

/** Unified line for Git-like display */
interface UnifiedLine {
  type: 'context' | 'modified' | 'removed' | 'added' | 'collapsed' | 'group-header';
  baseIndex?: number;
  baseSentence?: CommitV4Sentence;
  targetSentence?: CommitV4Sentence;
  wordDiff?: WordDiffSegment[];
  collapsedCount?: number;
  /** Source group header data */
  groupHeader?: {
    conversationId: string;
    title: string | null;
    sentenceCount: number;
    avgConfidence: number;
    isNewSource: boolean;
    type: 'conversation' | 'leaf';
  };
}

// ============================================================================
// Helpers
// ============================================================================

const CONTEXT_LINES = 2;

/**
 * Build unified lines in position order with context folding
 */
function buildUnifiedLines(
  baseSentences: CommitV4Sentence[],
  targetSentences: CommitV4Sentence[],
  segmentDiffs: SegmentDiffItem[]
): UnifiedLine[] {
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

  const rawLines: UnifiedLine[] = [];

  for (let i = 0; i < baseSentences.length; i++) {
    const baseSentence = baseSentences[i];
    const diff = diffByBaseId.get(baseSentence.id);

    if (!diff || diff.diffType === 'same') {
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

  for (const added of addedItems) {
    const targetSentence = targetMap.get(added.segmentId);
    if (targetSentence) {
      rawLines.push({
        type: 'added',
        targetSentence,
      });
    }
  }

  // Context folding
  const showLine = new Array(rawLines.length).fill(false);
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].type !== 'context') {
      showLine[i] = true;
      for (
        let j = Math.max(0, i - CONTEXT_LINES);
        j <= Math.min(rawLines.length - 1, i + CONTEXT_LINES);
        j++
      ) {
        showLine[j] = true;
      }
    }
  }

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

/** Get the effective conversation ID for a line */
function getConversationId(line: UnifiedLine): string | null {
  const sentence = line.targetSentence ?? line.baseSentence;
  return sentence?.source_ref?.conversation_id ?? null;
}

/**
 * Insert source group headers between groups of sentences from different conversations.
 *
 * Two-pass approach:
 * 1. First pass: identify group boundaries and count sentences per segment
 * 2. Second pass: build result with headers showing per-segment counts
 */
function insertGroupHeaders(
  lines: UnifiedLine[],
  baseSentences: CommitV4Sentence[],
  sourceRefTitles?: Map<string, string>
): UnifiedLine[] {
  // Build a set of base conversation IDs to determine "new" sources
  const baseConvIds = new Set<string>();
  for (const s of baseSentences) {
    if (s.source_ref?.conversation_id) {
      baseConvIds.add(s.source_ref.conversation_id);
    }
  }

  // First pass: identify consecutive group segments and count per-segment
  interface GroupSegment {
    convId: string;
    startIdx: number;
    count: number;
    totalConf: number;
  }
  const segments: GroupSegment[] = [];
  let currentSegment: GroupSegment | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.type === 'collapsed') {
      currentSegment = null;
      continue;
    }
    const convId = getConversationId(line);
    if (!convId) {
      currentSegment = null;
      continue;
    }
    if (currentSegment && currentSegment.convId === convId) {
      currentSegment.count++;
      currentSegment.totalConf +=
        line.targetSentence?.confidence ?? line.baseSentence?.confidence ?? 0;
    } else {
      currentSegment = {
        convId,
        startIdx: i,
        count: 1,
        totalConf: line.targetSentence?.confidence ?? line.baseSentence?.confidence ?? 0,
      };
      segments.push(currentSegment);
    }
  }

  // Build lookup: line index → segment info
  const segmentAtLine = new Map<number, GroupSegment>();
  for (const seg of segments) {
    segmentAtLine.set(seg.startIdx, seg);
  }

  // Second pass: build result with headers
  const result: UnifiedLine[] = [];
  let currentConvId: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.type === 'collapsed') {
      result.push(line);
      currentConvId = null;
      continue;
    }

    const convId = getConversationId(line);

    if (convId && convId !== currentConvId) {
      const seg = segmentAtLine.get(i);
      const title = sourceRefTitles?.get(convId) ?? null;
      result.push({
        type: 'group-header',
        groupHeader: {
          conversationId: convId,
          title,
          sentenceCount: seg?.count ?? 1,
          avgConfidence: seg && seg.count > 0 ? seg.totalConf / seg.count : 0,
          isNewSource: !baseConvIds.has(convId),
          type: 'conversation',
        },
      });
      currentConvId = convId;
    } else if (!convId) {
      currentConvId = null;
    }

    result.push(line);
  }

  return result;
}

// ============================================================================
// Sub-components
// ============================================================================

interface CollapsedRowProps {
  count: number;
  onExpand: () => void;
  unified?: boolean;
}

function CollapsedRow({ count, onExpand, unified }: CollapsedRowProps) {
  if (unified) {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="w-full px-3 py-1.5 text-xs text-[var(--text-tertiary)] flex items-center gap-1 bg-[var(--surface-app)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
      >
        <ChevronRight className="h-3 w-3" />
        <span>··· {count} unchanged ···</span>
      </button>
    );
  }

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
  function DiffSideBySide(
    {
      segmentDiffs,
      baseSentences,
      targetSentences,
      projectId,
      viewMode = 'split',
      showSnippets = false,
      groupBySource = false,
      sourceRefTitles,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // Build unified lines
    const rawUnifiedLines = useMemo(
      () => buildUnifiedLines(baseSentences, targetSentences, segmentDiffs),
      [baseSentences, targetSentences, segmentDiffs]
    );

    // Optionally insert group headers
    const unifiedLines = useMemo(() => {
      if (!groupBySource) return rawUnifiedLines;
      return insertGroupHeaders(rawUnifiedLines, baseSentences, sourceRefTitles);
    }, [rawUnifiedLines, groupBySource, baseSentences, sourceRefTitles]);

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
      scrollToSource: (conversationId: string) => {
        if (!containerRef.current) return;
        const groupEl = containerRef.current.querySelector(
          `[data-source-group="${conversationId}"]`
        );
        groupEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }));

    // Inline context state
    const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);
    const [inlineContextData, setInlineContextData] = useState<TurnContextData | null>(null);
    const [inlineContextLoading, setInlineContextLoading] = useState(false);
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

    // Whether a line is a change (not context/collapsed/group-header)
    const isChangeLine = (line: UnifiedLine) =>
      line.type === 'modified' || line.type === 'added' || line.type === 'removed';

    // Render a split (side-by-side) line
    const renderSplitLine = (line: UnifiedLine, index: number) => {
      if (line.type === 'group-header' && line.groupHeader) {
        return (
          <div key={`group-${index}`} data-line-index={index}>
            <DiffSourceGroupHeader
              conversationId={line.groupHeader.conversationId}
              conversationTitle={line.groupHeader.title}
              sentenceCount={line.groupHeader.sentenceCount}
              avgConfidence={line.groupHeader.avgConfidence}
              isNewSource={line.groupHeader.isNewSource}
              projectId={projectId || ''}
              type={line.groupHeader.type}
            />
          </div>
        );
      }

      if (line.type === 'collapsed') {
        if (expandedSections.has(index)) {
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
      const showChange = isChangeLine(line);

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

          {/* Context snippet below changed lines (split mode — spans full width) */}
          {showSnippets && showChange && (
            <div className="grid grid-cols-2 divide-x divide-[var(--stroke-divider)]">
              <div>
                {line.type !== 'added' && line.baseSentence?.source_ref && (
                  <DiffContextSnippet
                    sentence={line.baseSentence}
                    onJumpToConversation={projectId ? handleJumpToConversation : undefined}
                  />
                )}
              </div>
              <div>
                {line.type !== 'removed' && line.targetSentence?.source_ref && (
                  <DiffContextSnippet
                    sentence={line.targetSentence}
                    onJumpToConversation={projectId ? handleJumpToConversation : undefined}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      );
    };

    // Render a unified (single-column) line
    const renderUnifiedLine = (line: UnifiedLine, index: number) => {
      if (line.type === 'group-header' && line.groupHeader) {
        return (
          <div key={`group-${index}`} data-line-index={index}>
            <DiffSourceGroupHeader
              conversationId={line.groupHeader.conversationId}
              conversationTitle={line.groupHeader.title}
              sentenceCount={line.groupHeader.sentenceCount}
              avgConfidence={line.groupHeader.avgConfidence}
              isNewSource={line.groupHeader.isNewSource}
              projectId={projectId || ''}
              type={line.groupHeader.type}
            />
          </div>
        );
      }

      if (line.type === 'collapsed') {
        if (expandedSections.has(index)) {
          return (
            <button
              key={`collapsed-${index}`}
              type="button"
              onClick={() => toggleSection(index)}
              className="w-full px-3 py-1 text-xs text-[var(--text-tertiary)] flex items-center gap-1 bg-[var(--surface-app)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
              data-line-index={index}
            >
              <ChevronDown className="h-3 w-3" />
              <span>··· {line.collapsedCount} unchanged (click to collapse) ···</span>
            </button>
          );
        }
        return (
          <CollapsedRow
            key={`collapsed-${index}`}
            count={line.collapsedCount || 0}
            onExpand={() => toggleSection(index)}
            unified
          />
        );
      }

      const showChange = isChangeLine(line);
      const relevantSentence = line.targetSentence ?? line.baseSentence;

      // For modified lines in unified view, show removed then added
      if (line.type === 'modified') {
        return (
          <div key={`line-${index}`} data-line-index={index}>
            <DiffSentenceLine
              text={line.baseSentence?.text || ''}
              type="removed"
              wordDiff={line.wordDiff?.filter((seg) => seg.type !== 'added')}
              hasSource={!!line.baseSentence?.source_ref?.turn_hash}
              onSourceClick={() => {
                if (line.baseSentence) {
                  handleSourceToggle(line.baseSentence.id, line.baseSentence);
                }
              }}
              expanded={expandedSegmentId === line.baseSentence?.id}
              inlineContextData={inlineContextData}
              inlineContextLoading={inlineContextLoading}
              turnHash={expandedSegmentId === line.baseSentence?.id ? expandedTurnHash : undefined}
              highlightStart={
                expandedSegmentId === line.baseSentence?.id ? expandedHighlightStart : undefined
              }
              highlightEnd={
                expandedSegmentId === line.baseSentence?.id ? expandedHighlightEnd : undefined
              }
              onJumpToConversation={projectId ? handleJumpToConversation : undefined}
            />
            <DiffSentenceLine
              text={line.targetSentence?.text || ''}
              type="added"
              wordDiff={line.wordDiff?.filter((seg) => seg.type !== 'removed')}
              hasSource={!!line.targetSentence?.source_ref?.turn_hash}
              onSourceClick={() => {
                if (line.targetSentence) {
                  handleSourceToggle(`target-${line.targetSentence.id}`, line.targetSentence);
                }
              }}
              expanded={expandedSegmentId === `target-${line.targetSentence?.id}`}
              inlineContextData={inlineContextData}
              inlineContextLoading={inlineContextLoading}
              turnHash={
                expandedSegmentId === `target-${line.targetSentence?.id}`
                  ? expandedTurnHash
                  : undefined
              }
              highlightStart={
                expandedSegmentId === `target-${line.targetSentence?.id}`
                  ? expandedHighlightStart
                  : undefined
              }
              highlightEnd={
                expandedSegmentId === `target-${line.targetSentence?.id}`
                  ? expandedHighlightEnd
                  : undefined
              }
              onJumpToConversation={projectId ? handleJumpToConversation : undefined}
            />
            {showSnippets && line.targetSentence?.source_ref && (
              <DiffContextSnippet
                sentence={line.targetSentence}
                onJumpToConversation={projectId ? handleJumpToConversation : undefined}
              />
            )}
          </div>
        );
      }

      // Single line (context, added, removed)
      return (
        <div key={`line-${index}`} data-line-index={index}>
          <DiffSentenceLine
            text={relevantSentence?.text || ''}
            type={line.type === 'context' ? 'context' : line.type === 'added' ? 'added' : 'removed'}
            hasSource={!!relevantSentence?.source_ref?.turn_hash}
            onSourceClick={() => {
              if (relevantSentence) {
                const id =
                  line.type === 'added' ? `target-${relevantSentence.id}` : relevantSentence.id;
                handleSourceToggle(id, relevantSentence);
              }
            }}
            expanded={
              expandedSegmentId ===
              (line.type === 'added' ? `target-${relevantSentence?.id}` : relevantSentence?.id)
            }
            inlineContextData={inlineContextData}
            inlineContextLoading={inlineContextLoading}
            turnHash={
              expandedSegmentId ===
              (line.type === 'added' ? `target-${relevantSentence?.id}` : relevantSentence?.id)
                ? expandedTurnHash
                : undefined
            }
            highlightStart={
              expandedSegmentId ===
              (line.type === 'added' ? `target-${relevantSentence?.id}` : relevantSentence?.id)
                ? expandedHighlightStart
                : undefined
            }
            highlightEnd={
              expandedSegmentId ===
              (line.type === 'added' ? `target-${relevantSentence?.id}` : relevantSentence?.id)
                ? expandedHighlightEnd
                : undefined
            }
            onJumpToConversation={projectId ? handleJumpToConversation : undefined}
          />
          {showSnippets && showChange && relevantSentence?.source_ref && (
            <DiffContextSnippet
              sentence={relevantSentence}
              onJumpToConversation={projectId ? handleJumpToConversation : undefined}
            />
          )}
        </div>
      );
    };

    const isUnified = viewMode === 'unified';

    return (
      <div className={cn('flex-1 overflow-auto', glass.reading)} ref={containerRef}>
        {/* Column Headers */}
        {isUnified ? (
          <div className="px-4 py-2 flex items-center gap-2 border-b border-[var(--stroke-divider)] bg-[var(--glass-bg-reading)] sticky top-0 z-10">
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--diff-removed-line)]/40 text-[var(--diff-removed-line)] bg-transparent px-2 py-0.5 text-[10px] font-medium">
              <Minus className="h-2.5 w-2.5" />
              Removed
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--diff-added-line)]/40 text-[var(--diff-added-line)] bg-transparent px-2 py-0.5 text-[10px] font-medium">
              <Plus className="h-2.5 w-2.5" />
              Added
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-[var(--stroke-divider)] border-b border-[var(--stroke-divider)] bg-[var(--glass-bg-reading)] sticky top-0 z-10">
            <div className="px-4 py-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--diff-removed-line)]/40 text-[var(--diff-removed-line)] bg-transparent px-2 py-0.5 text-[10px] font-medium">
                <Minus className="h-2.5 w-2.5" />
                Base (Source)
              </span>
            </div>
            <div className="px-4 py-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--diff-added-line)]/40 text-[var(--diff-added-line)] bg-transparent px-2 py-0.5 text-[10px] font-medium">
                <Plus className="h-2.5 w-2.5" />
                Target
              </span>
            </div>
          </div>
        )}

        {/* Diff lines */}
        <div className="divide-y divide-[var(--stroke-divider)]">
          {unifiedLines.map((line, i) =>
            isUnified ? renderUnifiedLine(line, i) : renderSplitLine(line, i)
          )}
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
