'use client';

import type { Frame, SlotConflict, SlotValue } from '@t3x-dev/core';
import { cn } from '@/lib/utils';
import { YAMLLine } from '@/components/diff/YAMLLine';
import { SlotValueSpan } from '@/components/diff/YAMLFrameRenderer';
import { buildAlignedSlotKeys } from '@/components/diff/DiffYAMLUtils';
import { YAML_COLORS } from '@/components/diff/DiffYAMLFormatters';
import type { FrameResolution } from './FrameConflictCard';

// ── Props ────────────────────────────────────────────────────────────────────

export interface MergeFrameRowProps {
  type: 'conflict' | 'onlyInSource' | 'onlyInTarget' | 'autoKept';
  frameId: string;
  sourceFrame?: Frame;
  targetFrame?: Frame;
  slotConflicts?: SlotConflict[];
  resolution?: FrameResolution | null;
  isKept?: boolean;
  onToggleKeep?: () => void;
  /** Anchor ID for navigator jump-to */
  anchorId?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Render a single slot value as a span, matching YAML_COLORS style */
function SlotLine({
  slotKey,
  value,
  lineNumber,
  highlight,
}: {
  slotKey: string;
  value: SlotValue | undefined;
  lineNumber: number;
  highlight?: 'source' | 'target' | 'modified' | null;
}) {
  const status =
    highlight === 'source' || highlight === 'target'
      ? 'modified'
      : highlight === 'modified'
        ? 'modified'
        : 'unchanged';

  const wordClass =
    highlight === 'source'
      ? 'word-source'
      : highlight === 'target'
        ? 'word-target'
        : undefined;

  return (
    <YAMLLine lineNumber={lineNumber} status={status}>
      {'    '}
      <span style={{ color: YAML_COLORS.key }}>{slotKey}</span>
      <span style={{ color: YAML_COLORS.bracket }}>: </span>
      {value !== undefined ? (
        wordClass ? (
          <span className={wordClass}>
            <SlotValueSpan value={value} />
          </span>
        ) : (
          <SlotValueSpan value={value} />
        )
      ) : (
        <span style={{ color: YAML_COLORS.comment }}>(none)</span>
      )}
    </YAMLLine>
  );
}

/** Frame type header line */
function FrameTypeHeader({
  frame,
  lineNumber,
  status,
}: {
  frame: Frame;
  lineNumber: number;
  status: 'unchanged' | 'modified' | 'added' | 'removed';
}) {
  return (
    <YAMLLine lineNumber={lineNumber} status={status}>
      <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{frame.type}</span>
      <span style={{ color: YAML_COLORS.bracket }}>:</span>
    </YAMLLine>
  );
}

/** Empty placeholder line (hatched) for the missing side */
function EmptyPlaceholderLine() {
  return <YAMLLine lineNumber={undefined} status="empty">{null}</YAMLLine>;
}

// ── Frame separator header ────────────────────────────────────────────────────

interface SeparatorProps {
  type: MergeFrameRowProps['type'];
  frameId: string;
  frameType?: string;
  isKept?: boolean;
  onToggleKeep?: () => void;
}

function MergeFrameSeparator({ type, frameId, frameType, isKept, onToggleKeep }: SeparatorProps) {
  const label =
    type === 'conflict'
      ? 'CONFLICT'
      : type === 'onlyInSource'
        ? 'SOURCE ONLY'
        : type === 'onlyInTarget'
          ? 'TARGET ONLY'
          : 'AUTO-KEPT';

  const labelColor =
    type === 'conflict'
      ? 'text-[var(--merge-conflict-accent)]'
      : type === 'onlyInSource'
        ? 'text-[var(--merge-source-accent)]'
        : type === 'onlyInTarget'
          ? 'text-[var(--merge-target-accent)]'
          : 'text-[var(--text-tertiary)]';

  return (
    <div className="flex items-center gap-[5px] text-[9px] font-medium uppercase tracking-[0.6px] select-none pt-[5px] pb-[2px] px-3">
      <span className={cn('text-[8px] font-semibold tracking-[0.3px]', labelColor)}>{label}</span>
      {frameType && <span className="text-[var(--text-secondary)]">{frameType}</span>}
      <span className="font-mono opacity-40 text-[8px] text-[var(--text-tertiary)]">{frameId}</span>
      {/* Divider */}
      <span className="flex-1 h-px bg-[var(--stroke-divider)] opacity-50" />
      {/* Keep/discard toggle for onlyIn types */}
      {(type === 'onlyInSource' || type === 'onlyInTarget') && onToggleKeep && (
        <button
          type="button"
          onClick={onToggleKeep}
          className={cn(
            'text-[9px] font-medium px-1.5 py-0.5 rounded border transition-colors',
            isKept
              ? 'border-[var(--merge-source-accent)]/50 text-[var(--merge-source-accent)] bg-[var(--merge-source-bg)]'
              : 'border-[var(--stroke-divider)] text-[var(--text-tertiary)] hover:border-[var(--stroke-default)] hover:text-[var(--text-secondary)]',
          )}
        >
          {isKept ? 'Keep' : 'Discard'}
        </button>
      )}
    </div>
  );
}

// ── Conflict frame renderer ───────────────────────────────────────────────────

function ConflictPanes({
  sourceFrame,
  targetFrame,
  slotConflicts,
  resolution,
}: {
  sourceFrame: Frame;
  targetFrame: Frame;
  slotConflicts: SlotConflict[];
  resolution?: FrameResolution | null;
}) {
  const conflictKeySet = new Set(slotConflicts.map((sc) => sc.key));
  const alignedSlots = buildAlignedSlotKeys(sourceFrame, targetFrame);

  // Determine unchosen side based on resolution
  const unchosenLeft =
    resolution?.type === 'target' ? true : false;
  const unchosenRight =
    resolution?.type === 'source' ? true : false;

  let leftLine = 1;
  let rightLine = 1;

  const leftRows: React.ReactNode[] = [];
  const rightRows: React.ReactNode[] = [];

  // Frame type header
  leftRows.push(
    <FrameTypeHeader key="hdr-left" frame={sourceFrame} lineNumber={leftLine++} status="unchanged" />,
  );
  rightRows.push(
    <FrameTypeHeader key="hdr-right" frame={targetFrame} lineNumber={rightLine++} status="unchanged" />,
  );

  for (const { key, inLeft, inRight } of alignedSlots) {
    const isConflicting = conflictKeySet.has(key);
    const leftValue = inLeft ? sourceFrame.slots[key] : undefined;
    const rightValue = inRight ? targetFrame.slots[key] : undefined;

    if (inLeft) {
      leftRows.push(
        <SlotLine
          key={`left-${key}`}
          slotKey={key}
          value={leftValue}
          lineNumber={leftLine++}
          highlight={isConflicting ? 'source' : null}
        />,
      );
    } else {
      leftRows.push(<EmptyPlaceholderLine key={`left-empty-${key}`} />);
    }

    if (inRight) {
      rightRows.push(
        <SlotLine
          key={`right-${key}`}
          slotKey={key}
          value={rightValue}
          lineNumber={rightLine++}
          highlight={isConflicting ? 'target' : null}
        />,
      );
    } else {
      rightRows.push(<EmptyPlaceholderLine key={`right-empty-${key}`} />);
    }
  }

  return (
    <div className="flex">
      {/* Left pane — source */}
      <div
        className={cn(
          'flex-1 min-w-0 border-r-2 border-r-[var(--stroke-pane-border)]',
          unchosenLeft && 'opacity-[var(--merge-unchosen-opacity)]',
        )}
        data-merge-side="source"
      >
        <div className="px-0 py-0 text-[9px] font-semibold uppercase tracking-wider text-[var(--merge-source-accent)] pl-[calc(36px+4px+10px)] pb-[2px] pt-[2px] border-b border-[var(--stroke-divider)] opacity-70">
          Source
        </div>
        {leftRows}
      </div>

      {/* Right pane — target */}
      <div
        className={cn(
          'flex-1 min-w-0',
          unchosenRight && 'opacity-[var(--merge-unchosen-opacity)]',
        )}
        data-merge-side="target"
      >
        <div className="px-0 py-0 text-[9px] font-semibold uppercase tracking-wider text-[var(--merge-target-accent)] pl-[calc(36px+4px+10px)] pb-[2px] pt-[2px] border-b border-[var(--stroke-divider)] opacity-70">
          Target
        </div>
        {rightRows}
      </div>
    </div>
  );
}

// ── OnlyIn frame renderer ─────────────────────────────────────────────────────

function OnlyInPanes({
  side,
  frame,
}: {
  side: 'source' | 'target';
  frame: Frame;
}) {
  const lineClass = side === 'source' ? 'line-source' : 'line-target';
  const slotCount = Object.keys(frame.slots).length;
  // +1 for frame type header
  const totalLines = 1 + slotCount;

  let lineNum = 1;
  const contentRows: React.ReactNode[] = [];
  contentRows.push(
    <FrameTypeHeader
      key="hdr"
      frame={frame}
      lineNumber={lineNum++}
      status={side === 'source' ? 'removed' : 'added'}
    />,
  );

  for (const [key, value] of Object.entries(frame.slots)) {
    contentRows.push(
      <div key={key} className={lineClass}>
        <SlotLine
          slotKey={key}
          value={value}
          lineNumber={lineNum++}
          highlight={null}
        />
      </div>,
    );
  }

  // Placeholder lines for the other side
  const placeholders = Array.from({ length: totalLines }, (_, i) => (
    <EmptyPlaceholderLine key={`ph-${i}`} />
  ));

  const leftContent = side === 'source' ? contentRows : placeholders;
  const rightContent = side === 'target' ? contentRows : placeholders;

  return (
    <div className="flex">
      <div className="flex-1 min-w-0 border-r-2 border-r-[var(--stroke-pane-border)]" data-merge-side="source">
        {leftContent}
      </div>
      <div className="flex-1 min-w-0" data-merge-side="target">
        {rightContent}
      </div>
    </div>
  );
}

// ── AutoKept frame renderer ───────────────────────────────────────────────────

function AutoKeptPanes({ frame }: { frame: Frame }) {
  let lineNum = 1;
  const rows: React.ReactNode[] = [
    <FrameTypeHeader key="hdr" frame={frame} lineNumber={lineNum++} status="unchanged" />,
  ];
  for (const [key, value] of Object.entries(frame.slots)) {
    rows.push(
      <SlotLine key={key} slotKey={key} value={value} lineNumber={lineNum++} highlight={null} />,
    );
  }

  return (
    <div className="flex opacity-[0.48]">
      <div className="flex-1 min-w-0 border-r-2 border-r-[var(--stroke-pane-border)]">{rows}</div>
      <div className="flex-1 min-w-0">{rows}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MergeFrameRow({
  type,
  frameId,
  sourceFrame,
  targetFrame,
  slotConflicts,
  resolution,
  isKept,
  onToggleKeep,
  anchorId,
}: MergeFrameRowProps) {
  const displayFrame = sourceFrame ?? targetFrame;

  return (
    <div
      id={anchorId}
      className="frame-row border-b border-[var(--stroke-divider)]"
    >
      {/* Frame separator / header */}
      <MergeFrameSeparator
        type={type}
        frameId={frameId}
        frameType={displayFrame?.type}
        isKept={isKept}
        onToggleKeep={onToggleKeep}
      />

      {/* Pane content */}
      {type === 'conflict' && sourceFrame && targetFrame && (
        <ConflictPanes
          sourceFrame={sourceFrame}
          targetFrame={targetFrame}
          slotConflicts={slotConflicts ?? []}
          resolution={resolution}
        />
      )}

      {type === 'onlyInSource' && sourceFrame && (
        <OnlyInPanes side="source" frame={sourceFrame} />
      )}

      {type === 'onlyInTarget' && targetFrame && (
        <OnlyInPanes side="target" frame={targetFrame} />
      )}

      {type === 'autoKept' && (sourceFrame ?? targetFrame) && (
        <AutoKeptPanes frame={(sourceFrame ?? targetFrame)!} />
      )}
    </div>
  );
}
