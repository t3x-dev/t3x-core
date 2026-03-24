'use client';

import { useCallback, useRef } from 'react';
import type { FrameDiff } from '@t3x-dev/core';
import { buildAlignedFrames, type AlignedFrame } from './DiffYAMLUtils';
import {
  DY_CSS_VARS,
  FrameSeparator,
  RelationAnnotation,
  IdenticalCollapseBar,
  getFrameRelations,
} from './DiffYAMLShared';
import { YAMLFrameRenderer, frameLineCount } from './YAMLFrameRenderer';
import { YAMLLine } from './YAMLLine';

// ── Props ──

interface DiffYAMLSplitViewProps {
  diff: FrameDiff;
  activeFrameId: string | null;
  onSelectFrame: (id: string) => void;
  showIdentical: boolean;
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
      style={DY_CSS_VARS}
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
