'use client';

import type { TreeNode, SlotDiff, SlotValue } from '@t3x-dev/core';
import { formatSlotValue, YAML_COLORS } from './DiffYAMLFormatters';
import { YAMLLine, type YAMLLineStatus } from './YAMLLine';
import type { CompatNode } from '@/lib/treeCompat';

interface YAMLNodeRendererProps {
  node: TreeNode;
  /** Overall status: how this tree differs in the diff */
  frameStatus: 'added' | 'removed' | 'modified' | 'identical';
  /** Slot-level diffs (only for modified nodes) */
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

export function WordDiffSpan({
  wordDiff,
}: {
  wordDiff: Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }>;
}) {
  return (
    <>
      {wordDiff.map((seg, i) => {
        if (seg.type === 'added') {
          return (
            <span
              key={i}
              className="bg-[var(--dy-added-word)] text-white rounded-sm px-[2px] font-medium"
            >
              {seg.text}
            </span>
          );
        }
        if (seg.type === 'removed') {
          return (
            <span
              key={i}
              className="bg-[var(--dy-removed-word)] text-white rounded-sm px-[2px] line-through"
              style={{ textDecorationColor: 'rgba(255,255,255,0.4)' }}
            >
              {seg.text}
            </span>
          );
        }
        return (
          <span key={i} style={{ color: YAML_COLORS.string }}>
            {seg.text}
          </span>
        );
      })}
    </>
  );
}

export function YAMLNodeRenderer({
  node,
  frameStatus,
  slotDiffs,
  startLine,
}: YAMLNodeRendererProps) {
  const slotDiffMap = new Map<string, SlotDiff>();
  if (slotDiffs) {
    for (const sd of slotDiffs) slotDiffMap.set(sd.key, sd);
  }

  let lineNum = startLine;

  // For added/removed nodes, all lines get that status.
  // For modified nodes, unchanged slots get 'unchanged', changed slots get 'modified'.
  // For identical nodes, all lines get 'unchanged'.
  const lineStatus = (slotKey?: string): YAMLLineStatus => {
    if (frameStatus === 'added') return 'added';
    if (frameStatus === 'removed') return 'removed';
    if (frameStatus === 'identical') return 'unchanged';
    // modified: check per-slot
    if (slotKey && slotDiffMap.has(slotKey)) return 'modified';
    return 'unchanged';
  };

  const removedSlots = slotDiffs?.filter((sd) => sd.type === 'removed') ?? [];

  return (
    <>
      {/* Tree type header */}
      <YAMLLine lineNumber={lineNum++} status={lineStatus()}>
        <span style={{ color: YAML_COLORS.type, fontWeight: 600 }}>{node.type}</span>
        <span style={{ color: YAML_COLORS.bracket }}>:</span>
      </YAMLLine>

      {/* Slot lines */}
      {Object.entries(node.slots).map(([key, value]) => {
        const sd = slotDiffMap.get(key);
        const status = lineStatus(key);

        return (
          <YAMLLine key={key} lineNumber={lineNum++} status={status}>
            {'    '}
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

      {/* Removed slots (only in source, not in this node) */}
      {frameStatus === 'modified' &&
        removedSlots.map((sd) => (
          <YAMLLine key={`removed-${sd.key}`} lineNumber={lineNum++} status="removed">
            {'    '}
            <span style={{ color: YAML_COLORS.key }} className="line-through opacity-60">
              {sd.key}
            </span>
            <span style={{ color: YAML_COLORS.bracket }}>: </span>
            <span className="line-through opacity-60">
              {sd.oldValue !== undefined ? formatSlotValue(sd.oldValue) : '(none)'}
            </span>
          </YAMLLine>
        ))}
    </>
  );
}

/** Calculate how many lines a tree node will render */
export function treeLineCount(node: TreeNode, removedSlotCount = 0): number {
  return 1 + Object.keys(node.slots).length + removedSlotCount;
}
