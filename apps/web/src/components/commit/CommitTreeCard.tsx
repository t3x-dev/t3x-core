'use client';

/**
 * CommitTreeCard — YAML-style card for a single semantic tree on the commit detail page.
 *
 * Features:
 * - Header bar: type badge, tree ID, diff status label, confidence
 * - YAML body: syntax-highlighted key:value slots
 * - Slot-level diff: changed (yellow border + "was:"), added (green border), removed (line-through)
 * - Hover a slot → sets hoveredSlotKey in store
 * - Click a slot → calls openSourceViewer(slotKey) from store
 * - Colored left gutter bar (GutterBar) matching diff status
 */

import type { TreeNode, SlotValue } from '@t3x-dev/core';
import {
  type EnrichedNode,
  type DiffStatus,
  useCommitDetailStore,
} from '@/store/commitDetailStore';
import { ConfidenceBadge, DotIndicator, GutterBar, StatusBadge } from './CommitDetailHelpers';

// ============================================================================
// Types
// ============================================================================

export interface CommitTreeCardProps {
  enrichedNode: EnrichedNode;
  isActive: boolean;
  onSelect: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}

// ============================================================================
// Slot diff computation
// ============================================================================

interface SlotDiffSets {
  changedSlots: Set<string>;
  addedSlots: Set<string>;
  removedSlotEntries: Array<{ key: string; value: SlotValue }>;
}

function computeSlotDiff(node: TreeNode, previousNode: TreeNode | undefined): SlotDiffSets {
  if (!previousNode) {
    return { changedSlots: new Set(), addedSlots: new Set(), removedSlotEntries: [] };
  }

  const changedSlots = new Set<string>();
  const addedSlots = new Set<string>();
  const removedSlotEntries: Array<{ key: string; value: SlotValue }> = [];

  const prevKeys = new Set(Object.keys(previousNode.slots));
  const currKeys = new Set(Object.keys(node.slots));

  for (const key of currKeys) {
    if (!prevKeys.has(key)) {
      addedSlots.add(key);
    } else if (JSON.stringify(node.slots[key]) !== JSON.stringify(previousNode.slots[key])) {
      changedSlots.add(key);
    }
  }

  for (const key of prevKeys) {
    if (!currKeys.has(key)) {
      removedSlotEntries.push({ key, value: previousNode.slots[key] });
    }
  }

  return { changedSlots, addedSlots, removedSlotEntries };
}

// ============================================================================
// SlotValue renderer
// ============================================================================

function renderSlotValue(value: SlotValue): React.ReactNode {
  if (typeof value === 'string') {
    return <span style={{ color: '#9ece6a' }}>&quot;{value}&quot;</span>;
  }
  if (typeof value === 'number') {
    return <span style={{ color: '#ff9e64' }}>{value}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span className="block">
        {(value as SlotValue[]).map((item, i) => (
          <span key={i} className="block pl-4 leading-relaxed">
            <span style={{ color: '#89ddff' }}>- </span>
            {renderSlotValue(item)}
          </span>
        ))}
      </span>
    );
  }
  if (value !== null && typeof value === 'object') {
    if ('ref' in value && typeof value.ref === 'string') {
      // SlotRef
      return (
        <span style={{ color: '#bb9af7' }}>
          {'{ '}ref: {value.ref}
          {' }'}
        </span>
      );
    }
    if ('type' in value && 'slots' in value) {
      // InlineNode — render as JSON
      return <span style={{ color: '#89ddff' }}>{JSON.stringify(value)}</span>;
    }
  }
  return <span style={{ color: '#89ddff' }}>{JSON.stringify(value)}</span>;
}

// ============================================================================
// SlotRow — a single key:value line
// ============================================================================

type SlotRowStatus = 'added' | 'changed' | 'removed' | 'normal';

interface SlotRowProps {
  slotKey: string;
  value: SlotValue;
  status: SlotRowStatus;
  oldValue?: SlotValue;
  isHovered: boolean;
  onHover: (key: string | null) => void;
  onClick: (key: string) => void;
}

function SlotRow({ slotKey, value, status, oldValue, isHovered, onHover, onClick }: SlotRowProps) {
  const borderColor =
    status === 'added'
      ? 'var(--diff-added-accent)'
      : status === 'changed'
        ? 'var(--diff-modified-accent)'
        : status === 'removed'
          ? 'var(--diff-removed-accent)'
          : 'transparent';

  const bgColor =
    status === 'added'
      ? 'var(--diff-added-bg)'
      : status === 'changed'
        ? 'var(--diff-modified-bg)'
        : status === 'removed'
          ? 'var(--diff-removed-bg)'
          : 'transparent';

  const isClickable = status !== 'removed';

  return (
    <div
      className={`group/slot relative flex flex-col rounded py-0.5 pr-2 transition-colors ${
        isHovered ? 'bg-[var(--hover-bg)]' : ''
      } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
      style={{
        borderLeft: status !== 'normal' ? `2px solid ${borderColor}` : '2px solid transparent',
        paddingLeft: status !== 'normal' ? '8px' : '10px',
        backgroundColor:
          isHovered && status === 'normal'
            ? undefined
            : bgColor !== 'transparent'
              ? bgColor
              : undefined,
      }}
      onMouseEnter={() => onHover(slotKey)}
      onMouseLeave={() => onHover(null)}
      onClick={() => {
        if (isClickable) onClick(slotKey);
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-1 font-mono text-[12px] leading-relaxed">
        {/* Key */}
        <span style={{ color: '#7aa2f7' }}>{slotKey}</span>
        <span style={{ color: '#89ddff' }}>:</span>

        {/* Value */}
        {status === 'removed' ? (
          <span className="line-through opacity-60">{renderSlotValue(value)}</span>
        ) : (
          renderSlotValue(value)
        )}

        {/* Status labels */}
        {status === 'added' && (
          <span
            className="ml-1 rounded-sm px-1 py-px text-[9px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--diff-added-accent)', backgroundColor: 'var(--diff-added-bg)' }}
          >
            new
          </span>
        )}
        {status === 'removed' && (
          <span
            className="ml-1 rounded-sm px-1 py-px text-[9px] font-semibold uppercase tracking-wide"
            style={{
              color: 'var(--diff-removed-accent)',
              backgroundColor: 'var(--diff-removed-bg)',
            }}
          >
            removed
          </span>
        )}
      </div>

      {/* "was: oldValue" annotation for changed slots */}
      {status === 'changed' && oldValue !== undefined && (
        <div className="mt-0.5 font-mono text-[11px] opacity-60">
          <span style={{ color: 'var(--text-tertiary)' }}>was: </span>
          <span className="line-through">{renderSlotValue(oldValue)}</span>
        </div>
      )}

      {/* Hover click hint */}
      {isClickable && isHovered && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--text-tertiary)] opacity-70">
          view source ↗
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Status label helpers
// ============================================================================

const _diffStatusLabels: Record<DiffStatus, string> = {
  added: '+ added',
  removed: '- removed',
  modified: '~ modified',
  identical: '= identical',
};

// ============================================================================
// CommitTreeCard
// ============================================================================

export function CommitTreeCard({
  enrichedNode,
  isActive,
  onSelect,
  cardRef,
}: CommitTreeCardProps) {
  const { node, diffStatus, previousNode } = enrichedNode;
  const hoveredSlotKey = useCommitDetailStore((s) => s.hoveredSlotKey);
  const setHoveredSlot = useCommitDetailStore((s) => s.setHoveredSlot);
  const openSourceViewer = useCommitDetailStore((s) => s.openSourceViewer);

  // Compute slot-level diff (only meaningful for 'modified' nodes)
  const { changedSlots, addedSlots, removedSlotEntries } = computeSlotDiff(
    node,
    diffStatus === 'modified' ? previousNode : undefined
  );

  function getSlotStatus(key: string): SlotRowStatus {
    if (changedSlots.has(key)) return 'changed';
    if (addedSlots.has(key)) return 'added';
    return 'normal';
  }

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      className={`group relative rounded-lg border transition-all duration-200 cursor-pointer overflow-hidden ${
        isActive
          ? 'border-[var(--accent-commit)]/30 bg-[var(--surface-card)]'
          : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] hover:border-[var(--stroke-default)]'
      }`}
    >
      {/* Left gutter bar */}
      <GutterBar status={diffStatus} />

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-4 pl-5 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0">
          <DotIndicator status={diffStatus} />

          {/* Type badge */}
          <span className="rounded bg-[var(--surface-app)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--stroke-divider)]">
            {node.key}
          </span>

          {/* Tree ID */}
          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{node.key}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Diff status label */}
          <StatusBadge status={diffStatus} />

          {/* Confidence */}
          {node.confidence != null && (
            <ConfidenceBadge value={node.confidence} pulse={isActive} />
          )}
        </div>
      </div>

      {/* ── YAML Body ── */}
      <div className="px-4 pl-5 py-3 space-y-0.5 bg-[var(--surface-app)]/40">
        {/* Current slots */}
        {Object.entries(node.slots).map(([key, value]) => (
          <SlotRow
            key={key}
            slotKey={key}
            value={value}
            status={getSlotStatus(key)}
            oldValue={changedSlots.has(key) && previousNode ? previousNode.slots[key] : undefined}
            isHovered={hoveredSlotKey === key}
            onHover={setHoveredSlot}
            onClick={openSourceViewer}
          />
        ))}

        {/* Removed slots (only appear in modified nodes) */}
        {removedSlotEntries.map(({ key, value }) => (
          <SlotRow
            key={`removed-${key}`}
            slotKey={key}
            value={value}
            status="removed"
            isHovered={hoveredSlotKey === key}
            onHover={setHoveredSlot}
            onClick={openSourceViewer}
          />
        ))}
      </div>

      {/* ── Removed tree overlay label ── */}
      {diffStatus === 'removed' && (
        <div className="absolute inset-0 pointer-events-none rounded-lg ring-1 ring-[var(--diff-removed-accent)]/20" />
      )}
    </div>
  );
}
