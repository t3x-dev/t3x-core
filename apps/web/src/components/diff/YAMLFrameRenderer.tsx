'use client';

import type { Frame, SlotDiff, SlotValue } from '@t3x-dev/core';
import { formatSlotValue, YAML_COLORS } from './DiffYAMLFormatters';
import { YAMLLine, type YAMLLineStatus } from './YAMLLine';

interface YAMLFrameRendererProps {
  frame: Frame;
  /** Overall status: how this frame differs in the diff */
  frameStatus: 'added' | 'removed' | 'modified' | 'identical';
  /** Slot-level diffs (only for modified frames) */
  slotDiffs?: SlotDiff[];
  /** Starting line number */
  startLine: number;
}

export function SlotValueSpan({ value }: { value: SlotValue }) {
  if (typeof value === 'string') {
    return <span style={{ color: YAML_COLORS.string }}>&quot;{value}&quot;</span>;
  }
  if (typeof value === 'number') {
    return <span style={{ color: YAML_COLORS.number }}>{value}</span>;
  }
  if (typeof value === 'boolean') {
    return <span style={{ color: YAML_COLORS.number }}>{String(value)}</span>;
  }
  if (value !== null && typeof value === 'object' && 'ref' in value) {
    return <span style={{ color: YAML_COLORS.ref }}>*{(value as { ref: string }).ref}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span>
        <span style={{ color: YAML_COLORS.bracket }}>[</span>
        {(value as SlotValue[]).map((item, i) => (
          <span key={i}>
            {i > 0 && <span style={{ color: YAML_COLORS.bracket }}>, </span>}
            <SlotValueSpan value={item} />
          </span>
        ))}
        <span style={{ color: YAML_COLORS.bracket }}>]</span>
      </span>
    );
  }
  return <span style={{ color: YAML_COLORS.bracket }}>{JSON.stringify(value)}</span>;
}

export function WordDiffSpan({ wordDiff }: { wordDiff: Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }> }) {
  return (
    <>
      {wordDiff.map((seg, i) => {
        if (seg.type === 'added') {
          return <span key={i} className="bg-[var(--dy-added-word)] text-white rounded-sm px-[2px] font-medium">{seg.text}</span>;
        }
        if (seg.type === 'removed') {
          return <span key={i} className="bg-[var(--dy-removed-word)] text-white rounded-sm px-[2px] line-through" style={{ textDecorationColor: 'rgba(255,255,255,0.4)' }}>{seg.text}</span>;
        }
        return <span key={i} style={{ color: YAML_COLORS.string }}>{seg.text}</span>;
      })}
    </>
  );
}

export function YAMLFrameRenderer({ frame, frameStatus, slotDiffs, startLine }: YAMLFrameRendererProps) {
  const slotDiffMap = new Map<string, SlotDiff>();
  if (slotDiffs) {
    for (const sd of slotDiffs) slotDiffMap.set(sd.key, sd);
  }

  let lineNum = startLine;

  // For added/removed frames, all lines get that status.
  // For modified frames, unchanged slots get 'unchanged', changed slots get 'modified'.
  // For identical frames, all lines get 'unchanged'.
  const lineStatus = (slotKey?: string): YAMLLineStatus => {
    if (frameStatus === 'added') return 'added';
    if (frameStatus === 'removed') return 'removed';
    if (frameStatus === 'identical') return 'unchanged';
    // modified: check per-slot
    if (slotKey && slotDiffMap.has(slotKey)) return 'modified';
    return 'unchanged';
  };

  const removedSlots = slotDiffs?.filter(sd => sd.type === 'removed') ?? [];

  return (
    <>
      {/* Frame type header */}
      <YAMLLine lineNumber={lineNum++} status={lineStatus()}>
        <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{frame.type}</span>
        <span style={{ color: YAML_COLORS.bracket }}>:</span>
      </YAMLLine>

      {/* Slot lines */}
      {Object.entries(frame.slots).map(([key, value]) => {
        const sd = slotDiffMap.get(key);
        const status = lineStatus(key);

        return (
          <YAMLLine key={key} lineNumber={lineNum++} status={status}>
            {'  '}
            <span style={{ color: YAML_COLORS.key }}>{key}</span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            {sd?.wordDiff ? (
              <WordDiffSpan wordDiff={sd.wordDiff} />
            ) : (
              <SlotValueSpan value={value} />
            )}
          </YAMLLine>
        );
      })}

      {/* Removed slots (only in source, not in this frame) */}
      {frameStatus === 'modified' && removedSlots.map((sd) => (
        <YAMLLine key={`removed-${sd.key}`} lineNumber={lineNum++} status="removed">
          {'  '}
          <span style={{ color: YAML_COLORS.key }} className="line-through opacity-60">{sd.key}</span>
          <span style={{ color: YAML_COLORS.bracket }}>: </span>
          <span className="line-through opacity-60">
            {sd.oldValue !== undefined ? formatSlotValue(sd.oldValue) : '(none)'}
          </span>
        </YAMLLine>
      ))}
    </>
  );
}

/** Calculate how many lines a frame will render */
export function frameLineCount(frame: Frame, removedSlotCount = 0): number {
  return 1 + Object.keys(frame.slots).length + removedSlotCount;
}
