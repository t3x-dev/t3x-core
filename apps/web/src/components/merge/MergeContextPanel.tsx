import type { MergeResult } from '@t3x-dev/core';

interface MergeContextPanelProps {
  sourceBranch: string | null;
  targetBranch: string | null;
  sourceHash: string | null;
  targetHash: string | null;
  treeMergeResult: MergeResult;
  unresolvedCount: number;
  message: string;
  previewTotalCount: number;
}

/**
 * Right sidebar context panel for the tree merge workspace.
 * Shows merge info, validation status, and summary stats.
 */
export function MergeContextPanel({
  sourceBranch,
  targetBranch,
  sourceHash,
  targetHash,
  treeMergeResult,
  unresolvedCount,
  message,
  previewTotalCount,
}: MergeContextPanelProps) {
  return (
    <div className="hidden lg:flex w-[280px] shrink-0 flex-col border-l border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 overflow-y-auto">
      {/* Source / Target info */}
      <div className="mb-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          Merge Info
        </h4>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--text-tertiary)]">Source</span>
            <span className="font-mono text-[var(--text-secondary)] truncate ml-2 max-w-[160px]">
              {sourceBranch || sourceHash?.slice(0, 12) || '?'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-tertiary)]">Target</span>
            <span className="font-mono text-[var(--text-secondary)] truncate ml-2 max-w-[160px]">
              {targetBranch || targetHash?.slice(0, 12) || '?'}
            </span>
          </div>
        </div>
      </div>

      {/* Validation summary */}
      <div className="mb-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          Validation
        </h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                unresolvedCount === 0
                  ? 'bg-[var(--diff-added-accent)]'
                  : 'bg-[var(--diff-removed-accent)]'
              }`}
            />
            <span className="text-[var(--text-secondary)]">
              {unresolvedCount === 0
                ? 'All conflicts resolved'
                : `${unresolvedCount} unresolved`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                message.trim()
                  ? 'bg-[var(--diff-added-accent)]'
                  : 'bg-[var(--diff-removed-accent)]'
              }`}
            />
            <span className="text-[var(--text-secondary)]">
              {message.trim() ? 'Message provided' : 'Message required'}
            </span>
          </div>
        </div>
      </div>

      {/* Tree count summary */}
      <div className="mb-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          Summary
        </h4>
        <div className="space-y-1 text-xs text-[var(--text-secondary)]">
          <div className="flex justify-between">
            <span>Auto-kept</span>
            <span className="font-mono">{treeMergeResult.autoKept.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Conflicts</span>
            <span className="font-mono">{treeMergeResult.conflicts.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Source only</span>
            <span className="font-mono">{treeMergeResult.onlyInSource.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Target only</span>
            <span className="font-mono">{treeMergeResult.onlyInTarget.length}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-[var(--stroke-divider)]">
            <span className="font-medium">Preview total</span>
            <span className="font-mono font-medium">{previewTotalCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
