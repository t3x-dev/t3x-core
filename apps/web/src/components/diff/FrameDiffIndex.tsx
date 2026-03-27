'use client';

/**
 * TreeDiffIndex — left sidebar listing all frames from a diff result with status icons.
 *
 * Shows:
 * 1. Stats summary: "N modified · N added · N removed"
 * 2. Modified frames (amber dot)
 * 3. Added frames (green dot, "new" label)
 * 4. Removed frames (red dot, strikethrough)
 * 5. Identical frames (gray dot, only when showIdentical is true)
 * 6. Toggle button: "Show identical (N)" / "Hide identical"
 */

import type { TreeDiff } from '@t3x-dev/core';
import { useCallback } from 'react';
import { DotIndicator } from '@/components/commit/CommitDetailHelpers';

// ============================================================================
// Types
// ============================================================================

interface TreeDiffIndexProps {
  diff: TreeDiff;
  activeFrameId: string | null;
  onSelectFrame: (id: string) => void;
  showIdentical: boolean;
  onToggleIdentical: () => void;
}

type FrameStatus = 'modified' | 'added' | 'removed' | 'identical';

// ============================================================================
// FrameRow
// ============================================================================

function FrameRow({
  frameId,
  frameType,
  status,
  isActive,
  onClick,
}: {
  frameId: string;
  frameType: string;
  status: FrameStatus;
  isActive: boolean;
  onClick: () => void;
}) {
  const isRemoved = status === 'removed';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--hover-bg)] ${
        isActive ? 'bg-[var(--hover-bg)]' : ''
      }`}
    >
      <div className="mt-0.5">
        <DotIndicator status={status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span
            className={`truncate text-[11px] font-medium ${isRemoved ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}
          >
            {frameType}
          </span>
          {status === 'added' && (
            <span className="shrink-0 rounded bg-[var(--diff-added-bg)] px-1 text-[8px] font-semibold uppercase text-[var(--diff-added-accent)]">
              new
            </span>
          )}
        </div>
        <div
          className={`truncate font-mono text-[10px] text-[var(--text-tertiary)] ${isRemoved ? 'line-through' : ''}`}
        >
          {frameId}
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// Component
// ============================================================================

/** Extract the last segment of a dot-path as the display type */
function pathToType(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1];
}

export function TreeDiffIndex({
  diff,
  activeFrameId,
  onSelectFrame,
  showIdentical,
  onToggleIdentical,
}: TreeDiffIndexProps) {
  const handleSelect = useCallback(
    (id: string) => {
      onSelectFrame(id);
      setTimeout(() => {
        document.getElementById(`diff-frame-${id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 50);
    },
    [onSelectFrame]
  );

  const modifiedCount = diff.modified.length;
  const addedCount = diff.onlyInTarget.length;
  const removedCount = diff.onlyInSource.length;
  const identicalCount = diff.identical.length;

  // Build stats summary string
  const statParts: string[] = [];
  if (modifiedCount > 0) statParts.push(`${modifiedCount} modified`);
  if (addedCount > 0) statParts.push(`${addedCount} added`);
  if (removedCount > 0) statParts.push(`${removedCount} removed`);

  return (
    <aside className="hidden w-[160px] shrink-0 overflow-y-auto border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-2 md:flex md:flex-col">
      {/* Stats summary */}
      {statParts.length > 0 && (
        <div className="mb-3 px-2 text-[10px] leading-relaxed text-[var(--text-tertiary)]">
          {statParts.join(' \u00b7 ')}
        </div>
      )}

      {/* Modified frames */}
      {modifiedCount > 0 && (
        <>
          <div className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--diff-modified-accent)]">
            Modified ({modifiedCount})
          </div>
          {diff.modified.map(({ path }) => (
            <FrameRow
              key={path}
              frameId={path}
              frameType={pathToType(path)}
              status="modified"
              isActive={activeFrameId === path}
              onClick={() => handleSelect(path)}
            />
          ))}
        </>
      )}

      {/* Added frames */}
      {addedCount > 0 && (
        <>
          <div
            className={`mb-1 px-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--diff-added-accent)] ${modifiedCount > 0 ? 'mt-3' : ''}`}
          >
            Added ({addedCount})
          </div>
          {diff.onlyInTarget.map((path) => (
            <FrameRow
              key={path}
              frameId={path}
              frameType={pathToType(path)}
              status="added"
              isActive={activeFrameId === path}
              onClick={() => handleSelect(path)}
            />
          ))}
        </>
      )}

      {/* Removed frames */}
      {removedCount > 0 && (
        <>
          <div
            className={`mb-1 px-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--diff-removed-accent)] ${modifiedCount > 0 || addedCount > 0 ? 'mt-3' : ''}`}
          >
            Removed ({removedCount})
          </div>
          {diff.onlyInSource.map((path) => (
            <FrameRow
              key={path}
              frameId={path}
              frameType={pathToType(path)}
              status="removed"
              isActive={false}
              onClick={() => {}}
            />
          ))}
        </>
      )}

      {/* Identical frames (conditionally shown) */}
      {showIdentical && identicalCount > 0 && (
        <>
          <div
            className={`mb-1 px-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] ${modifiedCount > 0 || addedCount > 0 || removedCount > 0 ? 'mt-3' : ''}`}
          >
            Identical ({identicalCount})
          </div>
          {diff.identical.map((path) => (
            <FrameRow
              key={path}
              frameId={path}
              frameType={pathToType(path)}
              status="identical"
              isActive={activeFrameId === path}
              onClick={() => handleSelect(path)}
            />
          ))}
        </>
      )}

      {/* Spacer to push toggle to bottom */}
      <div className="flex-1" />

      {/* Toggle button for identical frames */}
      {identicalCount > 0 && (
        <button
          type="button"
          onClick={onToggleIdentical}
          className="mt-2 w-full rounded-md border border-[var(--stroke-divider)] px-2 py-1.5 text-[10px] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]"
        >
          {showIdentical ? 'Hide identical' : `Show identical (${identicalCount})`}
        </button>
      )}
    </aside>
  );
}
