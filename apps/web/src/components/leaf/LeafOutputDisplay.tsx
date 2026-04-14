'use client';

import { Check, CheckCircle, CheckCircle2, Loader2, Play, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { NodeCoverageEntry, WorkspaceMode } from '@/hooks/useLeafPageData';
import type { Assertion, Constraint } from '@/types/api';
import { cn } from '@/utils/cn';
import type { NodeWithSource } from '@/types/sourceContext';

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
  nodeCoverage?: Map<string, NodeCoverageEntry>;
  nodes?: NodeWithSource[];
  hoveredNodeId?: string | null;
  onHoverNode?: (nodeId: string | null) => void;
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
 * Each segment is either plain text or highlighted (linked to a node).
 */
interface OutputSegment {
  text: string;
  nodeId?: string;
  /** Constraint highlight: 'require' (green) or 'exclude' (red) */
  constraintType?: 'require' | 'exclude';
}

/**
 * Find all occurrences of constraint values in output text (case-insensitive).
 * Returns non-overlapping ranges sorted by position.
 */
function buildConstraintRanges(
  output: string,
  markers: Array<{ constraint: Constraint; passed: boolean }>
): Array<{ start: number; end: number; type: 'require' | 'exclude' }> {
  const ranges: Array<{ start: number; end: number; type: 'require' | 'exclude' }> = [];
  const lowerOutput = output.toLowerCase();

  for (const { constraint, passed } of markers) {
    // For REQUIRE: highlight when found (passed)
    // For EXCLUDE: highlight when found (failed — it shouldn't be there)
    const shouldHighlight =
      (constraint.type === 'require' && passed) ||
      (constraint.type === 'exclude' && !passed);
    if (!shouldHighlight) continue;

    const needle = constraint.value.toLowerCase();
    if (needle.length < 2) continue;

    let pos = 0;
    while (pos < lowerOutput.length) {
      const idx = lowerOutput.indexOf(needle, pos);
      if (idx === -1) break;
      ranges.push({
        start: idx,
        end: idx + needle.length,
        type: constraint.type as 'require' | 'exclude',
      });
      pos = idx + needle.length;
    }
  }

  // Sort by position, remove overlaps (first match wins; overlapping constraint fully dropped)
  ranges.sort((a, b) => a.start - b.start);
  const cleaned: typeof ranges = [];
  let lastEnd = 0;
  for (const r of ranges) {
    if (r.start >= lastEnd) {
      cleaned.push(r);
      lastEnd = r.end;
    }
  }
  return cleaned;
}

function buildHighlightedSegments(
  output: string,
  coverage: Map<string, NodeCoverageEntry> | null,
  markers: Array<{ constraint: Constraint; passed: boolean }>
): OutputSegment[] {
  // Collect node coverage ranges
  const nodeRanges: Array<{ start: number; end: number; nodeId: string }> = [];
  if (coverage) {
    for (const [id, entry] of coverage.entries()) {
      if (entry.reflected && entry.matchStart !== undefined && entry.matchEnd !== undefined) {
        nodeRanges.push({ start: entry.matchStart, end: entry.matchEnd, nodeId: id });
      }
    }
  }

  // Collect constraint ranges
  const constraintRanges = buildConstraintRanges(output, markers);

  // Merge all ranges into a unified structure, constraint ranges take priority
  const allRanges: Array<{
    start: number;
    end: number;
    nodeId?: string;
    constraintType?: 'require' | 'exclude';
  }> = [];

  // Add constraint ranges first (higher priority)
  for (const r of constraintRanges) {
    allRanges.push({ start: r.start, end: r.end, constraintType: r.type });
  }
  // Add node ranges that don't overlap with constraint ranges
  for (const r of nodeRanges) {
    const overlaps = constraintRanges.some(
      (cr) => r.start < cr.end && r.end > cr.start
    );
    if (!overlaps) {
      allRanges.push({ start: r.start, end: r.end, nodeId: r.nodeId });
    }
  }

  allRanges.sort((a, b) => a.start - b.start);

  // Remove overlaps (keep first)
  const cleaned: typeof allRanges = [];
  let lastEnd = 0;
  for (const r of allRanges) {
    if (r.start >= lastEnd) {
      cleaned.push(r);
      lastEnd = r.end;
    }
  }

  // Build segments
  const segments: OutputSegment[] = [];
  let cursor = 0;
  for (const r of cleaned) {
    if (r.start > cursor) {
      segments.push({ text: output.slice(cursor, r.start) });
    }
    segments.push({
      text: output.slice(r.start, r.end),
      nodeId: r.nodeId,
      constraintType: r.constraintType,
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
  nodeCoverage,
  nodes: _nodes,
  hoveredNodeId,
  onHoverNode,
}: LeafOutputDisplayProps) {
  const passedCount = assertions?.filter((a) => a.passed).length ?? 0;
  const totalCount = assertions?.length ?? 0;
  const allPassed = totalCount > 0 && passedCount === totalCount;

  const markers = useMemo(
    () => buildConstraintMarkers(assertions, constraints),
    [assertions, constraints]
  );

  const highlightedSegments = useMemo(() => {
    if (!output) return null;
    // In display mode: node coverage + constraint highlights
    // In generate mode: constraint highlights only (when assertions exist)
    const hasConstraintHighlights = markers.length > 0;
    const hasNodeCoverage = mode === 'display' && nodeCoverage;
    if (!hasConstraintHighlights && !hasNodeCoverage) return null;
    return buildHighlightedSegments(output, hasNodeCoverage ? nodeCoverage! : null, markers);
  }, [mode, output, nodeCoverage, markers]);

  const handleSegmentHover = useCallback(
    (nodeId: string | null) => {
      onHoverNode?.(nodeId);
    },
    [onHoverNode]
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
        {highlightedSegments
          ? highlightedSegments.map((seg, i) =>
              seg.constraintType ? (
                <span
                  key={`seg-${i}`}
                  className={cn(
                    'rounded px-0.5 -mx-0.5 transition-colors border-b',
                    seg.constraintType === 'require'
                      ? 'bg-[var(--status-success-muted)] border-[var(--status-success)]/40 text-[var(--text-primary)]'
                      : 'bg-[var(--status-error-muted)] border-[var(--status-error)]/40 text-[var(--text-primary)]'
                  )}
                >
                  {seg.text}
                </span>
              ) : seg.nodeId ? (
                <span
                  key={`seg-${i}`}
                  className={cn(
                    'underline decoration-[var(--status-success)] decoration-2 underline-offset-[3px] cursor-pointer transition-colors',
                    hoveredNodeId === seg.nodeId &&
                      'bg-[var(--status-success-muted)] rounded-sm'
                  )}
                  onMouseEnter={() => handleSegmentHover(seg.nodeId!)}
                  onMouseLeave={() => handleSegmentHover(null)}
                >
                  {seg.text}
                </span>
              ) : (
                <span key={`seg-${i}`}>{seg.text}</span>
              )
            )
          : output}
      </div>
    </div>
  );
}
