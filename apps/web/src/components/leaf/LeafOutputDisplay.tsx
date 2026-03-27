'use client';

import { Check, CheckCircle, CheckCircle2, Loader2, Play, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SentenceCoverageEntry, WorkspaceMode } from '@/hooks/useLeafPageData';
import type { Assertion, Constraint } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { SentenceWithSource } from '@/types/sourceContext';

interface LeafOutputDisplayProps {
  output: string | null;
  generatedAt: string | null;
  assertions: Assertion[] | null;
  constraints: Constraint[];
  onGenerate: () => void;
  isGenerating: boolean;
  generatePhase: number;
  generateProgressMessages: string[];
  generateSuccessBanner: string | null;
  // Display Mode props
  mode?: WorkspaceMode;
  sentenceCoverage?: Map<string, SentenceCoverageEntry>;
  sentences?: SentenceWithSource[];
  hoveredSentenceId?: string | null;
  onHoverSentence?: (sentenceId: string | null) => void;
}

/** Build constraint hit markers from assertions + constraints */
function buildConstraintMarkers(
  assertions: Assertion[] | null,
  constraints: Constraint[]
): Array<{ constraint: Constraint; passed: boolean; details: string }> {
  if (!assertions || assertions.length === 0) return [];
  const constraintMap = new Map(constraints.map((c) => [c.id, c]));
  const markers: Array<{ constraint: Constraint; passed: boolean; details: string }> = [];
  for (const a of assertions) {
    const c = constraintMap.get(a.constraint_id);
    if (c) markers.push({ constraint: c, passed: a.passed, details: a.details });
  }
  return markers;
}

/**
 * Build highlighted output segments for Display Mode.
 * Each segment is either plain text or highlighted (linked to a sentence).
 */
interface OutputSegment {
  text: string;
  sentenceId?: string;
  /** Whether the sentence's linked constraint assertion failed */
  failed?: boolean;
  /** Tooltip label showing source frame path (e.g., "user_preference.destination") */
  tooltipLabel?: string;
}

/**
 * Build a lookup: sentenceId → { failed, tooltipLabel } by cross-referencing
 * assertions, constraints, and their source info.
 */
function buildSentenceMetadata(
  assertions: Assertion[] | null,
  constraints: Constraint[]
): Map<string, { failed: boolean; tooltipLabel?: string }> {
  const meta = new Map<string, { failed: boolean; tooltipLabel?: string }>();
  if (!assertions || assertions.length === 0) return meta;

  // Build constraint map and assertion-by-constraint map
  const constraintMap = new Map(constraints.map((c) => [c.id, c]));
  const assertionByConstraint = new Map(assertions.map((a) => [a.constraint_id, a]));

  // For each constraint that links to a sentence, determine pass/fail and tooltip
  for (const c of constraints) {
    if (c.type !== 'require') continue;
    const requireConstraint = c as { source_sentence_id?: string; source_node?: { frame_type: string; slot_key?: string } } & typeof c;
    const sentenceId = requireConstraint.source_sentence_id;
    if (!sentenceId) continue;

    const assertion = assertionByConstraint.get(c.id);
    const failed = assertion ? !assertion.passed : false;

    // Build tooltip from source_node if available
    let tooltipLabel: string | undefined;
    if (requireConstraint.source_node) {
      tooltipLabel = requireConstraint.source_node.slot_key
        ? `${requireConstraint.source_node.frame_type}.${requireConstraint.source_node.slot_key}`
        : requireConstraint.source_node.frame_type;
    }

    const existing = meta.get(sentenceId);
    if (existing) {
      // If any assertion fails for this sentence, mark as failed
      if (failed) existing.failed = true;
      // Keep the first tooltip we find
      if (!existing.tooltipLabel && tooltipLabel) existing.tooltipLabel = tooltipLabel;
    } else {
      meta.set(sentenceId, { failed, tooltipLabel });
    }
  }

  return meta;
}

function buildHighlightedSegments(
  output: string,
  coverage: Map<string, SentenceCoverageEntry>,
  sentenceMeta: Map<string, { failed: boolean; tooltipLabel?: string }>
): OutputSegment[] {
  // Collect all match ranges sorted by position
  const ranges: Array<{ start: number; end: number; sentenceId: string }> = [];
  for (const [id, entry] of coverage.entries()) {
    if (entry.reflected && entry.matchStart !== undefined && entry.matchEnd !== undefined) {
      ranges.push({ start: entry.matchStart, end: entry.matchEnd, sentenceId: id });
    }
  }
  ranges.sort((a, b) => a.start - b.start);

  // Remove overlaps (keep first match)
  const cleaned: typeof ranges = [];
  let lastEnd = 0;
  for (const r of ranges) {
    if (r.start >= lastEnd) {
      cleaned.push(r);
      lastEnd = r.end;
    }
  }

  // Build segments with metadata
  const segments: OutputSegment[] = [];
  let cursor = 0;
  for (const r of cleaned) {
    if (r.start > cursor) {
      segments.push({ text: output.slice(cursor, r.start) });
    }
    const meta = sentenceMeta.get(r.sentenceId);
    segments.push({
      text: output.slice(r.start, r.end),
      sentenceId: r.sentenceId,
      failed: meta?.failed,
      tooltipLabel: meta?.tooltipLabel,
    });
    cursor = r.end;
  }
  if (cursor < output.length) {
    segments.push({ text: output.slice(cursor) });
  }

  return segments;
}

export function LeafOutputDisplay({
  output,
  generatedAt,
  assertions,
  constraints,
  onGenerate,
  isGenerating,
  generatePhase,
  generateProgressMessages,
  generateSuccessBanner,
  mode = 'generate',
  sentenceCoverage,
  sentences: _sentences,
  hoveredSentenceId,
  onHoverSentence,
}: LeafOutputDisplayProps) {
  const passedCount = assertions?.filter((a) => a.passed).length ?? 0;
  const totalCount = assertions?.length ?? 0;
  const allPassed = totalCount > 0 && passedCount === totalCount;

  const markers = useMemo(
    () => buildConstraintMarkers(assertions, constraints),
    [assertions, constraints]
  );

  const sentenceMeta = useMemo(
    () => buildSentenceMetadata(assertions, constraints),
    [assertions, constraints]
  );

  const highlightedSegments = useMemo(() => {
    if (mode !== 'display' || !output || !sentenceCoverage) return null;
    return buildHighlightedSegments(output, sentenceCoverage, sentenceMeta);
  }, [mode, output, sentenceCoverage, sentenceMeta]);

  const handleSegmentHover = useCallback(
    (sentenceId: string | null) => {
      onHoverSentence?.(sentenceId);
    },
    [onHoverSentence]
  );

  if (!output) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--hover-bg)]">
          <Play className="h-6 w-6 text-[var(--text-tertiary)]" />
        </div>
        <p className="text-sm font-medium text-[var(--text-secondary)] mb-1">No output yet</p>
        <p className="text-xs text-[var(--text-tertiary)] mb-5 max-w-[280px] leading-relaxed">
          Configure your constraints on the left, write instructions below, then generate AI output
          from your knowledge base.
        </p>
        <Button size="sm" onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {generateProgressMessages[generatePhase]}
            </>
          ) : (
            <>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Generate & Verify
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Output header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-bold text-[var(--text-primary)]">Output</h2>
          {totalCount > 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                allPassed
                  ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
                  : 'bg-[var(--status-error-muted)] text-[var(--status-error)]'
              )}
            >
              {allPassed ? <CheckCircle className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {passedCount}/{totalCount} passed
            </span>
          )}
        </div>
        {generatedAt && (
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {new Date(generatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {/* Success banner */}
      {generateSuccessBanner && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--diff-added-border)] bg-[var(--diff-added-bg)] px-4 py-2.5 text-sm font-medium text-[var(--diff-added-text)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {generateSuccessBanner}
        </div>
      )}

      {/* Constraint hit markers */}
      {markers.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {markers.map(({ constraint, passed, details }) => (
            <Tooltip key={constraint.id}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium cursor-default border',
                    passed
                      ? 'border-[var(--status-success)]/30 bg-[var(--status-success-muted)] text-[var(--status-success)]'
                      : 'border-[var(--status-error)]/30 bg-[var(--status-error-muted)] text-[var(--status-error)]'
                  )}
                >
                  {passed ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                  <span className="max-w-[100px] truncate">{constraint.value}</span>
                  <span className="text-[9px] opacity-70 uppercase">
                    {constraint.type === 'require' ? 'req' : 'exc'}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p className="font-medium">
                  {constraint.type === 'require' ? 'Require' : 'Exclude'}: {constraint.value}
                </p>
                <p className="text-muted-foreground mt-0.5">{details}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}

      {/* Output text card */}
      <div
        className={cn(
          'whitespace-pre-wrap rounded-xl border border-[var(--stroke-strong)] p-6 text-sm leading-[1.8] text-[var(--text-secondary)]',
          'bg-[var(--glass-bg-reading)] backdrop-blur-[var(--glass-blur-reading)] shadow-[var(--shadow-reading)]',
          'min-h-[200px] transition-all duration-300',
          allPassed && 'ring-2 ring-[var(--status-success)]/30'
        )}
      >
        {mode === 'display' && highlightedSegments
          ? // Display Mode: output with inline highlights
            highlightedSegments.map((seg, i) =>
              seg.sentenceId ? (
                <span
                  key={`seg-${i}`}
                  className={cn(
                    'font-semibold rounded-sm px-0.5 cursor-pointer transition-colors border-b-2',
                    seg.failed
                      ? 'bg-[var(--leaf-fail-bg)] border-[var(--leaf-fail-border)] line-through decoration-[var(--leaf-fail-border)]'
                      : 'bg-[var(--leaf-match-bg)] border-[var(--leaf-match-border)]',
                    hoveredSentenceId === seg.sentenceId &&
                      (seg.failed
                        ? 'bg-[var(--leaf-fail-border)]'
                        : 'bg-[var(--leaf-match-border)]')
                  )}
                  title={
                    seg.tooltipLabel
                      ? `← ${seg.tooltipLabel}`
                      : `← ${seg.sentenceId}`
                  }
                  onMouseEnter={() => handleSegmentHover(seg.sentenceId!)}
                  onMouseLeave={() => handleSegmentHover(null)}
                >
                  {seg.text}
                </span>
              ) : (
                <span key={`seg-${i}`}>{seg.text}</span>
              )
            )
          : // Generate Mode: plain text
            output}
      </div>
    </div>
  );
}
