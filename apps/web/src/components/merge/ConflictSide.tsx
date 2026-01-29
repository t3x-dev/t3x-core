'use client';

/**
 * ConflictSide - Single side (source or target) of a conflict with inline context
 */

import { useEffect } from 'react';
import type { Sentence, TurnContextData } from '@/types/merge';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import { ConflictSourceContext } from './ConflictSourceContext';
import { cn } from '@/lib/utils';

type SideType = 'source' | 'target';

interface ConflictSideProps {
  side: SideType;
  sentence: Sentence;
  label: string;
  isSelected: boolean;
}

const sideStyles: Record<SideType, { border: string; bg: string; selectedBg: string }> = {
  source: {
    border: 'border-l-4 border-l-red-300',
    bg: 'bg-red-50/50',
    selectedBg: 'bg-red-100 ring-2 ring-red-300',
  },
  target: {
    border: 'border-l-4 border-l-green-300',
    bg: 'bg-green-50/50',
    selectedBg: 'bg-green-100 ring-2 ring-green-300',
  },
};

export function ConflictSide({
  side,
  sentence,
  label,
  isSelected,
}: ConflictSideProps) {
  const styles = sideStyles[side];
  const turnHash = sentence.source.turn_hash;

  // Access store for context fetching
  const {
    contextCache,
    contextLoadingStates,
    fetchSourceContext,
  } = useMergeWorkspaceStore();

  // Memoize sentence source info to avoid unnecessary refetches
  const startChar = sentence.source.start_char;
  const endChar = sentence.source.end_char;

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
  }, [turnHash, startChar, endChar, contextCache, contextLoadingStates, fetchSourceContext, sentence.id, sentence.text]);

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
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        {isSelected && (
          <span className="text-xs font-medium text-green-600">
            Selected
          </span>
        )}
      </div>

      {/* Sentence text */}
      <p className="text-sm leading-relaxed">
        {sentence.text}
      </p>

      {/* Inline source context */}
      <ConflictSourceContext
        turnHash={turnHash}
        sentenceText={sentence.text}
        startChar={sentence.source.start_char}
        endChar={sentence.source.end_char}
        contextData={cachedContext ?? null}
        loading={isLoading}
      />
    </div>
  );
}
