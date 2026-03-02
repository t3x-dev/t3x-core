'use client';

import { CheckCircle, Minus, Plus } from 'lucide-react';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { EmptyStateInline } from '@/components/ui/empty-state';
import type { CommitV4Sentence, TurnContextData } from '@/lib/api';
import * as api from '@/lib/api';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { WordDiffSegment } from '@/types/merge';
import { DiffContextSnippet } from './DiffContextSnippet';
import { DiffHunkHeader } from './DiffHunkHeader';
import { DiffSentenceLine } from './DiffSentenceLine';
import { DiffSourceContextModal } from './DiffSourceContextModal';
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
  /** Column label for base side (e.g., "main @ abc123") */
  baseLabel?: string;
  /** Column label for target side (e.g., "feature/pricing @ def456") */
  targetLabel?: string;
}

export interface DiffSideBySideHandle {
  jumpToSection: (section: string) => void;
  scrollToSource?: (conversationId: string) => void;
}

/** Unified line for Git-like display */
interface UnifiedLine {
  type: 'context' | 'modified' | 'removed' | 'added' | 'collapsed' | 'group-header';
  baseIndex?: number;
  targetIndex?: number;
  baseSentence?: CommitV4Sentence;
  targetSentence?: CommitV4Sentence;
  wordDiff?: WordDiffSegment[];
  collapsedCount?: number;
  /** Collapse range for hunk header display */
  collapseBaseStart?: number;
  collapseBaseEnd?: number;
  collapseTargetStart?: number;
  collapseTargetEnd?: number;
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

const CONTEXT_LINES = 3;

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

  // Build target position map: sentenceId → index in targetSentences
  const targetPositionMap = new Map<string, number>();
  for (let i = 0; i < targetSentences.length; i++) {
    targetPositionMap.set(targetSentences[i].id, i);
  }

  const rawLines: UnifiedLine[] = [];

  for (let i = 0; i < baseSentences.length; i++) {
    const baseSentence = baseSentences[i];
    const diff = diffByBaseId.get(baseSentence.id);

    if (!diff || diff.diffType === 'same') {
      rawLines.push({
        type: 'context',
        baseIndex: i,
        targetIndex: targetPositionMap.get(baseSentence.id),
        baseSentence,
        targetSentence: baseSentence,
      });
    } else if (diff.diffType === 'modified') {
      rawLines.push({
        type: 'modified',
        baseIndex: i,
        targetIndex: diff.matchedSegmentId
          ? targetPositionMap.get(diff.matchedSegmentId)
          : undefined,
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
        targetIndex: targetPositionMap.get(added.segmentId),
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
  let collapseStart = -1;

  for (let i = 0; i < rawLines.length; i++) {
    if (showLine[i]) {
      if (collapseStart >= 0) {
        const collapseEnd = i - 1;
        const count = collapseEnd - collapseStart + 1;
        finalLines.push({
          type: 'collapsed',
          collapsedCount: count,
          collapseBaseStart: rawLines[collapseStart].baseIndex,
          collapseBaseEnd: rawLines[collapseEnd].baseIndex,
          collapseTargetStart: rawLines[collapseStart].targetIndex,
          collapseTargetEnd: rawLines[collapseEnd].targetIndex,
        });
        collapseStart = -1;
      }
      finalLines.push(rawLines[i]);
    } else {
      if (collapseStart < 0) collapseStart = i;
    }
  }

  if (collapseStart >= 0) {
    const collapseEnd = rawLines.length - 1;
    const count = collapseEnd - collapseStart + 1;
    finalLines.push({
      type: 'collapsed',
      collapsedCount: count,
      collapseBaseStart: rawLines[collapseStart].baseIndex,
      collapseBaseEnd: rawLines[collapseEnd].baseIndex,
      collapseTargetStart: rawLines[collapseStart].targetIndex,
      collapseTargetEnd: rawLines[collapseEnd].targetIndex,
    });
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
// Helpers – hunk range formatting
// ============================================================================

/** Format a hunk range string like "3,5" (1-based start, count) */
function formatHunkRange(
  startIdx: number | undefined,
  endIdx: number | undefined
): string | undefined {
  if (startIdx == null || endIdx == null) return undefined;
  const start = startIdx + 1; // 1-based
  const count = endIdx - startIdx + 1;
  return `${start},${count}`;
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
      baseLabel,
      targetLabel,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);

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
    const [expandedWordDiff, setExpandedWordDiff] = useState<WordDiffSegment[] | undefined>();

    const handleSourceToggle = useCallback(
      async (segmentId: string, sentence: CommitV4Sentence, lineWordDiff?: WordDiffSegment[]) => {
        if (expandedSegmentId === segmentId) {
          setExpandedSegmentId(null);
          setInlineContextData(null);
          setExpandedTurnHash(undefined);
          setExpandedHighlightStart(undefined);
          setExpandedHighlightEnd(undefined);
          setExpandedWordDiff(undefined);
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
        setExpandedWordDiff(lineWordDiff);
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

    // Context modal state
    const [contextModal, setContextModal] = useState<{
      open: boolean;
      conversationId: string;
      turnHash: string;
      highlightStart?: number;
      highlightEnd?: number;
      wordDiff?: WordDiffSegment[];
    } | null>(null);
    const [modalContextData, setModalContextData] = useState<TurnContextData | null>(null);
    const [modalLoading, setModalLoading] = useState(false);

    const openContextModal = useCallback(
      (conversationId: string, turnHash: string, hStart?: number, hEnd?: number, wDiff?: WordDiffSegment[]) => {
        setContextModal({ open: true, conversationId, turnHash, highlightStart: hStart, highlightEnd: hEnd, wordDiff: wDiff });
        setModalLoading(true);
        setModalContextData(null);

        api.fetchTurnContextCached(turnHash, {
          before: 5,
          after: 5,
          highlightStart: hStart,
          highlightEnd: hEnd,
        })
          .then((data) => setModalContextData(data))
          .catch(() => setModalContextData(null))
          .finally(() => setModalLoading(false));
      },
      []
    );

    const closeContextModal = useCallback(() => {
      setContextModal(null);
      setModalContextData(null);
    }, []);

    /** Create a jump handler that opens the context modal with source_ref info */
    const makeJumpHandler = useCallback(
      (sentence: CommitV4Sentence | undefined, lineWordDiff?: WordDiffSegment[]) => {
        if (!projectId || !sentence?.source_ref?.conversation_id) return undefined;
        return (conversationId: string) => {
          const ref = sentence.source_ref;
          openContextModal(
            conversationId,
            ref?.turn_hash || '',
            ref?.start_char,
            ref?.end_char,
            lineWordDiff
          );
        };
      },
      [projectId, openContextModal]
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
        return (
          <div key={`collapsed-${index}`} data-line-index={index}>
            <DiffHunkHeader
              baseRange={formatHunkRange(line.collapseBaseStart, line.collapseBaseEnd)}
              targetRange={formatHunkRange(line.collapseTargetStart, line.collapseTargetEnd)}
              label={`··· ${line.collapsedCount} unchanged ···`}
              onToggle={() => toggleSection(index)}
              isExpanded={expandedSections.has(index)}
            />
          </div>
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
                lineNumber={line.baseIndex != null ? line.baseIndex + 1 : undefined}
                wordDiff={
                  line.type === 'modified'
                    ? line.wordDiff?.filter((seg) => seg.type !== 'added')
                    : undefined
                }
                hasSource={!!line.baseSentence?.source_ref?.turn_hash}
                onSourceClick={() => {
                  if (line.baseSentence) {
                    const wd = line.type === 'modified' ? line.wordDiff?.filter((seg) => seg.type !== 'added') : undefined;
                    handleSourceToggle(line.baseSentence.id, line.baseSentence, wd);
                  }
                }}
                expanded={expandedSegmentId === baseId}
                inlineContextData={inlineContextData}
                inlineContextLoading={inlineContextLoading}
                turnHash={expandedSegmentId === baseId ? expandedTurnHash : undefined}
                highlightStart={expandedSegmentId === baseId ? expandedHighlightStart : undefined}
                highlightEnd={expandedSegmentId === baseId ? expandedHighlightEnd : undefined}
                onJumpToConversation={makeJumpHandler(line.baseSentence, line.type === 'modified' ? line.wordDiff?.filter((seg) => seg.type !== 'added') : undefined)}
              />
            )}

            {/* Right (Target) side */}
            {line.type === 'removed' ? (
              <div className="bg-[var(--surface-app)] px-3 py-2 min-h-[2.5rem]" />
            ) : (
              <DiffSentenceLine
                text={line.targetSentence?.text || ''}
                type={line.type === 'context' ? 'context' : 'added'}
                lineNumber={line.targetIndex != null ? line.targetIndex + 1 : undefined}
                wordDiff={
                  line.type === 'modified'
                    ? line.wordDiff?.filter((seg) => seg.type !== 'removed')
                    : undefined
                }
                hasSource={!!line.targetSentence?.source_ref?.turn_hash}
                onSourceClick={() => {
                  if (line.targetSentence) {
                    const wd = line.type === 'modified' ? line.wordDiff?.filter((seg) => seg.type !== 'removed') : undefined;
                    handleSourceToggle(`target-${line.targetSentence.id}`, line.targetSentence, wd);
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
                onJumpToConversation={makeJumpHandler(line.targetSentence, line.type === 'modified' ? line.wordDiff?.filter((seg) => seg.type !== 'removed') : undefined)}
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
                    onJumpToConversation={makeJumpHandler(line.baseSentence)}
                  />
                )}
              </div>
              <div>
                {line.type !== 'removed' && line.targetSentence?.source_ref && (
                  <DiffContextSnippet
                    sentence={line.targetSentence}
                    onJumpToConversation={makeJumpHandler(line.targetSentence)}
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
        return (
          <div key={`collapsed-${index}`} data-line-index={index}>
            <DiffHunkHeader
              baseRange={formatHunkRange(line.collapseBaseStart, line.collapseBaseEnd)}
              targetRange={formatHunkRange(line.collapseTargetStart, line.collapseTargetEnd)}
              label={`··· ${line.collapsedCount} unchanged ···`}
              onToggle={() => toggleSection(index)}
              isExpanded={expandedSections.has(index)}
            />
          </div>
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
              baseLineNumber={line.baseIndex != null ? line.baseIndex + 1 : undefined}
              wordDiff={line.wordDiff?.filter((seg) => seg.type !== 'added')}
              hasSource={!!line.baseSentence?.source_ref?.turn_hash}
              onSourceClick={() => {
                if (line.baseSentence) {
                  handleSourceToggle(line.baseSentence.id, line.baseSentence, line.wordDiff?.filter((seg) => seg.type !== 'added'));
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
              onJumpToConversation={makeJumpHandler(line.baseSentence, line.wordDiff?.filter((seg) => seg.type !== 'added'))}
            />
            <DiffSentenceLine
              text={line.targetSentence?.text || ''}
              type="added"
              targetLineNumber={line.targetIndex != null ? line.targetIndex + 1 : undefined}
              wordDiff={line.wordDiff?.filter((seg) => seg.type !== 'removed')}
              hasSource={!!line.targetSentence?.source_ref?.turn_hash}
              onSourceClick={() => {
                if (line.targetSentence) {
                  handleSourceToggle(`target-${line.targetSentence.id}`, line.targetSentence, line.wordDiff?.filter((seg) => seg.type !== 'removed'));
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
              onJumpToConversation={makeJumpHandler(line.targetSentence, line.wordDiff?.filter((seg) => seg.type !== 'removed'))}
            />
            {showSnippets && line.targetSentence?.source_ref && (
              <DiffContextSnippet
                sentence={line.targetSentence}
                onJumpToConversation={makeJumpHandler(line.targetSentence)}
              />
            )}
          </div>
        );
      }

      // Single line (context, added, removed)
      // Dual gutters: base # on left, target # on right
      const baseNum =
        line.type !== 'added' && line.baseIndex != null ? line.baseIndex + 1 : undefined;
      const targetNum =
        line.type !== 'removed' && line.targetIndex != null ? line.targetIndex + 1 : undefined;

      return (
        <div key={`line-${index}`} data-line-index={index}>
          <DiffSentenceLine
            text={relevantSentence?.text || ''}
            type={line.type === 'context' ? 'context' : line.type === 'added' ? 'added' : 'removed'}
            baseLineNumber={baseNum}
            targetLineNumber={targetNum}
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
            onJumpToConversation={makeJumpHandler(relevantSentence)}
          />
          {showSnippets && showChange && relevantSentence?.source_ref && (
            <DiffContextSnippet
              sentence={relevantSentence}
              onJumpToConversation={makeJumpHandler(relevantSentence)}
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
            <span className="text-[10px] font-mono text-[var(--text-tertiary)]/50 w-8 text-right shrink-0" title="Base line">
              {baseLabel || 'Base'}
            </span>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)]/50 w-8 text-right shrink-0" title="Target line">
              {targetLabel || 'Target'}
            </span>
            <span className="w-4 shrink-0" />
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
            <div className="px-4 py-2 flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]/50 w-8 text-right shrink-0">
                #
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--diff-removed-line)]/40 text-[var(--diff-removed-line)] bg-transparent px-2 py-0.5 text-[10px] font-medium shrink-0">
                <Minus className="h-2.5 w-2.5" />
                Base
              </span>
              {baseLabel && (
                <span className="text-xs text-[var(--text-secondary)] font-medium truncate">
                  {baseLabel}
                </span>
              )}
            </div>
            <div className="px-4 py-2 flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]/50 w-8 text-right shrink-0">
                #
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--diff-added-line)]/40 text-[var(--diff-added-line)] bg-transparent px-2 py-0.5 text-[10px] font-medium shrink-0">
                <Plus className="h-2.5 w-2.5" />
                Target
              </span>
              {targetLabel && (
                <span className="text-xs text-[var(--text-secondary)] font-medium truncate">
                  {targetLabel}
                </span>
              )}
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

        {/* Source context modal */}
        <DiffSourceContextModal
          open={!!contextModal?.open}
          sentence={null}
          data={modalContextData}
          loading={modalLoading}
          onClose={closeContextModal}
          projectId={projectId}
          conversationId={contextModal?.conversationId}
          turnHash={contextModal?.turnHash}
          highlightStart={contextModal?.highlightStart}
          highlightEnd={contextModal?.highlightEnd}
          wordDiff={contextModal?.wordDiff}
        />
      </div>
    );
  }
);
