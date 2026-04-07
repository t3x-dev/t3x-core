'use client';

/**
 * ConflictCard — card for resolving a single tree-level merge conflict.
 *
 * Two modes:
 * - Per-tree (default): Side-by-side source/target YAML preview with
 *   "Accept Source" / "Accept Target" / "Accept Both" quick-resolution buttons.
 * - Per-slot (expanded): Each conflicting slot shown as a row with individual
 *   source/target radio buttons. Non-conflicting slots shown as auto-resolved.
 *
 * Toggle between modes via the "Resolve per slot →" / "← Back to per-tree" link.
 */

import type { TreeNode, SlotConflict, SlotValue } from '@t3x-dev/core';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { CompatNode } from '@/lib/treeCompat';

// ============================================================================
// Types
// ============================================================================

export type TreeResolution =
  | { type: 'source' }
  | { type: 'target' }
  | { type: 'both' }
  | { type: 'per-slot'; slotChoices: Record<string, 'source' | 'target'> };

export interface ConflictCardProps {
  conflict: {
    treeId: string;
    baseNode?: TreeNode;
    sourceNode: TreeNode;
    targetNode: TreeNode;
    slotConflicts: SlotConflict[];
  };
  resolution: TreeResolution | null;
  onResolve: (resolution: TreeResolution) => void;
  isActive: boolean;
  onSelect: () => void;
}

// ============================================================================
// SlotValue renderer (same syntax colors as CommitTreeCard / DiffCard)
// ============================================================================

function renderSlotValue(value: SlotValue | undefined): React.ReactNode {
  if (value === undefined) {
    return <span style={{ color: 'var(--text-tertiary)' }}>(none)</span>;
  }
  if (typeof value === 'string') {
    return <span className="text-[var(--yaml-string,#16a34a)]">&quot;{value}&quot;</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-[var(--yaml-number,#d97706)]">{value}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span className="block">
        {(value as SlotValue[]).map((item, i) => (
          <span key={i} className="block pl-4 leading-relaxed">
            <span className="text-[var(--yaml-punctuation,#6b7280)]">- </span>
            {renderSlotValue(item)}
          </span>
        ))}
      </span>
    );
  }
  if (value !== null && typeof value === 'object') {
    if ('ref' in value && typeof (value as { ref: string }).ref === 'string') {
      return (
        <span className="text-[var(--yaml-ref,#7c3aed)]">
          {'{ '}ref: {(value as { ref: string }).ref}
          {' }'}
        </span>
      );
    }
    if ('type' in value && 'slots' in value) {
      return <span className="text-[var(--yaml-punctuation,#6b7280)]">{JSON.stringify(value)}</span>;
    }
  }
  return <span className="text-[var(--yaml-punctuation,#6b7280)]">{JSON.stringify(value)}</span>;
}

// ============================================================================
// YamlPreview — compact YAML-style slot list for one tree side
// ============================================================================

interface YamlPreviewProps {
  node: TreeNode;
  conflictKeys: Set<string>;
  label: string;
  labelColor: string;
}

function YamlPreview({ node, conflictKeys, label, labelColor }: YamlPreviewProps) {
  return (
    <div className="flex-1 min-w-0 rounded border border-[var(--stroke-divider)] bg-[var(--surface-app)]/60 overflow-hidden">
      {/* Side label */}
      <div
        className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider border-b border-[var(--stroke-divider)]"
        style={{ color: labelColor }}
      >
        {label}
      </div>

      {/* Slot rows */}
      <div className="px-3 py-2 space-y-0.5">
        {Object.entries(node.slots).map(([key, value]) => {
          const isConflicting = conflictKeys.has(key);
          return (
            <div
              key={key}
              className="flex flex-wrap items-baseline gap-x-1 font-mono text-[11px] leading-relaxed rounded py-0.5"
              style={
                isConflicting
                  ? {
                      borderLeft: '2px solid var(--diff-removed-accent)',
                      paddingLeft: '6px',
                      backgroundColor: 'var(--diff-removed-bg)',
                    }
                  : { paddingLeft: '8px' }
              }
            >
              <span className="text-[var(--yaml-key,#2563eb)]">{key}</span>
              <span className="text-[var(--yaml-punctuation,#6b7280)]">:</span>
              {renderSlotValue(value)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// PerSlotRow — individual slot conflict with source/target radio buttons
// ============================================================================

interface PerSlotRowProps {
  conflict: SlotConflict;
  choice: 'source' | 'target' | undefined;
  treeId: string;
  onChoose: (key: string, choice: 'source' | 'target') => void;
}

function PerSlotRow({ conflict, choice, treeId, onChoose }: PerSlotRowProps) {
  const radioName = `slot-${treeId}-${conflict.key}`;

  return (
    <div className="rounded border border-[var(--diff-removed-accent)]/30 bg-[var(--diff-removed-bg)]/40 p-2 space-y-1.5">
      {/* Slot key label */}
      <div
        className="flex items-center gap-1.5 text-xs font-medium"
        style={{ color: 'var(--diff-removed-accent)' }}
      >
        <span className="font-mono">{conflict.key}</span>
        <span className="text-[var(--text-tertiary)] font-normal">conflict</span>
      </div>

      {/* Source / Target side by side */}
      <div className="grid grid-cols-2 gap-2">
        {/* Source */}
        <label
          className={cn(
            'flex items-start gap-1.5 rounded border p-2 cursor-pointer transition-colors text-xs',
            choice === 'source'
              ? 'border-[var(--merge-source-accent)]/60 bg-[var(--merge-source-accent)]/10 ring-1 ring-[var(--merge-source-accent)]/40'
              : 'border-[var(--stroke-divider)] hover:border-[var(--merge-source-accent)]/40'
          )}
        >
          <input
            type="radio"
            name={radioName}
            checked={choice === 'source'}
            onChange={() => onChoose(conflict.key, 'source')}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium text-[var(--merge-source-accent)] mb-0.5">Source</div>
            <div className="font-mono break-words">{renderSlotValue(conflict.sourceValue)}</div>
          </div>
        </label>

        {/* Target */}
        <label
          className={cn(
            'flex items-start gap-1.5 rounded border p-2 cursor-pointer transition-colors text-xs',
            choice === 'target'
              ? 'border-[var(--merge-target-accent)]/60 bg-[var(--merge-target-accent)]/10 ring-1 ring-[var(--merge-target-accent)]/40'
              : 'border-[var(--stroke-divider)] hover:border-[var(--merge-target-accent)]/40'
          )}
        >
          <input
            type="radio"
            name={radioName}
            checked={choice === 'target'}
            onChange={() => onChoose(conflict.key, 'target')}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium text-[var(--merge-target-accent)] mb-0.5">Target</div>
            <div className="font-mono break-words">{renderSlotValue(conflict.targetValue)}</div>
          </div>
        </label>
      </div>
    </div>
  );
}

// ============================================================================
// AutoResolvedSlotRow — non-conflicting slot shown as dimmed
// ============================================================================

function AutoResolvedSlotRow({ slotKey, value }: { slotKey: string; value: SlotValue }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1 font-mono text-[11px] leading-relaxed px-2 py-0.5 opacity-50">
      <Check className="h-2.5 w-2.5 text-[var(--diff-added-accent)] shrink-0 mt-0.5" />
      <span className="text-[var(--yaml-key,#2563eb)]">{slotKey}</span>
      <span className="text-[var(--yaml-punctuation,#6b7280)]">:</span>
      {renderSlotValue(value)}
      <span className="text-[9px] text-[var(--text-tertiary)] font-sans normal-case tracking-normal">
        auto
      </span>
    </div>
  );
}

// ============================================================================
// GutterBar — colored left edge based on resolution state
// ============================================================================

function GutterBar({ isResolved }: { isResolved: boolean }) {
  return (
    <div
      className={cn(
        'absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg transition-colors',
        isResolved ? 'bg-[var(--diff-added-accent)]' : 'bg-[var(--diff-removed-accent)]'
      )}
    />
  );
}

// ============================================================================
// ConflictCard
// ============================================================================

export function ConflictCard({
  conflict,
  resolution,
  onResolve,
  isActive,
  onSelect,
}: ConflictCardProps) {
  const [mode, setMode] = useState<'per-tree' | 'per-slot'>('per-tree');
  const { treeId, sourceNode, targetNode, slotConflicts } = conflict;

  const isResolved = resolution !== null;
  const conflictKeys = new Set(slotConflicts.map((sc) => sc.key));

  // Current per-slot choices (from resolution if in per-slot mode, else empty)
  const slotChoices: Record<string, 'source' | 'target'> =
    resolution?.type === 'per-slot' ? resolution.slotChoices : {};

  // Count resolved per-slot choices (for display in per-slot mode)
  const resolvedSlotCount = slotConflicts.filter((sc) => slotChoices[sc.key]).length;

  // Non-conflicting slots (agreed upon): present in source, not in slotConflicts
  const allSlotKeys = new Set([
    ...Object.keys(sourceNode.slots),
    ...Object.keys(targetNode.slots),
  ]);
  const agreedSlots: Array<{ key: string; value: SlotValue }> = [];
  for (const key of allSlotKeys) {
    if (!conflictKeys.has(key)) {
      const value = sourceNode.slots[key] ?? targetNode.slots[key];
      if (value !== undefined) {
        agreedSlots.push({ key, value });
      }
    }
  }

  // Handlers for per-tree buttons
  function handleAcceptSource() {
    onResolve({ type: 'source' });
  }
  function handleAcceptTarget() {
    onResolve({ type: 'target' });
  }
  function handleAcceptBoth() {
    onResolve({ type: 'both' });
  }

  // Handler for per-slot choice change
  function handleSlotChoose(key: string, choice: 'source' | 'target') {
    const nextChoices = { ...slotChoices, [key]: choice };
    onResolve({ type: 'per-slot', slotChoices: nextChoices });
  }

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative rounded-lg border transition-all duration-200 cursor-pointer overflow-hidden',
        isActive
          ? 'border-[var(--accent-commit)]/30 bg-[var(--surface-card)]'
          : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] hover:border-[var(--stroke-default)]',
        isResolved
          ? 'ring-1 ring-[var(--diff-added-accent)]/30'
          : 'ring-1 ring-[var(--diff-removed-accent)]/30'
      )}
    >
      <GutterBar isResolved={isResolved} />

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-4 pl-5 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Pulsing indicator for unresolved */}
          {!isResolved && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[var(--diff-removed-accent)]" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--diff-removed-accent)]" />
            </span>
          )}
          {isResolved && <Check className="h-3.5 w-3.5 text-[var(--diff-added-accent)] shrink-0" />}

          {/* Type badge */}
          <span className="rounded bg-[var(--surface-app)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--stroke-divider)]">
            {sourceNode.key}
          </span>

          {/* Tree ID */}
          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{treeId}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* CONFLICT / RESOLVED label */}
          {isResolved ? (
            <span className="inline-flex items-center rounded-full border border-[var(--diff-added-accent)]/40 text-[var(--diff-added-accent)] bg-[var(--diff-added-bg)] px-2 py-0.5 text-[10px] font-medium">
              resolved
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-[var(--diff-removed-accent)]/60 text-[var(--diff-removed-accent)] bg-[var(--diff-removed-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              conflict
            </span>
          )}

          {/* Slot count */}
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {slotConflicts.length} slot{slotConflicts.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div
        className="px-4 pl-5 py-3 space-y-3 bg-[var(--surface-app)]/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Per-tree mode ── */}
        {mode === 'per-tree' && (
          <>
            {/* Side-by-side YAML preview */}
            <div className="flex gap-3">
              <YamlPreview
                node={sourceNode}
                conflictKeys={conflictKeys}
                label="Source"
                labelColor="var(--diff-added-accent)"
              />
              <YamlPreview
                node={targetNode}
                conflictKeys={conflictKeys}
                label="Target"
                labelColor="var(--accent-pending, #e0af68)"
              />
            </div>

            {/* Quick-resolution buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleAcceptSource}
                className={cn(
                  'rounded px-3 py-1.5 text-xs font-medium border transition-colors',
                  resolution?.type === 'source'
                    ? 'bg-[var(--merge-source-accent)]/20 border-[var(--merge-source-accent)]/60 text-[var(--merge-source-accent)] ring-1 ring-[var(--merge-source-accent)]/40'
                    : 'border-[var(--stroke-divider)] text-[var(--text-secondary)] hover:border-[var(--merge-source-accent)]/60 hover:text-[var(--merge-source-accent)]'
                )}
              >
                Accept Source
                <kbd className="ml-1 text-[0.65rem] font-mono bg-[var(--hover-bg)] px-1 rounded opacity-60">A</kbd>
              </button>
              <button
                type="button"
                onClick={handleAcceptTarget}
                className={cn(
                  'rounded px-3 py-1.5 text-xs font-medium border transition-colors',
                  resolution?.type === 'target'
                    ? 'bg-[var(--merge-target-accent)]/20 border-[var(--merge-target-accent)]/60 text-[var(--merge-target-accent)] ring-1 ring-[var(--merge-target-accent)]/40'
                    : 'border-[var(--stroke-divider)] text-[var(--text-secondary)] hover:border-[var(--merge-target-accent)]/60 hover:text-[var(--merge-target-accent)]'
                )}
              >
                Accept Target
                <kbd className="ml-1 text-[0.65rem] font-mono bg-[var(--hover-bg)] px-1 rounded opacity-60">B</kbd>
              </button>
              <button
                type="button"
                onClick={handleAcceptBoth}
                className={cn(
                  'rounded px-3 py-1.5 text-xs font-medium border transition-colors',
                  resolution?.type === 'both'
                    ? 'bg-[var(--merge-conflict-accent)]/20 border-[var(--merge-conflict-accent)]/60 text-[var(--merge-conflict-accent)] ring-1 ring-[var(--merge-conflict-accent)]/40'
                    : 'border-[var(--stroke-divider)] text-[var(--text-secondary)] hover:border-[var(--merge-conflict-accent)]/60 hover:text-[var(--merge-conflict-accent)]'
                )}
              >
                Accept Both
                <kbd className="ml-1 text-[0.65rem] font-mono bg-[var(--hover-bg)] px-1 rounded opacity-60">X</kbd>
              </button>

              {/* Mode toggle */}
              <button
                type="button"
                onClick={() => setMode('per-slot')}
                className="ml-auto text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                Resolve per slot →
              </button>
            </div>
          </>
        )}

        {/* ── Per-slot mode ── */}
        {mode === 'per-slot' && (
          <>
            {/* Progress */}
            <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
              <span>
                {resolvedSlotCount}/{slotConflicts.length} slots resolved
              </span>
              <button
                type="button"
                onClick={() => setMode('per-tree')}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                ← Back to per-tree
              </button>
            </div>

            {/* Auto-resolved (agreed) slots */}
            {agreedSlots.length > 0 && (
              <div className="rounded border border-[var(--stroke-divider)] bg-[var(--surface-app)]/40 py-1">
                <div className="px-2 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Auto-resolved
                </div>
                {agreedSlots.map(({ key, value }) => (
                  <AutoResolvedSlotRow key={key} slotKey={key} value={value} />
                ))}
              </div>
            )}

            {/* Conflicting slot rows */}
            <div className="space-y-2">
              {slotConflicts.map((sc) => (
                <PerSlotRow
                  key={sc.key}
                  conflict={sc}
                  choice={slotChoices[sc.key]}
                  treeId={treeId}
                  onChoose={handleSlotChoose}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
