'use client';

/**
 * UnifiedDiffView - Git-style unified diff visualization
 *
 * Shows merge conflicts and changes with two view modes:
 * - Grouped (default): Groups by type (Identical → Conflicts → Source Only → Target Only)
 * - Positional: Follows source document order with context folding
 *
 * Supports click-to-expand inline source context (VS Code Peek style).
 */

import { CheckCircle, ChevronDown, ChevronRight, ListTree, MapPin } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DiffMode } from '@/components/diff/DiffModeToggle';
import { DiffModeToggle } from '@/components/diff/DiffModeToggle';
import { DiffSourceContextModal } from '@/components/diff/DiffSourceContextModal';
import { Button } from '@/components/ui/button';
import { EmptyStateInline } from '@/components/ui/empty-state';
import { useTerminology } from '@/hooks/useTerminology';
import type { CommitV4, TurnContextData } from '@/lib/api';
import { fetchTurnContextCached, getCommitV4 } from '@/lib/api';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import type { Merge2WayResult, MergeCandidate, MergeSimilarPair, Sentence } from '@/types/merge';
import { MergeConflictView } from './MergeConflictView';
import { MergeDiffLine } from './MergeDiffLine';
import { MergeDiffSection } from './MergeDiffSection';

// ============================================================================
// Types
// ============================================================================

/** View mode for the diff display */
export type ViewMode = 'grouped' | 'positional';

/** Number of context lines to show before/after changes (positional mode) */
const CONTEXT_LINES = 2;

/** Unified line types for positional display */
type UnifiedLineType = 'context' | 'conflict' | 'source-only' | 'target-only' | 'collapsed';

interface UnifiedLine {
  type: UnifiedLineType;
  sentence?: Sentence;
  pairIndex?: number;
  pair?: MergeSimilarPair;
  sourceCandidate?: MergeCandidate;
  sourceIndex?: number;
  targetCandidate?: MergeCandidate;
  targetIndex?: number;
  collapsedCount?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build unified lines in position order with context folding
 * Used for positional view mode
 */
function buildPositionalLines(
  prepared: Merge2WayResult,
  sourceSentences?: Sentence[]
): UnifiedLine[] {
  if (!sourceSentences || sourceSentences.length === 0) {
    return [];
  }

  // Build lookup maps
  const identicalTexts = new Set(prepared.identical.map((s) => s.text));
  const conflictBySourceId = new Map<string, { pair: MergeSimilarPair; index: number }>();
  const sourceOnlyById = new Map<string, { candidate: MergeCandidate; index: number }>();

  for (let i = 0; i < prepared.similarPairs.length; i++) {
    conflictBySourceId.set(prepared.similarPairs[i].source.id, {
      pair: prepared.similarPairs[i],
      index: i,
    });
  }

  for (let i = 0; i < prepared.onlyInSource.length; i++) {
    sourceOnlyById.set(prepared.onlyInSource[i].sentence.id, {
      candidate: prepared.onlyInSource[i],
      index: i,
    });
  }

  // Build raw lines in source sentence order
  const rawLines: UnifiedLine[] = [];
  const processedConflictIndices = new Set<number>();
  const processedSourceOnlyIndices = new Set<number>();

  for (const sentence of sourceSentences) {
    if (identicalTexts.has(sentence.text)) {
      rawLines.push({ type: 'context', sentence });
      continue;
    }

    const conflict = conflictBySourceId.get(sentence.id);
    if (conflict) {
      rawLines.push({ type: 'conflict', pairIndex: conflict.index, pair: conflict.pair });
      processedConflictIndices.add(conflict.index);
      continue;
    }

    const sourceOnly = sourceOnlyById.get(sentence.id);
    if (sourceOnly) {
      rawLines.push({
        type: 'source-only',
        sourceCandidate: sourceOnly.candidate,
        sourceIndex: sourceOnly.index,
      });
      processedSourceOnlyIndices.add(sourceOnly.index);
      continue;
    }

    rawLines.push({ type: 'context', sentence });
  }

  // Add unprocessed items
  for (let i = 0; i < prepared.similarPairs.length; i++) {
    if (!processedConflictIndices.has(i)) {
      rawLines.push({ type: 'conflict', pairIndex: i, pair: prepared.similarPairs[i] });
    }
  }

  for (let i = 0; i < prepared.onlyInSource.length; i++) {
    if (!processedSourceOnlyIndices.has(i)) {
      rawLines.push({
        type: 'source-only',
        sourceCandidate: prepared.onlyInSource[i],
        sourceIndex: i,
      });
    }
  }

  for (let i = 0; i < prepared.onlyInTarget.length; i++) {
    rawLines.push({
      type: 'target-only',
      targetCandidate: prepared.onlyInTarget[i],
      targetIndex: i,
    });
  }

  // Apply context folding
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

  // Build final lines with collapsed sections
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
      className="w-full flex items-center gap-2 px-4 py-2 bg-[var(--surface-app)] hover:bg-[var(--hover-bg)] transition-colors text-xs text-[var(--text-tertiary)]"
    >
      <ChevronRight className="h-3 w-3" />
      <span>··· {count} unchanged sentences ···</span>
    </button>
  );
}

interface ExpandedRowProps {
  count: number;
  onCollapse: () => void;
}

function ExpandedRowHeader({ count, onCollapse }: ExpandedRowProps) {
  return (
    <button
      type="button"
      onClick={onCollapse}
      className="w-full flex items-center gap-2 px-4 py-1 bg-[var(--surface-app)] hover:bg-[var(--hover-bg)] transition-colors text-xs text-[var(--text-tertiary)]"
    >
      <ChevronDown className="h-3 w-3" />
      <span>··· {count} unchanged (click to collapse) ···</span>
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface UnifiedDiffViewProps {
  prepared: Merge2WayResult;
  onResolvePair: (index: number, pick: 'source' | 'target') => void;
  onToggleKeep: (side: 'source' | 'target', index: number) => void;
  sourceBranch?: string;
  targetBranch?: string;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  diffMode?: DiffMode;
  onDiffModeChange?: (mode: DiffMode) => void;
  hasSemanticData?: boolean;
}

export function UnifiedDiffView({
  prepared,
  onResolvePair: _onResolvePair,
  onToggleKeep,
  sourceBranch = 'A',
  targetBranch = 'B',
  viewMode: controlledViewMode,
  onViewModeChange,
  diffMode,
  onDiffModeChange,
  hasSemanticData,
}: UnifiedDiffViewProps) {
  const { identical, similarPairs, onlyInSource, onlyInTarget } = prepared;
  const { getUnresolvedCount, contextCache, contextLoadingStates, projectId, sourceHash } =
    useMergeWorkspaceStore();
  const { t } = useTerminology();

  // View mode state — controlled if props provided, otherwise internal
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('grouped');
  const viewMode = controlledViewMode ?? internalViewMode;
  const setViewMode = onViewModeChange ?? setInternalViewMode;

  // Fetch source commit for positional mode
  const [sourceCommit, setSourceCommit] = useState<CommitV4 | null>(null);
  const [loadingCommit, setLoadingCommit] = useState(false);

  useEffect(() => {
    // Only fetch when switching to positional mode
    if (viewMode !== 'positional' || !sourceHash) return;
    if (sourceCommit) return; // Already loaded

    let cancelled = false;
    setLoadingCommit(true);

    getCommitV4(sourceHash)
      .then((commit) => {
        if (!cancelled) setSourceCommit(commit);
      })
      .catch(() => {
        if (!cancelled) setSourceCommit(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingCommit(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, sourceHash, sourceCommit]);

  // Convert CommitV4 sentences to Sentence type
  const sourceSentences = useMemo(() => {
    if (!sourceCommit?.content?.sentences) return undefined;
    return sourceCommit.content.sentences.map((s) => ({
      id: s.id,
      text: s.text,
      confidence: s.confidence,
      source: s.source_ref
        ? {
            turn_hash: s.source_ref.turn_hash,
            start_char: s.source_ref.start_char,
            end_char: s.source_ref.end_char,
          }
        : undefined,
    }));
  }, [sourceCommit]);

  // Build positional lines (only when in positional mode)
  const positionalLines = useMemo(
    () => (viewMode === 'positional' ? buildPositionalLines(prepared, sourceSentences) : []),
    [viewMode, prepared, sourceSentences]
  );

  // Track expanded collapsed sections (positional mode)
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

  // Helper to get cached context data
  const getContextForSentence = useCallback(
    (sentence: Sentence) => {
      const turnHash = sentence.source?.turn_hash;
      if (!turnHash) return { data: undefined, loading: false };
      return {
        data: contextCache[turnHash]?.data,
        loading: contextLoadingStates[turnHash] ?? false,
      };
    },
    [contextCache, contextLoadingStates]
  );

  // Context modal state
  const [contextModal, setContextModal] = useState<{
    open: boolean;
    conversationId: string;
    turnHash: string;
    highlightStart?: number;
    highlightEnd?: number;
  } | null>(null);
  const [modalContextData, setModalContextData] = useState<TurnContextData | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const openContextModal = useCallback(
    (conversationId: string, turnHash: string, hStart?: number, hEnd?: number) => {
      setContextModal({
        open: true,
        conversationId,
        turnHash,
        highlightStart: hStart,
        highlightEnd: hEnd,
      });
      setModalLoading(true);
      setModalContextData(null);

      fetchTurnContextCached(turnHash, {
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

  /** Create a jump handler that opens the context modal with source info */
  const makeJumpHandler = useCallback(
    (sentence: Sentence) => {
      if (!projectId || !sentence.source?.conversation_id) return undefined;
      return (conversationId: string) => {
        openContextModal(
          conversationId,
          sentence.source?.turn_hash || '',
          sentence.source?.start_char,
          sentence.source?.end_char
        );
      };
    },
    [projectId, openContextModal]
  );

  // Render a positional line
  const renderPositionalLine = (line: UnifiedLine, index: number) => {
    if (line.type === 'collapsed') {
      if (expandedSections.has(index)) {
        return (
          <ExpandedRowHeader
            key={`collapsed-${index}`}
            count={line.collapsedCount || 0}
            onCollapse={() => toggleSection(index)}
          />
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

    if (line.type === 'context' && line.sentence) {
      const ctx = getContextForSentence(line.sentence);
      return (
        <MergeDiffLine
          key={`context-${index}`}
          type="context"
          sentence={line.sentence}
          contextData={ctx.data}
          contextLoading={ctx.loading}
          onJumpToConversation={makeJumpHandler(line.sentence)}
        />
      );
    }

    if (line.type === 'conflict' && line.pair && line.pairIndex !== undefined) {
      return (
        <MergeConflictView
          key={`conflict-${index}`}
          pair={line.pair}
          index={line.pairIndex}
          sourceBranch={sourceBranch}
          targetBranch={targetBranch}
          navId={`conflict-${line.pairIndex}`}
        />
      );
    }

    if (line.type === 'source-only' && line.sourceCandidate && line.sourceIndex !== undefined) {
      const ctx = getContextForSentence(line.sourceCandidate.sentence);
      return (
        <MergeDiffLine
          key={`source-${index}`}
          type="added"
          sentence={line.sourceCandidate.sentence}
          isKept={line.sourceCandidate.keep}
          onToggleKeep={() => onToggleKeep('source', line.sourceIndex!)}
          checkable
          contextData={ctx.data}
          contextLoading={ctx.loading}
          onJumpToConversation={makeJumpHandler(line.sourceCandidate.sentence)}
          navId={`source-${line.sourceIndex}`}
        />
      );
    }

    if (line.type === 'target-only' && line.targetCandidate && line.targetIndex !== undefined) {
      const ctx = getContextForSentence(line.targetCandidate.sentence);
      return (
        <MergeDiffLine
          key={`target-${index}`}
          type="added"
          sentence={line.targetCandidate.sentence}
          isKept={line.targetCandidate.keep}
          onToggleKeep={() => onToggleKeep('target', line.targetIndex!)}
          checkable
          contextData={ctx.data}
          contextLoading={ctx.loading}
          onJumpToConversation={makeJumpHandler(line.targetCandidate.sentence)}
          navId={`target-${line.targetIndex}`}
        />
      );
    }

    return null;
  };

  // Stats
  const unresolvedCount = getUnresolvedCount();
  const totalChanges = similarPairs.length + onlyInSource.length + onlyInTarget.length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Stats Header with View Toggle */}
      <div className="flex items-center justify-between mb-[var(--space-group)] px-2 py-2 bg-[var(--surface-panel)] border border-[var(--stroke-divider)] rounded-lg text-sm">
        {/* Sentence-level stats — hidden in Frame mode */}
        {diffMode !== 'frame' && (
          <div className="flex items-center gap-[var(--space-group)]">
            <span className="text-[var(--text-tertiary)]">
              {identical.length} {t('identical_sentences').toLowerCase()}
            </span>
            {similarPairs.length > 0 && (
              <span
                className={
                  unresolvedCount > 0
                    ? 'text-[var(--diff-modified-line)]'
                    : 'text-[var(--diff-added-line)]'
                }
              >
                {similarPairs.length} {t('conflicts').toLowerCase()}
                {unresolvedCount > 0 && ` (${unresolvedCount} ${t('unresolved').toLowerCase()})`}
              </span>
            )}
            {onlyInSource.length > 0 && (
              <span className="text-[var(--accent-commit)]">
                +{onlyInSource.length} from {t('source').toLowerCase()}
              </span>
            )}
            {onlyInTarget.length > 0 && (
              <span className="text-[var(--diff-added-line)]">
                +{onlyInTarget.length} from {t('target').toLowerCase()}
              </span>
            )}
          </div>
        )}

        {/* Spacer when in frame mode to push toggle to the right */}
        {diffMode === 'frame' && <div className="flex-1" />}

        {/* Diff mode toggle */}
        {onDiffModeChange && (
          <DiffModeToggle
            mode={diffMode ?? 'sentence'}
            onChange={onDiffModeChange}
            hidden={!hasSemanticData}
          />
        )}

        {/* View Mode Toggle */}
        {diffMode !== 'frame' && (
          <div className="flex items-center gap-1 border border-[var(--stroke-divider)] rounded-md p-0.5">
            <Button
              variant={viewMode === 'grouped' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setViewMode('grouped')}
            >
              <ListTree className="h-3.5 w-3.5 mr-1" />
              Grouped
            </Button>
            <Button
              variant={viewMode === 'positional' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setViewMode('positional')}
            >
              <MapPin className="h-3.5 w-3.5 mr-1" />
              Position
            </Button>
          </div>
        )}
      </div>

      {diffMode !== 'frame' && (
        <>
          {/* Grouped View (default) */}
          {viewMode === 'grouped' && (
            <div className="space-y-[var(--space-section)]">
              {/* Identical Sentences */}
              {identical.length > 0 && (
                <MergeDiffSection
                  title={t('identical_sentences')}
                  subtitle={`${identical.length} sentences (${t('auto_kept').toLowerCase()})`}
                  variant="success"
                  defaultCollapsed
                  navId="identical"
                >
                  <div className="space-y-1">
                    {identical.map((sentence) => {
                      const ctx = getContextForSentence(sentence);
                      return (
                        <MergeDiffLine
                          key={`identical-${sentence.id}`}
                          type="context"
                          sentence={sentence}
                          contextData={ctx.data}
                          contextLoading={ctx.loading}
                          onJumpToConversation={makeJumpHandler(sentence)}
                        />
                      );
                    })}
                  </div>
                </MergeDiffSection>
              )}

              {/* Conflicts */}
              {similarPairs.length > 0 && (
                <MergeDiffSection
                  title={t('conflicts')}
                  subtitle={`${unresolvedCount} of ${similarPairs.length} need resolution`}
                  variant={unresolvedCount > 0 ? 'warning' : 'success'}
                  navId="conflicts"
                >
                  <ul className="space-y-[var(--space-group)] list-none p-0 m-0">
                    {similarPairs.map((pair, idx) => (
                      <MergeConflictView
                        key={`conflict-${pair.source.id}-${pair.target.id}`}
                        pair={pair}
                        index={idx}
                        sourceBranch={sourceBranch}
                        targetBranch={targetBranch}
                        navId={`conflict-${idx}`}
                      />
                    ))}
                  </ul>
                </MergeDiffSection>
              )}

              {/* Source-Only */}
              {onlyInSource.length > 0 && (
                <MergeDiffSection
                  title={t('only_in_source')}
                  subtitle={`${onlyInSource.length} sentences from ${t('source').toLowerCase()}`}
                  variant="info"
                  navId="source-only"
                >
                  <div className="space-y-1">
                    {onlyInSource.map((candidate, idx) => {
                      const ctx = getContextForSentence(candidate.sentence);
                      return (
                        <MergeDiffLine
                          key={`source-${candidate.sentence.id}`}
                          type="added"
                          sentence={candidate.sentence}
                          isKept={candidate.keep}
                          onToggleKeep={() => onToggleKeep('source', idx)}
                          checkable
                          contextData={ctx.data}
                          contextLoading={ctx.loading}
                          onJumpToConversation={makeJumpHandler(candidate.sentence)}
                          navId={`source-${idx}`}
                        />
                      );
                    })}
                  </div>
                </MergeDiffSection>
              )}

              {/* Target-Only */}
              {onlyInTarget.length > 0 && (
                <MergeDiffSection
                  title={t('only_in_target')}
                  subtitle={`${onlyInTarget.length} sentences from ${t('target').toLowerCase()}`}
                  variant="info"
                  navId="target-only"
                >
                  <div className="space-y-1">
                    {onlyInTarget.map((candidate, idx) => {
                      const ctx = getContextForSentence(candidate.sentence);
                      return (
                        <MergeDiffLine
                          key={`target-${candidate.sentence.id}`}
                          type="added"
                          sentence={candidate.sentence}
                          isKept={candidate.keep}
                          onToggleKeep={() => onToggleKeep('target', idx)}
                          checkable
                          contextData={ctx.data}
                          contextLoading={ctx.loading}
                          onJumpToConversation={makeJumpHandler(candidate.sentence)}
                          navId={`target-${idx}`}
                        />
                      );
                    })}
                  </div>
                </MergeDiffSection>
              )}
            </div>
          )}

          {/* Positional View */}
          {viewMode === 'positional' && (
            <div className="space-y-[var(--space-item)] border border-[var(--stroke-divider)] rounded-lg overflow-hidden">
              {loadingCommit ? (
                <div className="p-4 text-center text-[var(--text-tertiary)]">
                  Loading document structure...
                </div>
              ) : positionalLines.length > 0 ? (
                positionalLines.map((line, i) => renderPositionalLine(line, i))
              ) : (
                <div className="p-4 text-center text-[var(--text-tertiary)]">
                  Position data not available. Using grouped view is recommended.
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {totalChanges === 0 && identical.length === 0 && (
            <EmptyStateInline
              icon={CheckCircle}
              message="Documents are identical -- no differences found between commits."
              className="py-12"
            />
          )}

          {/* Source context modal */}
          <DiffSourceContextModal
            open={!!contextModal?.open}
            sentence={null}
            data={modalContextData}
            loading={modalLoading}
            onClose={closeContextModal}
            projectId={projectId ?? undefined}
            conversationId={contextModal?.conversationId}
            turnHash={contextModal?.turnHash}
            highlightStart={contextModal?.highlightStart}
            highlightEnd={contextModal?.highlightEnd}
          />
        </>
      )}
    </div>
  );
}
