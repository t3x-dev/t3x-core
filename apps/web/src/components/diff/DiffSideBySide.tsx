'use client';

import { Check, CheckCircle, FileText, MapPin, Minus, Plus } from 'lucide-react';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { WordDiffDisplay } from '@/components/merge/WordDiffDisplay';
import { SourceContextView } from '@/components/shared/SourceContextView';
import { EmptyStateInline } from '@/components/ui/empty-state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CommitSentence, TurnContextData } from '@/lib/api';
import * as api from '@/lib/api';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { WordDiffSegment } from '@/types/merge';
import type { InlineContextState, SegmentDiffItem, UnifiedLine } from './DiffBuilders';
import {
  buildDocumentLines,
  buildUnifiedLines,
  formatHunkRange,
  insertGroupHeaders,
} from './DiffBuilders';
import { DiffContextSnippet } from './DiffContextSnippet';
import { DiffHunkHeader } from './DiffHunkHeader';
import { DiffSentenceLine } from './DiffSentenceLine';
import { DiffSourceContextModal } from './DiffSourceContextModal';
import { DiffSourceGroupHeader } from './DiffSourceGroupHeader';

// ============================================================================
// Props
// ============================================================================

interface DiffSideBySideProps {
  segmentDiffs: SegmentDiffItem[];
  baseSentences: CommitSentence[];
  targetSentences: CommitSentence[];
  projectId?: string;
  /** View mode: split (side-by-side), unified (single column), or document (readable) */
  viewMode?: 'split' | 'unified' | 'document';
  /** Show context snippets below changed lines */
  showSnippets?: boolean;
  /** Group sentences by source conversation */
  groupBySource?: boolean;
  /** Map of conversation ID -> title from commit-level source_refs */
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
    const isDocument = viewMode === 'document';

    // Build lines based on view mode
    const rawUnifiedLines = useMemo(
      () =>
        isDocument
          ? buildDocumentLines(baseSentences, targetSentences, segmentDiffs)
          : buildUnifiedLines(baseSentences, targetSentences, segmentDiffs),
      [baseSentences, targetSentences, segmentDiffs, isDocument]
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

    // --- 3.2: Multiple simultaneous source context panels ---
    const [expandedSegmentIds, setExpandedSegmentIds] = useState<Set<string>>(new Set());
    const [inlineContextMap, setInlineContextMap] = useState<Map<string, InlineContextState>>(
      new Map()
    );

    const handleSourceToggle = useCallback(
      async (segmentId: string, sentence: CommitSentence, lineWordDiff?: WordDiffSegment[]) => {
        // Use updater form to avoid stale closure over expandedSegmentIds
        let wasExpanded = false;
        setExpandedSegmentIds((prev) => {
          wasExpanded = prev.has(segmentId);
          if (wasExpanded) {
            const next = new Set(prev);
            next.delete(segmentId);
            return next;
          }
          return new Set([...prev, segmentId]);
        });

        if (wasExpanded) {
          setInlineContextMap((prev) => {
            const next = new Map(prev);
            next.delete(segmentId);
            return next;
          });
          return;
        }

        if (!sentence.source_ref?.turn_hash) return;

        const turnHash = sentence.source_ref.turn_hash;
        const startChar = sentence.source_ref.start_char;
        const endChar = sentence.source_ref.end_char;

        // Set loading state in map
        setInlineContextMap((prev) => {
          const next = new Map(prev);
          next.set(segmentId, {
            data: null,
            loading: true,
            turnHash,
            highlightStart: startChar,
            highlightEnd: endChar,
            wordDiff: lineWordDiff,
          });
          return next;
        });

        try {
          const data = await api.fetchTurnContextCached(turnHash, {
            before: 2,
            after: 2,
            highlightStart: startChar,
            highlightEnd: endChar,
          });
          setInlineContextMap((prev) => {
            const next = new Map(prev);
            const existing = next.get(segmentId);
            if (existing) {
              next.set(segmentId, { ...existing, data, loading: false });
            }
            return next;
          });
        } catch {
          setInlineContextMap((prev) => {
            const next = new Map(prev);
            const existing = next.get(segmentId);
            if (existing) {
              next.set(segmentId, { ...existing, data: null, loading: false });
            }
            return next;
          });
        }
      },
      []
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
      (
        conversationId: string,
        turnHash: string,
        hStart?: number,
        hEnd?: number,
        wDiff?: WordDiffSegment[]
      ) => {
        setContextModal({
          open: true,
          conversationId,
          turnHash,
          highlightStart: hStart,
          highlightEnd: hEnd,
          wordDiff: wDiff,
        });
        setModalLoading(true);
        setModalContextData(null);

        api
          .fetchTurnContextCached(turnHash, {
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
      (sentence: CommitSentence | undefined, lineWordDiff?: WordDiffSegment[]) => {
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

    // --- 3.2 Helper: get inline context props for a segment ---
    const getInlineProps = useCallback(
      (segmentId: string | undefined) => {
        if (!segmentId) {
          return {
            expanded: false,
            inlineContextData: null as TurnContextData | null,
            inlineContextLoading: false,
            turnHash: undefined as string | undefined,
            highlightStart: undefined as number | undefined,
            highlightEnd: undefined as number | undefined,
          };
        }
        const isExpanded = expandedSegmentIds.has(segmentId);
        const ctx = inlineContextMap.get(segmentId);
        return {
          expanded: isExpanded,
          inlineContextData: ctx?.data ?? null,
          inlineContextLoading: ctx?.loading ?? false,
          turnHash: isExpanded ? ctx?.turnHash : undefined,
          highlightStart: isExpanded ? ctx?.highlightStart : undefined,
          highlightEnd: isExpanded ? ctx?.highlightEnd : undefined,
        };
      },
      [expandedSegmentIds, inlineContextMap]
    );

    /** Get the source conversation title for a sentence */
    const getSourceTitle = useCallback(
      (sentence: CommitSentence | undefined): string | undefined => {
        const convId = sentence?.source_ref?.conversation_id;
        if (!convId) return undefined;
        return sourceRefTitles?.get(convId) ?? undefined;
      },
      [sourceRefTitles]
    );

    // Whether a line is a change (not context/collapsed/group-header)
    const isChangeLine = (line: UnifiedLine) =>
      line.type === 'modified' || line.type === 'added' || line.type === 'removed';

    // ========================================================================
    // Render: Split (side-by-side) line
    // ========================================================================

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
        const isExpanded = expandedSections.has(index);
        return (
          <div key={`collapsed-${index}`} data-line-index={index}>
            <DiffHunkHeader
              baseRange={formatHunkRange(line.collapseBaseStart, line.collapseBaseEnd)}
              targetRange={formatHunkRange(line.collapseTargetStart, line.collapseTargetEnd)}
              label={`\u00b7\u00b7\u00b7 ${line.collapsedCount} unchanged \u00b7\u00b7\u00b7`}
              onToggle={() => toggleSection(index)}
              isExpanded={isExpanded}
            />
            {isExpanded &&
              line.collapsedLines?.map((cLine, ci) => {
                const cBaseId = cLine.baseSentence?.id;
                const cTargetId = cLine.targetSentence?.id;
                return (
                  <div
                    key={`expanded-${index}-${ci}-${cBaseId || cTargetId}`}
                    data-segment-id={cBaseId || cTargetId}
                  >
                    <div className="grid grid-cols-2 divide-x divide-[var(--stroke-divider)]">
                      <DiffSentenceLine
                        text={cLine.baseSentence?.text || ''}
                        type="context"
                        lineNumber={cLine.baseIndex != null ? cLine.baseIndex + 1 : undefined}
                        hasSource={!!cLine.baseSentence?.source_ref?.turn_hash}
                        onSourceClick={() => {
                          if (cLine.baseSentence) {
                            handleSourceToggle(cLine.baseSentence.id, cLine.baseSentence);
                          }
                        }}
                        sourceTitle={getSourceTitle(cLine.baseSentence)}
                      />
                      <DiffSentenceLine
                        text={cLine.targetSentence?.text || ''}
                        type="context"
                        lineNumber={cLine.targetIndex != null ? cLine.targetIndex + 1 : undefined}
                        hasSource={!!cLine.targetSentence?.source_ref?.turn_hash}
                        onSourceClick={() => {
                          if (cLine.targetSentence) {
                            handleSourceToggle(
                              `target-${cLine.targetSentence.id}`,
                              cLine.targetSentence
                            );
                          }
                        }}
                        sourceTitle={getSourceTitle(cLine.targetSentence)}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        );
      }

      const baseId = line.baseSentence?.id;
      const targetId = line.targetSentence?.id;
      const showChange = isChangeLine(line);
      const baseSegId = baseId;
      const targetSegId = targetId ? `target-${targetId}` : undefined;
      const baseInline = getInlineProps(baseSegId);
      const targetInline = getInlineProps(targetSegId);

      return (
        <div
          key={`line-${index}-${baseId || targetId}`}
          data-line-index={index}
          data-segment-id={baseId || targetId}
        >
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
                    const wd =
                      line.type === 'modified'
                        ? line.wordDiff?.filter((seg) => seg.type !== 'added')
                        : undefined;
                    handleSourceToggle(line.baseSentence.id, line.baseSentence, wd);
                  }
                }}
                sourceTitle={getSourceTitle(line.baseSentence)}
                {...baseInline}
                onJumpToConversation={makeJumpHandler(
                  line.baseSentence,
                  line.type === 'modified'
                    ? line.wordDiff?.filter((seg) => seg.type !== 'added')
                    : undefined
                )}
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
                    const wd =
                      line.type === 'modified'
                        ? line.wordDiff?.filter((seg) => seg.type !== 'removed')
                        : undefined;
                    handleSourceToggle(`target-${line.targetSentence.id}`, line.targetSentence, wd);
                  }
                }}
                sourceTitle={getSourceTitle(line.targetSentence)}
                {...targetInline}
                onJumpToConversation={makeJumpHandler(
                  line.targetSentence,
                  line.type === 'modified'
                    ? line.wordDiff?.filter((seg) => seg.type !== 'removed')
                    : undefined
                )}
              />
            )}
          </div>

          {/* Context snippet below changed lines (split mode -- spans full width) */}
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

    // ========================================================================
    // Render: Unified (single-column) line
    // ========================================================================

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
        const isExpanded = expandedSections.has(index);
        return (
          <div key={`collapsed-${index}`} data-line-index={index}>
            <DiffHunkHeader
              baseRange={formatHunkRange(line.collapseBaseStart, line.collapseBaseEnd)}
              targetRange={formatHunkRange(line.collapseTargetStart, line.collapseTargetEnd)}
              label={`\u00b7\u00b7\u00b7 ${line.collapsedCount} unchanged \u00b7\u00b7\u00b7`}
              onToggle={() => toggleSection(index)}
              isExpanded={isExpanded}
            />
            {isExpanded &&
              line.collapsedLines?.map((cLine, ci) => {
                const cSentence = cLine.targetSentence ?? cLine.baseSentence;
                const cBaseNum = cLine.baseIndex != null ? cLine.baseIndex + 1 : undefined;
                const cTargetNum = cLine.targetIndex != null ? cLine.targetIndex + 1 : undefined;
                return (
                  <div
                    key={`expanded-${index}-${ci}-${cSentence?.id}`}
                    data-segment-id={cSentence?.id}
                  >
                    <DiffSentenceLine
                      text={cSentence?.text || ''}
                      type="context"
                      baseLineNumber={cBaseNum}
                      targetLineNumber={cTargetNum}
                      hasSource={!!cSentence?.source_ref?.turn_hash}
                      onSourceClick={() => {
                        if (cSentence) {
                          handleSourceToggle(cSentence.id, cSentence);
                        }
                      }}
                      sourceTitle={getSourceTitle(cSentence)}
                    />
                  </div>
                );
              })}
          </div>
        );
      }

      const showChange = isChangeLine(line);
      const relevantSentence = line.targetSentence ?? line.baseSentence;

      // For modified lines in unified view, show removed then added
      if (line.type === 'modified') {
        const baseSegId = line.baseSentence?.id;
        const targetSegId = line.targetSentence ? `target-${line.targetSentence.id}` : undefined;
        const baseInline = getInlineProps(baseSegId);
        const targetInline = getInlineProps(targetSegId);

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
                  handleSourceToggle(
                    line.baseSentence.id,
                    line.baseSentence,
                    line.wordDiff?.filter((seg) => seg.type !== 'added')
                  );
                }
              }}
              sourceTitle={getSourceTitle(line.baseSentence)}
              {...baseInline}
              onJumpToConversation={makeJumpHandler(
                line.baseSentence,
                line.wordDiff?.filter((seg) => seg.type !== 'added')
              )}
            />
            <DiffSentenceLine
              text={line.targetSentence?.text || ''}
              type="added"
              targetLineNumber={line.targetIndex != null ? line.targetIndex + 1 : undefined}
              wordDiff={line.wordDiff?.filter((seg) => seg.type !== 'removed')}
              hasSource={!!line.targetSentence?.source_ref?.turn_hash}
              onSourceClick={() => {
                if (line.targetSentence) {
                  handleSourceToggle(
                    `target-${line.targetSentence.id}`,
                    line.targetSentence,
                    line.wordDiff?.filter((seg) => seg.type !== 'removed')
                  );
                }
              }}
              sourceTitle={getSourceTitle(line.targetSentence)}
              {...targetInline}
              onJumpToConversation={makeJumpHandler(
                line.targetSentence,
                line.wordDiff?.filter((seg) => seg.type !== 'removed')
              )}
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
      const segId = line.type === 'added' ? `target-${relevantSentence?.id}` : relevantSentence?.id;
      const inlineProps = getInlineProps(segId);
      const baseNum =
        line.type !== 'added' && line.baseIndex != null ? line.baseIndex + 1 : undefined;
      const targetNum =
        line.type !== 'removed' && line.targetIndex != null ? line.targetIndex + 1 : undefined;

      return (
        <div key={`line-${index}`} data-line-index={index} data-segment-id={relevantSentence?.id}>
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
            sourceTitle={getSourceTitle(relevantSentence)}
            {...inlineProps}
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

    // ========================================================================
    // Render: Document (readable) line
    // ========================================================================

    /** Track where the "removed" section starts in document view.
     *  If a group-header immediately precedes the first removed line,
     *  the divider should appear before that header. */
    const firstRemovedIndex = useMemo(() => {
      if (!isDocument) return -1;
      const rawIdx = unifiedLines.findIndex((l) => l.type === 'removed');
      if (rawIdx <= 0) return rawIdx;
      // Move divider before the preceding group-header if any
      if (unifiedLines[rawIdx - 1]?.type === 'group-header') {
        return rawIdx - 1;
      }
      return rawIdx;
    }, [unifiedLines, isDocument]);

    const renderDocumentLine = (line: UnifiedLine, index: number) => {
      if (line.type === 'group-header' && line.groupHeader) {
        const showDividerBeforeHeader = index === firstRemovedIndex;
        return (
          <div key={`group-${index}`} data-line-index={index}>
            {showDividerBeforeHeader && (
              <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--stroke-divider)]">
                <div className="h-px flex-1 bg-[var(--diff-removed-line)]/20" />
                <span className="text-[10px] font-medium text-[var(--diff-removed-accent)]">
                  Removed sentences
                </span>
                <div className="h-px flex-1 bg-[var(--diff-removed-line)]/20" />
              </div>
            )}
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

      // Document view doesn't use collapsed sections
      if (line.type === 'collapsed') return null;

      const sentence = line.targetSentence ?? line.baseSentence;
      if (!sentence) return null;

      const segId =
        line.type === 'added' || line.type === 'modified' || line.type === 'context'
          ? line.targetSentence
            ? `target-${line.targetSentence.id}`
            : line.baseSentence?.id
          : line.baseSentence?.id;
      const inlineProps = getInlineProps(segId);

      // Status badge styles
      const statusConfig = {
        context: {
          border: 'border-transparent',
          bg: 'bg-[var(--surface-app)]',
          badge: (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--text-tertiary)] border border-[var(--stroke-divider)]">
              <Check className="h-2.5 w-2.5" />
              Unchanged
            </span>
          ),
        },
        modified: {
          border: 'border-[var(--diff-modified-line)]',
          bg: 'bg-[var(--diff-modified-bg)]',
          badge: (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--diff-modified-accent)] border border-[var(--diff-modified-line)]/30">
              Modified
            </span>
          ),
        },
        added: {
          border: 'border-[var(--diff-added-line)]',
          bg: 'bg-[var(--diff-added-bg)]',
          badge: (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--diff-added-accent)] border border-[var(--diff-added-line)]/30">
              <Plus className="h-2.5 w-2.5" />
              New
            </span>
          ),
        },
        removed: {
          border: 'border-[var(--diff-removed-line)]',
          bg: 'bg-[var(--diff-removed-bg)]',
          badge: (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--diff-removed-accent)] border border-[var(--diff-removed-line)]/30">
              <Minus className="h-2.5 w-2.5" />
              Removed
            </span>
          ),
        },
      };

      const lineType = line.type as keyof typeof statusConfig;
      const config = statusConfig[lineType] ?? statusConfig.context;

      // Render removed divider before first removed line
      // (only if a group-header didn't already show it)
      const showRemovedDivider = line.type === 'removed' && index === firstRemovedIndex;

      return (
        <div
          key={`doc-${index}-${sentence.id}`}
          data-line-index={index}
          data-segment-id={sentence.id}
        >
          {showRemovedDivider && (
            <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--stroke-divider)]">
              <div className="h-px flex-1 bg-[var(--diff-removed-line)]/20" />
              <span className="text-[10px] font-medium text-[var(--diff-removed-accent)]">
                Removed sentences
              </span>
              <div className="h-px flex-1 bg-[var(--diff-removed-line)]/20" />
            </div>
          )}

          <div
            className={`flex items-start gap-3 px-4 py-2.5 border-l-2 ${config.border} ${config.bg}`}
          >
            {/* Sentence text */}
            <div className="flex-1 min-w-0 text-sm leading-relaxed text-[var(--text-primary)]">
              {line.type === 'modified' && line.wordDiff && line.wordDiff.length > 0 ? (
                <WordDiffDisplay segments={line.wordDiff} />
              ) : line.type === 'removed' ? (
                <span className="line-through text-[var(--text-tertiary)]">{sentence.text}</span>
              ) : (
                sentence.text
              )}
            </div>

            {/* Status badge */}
            {config.badge}

            {/* Source trace button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    if (sentence.source_ref?.turn_hash) {
                      const id = line.type === 'removed' ? sentence.id : `target-${sentence.id}`;
                      handleSourceToggle(id, sentence, line.wordDiff);
                    }
                  }}
                  disabled={!sentence.source_ref?.turn_hash}
                  className={`shrink-0 p-1 rounded transition-colors ${
                    sentence.source_ref?.turn_hash
                      ? inlineProps.expanded
                        ? 'text-[var(--accent-commit)] bg-[var(--hover-bg)]'
                        : 'text-[var(--text-tertiary)] hover:text-[var(--accent-commit)] hover:bg-[var(--hover-bg)]'
                      : 'text-[var(--text-tertiary)]/30 cursor-not-allowed'
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                {sentence.source_ref?.turn_hash ? (
                  <div className="space-y-0.5">
                    {getSourceTitle(sentence) && (
                      <div className="font-medium text-[10px] opacity-70">
                        From: {getSourceTitle(sentence)}
                      </div>
                    )}
                    <div>
                      {inlineProps.expanded
                        ? 'Click to collapse source context'
                        : 'Click to view source context'}
                    </div>
                  </div>
                ) : (
                  'No source reference available'
                )}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Inline source context */}
          {inlineProps.expanded && inlineProps.turnHash && (
            <div className="mx-2 mb-1">
              <SourceContextView
                turnHash={inlineProps.turnHash}
                highlightStart={inlineProps.highlightStart}
                highlightEnd={inlineProps.highlightEnd}
                wordDiff={line.wordDiff}
                contextData={inlineProps.inlineContextData}
                autoFetch={false}
                loading={inlineProps.inlineContextLoading}
                showJumpLink={!!makeJumpHandler(sentence, line.wordDiff)}
                onJumpClick={makeJumpHandler(sentence, line.wordDiff)}
              />
            </div>
          )}

          {/* Context snippet */}
          {showSnippets && isChangeLine(line) && sentence.source_ref && (
            <DiffContextSnippet
              sentence={sentence}
              onJumpToConversation={makeJumpHandler(sentence)}
            />
          )}
        </div>
      );
    };

    // ========================================================================
    // Main Render
    // ========================================================================

    const isUnified = viewMode === 'unified';

    const renderLine = isDocument
      ? renderDocumentLine
      : isUnified
        ? renderUnifiedLine
        : renderSplitLine;

    return (
      <div className={cn('flex-1 overflow-auto', glass.reading)} ref={containerRef}>
        {/* Column Headers */}
        {isDocument ? (
          <div className="px-4 py-2 flex items-center gap-2 border-b border-[var(--stroke-divider)] bg-[var(--glass-bg-reading)] sticky top-0 z-10">
            <FileText className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
            <span className="text-xs font-medium text-[var(--text-secondary)]">Document View</span>
            {targetLabel && (
              <span className="text-[10px] text-[var(--text-tertiary)]">{targetLabel}</span>
            )}
          </div>
        ) : isUnified ? (
          <div className="px-4 py-2 flex items-center gap-2 border-b border-[var(--stroke-divider)] bg-[var(--glass-bg-reading)] sticky top-0 z-10">
            <span
              className="text-[10px] font-mono text-[var(--text-tertiary)]/50 w-8 text-right shrink-0"
              title="Base line"
            >
              {baseLabel || 'Base'}
            </span>
            <span
              className="text-[10px] font-mono text-[var(--text-tertiary)]/50 w-8 text-right shrink-0"
              title="Target line"
            >
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
