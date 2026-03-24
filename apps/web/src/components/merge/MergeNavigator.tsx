'use client';

/**
 * MergeNavigator — left sidebar for the merge workspace.
 *
 * Shows:
 * 1. Progress bar: X/Y resolved (conflicts only)
 * 2. Conflicts section: clickable, resolved/unresolved indicator
 * 3. Auto-kept section: informational only
 * 4. Source only: toggle keep/discard per frame
 * 5. Target only: toggle keep/discard per frame
 */

import type { FrameMergeResult } from '@t3x-dev/core';
import { Check, ChevronDown, Circle } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

type FrameResolution =
  | { type: 'source' }
  | { type: 'target' }
  | { type: 'both' }
  | { type: 'per-slot'; slotChoices: Record<string, 'source' | 'target'> };

interface RelationAnnotation {
  source: string;
  target: string;
  type: string;
}

interface MergeNavigatorProps {
  mergeResult: FrameMergeResult;
  resolutions: Map<string, FrameResolution>;
  keepSource: Set<string>;
  keepTarget: Set<string>;
  activeFrameId: string | null;
  onSelectFrame: (id: string) => void;
  onToggleKeepSource: (frameId: string) => void;
  onToggleKeepTarget: (frameId: string) => void;
  onJumpToNextUnresolved?: () => void;
  relations?: RelationAnnotation[];
}

// ============================================================================
// Helpers
// ============================================================================

function formatFrameType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function SectionHeader({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: 'red' | 'green' | 'blue' | 'default';
}) {
  const colorClass = {
    red: 'text-[var(--diff-removed-accent)]',
    green: 'text-[var(--diff-added-accent)]',
    blue: 'text-[var(--accent-commit)]',
    default: 'text-[var(--text-tertiary)]',
  }[color];

  return (
    <div className={`mt-3 mb-1 flex items-center gap-1.5 px-2 ${colorClass}`}>
      <span className="text-[9px] font-semibold uppercase tracking-wider">{label}</span>
      <span className="rounded bg-current/10 px-1 py-0.5 font-mono text-[9px] opacity-80">
        {count}
      </span>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function MergeNavigator({
  mergeResult,
  resolutions,
  keepSource,
  keepTarget,
  activeFrameId,
  onSelectFrame,
  onToggleKeepSource,
  onToggleKeepTarget,
  onJumpToNextUnresolved,
  relations = [],
}: MergeNavigatorProps) {
  const totalConflicts = mergeResult.conflicts.length;
  const resolvedCountActual = mergeResult.conflicts.filter((c) =>
    resolutions.has(c.frameId)
  ).length;
  const progress = totalConflicts > 0 ? (resolvedCountActual / totalConflicts) * 100 : 100;

  function handleFrameClick(frameId: string) {
    onSelectFrame(frameId);
    setTimeout(() => {
      document.getElementById(`merge-frame-${frameId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 50);
  }

  return (
    <aside className="hidden w-[200px] shrink-0 flex-col overflow-y-auto border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-2 md:flex">
      {/* Progress */}
      <div className="mb-2 border-b border-[var(--stroke-divider)] px-3 pb-3 pt-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
          Progress
        </div>
        <div className="h-[3px] overflow-hidden rounded-full bg-[var(--stroke-divider)]">
          <div
            className="h-full rounded-full bg-[var(--diff-added-accent)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1.5 font-mono text-[10px] text-[var(--text-tertiary)]">
          {totalConflicts === 0 ? (
            <span className="text-[var(--diff-added-accent)]">No conflicts</span>
          ) : (
            <span
              className={
                resolvedCountActual === totalConflicts
                  ? 'text-[var(--diff-added-accent)]'
                  : 'text-[var(--text-tertiary)]'
              }
            >
              {resolvedCountActual} / {totalConflicts} conflicts resolved
            </span>
          )}
        </div>
        {/* Jump to next unresolved button — hidden when all resolved */}
        {onJumpToNextUnresolved && resolvedCountActual < totalConflicts && (
          <button
            type="button"
            onClick={onJumpToNextUnresolved}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[5px] border border-[var(--merge-conflict-accent)]/30 bg-[var(--merge-conflict-accent)]/6 px-0 py-1.5 text-[10px] font-semibold text-[var(--merge-conflict-accent)] transition-colors hover:bg-[var(--merge-conflict-accent)]/12"
          >
            <ChevronDown size={10} />
            Next unresolved
            <span className="rounded border border-white/8 bg-white/6 px-1 font-mono text-[9px] text-[var(--text-tertiary)]">
              J
            </span>
          </button>
        )}
      </div>

      {/* Conflicts */}
      {mergeResult.conflicts.length > 0 && (
        <>
          <SectionHeader label="Conflicts" count={mergeResult.conflicts.length} color="red" />
          {mergeResult.conflicts.map((conflict, idx) => {
            const isResolved = resolutions.has(conflict.frameId);
            const isActive = activeFrameId === conflict.frameId;
            // Find relations that link this conflict to the next conflict item
            const nextConflict = mergeResult.conflicts[idx + 1];
            const relationsToNext = nextConflict
              ? relations.filter(
                  (r) =>
                    (r.source === conflict.frameId && r.target === nextConflict.frameId) ||
                    (r.source === nextConflict.frameId && r.target === conflict.frameId)
                )
              : [];
            return (
              <div key={conflict.frameId}>
                <button
                  type="button"
                  onClick={() => handleFrameClick(conflict.frameId)}
                  className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all duration-200 ${
                    isActive
                      ? 'bg-[var(--accent-commit)]/8 text-[var(--text-primary)] ring-1 ring-[var(--accent-commit)]/20'
                      : 'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {isResolved ? (
                    <Check
                      size={8}
                      className="shrink-0 rounded-full text-[var(--diff-added-accent)]"
                    />
                  ) : (
                    <Circle
                      size={8}
                      className="shrink-0 fill-[var(--merge-conflict-accent)] text-[var(--merge-conflict-accent)]"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium">
                      {formatFrameType(conflict.sourceFrame.type)}
                    </div>
                    <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                      {conflict.frameId}
                    </div>
                  </div>
                </button>
                {/* Relation annotations between this and the next conflict */}
                {relationsToNext.map((rel, rIdx) => (
                  <div
                    key={`${rel.source}-${rel.target}-${rIdx}`}
                    className="flex items-center gap-1.5 py-0.5 pl-7 pr-2 font-mono text-[9px] text-[var(--text-tertiary)]"
                    title={`${rel.source} ${rel.type} ${rel.target}`}
                  >
                    <span className="opacity-60">↳</span>
                    <span className="truncate opacity-60">
                      {rel.type} {rel.source === conflict.frameId ? rel.target : rel.source}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}

      {/* Auto-kept */}
      {mergeResult.autoKept.length > 0 && (
        <>
          <SectionHeader label="Auto-kept" count={mergeResult.autoKept.length} color="green" />
          {mergeResult.autoKept.map((frame) => (
            <div
              key={frame.id}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[var(--text-tertiary)] opacity-60"
            >
              <Check size={8} className="shrink-0 rounded-full text-[var(--diff-added-accent)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium">
                  {formatFrameType(frame.type)}
                </div>
                <div className="truncate font-mono text-[10px]">{frame.id}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Source only */}
      {mergeResult.onlyInSource.length > 0 && (
        <>
          <SectionHeader label="Source only" count={mergeResult.onlyInSource.length} color="blue" />
          {mergeResult.onlyInSource.map((frame) => {
            const isKept = keepSource.has(frame.id);
            return (
              <div key={frame.id} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={isKept}
                  onChange={() => onToggleKeepSource(frame.id)}
                  className="h-3 w-3 shrink-0 cursor-pointer accent-[var(--merge-source-accent)]"
                  title={isKept ? 'Discard from source' : 'Keep from source'}
                />
                <div className={`min-w-0 flex-1 ${isKept ? '' : 'opacity-40'}`}>
                  <div className="truncate text-[11px] font-medium text-[var(--text-secondary)]">
                    {formatFrameType(frame.type)}
                  </div>
                  <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                    {frame.id}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Target only */}
      {mergeResult.onlyInTarget.length > 0 && (
        <>
          <SectionHeader label="Target only" count={mergeResult.onlyInTarget.length} color="blue" />
          {mergeResult.onlyInTarget.map((frame) => {
            const isKept = keepTarget.has(frame.id);
            return (
              <div key={frame.id} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={isKept}
                  onChange={() => onToggleKeepTarget(frame.id)}
                  className="h-3 w-3 shrink-0 cursor-pointer accent-[var(--merge-target-accent)]"
                  title={isKept ? 'Discard from target' : 'Keep from target'}
                />
                <div className={`min-w-0 flex-1 ${isKept ? '' : 'opacity-40'}`}>
                  <div className="truncate text-[11px] font-medium text-[var(--text-secondary)]">
                    {formatFrameType(frame.type)}
                  </div>
                  <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                    {frame.id}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </aside>
  );
}
