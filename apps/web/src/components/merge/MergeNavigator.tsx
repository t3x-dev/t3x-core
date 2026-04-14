'use client';

/**
 * MergeNavigator — left sidebar for the merge workspace.
 *
 * Shows:
 * 1. Progress bar: X/Y resolved (conflicts only)
 * 2. Conflicts section: clickable, resolved/unresolved indicator
 * 3. Auto-kept section: informational only
 * 4. Source only: toggle keep/discard per path
 * 5. Target only: toggle keep/discard per path
 */

import type { MergeResult } from '@t3x-dev/core';
import { Check, Circle } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

type TreeResolution =
  | { type: 'source' }
  | { type: 'target' }
  | { type: 'both' }
  | { type: 'per-slot'; slotChoices: Record<string, 'source' | 'target'> };

interface MergeNavigatorProps {
  mergeResult: MergeResult;
  resolutions: Map<string, TreeResolution>;
  keepSource: Set<string>;
  keepTarget: Set<string>;
  activeNodeId: string | null;
  onSelectNode: (id: string) => void;
  onToggleKeepSource: (path: string) => void;
  onToggleKeepTarget: (path: string) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatPath(path: string): string {
  const parts = path.split('.');
  const last = parts[parts.length - 1];
  return last
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
  activeNodeId,
  onSelectNode,
  onToggleKeepSource,
  onToggleKeepTarget,
}: MergeNavigatorProps) {
  const totalConflicts = mergeResult.conflicts.length;
  const resolvedCountActual = mergeResult.conflicts.filter((c) => resolutions.has(c.path)).length;
  const progress = totalConflicts > 0 ? (resolvedCountActual / totalConflicts) * 100 : 100;

  function handleNodeClick(path: string) {
    onSelectNode(path);
    setTimeout(() => {
      document.getElementById(`merge-tree-${path}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 50);
  }

  return (
    <aside className="hidden w-[200px] shrink-0 flex-col overflow-y-auto border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-2 md:flex">
      {/* Progress */}
      <div className="mb-3 px-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Progress
          </span>
          <span
            className={`font-mono text-[10px] font-medium ${
              resolvedCountActual === totalConflicts && totalConflicts > 0
                ? 'text-[var(--diff-added-accent)]'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            {resolvedCountActual}/{totalConflicts}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--stroke-divider)]">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              progress === 100 ? 'bg-[var(--diff-added-accent)]' : 'bg-[var(--accent-commit)]'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {totalConflicts === 0 && (
          <div className="mt-1 text-[10px] text-[var(--diff-added-accent)]">No conflicts</div>
        )}
      </div>

      {/* Conflicts */}
      {mergeResult.conflicts.length > 0 && (
        <>
          <SectionHeader label="Conflicts" count={mergeResult.conflicts.length} color="red" />
          {mergeResult.conflicts.map((conflict) => {
            const isResolved = resolutions.has(conflict.path);
            const isActive = activeNodeId === conflict.path;
            return (
              <button
                key={conflict.path}
                type="button"
                onClick={() => handleNodeClick(conflict.path)}
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
                    className="shrink-0 fill-[var(--diff-removed-accent)] text-[var(--diff-removed-accent)]"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium">
                    {formatPath(conflict.path)}
                  </div>
                  <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                    {conflict.path}
                  </div>
                </div>
              </button>
            );
          })}
        </>
      )}

      {/* Auto-kept */}
      {mergeResult.autoKept.length > 0 && (
        <>
          <SectionHeader label="Auto-kept" count={mergeResult.autoKept.length} color="green" />
          {mergeResult.autoKept.map((path) => (
            <div
              key={path}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[var(--text-tertiary)] opacity-60"
            >
              <Check size={8} className="shrink-0 rounded-full text-[var(--diff-added-accent)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium">{formatPath(path)}</div>
                <div className="truncate font-mono text-[10px]">{path}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Source only */}
      {mergeResult.onlyInSource.length > 0 && (
        <>
          <SectionHeader
            label="Added in source"
            count={mergeResult.onlyInSource.length}
            color="blue"
          />
          {mergeResult.onlyInSource.map((path) => {
            const isKept = keepSource.has(path);
            return (
              <div key={path} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={isKept}
                  onChange={() => onToggleKeepSource(path)}
                  className="h-3 w-3 shrink-0 cursor-pointer accent-[var(--accent-commit)]"
                  title={isKept ? 'Discard from source' : 'Keep from source'}
                />
                <div className={`min-w-0 flex-1 ${isKept ? '' : 'opacity-40'}`}>
                  <div className="truncate text-[11px] font-medium text-[var(--text-secondary)]">
                    {formatPath(path)}
                  </div>
                  <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                    {path}
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
          <SectionHeader
            label="Added in target"
            count={mergeResult.onlyInTarget.length}
            color="blue"
          />
          {mergeResult.onlyInTarget.map((path) => {
            const isKept = keepTarget.has(path);
            return (
              <div key={path} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={isKept}
                  onChange={() => onToggleKeepTarget(path)}
                  className="h-3 w-3 shrink-0 cursor-pointer accent-[var(--accent-commit)]"
                  title={isKept ? 'Discard from target' : 'Keep from target'}
                />
                <div className={`min-w-0 flex-1 ${isKept ? '' : 'opacity-40'}`}>
                  <div className="truncate text-[11px] font-medium text-[var(--text-secondary)]">
                    {formatPath(path)}
                  </div>
                  <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                    {path}
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
