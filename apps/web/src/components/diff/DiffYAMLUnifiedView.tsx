'use client';

import type { TreeDiff, SlotDiff, SlotValue } from '@t3x-dev/core';
import { cn } from '@/lib/utils';
import { formatSlotValue, YAML_COLORS } from './DiffYAMLFormatters';
import {
  FrameSeparator,
  getFrameRelations,
  IdenticalCollapseBar,
  RelationAnnotation,
  useDYTheme,
} from './DiffYAMLShared';
import { type AlignedFrame, buildAlignedFrames } from './DiffYAMLUtils';
import { frameLineCount, SlotValueSpan, WordDiffSpan } from './YAMLFrameRenderer';

// ── Props ──

interface DiffYAMLUnifiedViewProps {
  diff: TreeDiff;
  activeFrameId: string | null;
  onSelectFrame: (id: string) => void;
  showIdentical: boolean;
}

// ── Unified padding constant ──

const UNIFIED_PADDING = 'calc(72px + 4px + 10px)';

// ── Unified line with dual gutters ──

type UnifiedLineStatus = 'added' | 'removed' | 'modified' | 'unchanged' | 'empty';

function UnifiedLine({
  leftNum,
  rightNum,
  status,
  children,
}: {
  leftNum?: number;
  rightNum?: number;
  status: UnifiedLineStatus;
  children: React.ReactNode;
}) {
  const isEmpty = status === 'empty';

  return (
    <div
      className={cn(
        'diff-yaml-line flex items-stretch font-mono text-[11.5px] leading-[21px]',
        status === 'unchanged' && 'opacity-[0.45] hover:opacity-80',
        isEmpty && 'diff-yaml-empty'
      )}
    >
      {/* Left gutter (base line number) */}
      <div
        className={cn(
          'w-[36px] min-w-[36px] shrink-0 select-none text-right pr-2 text-[9px] leading-[21px]',
          status === 'added' && 'text-[var(--dy-added-accent)] opacity-50',
          status === 'removed' && 'text-[var(--dy-removed-accent)] opacity-50',
          status === 'modified' && 'text-[var(--dy-modified-accent)] opacity-40',
          (status === 'unchanged' || isEmpty) && 'text-[var(--text-tertiary)] opacity-50'
        )}
      >
        {isEmpty ? '' : leftNum}
      </div>

      {/* Right gutter (target line number) */}
      <div
        className={cn(
          'w-[36px] min-w-[36px] shrink-0 select-none text-right pr-2 text-[9px] leading-[21px]',
          status === 'added' && 'text-[var(--dy-added-accent)] opacity-50',
          status === 'removed' && 'text-[var(--dy-removed-accent)] opacity-50',
          status === 'modified' && 'text-[var(--dy-modified-accent)] opacity-40',
          (status === 'unchanged' || isEmpty) && 'text-[var(--text-tertiary)] opacity-50'
        )}
      >
        {isEmpty ? '' : rightNum}
      </div>

      {/* Marker strip */}
      <div
        className={cn(
          'w-1 min-w-1 shrink-0',
          status === 'added' && 'bg-[var(--dy-added-accent)]',
          status === 'removed' && 'bg-[var(--dy-removed-accent)]',
          status === 'modified' && 'bg-[var(--dy-modified-accent)]'
        )}
      />

      {/* Content */}
      <div
        className={cn(
          'flex-1 px-[10px] whitespace-pre overflow-hidden text-ellipsis',
          status === 'added' && 'bg-[var(--dy-added-bg)]',
          status === 'removed' && 'bg-[var(--dy-removed-bg)]',
          status === 'modified' && 'bg-[var(--dy-modified-bg)]'
        )}
        style={
          isEmpty
            ? {
                background:
                  'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255,255,255,0.015) 4px, rgba(255,255,255,0.015) 5px)',
              }
            : undefined
        }
      >
        {isEmpty ? null : children}
      </div>
    </div>
  );
}

// ── Unified frame renderer ──

function UnifiedFrameContent({
  aligned,
  diff,
  leftLineRef,
  rightLineRef,
}: {
  aligned: AlignedFrame;
  diff: TreeDiff;
  leftLineRef: { current: number };
  rightLineRef: { current: number };
}) {
  const lines: React.ReactNode[] = [];

  if (aligned.type === 'added') {
    // All lines green, right gutter only
    const frame = aligned.rightFrame!;
    lines.push(
      <UnifiedLine key="header" rightNum={rightLineRef.current++} status="added">
        <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{frame.type}</span>
        <span style={{ color: YAML_COLORS.bracket }}>:</span>
      </UnifiedLine>
    );
    for (const [key, value] of Object.entries(frame.slots)) {
      lines.push(
        <UnifiedLine key={`slot-${key}`} rightNum={rightLineRef.current++} status="added">
          {'    '}
          <span style={{ color: YAML_COLORS.key }}>{key}</span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <SlotValueSpan value={value} />
        </UnifiedLine>
      );
    }
  } else if (aligned.type === 'removed') {
    // All lines red with strikethrough, left gutter only
    const frame = aligned.leftFrame!;
    lines.push(
      <UnifiedLine key="header" leftNum={leftLineRef.current++} status="removed">
        <span className="line-through" style={{ color: YAML_COLORS.type, fontWeight: 600 }}>
          {frame.type}
        </span>
        <span className="line-through" style={{ color: YAML_COLORS.bracket }}>
          :
        </span>
      </UnifiedLine>
    );
    for (const [key, value] of Object.entries(frame.slots)) {
      lines.push(
        <UnifiedLine key={`slot-${key}`} leftNum={leftLineRef.current++} status="removed">
          {'    '}
          <span className="line-through opacity-60" style={{ color: YAML_COLORS.key }}>
            {key}
          </span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <span className="line-through opacity-60">
            <SlotValueSpan value={value} />
          </span>
        </UnifiedLine>
      );
    }
  } else if (aligned.type === 'identical') {
    // All unchanged, both gutters
    const frame = aligned.leftFrame!;
    lines.push(
      <UnifiedLine
        key="header"
        leftNum={leftLineRef.current++}
        rightNum={rightLineRef.current++}
        status="unchanged"
      >
        <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{frame.type}</span>
        <span style={{ color: YAML_COLORS.bracket }}>:</span>
      </UnifiedLine>
    );
    for (const [key, value] of Object.entries(frame.slots)) {
      lines.push(
        <UnifiedLine
          key={`slot-${key}`}
          leftNum={leftLineRef.current++}
          rightNum={rightLineRef.current++}
          status="unchanged"
        >
          {'    '}
          <span style={{ color: YAML_COLORS.key }}>{key}</span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <SlotValueSpan value={value} />
        </UnifiedLine>
      );
    }
  } else {
    // Modified frame: show per-slot diffs
    const sourceFrame = aligned.leftFrame!;
    const targetFrame = aligned.rightFrame!;
    const slotDiffMap = new Map<string, SlotDiff>();
    if (aligned.slotDiffs) {
      for (const sd of aligned.slotDiffs) slotDiffMap.set(sd.key, sd);
    }

    // Frame type header — unchanged (both frames have same type usually)
    lines.push(
      <UnifiedLine
        key="header"
        leftNum={leftLineRef.current++}
        rightNum={rightLineRef.current++}
        status="unchanged"
      >
        <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{targetFrame.type}</span>
        <span style={{ color: YAML_COLORS.bracket }}>:</span>
      </UnifiedLine>
    );

    // Slots present in target (may be unchanged, modified, or added)
    for (const [key, value] of Object.entries(targetFrame.slots)) {
      const sd = slotDiffMap.get(key);

      if (!sd) {
        // Unchanged slot: single line, both gutters
        lines.push(
          <UnifiedLine
            key={`slot-${key}`}
            leftNum={leftLineRef.current++}
            rightNum={rightLineRef.current++}
            status="unchanged"
          >
            {'    '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            <SlotValueSpan value={value} />
          </UnifiedLine>
        );
      } else if (sd.type === 'added') {
        // Added slot: right gutter only, green
        lines.push(
          <UnifiedLine key={`slot-add-${key}`} rightNum={rightLineRef.current++} status="added">
            {'    '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            <SlotValueSpan value={value} />
          </UnifiedLine>
        );
      } else if (sd.type === 'changed') {
        // Modified slot: removed line (left gutter) then added line (right gutter)
        lines.push(
          <UnifiedLine key={`slot-rem-${key}`} leftNum={leftLineRef.current++} status="removed">
            {'    '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            {sd.wordDiff ? (
              <WordDiffSpan wordDiff={sd.wordDiff.filter((w) => w.type !== 'added')} />
            ) : (
              <span className="line-through opacity-60">
                {sd.oldValue !== undefined ? formatSlotValue(sd.oldValue) : '(none)'}
              </span>
            )}
          </UnifiedLine>
        );
        lines.push(
          <UnifiedLine key={`slot-add-${key}`} rightNum={rightLineRef.current++} status="added">
            {'    '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            {sd.wordDiff ? (
              <WordDiffSpan wordDiff={sd.wordDiff.filter((w) => w.type !== 'removed')} />
            ) : (
              <SlotValueSpan value={value} />
            )}
          </UnifiedLine>
        );
      }
    }

    // Removed slots (only in source, not in target)
    const removedSlots = aligned.slotDiffs?.filter((sd) => sd.type === 'removed') ?? [];
    for (const sd of removedSlots) {
      lines.push(
        <UnifiedLine key={`slot-del-${sd.key}`} leftNum={leftLineRef.current++} status="removed">
          {'    '}
          <span className="line-through opacity-60" style={{ color: YAML_COLORS.key }}>
            {sd.key}
          </span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <span className="line-through opacity-60">
            {sd.oldValue !== undefined ? formatSlotValue(sd.oldValue) : '(none)'}
          </span>
        </UnifiedLine>
      );
    }
  }

  // Relation annotations
  const relations = getFrameRelations(aligned.frameId, diff);

  return (
    <>
      {lines}
      {relations.map((rel, i) => (
        <RelationAnnotation
          key={`${aligned.frameId}-rel-${i}`}
          rel={rel}
          paddingLeft={UNIFIED_PADDING}
        />
      ))}
    </>
  );
}

// ── Main component ──

export function DiffYAMLUnifiedView({
  diff,
  activeFrameId,
  onSelectFrame,
  showIdentical,
}: DiffYAMLUnifiedViewProps) {
  const dyTheme = useDYTheme();
  const aligned = buildAlignedFrames(diff);
  const nonIdentical = aligned.filter((a) => a.type !== 'identical');
  const identicalFrames = aligned.filter((a) => a.type === 'identical');

  // Mutable line counters passed by ref
  const leftLineRef = { current: 1 };
  const rightLineRef = { current: 1 };

  const renderFrame = (af: AlignedFrame) => (
    <div key={`unified-${af.frameId}`}>
      <FrameSeparator
        aligned={af}
        onClick={() => onSelectFrame(af.frameId)}
        isActive={activeFrameId === af.frameId}
        paddingLeft={UNIFIED_PADDING}
      />
      <UnifiedFrameContent
        aligned={af}
        diff={diff}
        leftLineRef={leftLineRef}
        rightLineRef={rightLineRef}
      />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto" style={dyTheme}>
      {nonIdentical.map(renderFrame)}
      {showIdentical ? (
        identicalFrames.map(renderFrame)
      ) : (
        <IdenticalCollapseBar
          frames={identicalFrames}
          paddingLeft={UNIFIED_PADDING}
          onClick={() => {
            if (identicalFrames.length > 0) {
              onSelectFrame(identicalFrames[0].frameId);
            }
          }}
        />
      )}
    </div>
  );
}
