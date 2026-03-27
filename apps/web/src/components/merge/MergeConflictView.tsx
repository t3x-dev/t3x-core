// @ts-nocheck — tree-primary migration: needs rework
'use client';

/**
 * MergeConflictView - Main conflict card with two-column layout
 *
 * Displays a merge conflict with:
 * - Two-column layout showing source and target sides
 * - Inline source context for each side
 * - Word diff visualization
 * - Resolution buttons (Keep A, Keep B, Keep Both, Edit)
 * - Inline edit panel when Edit is selected
 */

import { useCallback, useState } from 'react';
import { DiffSourceContextModal } from '@/components/diff/DiffSourceContextModal';
import { useTerminology } from '@/hooks/useTerminology';
import type { TurnContextData } from '@/lib/api';
import { fetchTurnContextCached } from '@/lib/api';
import { cn } from '@/lib/utils';
import { isConflictResolved, useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import type { MergeSimilarPair, Sentence } from '@/types/merge';
import { ConflictHeader } from './ConflictHeader';
import { ConflictResolutionButtons } from './ConflictResolutionButtons';
import { ConflictSide } from './ConflictSide';
import { WordDiffDisplay } from './WordDiffDisplay';

interface MergeConflictViewProps {
  pair: MergeSimilarPair;
  index: number;
  sourceBranch: string;
  targetBranch: string;
  navId?: string;
}

export function MergeConflictView({
  pair,
  index,
  sourceBranch,
  targetBranch,
  navId,
}: MergeConflictViewProps) {
  const { t } = useTerminology();
  const { extendedResolutions, resolveConflict, getEffectiveResolution, projectId } =
    useMergeWorkspaceStore();

  // Get effective resolution (standard or extended)
  const effectiveResolution = getEffectiveResolution(index);
  const extRes = extendedResolutions[String(index)];
  const resolved = isConflictResolved(pair, extRes);

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
      if (!projectId || !sentence.source?.conversation_id || !sentence.source?.turn_hash)
        return undefined;
      const { turn_hash, start_char, end_char } = sentence.source;
      return (conversationId: string) => {
        openContextModal(conversationId, turn_hash, start_char, end_char);
      };
    },
    [projectId, openContextModal]
  );

  return (
    <li
      data-merge-nav={navId}
      aria-label={`Conflict ${index + 1}: ${resolved ? 'resolved' : 'unresolved'}`}
      className={cn(
        'rounded-lg border p-[var(--space-group)] transition-colors elevation-1',
        resolved
          ? 'border-[var(--diff-added-line)]/20 bg-[var(--diff-added-bg)]'
          : 'border-[var(--diff-modified-line)]/20 bg-[var(--diff-modified-bg)]'
      )}
    >
      {/* Header */}
      <ConflictHeader
        index={index}
        resolution={effectiveResolution}
        sourceBranch={sourceBranch}
        targetBranch={targetBranch}
      />

      {/* Word diff visualization */}
      {pair.wordDiff && pair.wordDiff.length > 0 && (
        <div className="mb-[var(--space-group)] bg-[var(--glass-bg-reading-soft)] rounded-md p-3">
          <div className="text-xs text-[var(--text-tertiary)] mb-1">Changes:</div>
          <WordDiffDisplay segments={pair.wordDiff} />
        </div>
      )}

      {/* Two-column layout for source and target */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-group)]">
        <ConflictSide
          side="source"
          sentence={pair.source}
          label={`${t('branch')} ${sourceBranch}`}
          isSelected={effectiveResolution === 'source' || effectiveResolution === 'both'}
          wordDiff={pair.wordDiff}
          onJumpToConversation={makeJumpHandler(pair.source)}
        />
        <ConflictSide
          side="target"
          sentence={pair.target}
          label={`${t('branch')} ${targetBranch}`}
          isSelected={effectiveResolution === 'target' || effectiveResolution === 'both'}
          wordDiff={pair.wordDiff}
          onJumpToConversation={makeJumpHandler(pair.target)}
        />
      </div>

      {/* Resolution buttons */}
      <ConflictResolutionButtons
        current={effectiveResolution}
        onResolve={(resolution) => resolveConflict(index, resolution)}
        sourceBranch={sourceBranch}
        targetBranch={targetBranch}
      />

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
    </li>
  );
}
