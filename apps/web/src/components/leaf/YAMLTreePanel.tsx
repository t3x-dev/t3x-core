'use client';

/**
 * YAMLTreePanel — Renders commit sentences as a structured YAML tree.
 *
 * Used in Leaf detail page left panel. Serves both Generate and Display modes:
 * - Generate: each frame shows Require/Exclude buttons for constraint creation
 * - Display: each frame shows assertion pass/fail badges, highlighted on hover
 */

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import type { WorkspaceMode } from '@/hooks/useLeafPageData';
import type { Assertion, Constraint } from '@/lib/api/leaves';
import { cn } from '@/lib/utils';
import type { SentenceWithSource } from '@/types/sourceContext';

// ============================================================================
// Types
// ============================================================================

interface YAMLTreePanelProps {
  sentences: SentenceWithSource[];
  mode: WorkspaceMode;
  constraints: Constraint[];
  assertions?: Assertion[];
  saving: boolean;
  sentenceConfidence: Map<string, number>;
  commitHash?: string;
  projectId?: string;
  onAddConstraintFromSource: (
    type: 'require' | 'exclude',
    value: string,
    sourceSentenceId: string
  ) => void;
  /** ID of assertion being hovered in QualityPanel */
  highlightedConstraintId?: string | null;
  onHoverSentence?: (sentenceId: string | null) => void;
}

interface ParsedFrame {
  type: string;
  slots: Array<{ key: string; value: string }>;
  sentences: SentenceWithSource[];
  confidence: number;
}

// ============================================================================
// Frame Parsing
// ============================================================================

/**
 * Parse sentences into frame groups.
 * Sentence text format: "[frame_type] key: value; key: value"
 * or plain text without bracket prefix.
 */
function groupSentencesIntoFrames(sentences: SentenceWithSource[]): ParsedFrame[] {
  const frameMap = new Map<string, ParsedFrame>();
  const ungrouped: SentenceWithSource[] = [];

  for (const s of sentences) {
    const match = s.text.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      const frameType = match[1];
      const slotsRaw = match[2];

      let frame = frameMap.get(frameType);
      if (!frame) {
        frame = { type: frameType, slots: [], sentences: [], confidence: 0 };
        frameMap.set(frameType, frame);
      }
      frame.sentences.push(s);

      // Parse "key: value; key: value" into slots
      const pairs = slotsRaw
        .split(';')
        .map((p) => p.trim())
        .filter(Boolean);
      for (const pair of pairs) {
        const colonIdx = pair.indexOf(':');
        if (colonIdx > 0) {
          const key = pair.slice(0, colonIdx).trim();
          const value = pair.slice(colonIdx + 1).trim();
          // Avoid duplicate slots
          if (!frame.slots.some((sl) => sl.key === key)) {
            frame.slots.push({ key, value });
          }
        }
      }
    } else {
      ungrouped.push(s);
    }
  }

  // Calculate confidence per frame (average of sentence confidences)
  const frames = Array.from(frameMap.values());
  // Ungrouped sentences get their own "other" frame
  if (ungrouped.length > 0) {
    frames.push({
      type: 'other',
      slots: ungrouped.map((s) => ({ key: 'text', value: s.text })),
      sentences: ungrouped,
      confidence: 0,
    });
  }

  return frames;
}

// ============================================================================
// FrameCard
// ============================================================================

function FrameCard({
  frame,
  mode,
  assertions,
  constraints,
  saving,
  sentenceConfidence,
  isHighlighted,
  onAddConstraintFromSource,
  onHover,
}: {
  frame: ParsedFrame;
  mode: WorkspaceMode;
  assertions?: Assertion[];
  constraints: Constraint[];
  saving: boolean;
  sentenceConfidence: Map<string, number>;
  isHighlighted: boolean;
  onAddConstraintFromSource: (
    type: 'require' | 'exclude',
    value: string,
    sourceSentenceId: string
  ) => void;
  onHover: (sentenceId: string | null) => void;
}) {
  // Find assertions related to this frame's sentences
  const frameAssertions = useMemo(() => {
    if (!assertions || !constraints) return [];
    // Find constraints that reference this frame's sentences
    const sentenceIds = new Set(frame.sentences.map((s) => s.id));
    const matchingConstraintIds = new Set(
      constraints
        .filter(
          (c) =>
            ('source_sentence_id' in c && sentenceIds.has(c.source_sentence_id ?? '')) ||
            ('source_frame' in c && c.source_frame?.frame_type === frame.type)
        )
        .map((c) => c.id)
    );
    return assertions.filter((a) => matchingConstraintIds.has(a.constraint_id));
  }, [assertions, constraints, frame]);

  const allPassed = frameAssertions.length > 0 && frameAssertions.every((a) => a.passed);
  const anyFailed = frameAssertions.some((a) => !a.passed);

  // Use first sentence ID for constraint source
  const primarySentenceId = frame.sentences[0]?.id ?? '';
  // Build a combined value for require/exclude
  const frameValue = frame.slots.map((s) => `${s.key}: ${s.value}`).join('; ');

  // Average confidence from the page's sentenceConfidence map
  const avgConfidence = useMemo(() => {
    if (frame.sentences.length === 0) return 0;
    let sum = 0;
    let count = 0;
    for (const s of frame.sentences) {
      const c = sentenceConfidence.get(s.id);
      if (c != null) {
        sum += c;
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }, [frame.sentences, sentenceConfidence]);

  return (
    <div
      className={cn(
        'rounded-lg p-2.5 transition-all cursor-pointer group',
        'border',
        isHighlighted && anyFailed
          ? 'border-[var(--status-error)]/50 bg-[var(--status-error)]/5'
          : isHighlighted && allPassed
            ? 'border-[var(--status-success)]/50 bg-[var(--status-success)]/5'
            : 'border-[var(--stroke-default)] hover:border-[var(--stroke-strong)]',
        'bg-[var(--surface-card)] hover:shadow-[var(--fx-shadow-sm)]'
      )}
      onMouseEnter={() => onHover(primarySentenceId)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Frame header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-[var(--accent-leaf)]">{frame.type}</span>
        {avgConfidence > 0 && (
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {Math.round(avgConfidence * 100)}%
          </span>
        )}
      </div>

      {/* Slots */}
      <div className="pl-3 space-y-0.5 font-mono text-xs">
        {frame.slots.map((slot, i) => (
          <div key={`${slot.key}-${i}`} className="text-[var(--text-secondary)]">
            <span className="text-[var(--text-tertiary)]">{slot.key}:</span>{' '}
            <span>{slot.value}</span>
          </div>
        ))}
      </div>

      {/* Generate mode: Require/Exclude buttons */}
      {mode === 'generate' && (
        <div className="mt-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-transparent hover:border-[var(--status-success)]/30 hover:bg-[var(--status-success-muted)] text-[var(--status-success)] transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onAddConstraintFromSource('require', frameValue, primarySentenceId);
            }}
            disabled={saving}
          >
            Require
          </button>
          <button
            type="button"
            className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-transparent hover:border-[var(--status-error)]/30 hover:bg-[var(--status-error-muted)] text-[var(--status-error)] transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onAddConstraintFromSource('exclude', frameValue, primarySentenceId);
            }}
            disabled={saving}
          >
            Exclude
          </button>
        </div>
      )}

      {/* Display mode: assertion badges */}
      {mode === 'display' && frameAssertions.length > 0 && (
        <div className="mt-1.5">
          {allPassed ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--status-success-muted)] text-[var(--status-success)]">
              &#10003; {frameAssertions.length} passed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--status-error)]/10 text-[var(--status-error)]">
              &#10007; {frameAssertions.filter((a) => !a.passed).length} failed
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// YAMLTreePanel
// ============================================================================

export function YAMLTreePanel({
  sentences,
  mode,
  constraints,
  assertions,
  saving,
  sentenceConfidence,
  commitHash,
  projectId,
  onAddConstraintFromSource,
  highlightedConstraintId,
  onHoverSentence,
}: YAMLTreePanelProps) {
  const frames = useMemo(() => groupSentencesIntoFrames(sentences), [sentences]);

  const handleHover = useCallback(
    (id: string | null) => {
      onHoverSentence?.(id);
    },
    [onHoverSentence]
  );

  // Determine which frame is highlighted based on hovered constraint
  const highlightedFrameType = useMemo(() => {
    if (!highlightedConstraintId || !constraints) return null;
    const constraint = constraints.find((c) => c.id === highlightedConstraintId);
    if (!constraint) return null;
    if ('source_frame' in constraint && constraint.source_frame) {
      return constraint.source_frame.frame_type;
    }
    return null;
  }, [highlightedConstraintId, constraints]);

  return (
    <aside
      className={cn(
        'hidden md:flex w-[320px] min-w-[320px] shrink-0 flex-col overflow-y-auto border-r',
        'bg-[color-mix(in_srgb,var(--surface-panel)_88%,transparent)]',
        'backdrop-blur-[var(--fx-blur-panel)]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--stroke-divider)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            Source YAML
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-tertiary)]">
            {frames.length}
          </span>
        </div>
        {commitHash && projectId && (
          <Link
            href={`/project/${projectId}/commit/${encodeURIComponent(commitHash)}`}
            className="text-xs text-[var(--accent-leaf)] hover:underline flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            View Commit
          </Link>
        )}
      </div>

      {/* Frame list */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-1.5">
          {frames.map((frame) => (
            <FrameCard
              key={frame.type}
              frame={frame}
              mode={mode}
              assertions={assertions}
              constraints={constraints}
              saving={saving}
              sentenceConfidence={sentenceConfidence}
              isHighlighted={highlightedFrameType === frame.type}
              onAddConstraintFromSource={onAddConstraintFromSource}
              onHover={handleHover}
            />
          ))}
          {frames.length === 0 && (
            <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">
              No content in this commit.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
