'use client';

/**
 * DiffCard — YAML-style card for a single  node in a tree node-level diff.
 *
 * Four modes:
 * - modified: YAML card with slot-level diff indicators inline
 * - added: entire card with green border (onlyInTarget)
 * - removed: entire card with red border + strikethrough (onlyInSource)
 * - identical: dimmed card, collapsed by default
 */

import type { TreeNode, SlotDiff, SlotValue } from '@t3x-dev/core';
import { useState } from 'react';
import type { CompatNode } from '@/lib/treeCompat';

// ============================================================================
// Props
// ============================================================================

export interface DiffCardProps {
  type: 'modified' | 'added' | 'removed' | 'identical';
  node: TreeNode;
  slotDiffs?: SlotDiff[];
  sourceNode?: TreeNode;
  isActive: boolean;
  onSelect: () => void;
}

// ============================================================================
// SlotValue renderer (same syntax colors as CommitTreeCard)
// ============================================================================

function renderSlotValue(value: SlotValue, strikethrough = false): React.ReactNode {
  const wrapClass = strikethrough ? 'line-through opacity-60' : '';

  if (typeof value === 'string') {
    return (
      <span className={`${wrapClass} text-[var(--yaml-string,#16a34a)]`}>
        &quot;{value}&quot;
      </span>
    );
  }
  if (typeof value === 'number') {
    return (
      <span className={`${wrapClass} text-[var(--yaml-number,#d97706)]`}>
        {value}
      </span>
    );
  }
  if (Array.isArray(value)) {
    return (
      <span className="block">
        {(value as SlotValue[]).map((item, i) => (
          <span key={i} className="block pl-4 leading-relaxed">
            <span className="text-[var(--yaml-punctuation,#6b7280)]">- </span>
            {renderSlotValue(item, strikethrough)}
          </span>
        ))}
      </span>
    );
  }
  if (value !== null && typeof value === 'object') {
    if ('ref' in value && typeof value.ref === 'string') {
      return (
        <span className={`${wrapClass} text-[var(--yaml-ref,#7c3aed)]`}>
          {'{ '}ref: {value.ref}
          {' }'}
        </span>
      );
    }
    if ('type' in value && 'slots' in value) {
      return (
        <span className={`${wrapClass} text-[var(--yaml-punctuation,#6b7280)]`}>
          {JSON.stringify(value)}
        </span>
      );
    }
  }
  return (
    <span className={`${wrapClass} text-[var(--yaml-punctuation,#6b7280)]`}>
      {JSON.stringify(value)}
    </span>
  );
}

// ============================================================================
// WordDiff inline renderer (for changed slot values)
// ============================================================================

function renderWordDiff(
  wordDiff: Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }>
): React.ReactNode {
  return (
    <>
      {wordDiff.map((chunk, i) => {
        if (chunk.type === 'added') {
          return (
            <span
              key={i}
              style={{ color: 'var(--diff-added-accent)', backgroundColor: 'var(--diff-added-bg)' }}
            >
              {chunk.text}
            </span>
          );
        }
        if (chunk.type === 'removed') {
          return (
            <span
              key={i}
              className="line-through opacity-70"
              style={{ color: 'var(--diff-removed-accent)' }}
            >
              {chunk.text}
            </span>
          );
        }
        return (
          <span key={i} className="text-[var(--yaml-string,#16a34a)]">
            {chunk.text}
          </span>
        );
      })}
    </>
  );
}

// ============================================================================
// SlotRow — a single key:value line in a modified tree
// ============================================================================

interface SlotRowProps {
  slotKey: string;
  value: SlotValue;
  diff?: SlotDiff;
  /** For whole-card added/removed modes — apply uniform tint */
  cardType?: 'added' | 'removed' | 'identical';
}

function SlotRow({ slotKey, value, diff, cardType }: SlotRowProps) {
  const slotType = diff?.type ?? null;

  // Border + bg colors per slot diff type
  let borderColor = 'transparent';
  let bgColor: string | undefined;
  let paddingLeft = '10px';

  if (cardType === 'added') {
    borderColor = 'var(--diff-added-accent)';
    bgColor = 'var(--diff-added-bg)';
    paddingLeft = '8px';
  } else if (cardType === 'removed') {
    borderColor = 'var(--diff-removed-accent)';
    bgColor = 'var(--diff-removed-bg)';
    paddingLeft = '8px';
  } else if (slotType === 'added') {
    borderColor = 'var(--diff-added-accent)';
    bgColor = 'var(--diff-added-bg)';
    paddingLeft = '8px';
  } else if (slotType === 'changed') {
    borderColor = 'var(--diff-modified-accent)';
    bgColor = 'var(--diff-modified-bg)';
    paddingLeft = '8px';
  } else if (slotType === 'removed') {
    borderColor = 'var(--diff-removed-accent)';
    bgColor = 'var(--diff-removed-bg)';
    paddingLeft = '8px';
  }

  const isRemoved = slotType === 'removed' || cardType === 'removed';

  return (
    <div
      className="relative flex flex-col rounded py-0.5 pr-2"
      style={{
        borderLeft: `2px solid ${borderColor}`,
        paddingLeft,
        backgroundColor: bgColor,
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-1 font-mono text-[12px] leading-relaxed">
        {/* Key */}
        <span className="text-[var(--yaml-key,#2563eb)]">{slotKey}</span>
        <span className="text-[var(--yaml-punctuation,#6b7280)]">:</span>

        {/* Value rendering */}
        {slotType === 'changed' && diff?.wordDiff ? (
          // Word-level diff for text changes
          <span className="text-[var(--yaml-string,#16a34a)]">{renderWordDiff(diff.wordDiff)}</span>
        ) : slotType === 'changed' ? (
          // Fallback: show old → new
          <>
            <span className="line-through opacity-60">
              {diff?.oldValue !== undefined ? renderSlotValue(diff.oldValue) : null}
            </span>
            <span className="text-[var(--yaml-punctuation,#6b7280)] mx-1">
              →
            </span>
            {renderSlotValue(value)}
          </>
        ) : (
          renderSlotValue(value, isRemoved)
        )}

        {/* Status labels */}
        {slotType === 'added' && (
          <span
            className="ml-1 rounded-sm px-1 py-px text-[9px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--diff-added-accent)', backgroundColor: 'var(--diff-added-bg)' }}
          >
            new
          </span>
        )}
        {slotType === 'removed' && (
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

      {/* "was: oldValue" annotation for changed slots (no wordDiff) */}
      {slotType === 'changed' && !diff?.wordDiff && diff?.oldValue !== undefined && (
        <div className="mt-0.5 font-mono text-[11px] opacity-60">
          <span style={{ color: 'var(--text-tertiary)' }}>was: </span>
          <span className="line-through">{renderSlotValue(diff.oldValue)}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// GutterBar — colored left edge
// ============================================================================

function GutterBar({ type }: { type: 'modified' | 'added' | 'removed' | 'identical' }) {
  const colorMap = {
    modified: 'bg-[var(--diff-modified-accent)]',
    added: 'bg-[var(--diff-added-accent)]',
    removed: 'bg-[var(--diff-removed-accent)]',
    identical: 'bg-[var(--text-tertiary)]/15',
  };
  return (
    <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg ${colorMap[type]}`} />
  );
}

// ============================================================================
// DotIndicator
// ============================================================================

function DotIndicator({ type }: { type: 'modified' | 'added' | 'removed' | 'identical' }) {
  const colorMap = {
    modified: 'bg-[var(--diff-modified-accent)]',
    added: 'bg-[var(--diff-added-accent)]',
    removed: 'bg-[var(--diff-removed-accent)]',
    identical: 'bg-[var(--text-tertiary)]/30',
  };
  return <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${colorMap[type]}`} />;
}

// ============================================================================
// StatusBadge
// ============================================================================

const badgeStyles = {
  modified:
    'border-[var(--diff-modified-accent)]/40 text-[var(--diff-modified-accent)] bg-[var(--diff-modified-bg)]',
  added:
    'border-[var(--diff-added-accent)]/40 text-[var(--diff-added-accent)] bg-[var(--diff-added-bg)]',
  removed:
    'border-[var(--diff-removed-accent)]/40 text-[var(--diff-removed-accent)] bg-[var(--diff-removed-bg)]',
  identical: 'border-[var(--stroke-divider)] text-[var(--text-tertiary)] bg-transparent',
};

const badgeLabels = {
  modified: '~modified',
  added: '+added',
  removed: '-removed',
  identical: 'same',
};

function StatusBadge({ type }: { type: 'modified' | 'added' | 'removed' | 'identical' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeStyles[type]}`}
    >
      {badgeLabels[type]}
    </span>
  );
}

// ============================================================================
// DiffCard
// ============================================================================

export function DiffCard({
  type,
  node,
  slotDiffs,
  sourceNode,
  isActive,
  onSelect,
}: DiffCardProps) {
  const [collapsed, setCollapsed] = useState(type === 'identical');

  // Build a lookup map for slot diffs (keyed by slot key)
  const slotDiffMap = new Map<string, SlotDiff>();
  if (slotDiffs) {
    for (const sd of slotDiffs) {
      slotDiffMap.set(sd.key, sd);
    }
  }

  // Removed slot entries: present in sourceNode but not in current tree (modified mode)
  const removedSlotEntries: Array<{ key: string; value: SlotValue }> = [];
  if (type === 'modified' && sourceNode) {
    for (const key of Object.keys(sourceNode.slots)) {
      if (!(key in node.slots)) {
        removedSlotEntries.push({ key, value: sourceNode.slots[key] });
      }
    }
  }

  const isIdentical = type === 'identical';
  const isRemoved = type === 'removed';

  return (
    <div
      onClick={onSelect}
      className={`group relative rounded-lg border transition-all duration-200 cursor-pointer overflow-hidden ${
        isActive
          ? 'border-[var(--accent-commit)]/30 bg-[var(--surface-card)]'
          : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] hover:border-[var(--stroke-default)]'
      } ${isIdentical ? 'opacity-50' : ''} ${isRemoved ? 'opacity-70' : ''}`}
    >
      <GutterBar type={type} />

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-4 pl-5 py-2"
        onClick={(e) => {
          e.stopPropagation();
          if (isIdentical) setCollapsed((c) => !c);
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <DotIndicator type={type} />

          {/* Type badge */}
          <span className="rounded bg-[var(--surface-app)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--stroke-divider)]">
            {node.type}
          </span>

          {/* Tree ID */}
          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{node.id}</span>

          {/* Collapse indicator for identical */}
          {isIdentical && (
            <span className="text-[10px] text-[var(--text-tertiary)] ml-1">
              {collapsed ? '▶' : '▼'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge type={type} />
          {node.confidence != null && (
            <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
              {Math.round(node.confidence * 100)}%
            </span>
          )}
        </div>
      </div>

      {/* ── YAML Body ── */}
      {!collapsed && (
        <div
          className={`px-4 pl-5 py-3 space-y-0.5 bg-[var(--surface-app)]/40 ${isRemoved ? 'opacity-80' : ''}`}
        >
          {/* Current slots */}
          {Object.entries(node.slots).map(([key, value]) => (
            <SlotRow
              key={key}
              slotKey={key}
              value={value}
              diff={slotDiffMap.get(key)}
              cardType={type === 'added' || type === 'removed' ? type : undefined}
            />
          ))}

          {/* Removed slots (modified trees only — slots that existed in source but not target) */}
          {removedSlotEntries.map(({ key, value }) => (
            <SlotRow
              key={`removed-${key}`}
              slotKey={key}
              value={value}
              diff={{ key, type: 'removed', oldValue: value }}
            />
          ))}
        </div>
      )}

      {/* ── Removed tree overlay ring ── */}
      {isRemoved && (
        <div className="absolute inset-0 pointer-events-none rounded-lg ring-1 ring-[var(--diff-removed-accent)]/20" />
      )}

      {/* ── Added tree overlay ring ── */}
      {type === 'added' && (
        <div className="absolute inset-0 pointer-events-none rounded-lg ring-1 ring-[var(--diff-added-accent)]/20" />
      )}
    </div>
  );
}
