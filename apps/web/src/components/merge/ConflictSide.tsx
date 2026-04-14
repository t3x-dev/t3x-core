'use client';

/**
 * ConflictSide - Single side (source or target) of a conflict with inline context
 */

import { useEffect } from 'react';
import { SourceContextView } from '@/components/source-context/SourceContextView';
import { useMergeWorkspaceActions } from '@/hooks/merge/useMergeWorkspaceActions';
import { cn } from '@/utils/cn';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import type { ContentNode, WordDiffSegment } from '@/types/merge';
import { WordDiffDisplay } from './WordDiffDisplay';

type SideType = 'source' | 'target';

interface ConflictSideProps {
  side: SideType;
  node: ContentNode;
  label: string;
  isSelected: boolean;
  /** Word-level diff segments for highlighting changes within the node */
  wordDiff?: WordDiffSegment[];
  /** Callback when "Jump to conversation" is clicked */
  onJumpToConversation?: (conversationId: string) => void;
}

const sideStyles: Record<SideType, { border: string; bg: string; selectedBg: string }> = {
  source: {
    border: 'border-l-2 border-l-[var(--diff-removed-line)]',
    bg: 'bg-transparent',
    selectedBg: 'bg-[var(--diff-removed-bg)] ring-1 ring-[var(--diff-removed-line)]/30',
  },
  target: {
    border: 'border-l-2 border-l-[var(--diff-added-line)]',
    bg: 'bg-transparent',
    selectedBg: 'bg-[var(--diff-added-bg)] ring-1 ring-[var(--diff-added-line)]/30',
  },
};

export function ConflictSide({
  side,
  node,
  label,
  isSelected,
  wordDiff,
  onJumpToConversation,
}: ConflictSideProps) {
  const styles = sideStyles[side];
  const turnHash = node.source?.turn_hash;

  // Access store for context fetching
  const { contextCache, contextLoadingStates } = useMergeWorkspaceStore();
  const { fetchSourceContext } = useMergeWorkspaceActions();

  // Memoize node source info to avoid unnecessary refetches
  const startChar = node.source?.start_char;
  const endChar = node.source?.end_char;

  // Fetch context on mount if turn_hash is available
  useEffect(() => {
    if (turnHash && !contextCache[turnHash] && !contextLoadingStates[turnHash]) {
      // Create minimal node object for context fetch
      const nodeForFetch: typeof node = {
        id: node.id,
        text: node.text,
        source: { turn_hash: turnHash, start_char: startChar, end_char: endChar },
      };
      fetchSourceContext(turnHash, nodeForFetch);
    }
  }, [
    turnHash,
    startChar,
    endChar,
    contextCache,
    contextLoadingStates,
    fetchSourceContext,
    node.id,
    node.text,
  ]);

  // Get cached context data
  const cachedContext = turnHash ? contextCache[turnHash]?.data : null;
  const isLoading = turnHash ? contextLoadingStates[turnHash] || false : false;

  return (
    <div
      className={cn(
        'rounded-lg p-3 transition-all',
        styles.border,
        isSelected ? styles.selectedBg : styles.bg
      )}
    >
      {/* Side label */}
      <div className="flex items-center justify-between mb-[var(--space-item)]">
        <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
          {label}
        </span>
        {isSelected && (
          <span className="text-xs font-medium text-[var(--diff-added-accent)]">Selected</span>
        )}
      </div>

      {/* ContentNode text — with word-diff highlighting when available */}
      {wordDiff && wordDiff.length > 0 ? (
        <div className="text-sm leading-relaxed text-[var(--text-secondary)]">
          <WordDiffDisplay
            segments={wordDiff.filter((seg) =>
              side === 'source' ? seg.type !== 'added' : seg.type !== 'removed'
            )}
          />
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{node.text}</p>
      )}

      {/* Inline source context via SourceContextView */}
      {turnHash && (
        <SourceContextView
          turnHash={turnHash}
          highlightStart={node.source?.start_char}
          highlightEnd={node.source?.end_char}
          contextData={cachedContext ?? undefined}
          autoFetch={false}
          loading={isLoading}
          showJumpLink={!!onJumpToConversation}
          onJumpClick={onJumpToConversation}
        />
      )}
    </div>
  );
}
