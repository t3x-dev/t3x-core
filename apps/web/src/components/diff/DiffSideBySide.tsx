'use client';

import { useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import { DiffSectionHeader } from './DiffSectionHeader';
import { DiffSentenceLine } from './DiffSentenceLine';
import type { CommitV4Sentence } from '@/lib/api';
import type { Sentence } from '@/types/merge';
import type { WordDiffSegment } from '@/types/merge';

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
  onSourceClick: (sentence: Sentence) => void;
}

export interface DiffSideBySideHandle {
  jumpToSection: (section: string) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function toMergeSentence(s: CommitV4Sentence): Sentence {
  return {
    id: s.id,
    text: s.text,
    confidence: s.confidence,
    source: {
      turn_hash: s.source_ref?.turn_hash,
    },
  };
}

function buildSentenceMap(sentences: CommitV4Sentence[]): Map<string, CommitV4Sentence> {
  const map = new Map<string, CommitV4Sentence>();
  for (const s of sentences) {
    map.set(s.id, s);
  }
  return map;
}

// ============================================================================
// Component
// ============================================================================

export const DiffSideBySide = forwardRef<DiffSideBySideHandle, DiffSideBySideProps>(
  function DiffSideBySide({ segmentDiffs, baseSentences, targetSentences, onSourceClick }, ref) {
    const identicalRef = useRef<HTMLDivElement>(null);
    const modifiedRef = useRef<HTMLDivElement>(null);
    const removedRef = useRef<HTMLDivElement>(null);
    const addedRef = useRef<HTMLDivElement>(null);

    const baseMap = useMemo(() => buildSentenceMap(baseSentences), [baseSentences]);
    const targetMap = useMemo(() => buildSentenceMap(targetSentences), [targetSentences]);

    // Categorize
    const identical = useMemo(() => segmentDiffs.filter((s) => s.diffType === 'same'), [segmentDiffs]);
    const modified = useMemo(() => segmentDiffs.filter((s) => s.diffType === 'modified'), [segmentDiffs]);
    const removed = useMemo(() => segmentDiffs.filter((s) => s.diffType === 'removed'), [segmentDiffs]);
    const added = useMemo(() => segmentDiffs.filter((s) => s.diffType === 'added'), [segmentDiffs]);

    // Jump to section
    useImperativeHandle(ref, () => ({
      jumpToSection: (section: string) => {
        const refMap: Record<string, React.RefObject<HTMLDivElement | null>> = {
          identical: identicalRef,
          modified: modifiedRef,
          removed: removedRef,
          added: addedRef,
        };
        refMap[section]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }));

    const hasBaseSource = useCallback(
      (segmentId: string) => !!baseMap.get(segmentId)?.source_ref?.turn_hash,
      [baseMap]
    );
    const hasTargetSource = useCallback(
      (segmentId: string) => !!targetMap.get(segmentId)?.source_ref?.turn_hash,
      [targetMap]
    );

    const handleBaseSourceClick = useCallback(
      (segmentId: string) => {
        const s = baseMap.get(segmentId);
        if (s) onSourceClick(toMergeSentence(s));
      },
      [baseMap, onSourceClick]
    );

    const handleTargetSourceClick = useCallback(
      (segmentId: string) => {
        const s = targetMap.get(segmentId);
        if (s) onSourceClick(toMergeSentence(s));
      },
      [targetMap, onSourceClick]
    );

    const invertWordDiff = (wordDiff: WordDiffSegment[]): WordDiffSegment[] =>
      wordDiff.map((seg) => {
        if (seg.type === 'added') return { type: 'removed' as const, text: seg.text };
        if (seg.type === 'removed') return { type: 'added' as const, text: seg.text };
        return seg;
      });

    return (
      <div className="flex-1 overflow-auto">
        {/* Column Headers */}
        <div className="grid grid-cols-2 divide-x border-b bg-muted/20 sticky top-0 z-10">
          <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Base (Source)
          </div>
          <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Target
          </div>
        </div>

        {/* Identical */}
        <div ref={identicalRef}>
          <DiffSectionHeader title="Identical" count={identical.length} variant="identical" defaultCollapsed>
            <div className="divide-y">
              {identical.map((s) => (
                <div key={s.segmentId} className="grid grid-cols-2 divide-x">
                  <DiffSentenceLine
                    text={s.text}
                    type="context"
                    hasSource={hasBaseSource(s.segmentId)}
                    onSourceClick={() => handleBaseSourceClick(s.segmentId)}
                  />
                  <DiffSentenceLine
                    text={s.text}
                    type="context"
                    hasSource={hasTargetSource(s.segmentId)}
                    onSourceClick={() => handleTargetSourceClick(s.segmentId)}
                  />
                </div>
              ))}
            </div>
          </DiffSectionHeader>
        </div>

        {/* Modified */}
        <div ref={modifiedRef}>
          <DiffSectionHeader title="Modified" count={modified.length} variant="modified">
            <div className="divide-y">
              {modified.map((s) => (
                <div key={s.segmentId} className="grid grid-cols-2 divide-x">
                  <DiffSentenceLine
                    text={s.text}
                    type="removed"
                    wordDiff={s.wordDiff ? invertWordDiff(s.wordDiff) : undefined}
                    hasSource={hasBaseSource(s.segmentId)}
                    onSourceClick={() => handleBaseSourceClick(s.segmentId)}
                  />
                  <DiffSentenceLine
                    text={s.matchedText || ''}
                    type="added"
                    wordDiff={s.wordDiff}
                    hasSource={s.matchedSegmentId ? hasTargetSource(s.matchedSegmentId) : false}
                    onSourceClick={() => {
                      if (s.matchedSegmentId) handleTargetSourceClick(s.matchedSegmentId);
                    }}
                  />
                </div>
              ))}
            </div>
          </DiffSectionHeader>
        </div>

        {/* Removed */}
        <div ref={removedRef}>
          <DiffSectionHeader title="Removed" count={removed.length} variant="removed">
            <div className="divide-y">
              {removed.map((s) => (
                <div key={s.segmentId} className="grid grid-cols-2 divide-x">
                  <DiffSentenceLine
                    text={s.text}
                    type="removed"
                    hasSource={hasBaseSource(s.segmentId)}
                    onSourceClick={() => handleBaseSourceClick(s.segmentId)}
                  />
                  <div className="bg-muted/10 px-3 py-2" />
                </div>
              ))}
            </div>
          </DiffSectionHeader>
        </div>

        {/* Added */}
        <div ref={addedRef}>
          <DiffSectionHeader title="Added" count={added.length} variant="added">
            <div className="divide-y">
              {added.map((s) => (
                <div key={s.segmentId} className="grid grid-cols-2 divide-x">
                  <div className="bg-muted/10 px-3 py-2" />
                  <DiffSentenceLine
                    text={s.text}
                    type="added"
                    hasSource={hasTargetSource(s.segmentId)}
                    onSourceClick={() => handleTargetSourceClick(s.segmentId)}
                  />
                </div>
              ))}
            </div>
          </DiffSectionHeader>
        </div>

        {/* Empty state */}
        {segmentDiffs.length === 0 && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            No differences found
          </div>
        )}
      </div>
    );
  }
);
