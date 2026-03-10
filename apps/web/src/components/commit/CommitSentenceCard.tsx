'use client';

/**
 * CommitSentenceCard — enhanced sentence card for the commit detail page.
 *
 * Features:
 * - Colored left gutter bar (diff status)
 * - Header row: sentence ID, status badge, confidence
 * - Body: sentence text with word diff for modified sentences
 * - Inline source context expansion (SourceContextView)
 * - Footer: inheritance info, source turn reference
 * - IntersectionObserver fade-in animation
 * - Hover actions: copy, pin source
 */

import type { WordDiffSegment } from '@t3x-dev/core';
import { Pin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SourceContextView } from '@/components/shared/SourceContextView';
import {
  ConfidenceBadge,
  CopyButton,
  GutterBar,
  InheritedFromBadge,
  StatusBadge,
  WordDiffInline,
} from './CommitDetailHelpers';

// ============================================================================
// Types
// ============================================================================

export type SentenceDiffStatus = 'identical' | 'same' | 'modified' | 'added' | 'removed';

export interface SentenceCardProps {
  id: string;
  text: string;
  confidence: number | undefined;
  diffStatus: SentenceDiffStatus;
  oldText?: string;
  wordDiff?: WordDiffSegment[];
  /** Source reference for provenance */
  sourceRef?: {
    conversation_id: string;
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
  /** Hash of the parent commit this sentence was inherited from */
  inheritedFrom?: string;
  /** Whether this card is currently selected */
  isActive: boolean;
  /** Whether inline source is expanded */
  isSourceExpanded: boolean;
  /** Callback when card is clicked (select) */
  onSelect: () => void;
  /** Callback when source pin is toggled */
  onToggleSource: () => void;
  /** Ref callback for connection lines */
  cardRef: (el: HTMLDivElement | null) => void;
  /** Project ID for links */
  projectId: string;
  /** Parent commit hashes for "inherited from" display */
  parentHashes: string[];
}

// ============================================================================
// Component
// ============================================================================

export function CommitSentenceCard({
  id,
  text,
  confidence,
  diffStatus,
  oldText,
  wordDiff,
  sourceRef,
  inheritedFrom,
  isActive,
  isSourceExpanded,
  onSelect,
  onToggleSource,
  cardRef,
  projectId,
  parentHashes,
}: SentenceCardProps) {
  const [visible, setVisible] = useState(false);
  const elRef = useRef<HTMLDivElement | null>(null);

  // IntersectionObserver for fade-in
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasSource = !!sourceRef?.turn_hash;
  const effectiveStatus = diffStatus === 'same' ? 'identical' : diffStatus;

  return (
    <div
      ref={(el) => {
        elRef.current = el;
        cardRef(el);
      }}
      onClick={onSelect}
      className={`group relative rounded-lg border transition-all duration-300 cursor-pointer overflow-hidden ${
        visible ? 'sentence-fade-in' : 'opacity-0 translate-y-2'
      } ${
        isActive
          ? 'sentence-active border-[var(--accent-commit)]/30 bg-[var(--surface-card)]'
          : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] hover:border-[var(--stroke-default)] hover-connection-preview'
      }`}
    >
      {/* Left gutter bar */}
      <GutterBar status={effectiveStatus} />

      {/* Card header */}
      <div className="flex items-center justify-between border-b border-[var(--stroke-divider)] px-4 pl-5 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{id}</span>
          <StatusBadge status={effectiveStatus} />
          {confidence != null && <ConfidenceBadge value={confidence} pulse={isActive} />}
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <CopyButton text={text} size={12} />
          {hasSource && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSource();
              }}
              className={`rounded p-1 transition-colors ${
                isSourceExpanded
                  ? 'bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]'
              }`}
              title="Toggle source"
            >
              <Pin size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 pl-5 py-3">
        <p
          className={`text-[14px] leading-relaxed ${
            effectiveStatus === 'removed'
              ? 'text-[var(--diff-removed-text)] line-through'
              : 'text-[var(--text-primary)]'
          }`}
        >
          {text}
        </p>

        {/* Word diff for modified sentences */}
        {effectiveStatus === 'modified' && oldText && (
          <WordDiffInline oldText={oldText} newText={text} segments={wordDiff} />
        )}

        {/* Inline source context */}
        {isSourceExpanded && sourceRef?.turn_hash && (
          <div className="mt-2 source-expand-enter">
            <SourceContextView
              turnHash={sourceRef.turn_hash}
              highlightStart={sourceRef.start_char}
              highlightEnd={sourceRef.end_char}
              mode="compact"
              highlightColor="green"
              wordDiff={wordDiff}
              showHeader
              showJumpLink
            />
          </div>
        )}

        {/* Footer */}
        {(effectiveStatus === 'identical' || inheritedFrom) && parentHashes.length > 0 && (
          <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--text-tertiary)]">
            <InheritedFromBadge
              parentHash={inheritedFrom || parentHashes[0]}
              projectId={projectId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
