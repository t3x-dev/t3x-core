'use client';

/**
 * ConflictSide - Single side (source or target) of a conflict with inline context
 */

import { useEffect } from 'react';
import { SourceContextView } from '@/components/shared/SourceContextView';
import { cn } from '@/lib/utils';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import type { Sentence } from '@/types/merge';

type SideType = 'source' | 'target';

interface ConflictSideProps {
  side: SideType;
  sentence: Sentence;
  label: string;
  isSelected: boolean;
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
  sentence,
  label,
  isSelected,
  onJumpToConversation,
}: ConflictSideProps) {
  const styles = sideStyles[side];
  const turnHash = sentence.source?.turn_hash;

  // Access store for context fetching
  const { contextCache, contextLoadingStates, fetchSourceContext } = useMergeWorkspaceStore();

  // Memoize sentence source info to avoid unnecessary refetches
  const startChar = sentence.source?.start_char;
  const endChar = sentence.source?.end_char;

  // Fetch context on mount if turn_hash is available
  useEffect(() => {
    if (turnHash && !contextCache[turnHash] && !contextLoadingStates[turnHash]) {
      // Create minimal sentence object for context fetch
      const sentenceForFetch: typeof sentence = {
        id: sentence.id,
        text: sentence.text,
        source: { turn_hash: turnHash, start_char: startChar, end_char: endChar },
      };
      fetchSourceContext(turnHash, sentenceForFetch);
    }
  }, [
    turnHash,
    startChar,
    endChar,
    contextCache,
    contextLoadingStates,
    fetchSourceContext,
    sentence.id,
    sentence.text,
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

      {/* Sentence text */}
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{sentence.text}</p>

      {/* Inline source context via SourceContextView */}
      {turnHash && (
        <SourceContextView
          turnHash={turnHash}
          highlightStart={sentence.source?.start_char}
          highlightEnd={sentence.source?.end_char}
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
