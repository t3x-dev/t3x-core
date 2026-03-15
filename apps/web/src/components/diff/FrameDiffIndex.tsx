'use client';

/**
 * FrameDiffIndex — left sidebar listing all frames from a diff result with status icons.
 *
 * Shows:
 * 1. Stats summary: "N modified · N added · N removed"
 * 2. Modified frames (amber dot)
 * 3. Added frames (green dot, "new" label)
 * 4. Removed frames (red dot, strikethrough)
 * 5. Identical frames (gray dot, only when showIdentical is true)
 * 6. Toggle button: "Show identical (N)" / "Hide identical"
 */

import type { FrameDiff } from '@t3x-dev/core';
import { useCallback } from 'react';
import { DotIndicator } from '@/components/commit/CommitDetailHelpers';

// ============================================================================
// Types
// ============================================================================

interface FrameDiffIndexProps {
  diff: FrameDiff;
  activeFrameId: string | null;
  onSelectFrame: (id: string) => void;
  showIdentical: boolean;
  onToggleIdentical: () => void;
}

// ============================================================================
// Helper — format frame type from snake_case to Title Case
// ============================================================================

function formatFrameType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ============================================================================
// FrameRow — individual clickable row in the sidebar
// ============================================================================

interface FrameRowProps {
  frameId: string;
  frameType: string;
  status: 'modified' | 'added' | 'removed' | 'identical';
  isActive: boolean;
  onClick: () => void;
}

function FrameRow({ frameId, frameType, status, isActive, onClick }: FrameRowProps) {
  const isRemoved = status === 'removed';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isRemoved}
      className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all duration-200 ${
        isActive
          ? 'bg-[var(--accent-commit)]/8 text-[var(--text-primary)] ring-1 ring-[var(--accent-commit)]/20'
          : isRemoved
            ? 'cursor-default text-[var(--text-tertiary)] opacity-60'
            : 'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]'
      }`}
    >
      <DotIndicator status={status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <div
            className={`truncate text-[11px] font-medium ${isRemoved ? 'line-through' : ''}`}
          >
            {formatFrameType(frameType)}
          </div>
          {status === 'added' && (
            <span className="shrink-0 rounded px-1 py-px text-[9px] font-medium bg-[var(--diff-added-bg)] text-[var(--diff-added-accent)]">
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

export function FrameDiffIndex({
  diff,
  activeFrameId,
  onSelectFrame,
  showIdentical,
  onToggleIdentical,
}: FrameDiffIndexProps) {
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
          {statParts.join(' · ')}
        </div>
      )}

      {/* Modified frames */}
      {modifiedCount > 0 && (
        <>
          <div className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--diff-modified-accent)]">
            Modified ({modifiedCount})
          </div>
          {diff.modified.map(({ frameId, targetFrame }) => (
            <FrameRow
              key={frameId}
              frameId={frameId}
              frameType={targetFrame.type}
              status="modified"
              isActive={activeFrameId === frameId}
              onClick={() => handleSelect(frameId)}
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
          {diff.onlyInTarget.map((frame) => (
            <FrameRow
              key={frame.id}
              frameId={frame.id}
              frameType={frame.type}
              status="added"
              isActive={activeFrameId === frame.id}
              onClick={() => handleSelect(frame.id)}
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
          {diff.onlyInSource.map((frame) => (
            <FrameRow
              key={frame.id}
              frameId={frame.id}
              frameType={frame.type}
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
          {diff.identical.map((frame) => (
            <FrameRow
              key={frame.id}
              frameId={frame.id}
              frameType={frame.type}
              status="identical"
              isActive={activeFrameId === frame.id}
              onClick={() => handleSelect(frame.id)}
            />
          ))}
        </>
      )}

      {/* Spacer to push toggle to bottom */}
      <div className="flex-1" />

      {/* Toggle identical button */}
      {identicalCount > 0 && (
        <div className="mt-3 border-t border-[var(--stroke-divider)] pt-2">
          <button
            type="button"
            onClick={onToggleIdentical}
            className="w-full rounded px-2 py-1.5 text-left text-[10px] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)] transition-colors"
          >
            {showIdentical
              ? `Hide identical`
              : `Show identical (${identicalCount})`}
          </button>
        </div>
      )}
    </aside>
  );
}
