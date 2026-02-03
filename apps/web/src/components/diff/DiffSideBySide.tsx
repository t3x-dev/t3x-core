'use client';

import { CheckCircle } from 'lucide-react';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { EmptyStateInline } from '@/components/ui/empty-state';
import type { CommitV4Sentence, TurnContextData } from '@/lib/api';
import * as api from '@/lib/api';
import type { Sentence, WordDiffSegment } from '@/types/merge';
import { DiffSectionHeader } from './DiffSectionHeader';
import { DiffSentenceLine } from './DiffSentenceLine';
import { DiffSourceContextModal } from './DiffSourceContextModal';

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
      start_char: s.source_ref?.start_char,
      end_char: s.source_ref?.end_char,
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
    const identical = useMemo(
      () => segmentDiffs.filter((s) => s.diffType === 'same'),
      [segmentDiffs]
    );
    const modified = useMemo(
      () => segmentDiffs.filter((s) => s.diffType === 'modified'),
      [segmentDiffs]
    );
    const removed = useMemo(
      () => segmentDiffs.filter((s) => s.diffType === 'removed'),
      [segmentDiffs]
    );
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

    // Inline context state
    const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);
    const [inlineContextData, setInlineContextData] = useState<TurnContextData | null>(null);
    const [inlineContextLoading, setInlineContextLoading] = useState(false);

    // Modal state (for "Expand" button)
    const [modalOpen, setModalOpen] = useState(false);
    const [modalSentence, setModalSentence] = useState<Sentence | null>(null);
    const [modalData, setModalData] = useState<TurnContextData | null>(null);

    const hasBaseSource = useCallback(
      (segmentId: string) => !!baseMap.get(segmentId)?.source_ref?.turn_hash,
      [baseMap]
    );
    const hasTargetSource = useCallback(
      (segmentId: string) => !!targetMap.get(segmentId)?.source_ref?.turn_hash,
      [targetMap]
    );

    // Toggle inline context for a segment
    const handleSourceToggle = useCallback(
      async (segmentId: string, sentence: CommitV4Sentence) => {
        // Toggle off
        if (expandedSegmentId === segmentId) {
          setExpandedSegmentId(null);
          setInlineContextData(null);
          return;
        }

        if (!sentence.source_ref?.turn_hash) return;

        setExpandedSegmentId(segmentId);
        setInlineContextLoading(true);
        setInlineContextData(null);
        setModalSentence(toMergeSentence(sentence));

        try {
          const data = await api.fetchTurnContextCached(sentence.source_ref.turn_hash, {
            before: 2,
            after: 2,
            highlightStart: sentence.source_ref.start_char,
            highlightEnd: sentence.source_ref.end_char,
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

    // Open modal from inline "Expand" button
    const handleExpandModal = useCallback(() => {
      setModalData(inlineContextData);
      setModalOpen(true);
    }, [inlineContextData]);

    const closeModal = useCallback(() => {
      setModalOpen(false);
      setModalSentence(null);
      setModalData(null);
    }, []);

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
          <DiffSectionHeader
            title="Identical"
            count={identical.length}
            variant="identical"
            defaultCollapsed
          >
            <div className="divide-y">
              {identical.map((s) => (
                <div key={s.segmentId}>
                  <div className="grid grid-cols-2 divide-x">
                    <DiffSentenceLine
                      text={s.text}
                      type="context"
                      hasSource={hasBaseSource(s.segmentId)}
                      onSourceClick={() => {
                        const sentence = baseMap.get(s.segmentId);
                        if (sentence) handleSourceToggle(s.segmentId, sentence);
                      }}
                      expanded={expandedSegmentId === s.segmentId}
                      inlineContextData={inlineContextData}
                      inlineContextLoading={inlineContextLoading}
                      onExpandModal={handleExpandModal}
                    />
                    <DiffSentenceLine
                      text={s.text}
                      type="context"
                      hasSource={hasTargetSource(s.segmentId)}
                      onSourceClick={() => {
                        const sentence = targetMap.get(s.segmentId);
                        if (sentence) handleSourceToggle(`target-${s.segmentId}`, sentence);
                      }}
                      expanded={expandedSegmentId === `target-${s.segmentId}`}
                      inlineContextData={inlineContextData}
                      inlineContextLoading={inlineContextLoading}
                      onExpandModal={handleExpandModal}
                    />
                  </div>
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
                <div key={s.segmentId}>
                  <div className="grid grid-cols-2 divide-x">
                    <DiffSentenceLine
                      text={s.text}
                      type="removed"
                      wordDiff={s.wordDiff ? invertWordDiff(s.wordDiff) : undefined}
                      hasSource={hasBaseSource(s.segmentId)}
                      onSourceClick={() => {
                        const sentence = baseMap.get(s.segmentId);
                        if (sentence) handleSourceToggle(s.segmentId, sentence);
                      }}
                      expanded={expandedSegmentId === s.segmentId}
                      inlineContextData={inlineContextData}
                      inlineContextLoading={inlineContextLoading}
                      onExpandModal={handleExpandModal}
                    />
                    <DiffSentenceLine
                      text={s.matchedText || ''}
                      type="added"
                      wordDiff={s.wordDiff}
                      hasSource={s.matchedSegmentId ? hasTargetSource(s.matchedSegmentId) : false}
                      onSourceClick={() => {
                        if (s.matchedSegmentId) {
                          const sentence = targetMap.get(s.matchedSegmentId);
                          if (sentence)
                            handleSourceToggle(`target-${s.matchedSegmentId}`, sentence);
                        }
                      }}
                      expanded={expandedSegmentId === `target-${s.matchedSegmentId}`}
                      inlineContextData={inlineContextData}
                      inlineContextLoading={inlineContextLoading}
                      onExpandModal={handleExpandModal}
                    />
                  </div>
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
                <div key={s.segmentId}>
                  <div className="grid grid-cols-2 divide-x">
                    <DiffSentenceLine
                      text={s.text}
                      type="removed"
                      hasSource={hasBaseSource(s.segmentId)}
                      onSourceClick={() => {
                        const sentence = baseMap.get(s.segmentId);
                        if (sentence) handleSourceToggle(s.segmentId, sentence);
                      }}
                      expanded={expandedSegmentId === s.segmentId}
                      inlineContextData={inlineContextData}
                      inlineContextLoading={inlineContextLoading}
                      onExpandModal={handleExpandModal}
                    />
                    <div className="bg-muted/10 px-3 py-2" />
                  </div>
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
                <div key={s.segmentId}>
                  <div className="grid grid-cols-2 divide-x">
                    <div className="bg-muted/10 px-3 py-2" />
                    <DiffSentenceLine
                      text={s.text}
                      type="added"
                      hasSource={hasTargetSource(s.segmentId)}
                      onSourceClick={() => {
                        const sentence = targetMap.get(s.segmentId);
                        if (sentence) handleSourceToggle(`target-${s.segmentId}`, sentence);
                      }}
                      expanded={expandedSegmentId === `target-${s.segmentId}`}
                      inlineContextData={inlineContextData}
                      inlineContextLoading={inlineContextLoading}
                      onExpandModal={handleExpandModal}
                    />
                  </div>
                </div>
              ))}
            </div>
          </DiffSectionHeader>
        </div>

        {/* Empty state */}
        {segmentDiffs.length === 0 && (
          <EmptyStateInline
            icon={CheckCircle}
            message="Documents are identical -- no differences found between these commits."
            className="py-20"
          />
        )}

        {/* Source Context Modal (for "Expand" button) */}
        <DiffSourceContextModal
          open={modalOpen}
          onClose={closeModal}
          sentence={modalSentence}
          data={modalData}
          loading={false}
        />
      </div>
    );
  }
);
