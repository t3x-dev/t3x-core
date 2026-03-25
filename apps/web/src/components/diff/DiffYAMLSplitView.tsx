'use client';

import type { FrameDiff } from '@t3x-dev/core';
import { useCallback, useRef } from 'react';
import { YAML_COLORS } from './DiffYAMLFormatters';
import {
  FrameSeparator,
  getFrameRelations,
  IdenticalCollapseBar,
  RelationAnnotation,
  useDYTheme,
} from './DiffYAMLShared';
import { type AlignedFrame, buildAlignedFrames, buildAlignedSlotKeys } from './DiffYAMLUtils';
import {
  frameLineCount,
  SlotValueSpan,
  WordDiffSpan,
  YAMLFrameRenderer,
} from './YAMLFrameRenderer';
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

/** Compute how many content lines a frame takes on a given side */
function computeFrameHeight(af: AlignedFrame, side: 'left' | 'right', diff: FrameDiff): number {
  const frame = side === 'left' ? af.leftFrame : af.rightFrame;
  if (!frame) {
    // Placeholder side: count from the other side
    const otherFrame = side === 'left' ? af.rightFrame : af.leftFrame;
    if (!otherFrame) return 0;
    const removedSlots = af.slotDiffs?.filter((sd) => sd.type === 'removed').length ?? 0;
    return frameLineCount(otherFrame, removedSlots);
  }

  if (af.type === 'modified' && af.leftFrame && af.rightFrame) {
    // Aligned rendering: 1 header + number of aligned slot keys
    const alignedSlots = buildAlignedSlotKeys(af.leftFrame, af.rightFrame);
    return 1 + alignedSlots.length;
  }

  const removedSlots = af.slotDiffs?.filter((sd) => sd.type === 'removed').length ?? 0;
  return frameLineCount(frame, removedSlots);
}

function computeFrameHeightsMap(
  aligned: AlignedFrame[],
  diff: FrameDiff
): Map<string, { left: number; right: number; max: number; relCount: number }> {
  const map = new Map<string, { left: number; right: number; max: number; relCount: number }>();
  for (const af of aligned) {
    const left = computeFrameHeight(af, 'left', diff);
    const right = computeFrameHeight(af, 'right', diff);
    const relCount = getFrameRelations(af.frameId, diff).length;
    // Relations may differ per side in the future, but for now same count
    const leftTotal = left + relCount;
    const rightTotal = right + relCount;
    map.set(af.frameId, {
      left: leftTotal,
      right: rightTotal,
      max: Math.max(leftTotal, rightTotal),
      relCount,
    });
  }
  return map;
}

function PaneContent({
  aligned,
  side,
  diff,
  activeFrameId,
  onSelectFrame,
  showIdentical,
  heightsMap,
}: {
  aligned: AlignedFrame[];
  side: 'left' | 'right';
  diff: FrameDiff;
  activeFrameId: string | null;
  onSelectFrame: (id: string) => void;
  showIdentical: boolean;
  heightsMap: Map<string, { left: number; right: number; max: number; relCount: number }>;
}) {
  let lineNum = 1;

  // Separate identical frames for potential collapsing
  const nonIdentical = aligned.filter((a) => a.type !== 'identical');
  const identicalFrames = aligned.filter((a) => a.type === 'identical');

  const renderFrame = (af: AlignedFrame) => {
    const frame = side === 'left' ? af.leftFrame : af.rightFrame;
    const hasFrame = !!frame;

    // For added frames, left pane shows placeholder; for removed, right pane shows placeholder
    const isPlaceholder =
      (af.type === 'added' && side === 'left') || (af.type === 'removed' && side === 'right');

    // Calculate removed slot count for line counting
    const removedSlotCount =
      af.type === 'modified' && af.slotDiffs
        ? af.slotDiffs.filter((sd) => sd.type === 'removed').length
        : 0;

    // Get the frame to count lines from (the "real" side)
    const realFrame =
      af.type === 'added' ? af.rightFrame : af.type === 'removed' ? af.leftFrame : frame;

    const placeholderCount = realFrame ? frameLineCount(realFrame, removedSlotCount) : 0;

    // Gather relation annotations for this frame
    const relations = getFrameRelations(af.frameId, diff);

    // For placeholders, we also need to render empty lines for relation annotations
    const relationCount = relations.length;

    const startLine = lineNum;

    // Content rendering
    let content: React.ReactNode;
    if (isPlaceholder) {
      content = <EmptyPlaceholderLines count={placeholderCount} />;
    } else if (af.type === 'modified' && af.leftFrame && af.rightFrame) {
      // ── Modified frame: aligned slot-by-slot rendering ──
      const slotDiffMap = new Map((af.slotDiffs ?? []).map((sd) => [sd.key, sd]));
      const alignedSlots = buildAlignedSlotKeys(af.leftFrame, af.rightFrame);

      const lines: React.ReactNode[] = [];
      // Frame type header
      lines.push(
        <YAMLLine key="header" lineNumber={lineNum++} status="modified">
          <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{frame!.type}</span>
          <span style={{ color: YAML_COLORS.bracket }}>:</span>
        </YAMLLine>
      );

      for (const as of alignedSlots) {
        const sd = slotDiffMap.get(as.key);
        const inThisSide = side === 'left' ? as.inLeft : as.inRight;

        if (!inThisSide) {
          lines.push(
            <YAMLLine key={`empty-${as.key}`} lineNumber={undefined} status="empty">
              {null}
            </YAMLLine>
          );
          continue;
        }

        const value = side === 'left' ? af.leftFrame.slots[as.key] : af.rightFrame.slots[as.key];

        // Line status: both sides stay 'modified' (subtle amber) for changed slots
        // The VALUE itself gets colored, not the whole line
        let lineStatus: 'added' | 'removed' | 'modified' | 'unchanged' = 'unchanged';
        if (sd) {
          if (sd.type === 'added') lineStatus = 'added';
          else if (sd.type === 'removed') lineStatus = 'removed';
          else lineStatus = 'modified'; // both sides get subtle amber line
        }

        // Value rendering: highlight the changed VALUE, not the line
        let valueNode: React.ReactNode;
        if (sd?.wordDiff) {
          valueNode = <WordDiffSpan wordDiff={sd.wordDiff} />;
        } else if (sd?.type === 'changed') {
          // Left side = old value (red highlight), Right side = new value (green highlight)
          const hlClass =
            side === 'left'
              ? 'bg-[var(--dy-removed-word)] rounded-sm px-[3px] py-[1px] font-medium'
              : 'bg-[var(--dy-added-word)] rounded-sm px-[3px] py-[1px] font-medium';
          valueNode = (
            <span className={hlClass}>
              <SlotValueSpan value={value} />
            </span>
          );
        } else {
          valueNode = <SlotValueSpan value={value} />;
        }

        lines.push(
          <YAMLLine key={`slot-${as.key}`} lineNumber={lineNum++} status={lineStatus}>
            {'    '}
            <span style={{ color: YAML_COLORS.key }}>{as.key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            {valueNode}
          </YAMLLine>
        );
      }

      content = <>{lines}</>;
    } else if (hasFrame) {
      content = (
        <YAMLFrameRenderer
          frame={frame!}
          frameStatus={af.type}
          slotDiffs={af.type === 'modified' ? af.slotDiffs : undefined}
          startLine={startLine}
        />
      );
      lineNum += frameLineCount(frame!, removedSlotCount);
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
          <EmptyPlaceholderLines count={relationCount} />
        ) : (
          relations.map((rel, i) => <RelationAnnotation key={`${af.frameId}-rel-${i}`} rel={rel} />)
        )}
        {/* Padding to align with the other side */}
        {(() => {
          const h = heightsMap.get(af.frameId);
          if (!h) return null;
          const myHeight = side === 'left' ? h.left : h.right;
          const padCount = h.max - myHeight;
          return padCount > 0 ? <EmptyPlaceholderLines count={padCount} /> : null;
        })()}
      </div>
    );
  };

  return (
    <>
      {nonIdentical.map(renderFrame)}
      {showIdentical ? (
        identicalFrames.map(renderFrame)
      ) : (
        <IdenticalCollapseBar
          frames={identicalFrames}
          onClick={() => {
            // If there are identical frames, select the first one to trigger showing
            if (identicalFrames.length > 0) {
              onSelectFrame(identicalFrames[0].frameId);
            }
          }}
        />
      )}
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
  const dyTheme = useDYTheme();
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
  const heightsMap = computeFrameHeightsMap(aligned, diff);

  return (
    <div className="flex flex-1 overflow-hidden" style={dyTheme}>
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
          heightsMap={heightsMap}
        />
      </div>

      {/* Right pane (target) */}
      <div ref={rightRef} className="flex-1 overflow-y-auto" onScroll={() => handleScroll('right')}>
        <PaneContent
          aligned={aligned}
          side="right"
          diff={diff}
          activeFrameId={activeFrameId}
          onSelectFrame={onSelectFrame}
          showIdentical={showIdentical}
          heightsMap={heightsMap}
        />
      </div>
    </div>
  );
}
