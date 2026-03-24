'use client';

import { useCallback, useRef } from 'react';
import type { FrameDiff, Relation } from '@t3x-dev/core';
import { cn } from '@/lib/utils';
import { buildAlignedFrames, type AlignedFrame } from './DiffYAMLUtils';
import { YAMLFrameRenderer, frameLineCount } from './YAMLFrameRenderer';
import { YAMLLine } from './YAMLLine';

// ── Relation color map ──
const REL_COLORS: Record<string, string> = {
  causes: '#ff9e64',
  conditions: '#e3b341',
  contrasts: '#f85149',
  elaborates: '#58a6ff',
  follows: '#7d8590',
  depends: '#d2a8ff',
};

function relColor(type: string): string {
  return REL_COLORS[type] ?? '#7d8590';
}

// ── Props ──

interface DiffYAMLSplitViewProps {
  diff: FrameDiff;
  activeFrameId: string | null;
  onSelectFrame: (id: string) => void;
  showIdentical: boolean;
}

// ── Relation helpers ──

interface FrameRelation {
  relation: Relation;
  status: 'added' | 'removed' | 'kept';
  /** The "other" frame id (relative to the frame we're annotating) */
  otherId: string;
  /** Arrow direction: 'in' means other -> this frame, 'out' means this frame -> other */
  direction: 'in' | 'out';
}

/**
 * Gather relations relevant to a given frame, annotated with diff status.
 */
function getFrameRelations(
  frameId: string,
  diff: FrameDiff,
): FrameRelation[] {
  const results: FrameRelation[] = [];
  const addedSet = new Set(diff.relationsAdded.map(r => `${r.from}:${r.to}:${r.type}`));
  const removedSet = new Set(diff.relationsRemoved.map(r => `${r.from}:${r.to}:${r.type}`));

  // Collect all relations touching this frame
  const allRelations = [
    ...diff.relationsAdded,
    ...diff.relationsRemoved,
  ];

  // Also collect "kept" relations: present in both source and target.
  // These are relations NOT in added or removed. We need to find them from frames.
  // Since FrameDiff doesn't explicitly list kept relations, we infer from added/removed.
  // For now, we only show added and removed relation annotations.
  // But the preview shows "kept" relations too. We'll collect all unique relation keys
  // and determine status.

  // Build a map of all relations we know about
  const seen = new Set<string>();

  for (const r of diff.relationsAdded) {
    const key = `${r.from}:${r.to}:${r.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.from === frameId) {
      results.push({ relation: r, status: 'added', otherId: r.to, direction: 'out' });
    } else if (r.to === frameId) {
      results.push({ relation: r, status: 'added', otherId: r.from, direction: 'in' });
    }
  }

  for (const r of diff.relationsRemoved) {
    const key = `${r.from}:${r.to}:${r.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.from === frameId) {
      results.push({ relation: r, status: 'removed', otherId: r.to, direction: 'out' });
    } else if (r.to === frameId) {
      results.push({ relation: r, status: 'removed', otherId: r.from, direction: 'in' });
    }
  }

  return results;
}

// ── Frame separator ──

function FrameSeparator({
  aligned,
  onClick,
  isActive,
}: {
  aligned: AlignedFrame;
  onClick: () => void;
  isActive: boolean;
}) {
  const statusLabel = aligned.type === 'modified' ? '~mod'
    : aligned.type === 'added' ? '+new'
    : aligned.type === 'removed' ? '-del'
    : '=';

  const statusClass = aligned.type === 'modified' ? 'text-[var(--dy-modified-accent)]'
    : aligned.type === 'added' ? 'text-[var(--dy-added-accent)]'
    : aligned.type === 'removed' ? 'text-[var(--dy-removed-accent)]'
    : 'text-[var(--text-tertiary)]';

  const frame = aligned.leftFrame ?? aligned.rightFrame;
  const frameType = frame?.type ?? aligned.frameId;

  return (
    <div
      id={`diff-frame-${aligned.frameId}`}
      className={cn(
        'flex items-center gap-[5px] text-[9px] font-medium uppercase tracking-[0.6px] select-none cursor-pointer',
        'pt-[5px] pb-[2px] opacity-60 hover:opacity-100',
        'text-[var(--text-tertiary)]',
        isActive && 'opacity-100 bg-[var(--hover-bg)]',
      )}
      style={{ paddingLeft: 'calc(36px + 4px + 10px)' }}
      onClick={onClick}
    >
      <span className={cn('text-[8px] font-semibold tracking-[0.3px]', statusClass)}>
        {statusLabel}
      </span>
      <span>{frameType}</span>
      <span className="font-mono opacity-40 text-[8px]">{aligned.frameId}</span>
      {/* Divider line */}
      <span className="flex-1 h-px bg-[var(--stroke-divider)] opacity-50" />
    </div>
  );
}

// ── Relation annotation line ──

function RelationAnnotation({ rel }: { rel: FrameRelation }) {
  const statusClass = rel.status === 'added' ? 'text-[var(--dy-added-accent)]'
    : rel.status === 'removed' ? 'text-[var(--dy-removed-accent)] line-through opacity-50'
    : 'text-[var(--text-tertiary)] opacity-40';

  const arrow = rel.direction === 'in' ? '\u2190' : '\u2192';

  return (
    <div
      className={cn(
        'flex items-center gap-1 font-mono text-[10px] min-h-[18px]',
        statusClass,
      )}
      style={{ paddingLeft: 'calc(36px + 4px + 10px)', paddingRight: '10px' }}
    >
      <span className="inline-flex items-center gap-[3px] px-1 rounded-sm text-[9px]">
        <span
          className="w-1 h-1 rounded-full shrink-0"
          style={{ background: relColor(rel.relation.type) }}
        />
      </span>
      <span className="opacity-40">{arrow}</span>
      <span>{rel.otherId}</span>
      <span className="opacity-30 text-[9px]">{rel.relation.type}</span>
    </div>
  );
}

// ── Empty placeholder lines ──

function EmptyPlaceholderLines({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <YAMLLine key={`empty-${i}`} status="empty">
          {null}
        </YAMLLine>
      ))}
    </>
  );
}

// ── Identical frames collapse bar ──

function IdenticalCollapseBar({
  frames,
  onClick,
}: {
  frames: AlignedFrame[];
  onClick: () => void;
}) {
  if (frames.length === 0) return null;
  const names = frames
    .map(f => (f.leftFrame ?? f.rightFrame)?.type ?? f.frameId)
    .join(', ');
  return (
    <div
      className="flex items-center gap-[5px] font-mono text-[10px] text-[var(--text-tertiary)] cursor-pointer select-none opacity-50 hover:opacity-80 hover:bg-[var(--hover-bg)]"
      style={{ padding: '3px 10px 3px calc(36px + 4px + 10px)' }}
      onClick={onClick}
    >
      <span>\u25B6</span>
      <span>{frames.length} identical frame{frames.length > 1 ? 's' : ''}</span>
      <span className="opacity-50">({names})</span>
    </div>
  );
}

// ── Pane content renderer ──

function PaneContent({
  aligned,
  side,
  diff,
  activeFrameId,
  onSelectFrame,
  showIdentical,
}: {
  aligned: AlignedFrame[];
  side: 'left' | 'right';
  diff: FrameDiff;
  activeFrameId: string | null;
  onSelectFrame: (id: string) => void;
  showIdentical: boolean;
}) {
  let lineNum = 1;

  // Separate identical frames for potential collapsing
  const nonIdentical = aligned.filter(a => a.type !== 'identical');
  const identicalFrames = aligned.filter(a => a.type === 'identical');

  const renderFrame = (af: AlignedFrame) => {
    const frame = side === 'left' ? af.leftFrame : af.rightFrame;
    const hasFrame = !!frame;

    // For added frames, left pane shows placeholder; for removed, right pane shows placeholder
    const isPlaceholder =
      (af.type === 'added' && side === 'left') ||
      (af.type === 'removed' && side === 'right');

    // Calculate removed slot count for line counting
    const removedSlotCount =
      af.type === 'modified' && af.slotDiffs
        ? af.slotDiffs.filter(sd => sd.type === 'removed').length
        : 0;

    // Get the frame to count lines from (the "real" side)
    const realFrame = af.type === 'added' ? af.rightFrame
      : af.type === 'removed' ? af.leftFrame
      : frame;

    const placeholderCount = realFrame
      ? frameLineCount(realFrame, removedSlotCount)
      : 0;

    // Gather relation annotations for this frame
    const relations = getFrameRelations(af.frameId, diff);

    // For placeholders, we also need to render empty lines for relation annotations
    const relationCount = relations.length;

    const startLine = lineNum;

    // Content rendering
    let content: React.ReactNode;
    if (isPlaceholder) {
      content = <EmptyPlaceholderLines count={placeholderCount} />;
      // Don't advance line numbers for placeholders
    } else if (hasFrame) {
      content = (
        <YAMLFrameRenderer
          frame={frame}
          frameStatus={af.type}
          slotDiffs={af.type === 'modified' ? af.slotDiffs : undefined}
          startLine={startLine}
        />
      );
      lineNum += frameLineCount(frame, removedSlotCount);
    } else {
      content = null;
    }

    return (
      <div key={`${side}-${af.frameId}`}>
        <FrameSeparator
          aligned={af}
          onClick={() => onSelectFrame(af.frameId)}
          isActive={activeFrameId === af.frameId}
        />
        {content}
        {/* Relation annotations */}
        {isPlaceholder ? (
          // Render empty placeholders for relations too, to keep alignment
          <EmptyPlaceholderLines count={relationCount} />
        ) : (
          relations.map((rel, i) => (
            <RelationAnnotation key={`${af.frameId}-rel-${i}`} rel={rel} />
          ))
        )}
      </div>
    );
  };

  return (
    <>
      {nonIdentical.map(renderFrame)}
      {showIdentical
        ? identicalFrames.map(renderFrame)
        : (
          <IdenticalCollapseBar
            frames={identicalFrames}
            onClick={() => {
              // If there are identical frames, select the first one to trigger showing
              if (identicalFrames.length > 0) {
                onSelectFrame(identicalFrames[0].frameId);
              }
            }}
          />
        )
      }
    </>
  );
}

// ── Main component ──

export function DiffYAMLSplitView({
  diff,
  activeFrameId,
  onSelectFrame,
  showIdentical,
}: DiffYAMLSplitViewProps) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    requestAnimationFrame(() => {
      const from = source === 'left' ? leftRef.current : rightRef.current;
      const to = source === 'left' ? rightRef.current : leftRef.current;
      if (from && to) {
        to.scrollTop = from.scrollTop;
      }
      syncingRef.current = false;
    });
  }, []);

  const aligned = buildAlignedFrames(diff);

  return (
    <div
      className="flex flex-1 overflow-hidden"
      style={{
        // CSS custom properties for diff colors
        '--dy-surface': '#0d1117',
        '--dy-added-bg': 'rgba(46,160,67,0.15)',
        '--dy-added-accent': '#3fb950',
        '--dy-added-word': 'rgba(46,160,67,0.45)',
        '--dy-removed-bg': 'rgba(248,81,73,0.15)',
        '--dy-removed-accent': '#f85149',
        '--dy-removed-word': 'rgba(248,81,73,0.40)',
        '--dy-modified-bg': 'rgba(210,153,34,0.10)',
        '--dy-modified-accent': '#d29922',
      } as React.CSSProperties}
    >
      {/* Left pane (base) */}
      <div
        ref={leftRef}
        className="flex-1 overflow-y-auto"
        style={{ borderRight: '2px solid var(--stroke-pane-border, rgba(255,255,255,0.08))' }}
        onScroll={() => handleScroll('left')}
      >
        <PaneContent
          aligned={aligned}
          side="left"
          diff={diff}
          activeFrameId={activeFrameId}
          onSelectFrame={onSelectFrame}
          showIdentical={showIdentical}
        />
      </div>

      {/* Right pane (target) */}
      <div
        ref={rightRef}
        className="flex-1 overflow-y-auto"
        onScroll={() => handleScroll('right')}
      >
        <PaneContent
          aligned={aligned}
          side="right"
          diff={diff}
          activeFrameId={activeFrameId}
          onSelectFrame={onSelectFrame}
          showIdentical={showIdentical}
        />
      </div>
    </div>
  );
}
