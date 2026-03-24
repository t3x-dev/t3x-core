'use client';

/**
 * MergeFrameRow — Focused Diff card for a single frame.
 *
 * Instead of side-by-side panes, each conflicting slot is rendered as:
 *   key:  source_value  →  target_value
 *
 * Only differing slots are shown prominently. Identical slots are collapsed.
 * onlyIn slots are marked with +/- indicators.
 */

import type { Frame, SlotConflict, SlotValue } from '@t3x-dev/core';
import { useState } from 'react';
import { SlotValueSpan } from '@/components/diff/YAMLFrameRenderer';
import { cn } from '@/lib/utils';
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
  anchorId?: string;
}

// ── Diff row: source_value → target_value ────────────────────────────────────

function DiffSlotRow({
  slotKey,
  sourceValue,
  targetValue,
  type,
}: {
  slotKey: string;
  sourceValue?: SlotValue;
  targetValue?: SlotValue;
  type: 'changed' | 'only-source' | 'only-target';
}) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-0 py-[3px] px-4 min-h-[28px] font-mono text-[12px] leading-[20px]',
        'border-b border-[rgba(255,255,255,0.02)] hover:bg-[var(--hover-bg)]'
      )}
    >
      {/* +/- marker for only-in */}
      {type === 'only-source' && (
        <span className="w-4 shrink-0 text-center text-[14px] font-bold text-[var(--removed-accent,#f47067)]">
          &minus;
        </span>
      )}
      {type === 'only-target' && (
        <span className="w-4 shrink-0 text-center text-[14px] font-bold text-[var(--added-accent,#3fb950)]">
          +
        </span>
      )}
      {type === 'changed' && <span className="w-4 shrink-0" />}

      {/* Slot key */}
      <span
        className={cn(
          'w-[130px] min-w-[130px] shrink-0 text-right pr-3 font-medium',
          type === 'only-source' && 'text-[var(--merge-source-accent)]',
          type === 'only-target' && 'text-[var(--merge-target-accent)]',
          type === 'changed' && 'text-[var(--text-tertiary)]'
        )}
      >
        {slotKey}
      </span>

      {/* Source value */}
      <span
        className={cn(
          'flex-1 min-w-0 py-[2px] px-2',
          type === 'changed' && 'bg-[var(--merge-source-bg)] rounded',
          type === 'only-source' && 'text-[var(--merge-source-accent)] opacity-80'
        )}
      >
        {sourceValue !== undefined ? (
          type === 'changed' ? (
            <span className="word-source">
              <SlotValueSpan value={sourceValue} />
            </span>
          ) : (
            <SlotValueSpan value={sourceValue} />
          )
        ) : (
          <span className="opacity-20 italic">&mdash;</span>
        )}
      </span>

      {/* Arrow */}
      <span
        className={cn(
          'w-7 shrink-0 text-center text-[14px]',
          type === 'changed'
            ? 'text-[var(--text-secondary)] opacity-100'
            : 'text-[var(--text-tertiary)] opacity-20'
        )}
      >
        {type === 'changed' ? '\u2192' : ''}
      </span>

      {/* Target value */}
      <span
        className={cn(
          'flex-1 min-w-0 py-[2px] px-2',
          type === 'changed' && 'bg-[var(--merge-target-bg)] rounded',
          type === 'only-target' && 'text-[var(--merge-target-accent)] opacity-80'
        )}
      >
        {targetValue !== undefined ? (
          type === 'changed' ? (
            <span className="word-target">
              <SlotValueSpan value={targetValue} />
            </span>
          ) : (
            <SlotValueSpan value={targetValue} />
          )
        ) : (
          <span className="opacity-20 italic">&mdash;</span>
        )}
      </span>
    </div>
  );
}

// ── Column labels ────────────────────────────────────────────────────────────

function ColumnLabels() {
  return (
    <div className="flex items-baseline px-4 py-1 text-[9px] font-semibold uppercase tracking-[0.8px] opacity-40">
      <span className="w-4 shrink-0" />
      <span className="w-[130px] min-w-[130px] shrink-0" />
      <span className="flex-1 px-2 text-[var(--merge-source-accent)] opacity-80">source</span>
      <span className="w-7 shrink-0" />
      <span className="flex-1 px-2 text-[var(--merge-target-accent)] opacity-80">target</span>
    </div>
  );
}

// ── Identical slots collapse ─────────────────────────────────────────────────

function IdenticalCollapse({
  keys,
  allSlots,
}: {
  keys: string[];
  allSlots: Record<string, SlotValue>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (keys.length === 0) return null;

  return (
    <>
      <div
        className="flex items-center gap-1.5 px-4 py-[4px] text-[10px] text-[var(--text-tertiary)] cursor-pointer border-t border-[var(--stroke-divider)] hover:bg-[var(--hover-bg)]"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={cn('transition-transform inline-block', expanded && 'rotate-90')}>
          &rsaquo;
        </span>
        <span>
          {keys.length} identical <span className="opacity-40">({keys.join(', ')})</span>
        </span>
      </div>
      {expanded &&
        keys.map((key) => (
          <div
            key={key}
            className="flex px-4 py-[2px] font-mono text-[11px] text-[var(--text-tertiary)] opacity-50"
          >
            <span className="w-4 shrink-0" />
            <span className="w-[130px] min-w-[130px] shrink-0 text-right pr-3">{key}</span>
            <span className="flex-1">
              <SlotValueSpan value={allSlots[key]} />
            </span>
          </div>
        ))}
    </>
  );
}

// ── Card header ──────────────────────────────────────────────────────────────

function CardHeader({
  type,
  frameId,
  frameType,
  isKept,
  onToggleKeep,
}: {
  type: MergeFrameRowProps['type'];
  frameId: string;
  frameType?: string;
  isKept?: boolean;
  onToggleKeep?: () => void;
}) {
  const label =
    type === 'conflict'
      ? 'CONFLICT'
      : type === 'onlyInSource'
        ? 'SOURCE ONLY'
        : type === 'onlyInTarget'
          ? 'TARGET ONLY'
          : 'AUTO-KEPT';

  const borderColor =
    type === 'conflict'
      ? 'var(--merge-conflict-accent)'
      : type === 'onlyInSource'
        ? 'var(--merge-source-accent)'
        : type === 'onlyInTarget'
          ? 'var(--merge-target-accent)'
          : 'var(--text-tertiary)';

  const labelColor =
    type === 'conflict'
      ? 'text-[var(--merge-conflict-accent)]'
      : type === 'onlyInSource'
        ? 'text-[var(--merge-source-accent)]'
        : type === 'onlyInTarget'
          ? 'text-[var(--merge-target-accent)]'
          : 'text-[var(--text-tertiary)]';

  const bgClass =
    type === 'conflict'
      ? 'bg-[var(--merge-conflict-bg)]'
      : type === 'onlyInSource'
        ? 'bg-[var(--merge-source-bg)]'
        : type === 'onlyInTarget'
          ? 'bg-[var(--merge-target-bg)]'
          : '';

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-[8px] border-b border-[var(--stroke-divider)]',
        bgClass
      )}
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <span className={cn('text-[9px] font-bold uppercase tracking-[0.5px]', labelColor)}>
        {label}
      </span>
      {frameType && (
        <span className="font-mono text-[12px] font-semibold text-[var(--text-primary)]">
          {frameType}:
        </span>
      )}
      <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{frameId}</span>
      <span className="flex-1" />
      {(type === 'onlyInSource' || type === 'onlyInTarget') && onToggleKeep && (
        <button
          type="button"
          onClick={onToggleKeep}
          className={cn(
            'text-[10px] font-semibold px-2.5 py-[2px] rounded border transition-colors cursor-pointer',
            isKept
              ? 'border-[rgba(63,185,80,0.3)] bg-[rgba(63,185,80,0.06)] text-[var(--added-accent,#3fb950)]'
              : 'border-[var(--stroke-divider)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          )}
        >
          {isKept ? '\u2713 Keep' : 'Discard'}
        </button>
      )}
    </div>
  );
}

// ── OnlyIn card content ──────────────────────────────────────────────────────

function OnlyInContent({ frame }: { frame: Frame }) {
  return (
    <div className="px-4 py-1.5">
      {Object.entries(frame.slots).map(([key, value]) => (
        <div key={key} className="flex gap-2 py-[2px] font-mono text-[12px]">
          <span className="text-[var(--text-tertiary)] min-w-[100px] text-right">{key}:</span>
          <span className="text-[var(--text-secondary)]">
            <SlotValueSpan value={value} />
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function MergeFrameRow({
  type,
  frameId,
  sourceFrame,
  targetFrame,
  slotConflicts = [],
  resolution,
  isKept,
  onToggleKeep,
  anchorId,
}: MergeFrameRowProps) {
  const displayFrame = sourceFrame ?? targetFrame;

  if (type === 'conflict' && sourceFrame && targetFrame) {
    const conflictKeySet = new Set(slotConflicts.map((sc) => sc.key));
    const allSourceKeys = Object.keys(sourceFrame.slots);
    const allTargetKeys = Object.keys(targetFrame.slots);
    const allKeys = [...new Set([...allSourceKeys, ...allTargetKeys])];

    const changedRows: {
      key: string;
      sv?: SlotValue;
      tv?: SlotValue;
      type: 'changed' | 'only-source' | 'only-target';
    }[] = [];
    const identicalKeys: string[] = [];

    for (const key of allKeys) {
      const inSource = key in sourceFrame.slots;
      const inTarget = key in targetFrame.slots;
      const isConflicting = conflictKeySet.has(key);

      if (isConflicting) {
        changedRows.push({
          key,
          sv: inSource ? sourceFrame.slots[key] : undefined,
          tv: inTarget ? targetFrame.slots[key] : undefined,
          type: inSource && inTarget ? 'changed' : inSource ? 'only-source' : 'only-target',
        });
      } else if (inSource && inTarget) {
        identicalKeys.push(key);
      }
    }

    return (
      <div
        id={anchorId}
        className="bg-[var(--surface-card)] border border-[var(--stroke-divider)] rounded-[10px] overflow-hidden"
      >
        <CardHeader type="conflict" frameId={frameId} frameType={displayFrame?.type} />
        <ColumnLabels />
        {changedRows.map((row) => (
          <DiffSlotRow
            key={row.key}
            slotKey={row.key}
            sourceValue={row.sv}
            targetValue={row.tv}
            type={row.type}
          />
        ))}
        <IdenticalCollapse keys={identicalKeys} allSlots={sourceFrame.slots} />
      </div>
    );
  }

  if ((type === 'onlyInSource' || type === 'onlyInTarget') && displayFrame) {
    return (
      <div
        id={anchorId}
        className="bg-[var(--surface-card)] border border-[var(--stroke-divider)] rounded-[10px] overflow-hidden"
      >
        <CardHeader
          type={type}
          frameId={frameId}
          frameType={displayFrame.type}
          isKept={isKept}
          onToggleKeep={onToggleKeep}
        />
        <OnlyInContent frame={displayFrame} />
      </div>
    );
  }

  if (type === 'autoKept' && displayFrame) {
    return (
      <div
        id={anchorId}
        className="bg-[var(--surface-card)] border border-[var(--stroke-divider)] rounded-[10px] overflow-hidden opacity-50"
      >
        <CardHeader type="autoKept" frameId={frameId} frameType={displayFrame.type} />
        <OnlyInContent frame={displayFrame} />
      </div>
    );
  }

  return null;
}
