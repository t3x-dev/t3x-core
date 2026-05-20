'use client';

import { CheckCircle2, Loader2, Play } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import type { NodeCoverageEntry, WorkspaceMode } from '@/hooks/leaves/useLeafPageData';
import type { Assertion, Constraint } from '@/types/api';
import type { NodeWithSource } from '@/types/sourceContext';
import { cn } from '@/utils/cn';

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
      (constraint.type === 'require' && passed) || (constraint.type === 'exclude' && !passed);
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
    const overlaps = constraintRanges.some((cr) => r.start < cr.end && r.end > cr.start);
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

type OutputBlockKind = 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'divider';

interface OutputBlock {
  kind: OutputBlockKind;
  segments: OutputSegment[];
  markerNumber: number | null;
}

function splitSegmentsIntoBlocks(segments: OutputSegment[]): OutputSegment[][] {
  const blocks: OutputSegment[][] = [];
  let current: OutputSegment[] = [];

  const flush = () => {
    if (current.some((segment) => segment.text.trim().length > 0)) {
      blocks.push(current);
    }
    current = [];
  };

  for (const segment of segments) {
    const parts = segment.text.split(/(\n{2,})/);
    for (const part of parts) {
      if (part.length === 0) continue;
      if (/^\n{2,}$/.test(part)) {
        flush();
        continue;
      }
      current.push({ ...segment, text: part });
    }
  }

  flush();
  return blocks;
}

function getBlockText(block: OutputSegment[]): string {
  return block.map((segment) => segment.text).join('');
}

function stripLeadingCharacters(block: OutputSegment[], count: number): OutputSegment[] {
  let remaining = count;
  const stripped: OutputSegment[] = [];

  for (const segment of block) {
    if (remaining >= segment.text.length) {
      remaining -= segment.text.length;
      continue;
    }
    stripped.push({
      ...segment,
      text: remaining > 0 ? segment.text.slice(remaining) : segment.text,
    });
    remaining = 0;
  }

  return stripped;
}

function classifyBlock(block: OutputSegment[]): Omit<OutputBlock, 'markerNumber'> | null {
  const rawText = getBlockText(block);
  const trimmedStart = rawText.trimStart();
  if (!trimmedStart.trim()) return null;
  if (/^-{3,}$/.test(trimmedStart.trim())) {
    return { kind: 'divider', segments: [] };
  }

  const boldHeading = /^\*\*([^*]+)\*\*$/.exec(trimmedStart.trim());
  if (boldHeading) {
    const leadingWhitespace = rawText.length - trimmedStart.length;
    const prefixLength = leadingWhitespace + 2;
    return {
      kind: 'heading2',
      segments: stripLeadingCharacters(block, prefixLength).map((segment, index, segments) => {
        if (index !== segments.length - 1) return segment;
        return { ...segment, text: segment.text.replace(/\*\*$/, '') };
      }),
    };
  }

  const heading = /^(#{1,3})\s+/.exec(trimmedStart);
  if (!heading) {
    return { kind: 'paragraph', segments: block };
  }

  const leadingWhitespace = rawText.length - trimmedStart.length;
  const prefixLength = leadingWhitespace + heading[0].length;
  const headingLevel = heading[1].length;
  const kind: OutputBlockKind =
    headingLevel === 1 ? 'heading1' : headingLevel === 2 ? 'heading2' : 'heading3';

  return {
    kind,
    segments: stripLeadingCharacters(block, prefixLength),
  };
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

  const outputBlocks = useMemo((): OutputBlock[] => {
    if (!output) return [];
    const sourceSegments = highlightedSegments ?? [{ text: output }];
    const classified = splitSegmentsIntoBlocks(sourceSegments)
      .map(classifyBlock)
      .filter((block): block is Omit<OutputBlock, 'markerNumber'> => block !== null);
    const hasHeadings = classified.some((block) => block.kind !== 'paragraph');
    let markerNumber = 1;

    return classified.map((block, index) => {
      const shouldMark =
        hasHeadings ? block.kind !== 'paragraph' && block.kind !== 'divider' : index < 6;
      return {
        ...block,
        markerNumber: shouldMark ? markerNumber++ : null,
      };
    });
  }, [highlightedSegments, output]);

  const handleSegmentHover = useCallback(
    (nodeId: string | null) => {
      onHoverNode?.(nodeId);
    },
    [onHoverNode]
  );

  const renderOutputSegments = useCallback(
    (segments: OutputSegment[], blockIndex: number) =>
      segments.map((seg, i) => {
        const segmentKey = `${blockIndex}-${seg.nodeId ?? 'plain'}-${seg.constraintType ?? 'none'}-${seg.text}-${i}`;
        let inlineOffset = 0;
        const inlineContent = seg.text.split(/(\*\*[^*]+?\*\*)/g).map((part) => {
          const strong = /^\*\*([^*]+)\*\*$/.exec(part);
          const partKey = `${segmentKey}-${inlineOffset}-${part}`;
          inlineOffset += part.length;
          return strong ? (
            <strong key={partKey} className="font-bold">
              {strong[1]}
            </strong>
          ) : (
            part
          );
        });
        if (seg.constraintType) {
          return (
            <span
              key={segmentKey}
              className={cn(
                '-mx-0.5 rounded border-b px-0.5 transition-colors',
                seg.constraintType === 'require'
                  ? 'border-[var(--status-success)]/40 bg-[var(--status-success-muted)] text-[var(--text-primary)]'
                  : 'border-[var(--status-error)]/40 bg-[var(--status-error-muted)] text-[var(--text-primary)]'
              )}
            >
              {inlineContent}
            </span>
          );
        }

        if (seg.nodeId) {
          return (
            <span
              key={segmentKey}
              className={cn(
                'cursor-pointer rounded-sm underline decoration-[var(--source)] decoration-2 underline-offset-[3px] transition-colors',
                hoveredNodeId === seg.nodeId && 'bg-[var(--source-dim)]'
              )}
              onMouseEnter={() => handleSegmentHover(seg.nodeId!)}
              onMouseLeave={() => handleSegmentHover(null)}
            >
              {inlineContent}
            </span>
          );
        }

        return <span key={segmentKey}>{inlineContent}</span>;
      }),
    [handleSegmentHover, hoveredNodeId]
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
    <div className="mx-auto w-full max-w-[780px]">
      {/* Output header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Output</h2>
        </div>
        <span className="text-[11px] text-[var(--text-tertiary)]">
          Reading surface · source-backed paragraphs
          {generatedAt ? ` · generated ${formatDisplayTime(generatedAt)}` : ''}
        </span>
      </div>

      {/* Success banner */}
      {generateSuccessBanner && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--diff-added-border)] bg-[var(--diff-added-bg)] px-4 py-2.5 text-sm font-medium text-[var(--diff-added-text)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {generateSuccessBanner}
        </div>
      )}

      {/* Output text card */}
      <div
        className={cn(
          'relative min-h-[200px] rounded-2xl border border-[var(--stroke-strong)] bg-[var(--surface-card)] px-6 py-7 text-[15px] leading-8 text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)] md:px-8',
          'transition-all duration-300',
          allPassed && 'ring-1 ring-[var(--status-success)]/20'
        )}
      >
        <div className="absolute bottom-7 left-8 top-7 w-px bg-[var(--stroke-divider)]" />
        <div className="space-y-5">
          {outputBlocks.map((block, blockIndex) => (
            <section key={`${block.kind}-${blockIndex}`} className="relative pl-9">
              {block.markerNumber !== null && (
                <span className="absolute left-[-4px] top-[0.35rem] flex h-4 w-4 items-center justify-center rounded-full bg-[var(--source)] text-[9px] font-bold leading-none text-[var(--on-accent)]">
                  {block.markerNumber}
                </span>
              )}
              {block.kind === 'divider' ? (
                <div className="my-1 h-px w-full bg-[var(--stroke-divider)]" />
              ) : block.kind === 'heading1' ? (
                <h1 className="text-[22px] font-bold leading-8 text-[var(--text-primary)]">
                  {renderOutputSegments(block.segments, blockIndex)}
                </h1>
              ) : block.kind === 'heading2' ? (
                <h2 className="text-[16px] font-bold leading-7 text-[var(--text-primary)]">
                  {renderOutputSegments(block.segments, blockIndex)}
                </h2>
              ) : block.kind === 'heading3' ? (
                <h3 className="text-[14px] font-bold leading-7 text-[var(--text-primary)]">
                  {renderOutputSegments(block.segments, blockIndex)}
                </h3>
              ) : (
                <p className="whitespace-pre-wrap leading-8 text-[var(--text-primary)]">
                  {renderOutputSegments(block.segments, blockIndex)}
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDisplayTime(value: string): string {
  const date = new Date(value);
  const hours = String((date.getUTCHours() + 8) % 24).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
