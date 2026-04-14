'use client';

/**
 * MergePreview - Shows the final merged result before commit
 *
 * Collapsible panel at the bottom showing what the merge
 * commit will contain. Uses tree-based merge data.
 */

import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useTerminology } from '@/hooks/useTerminology';
import { glass } from '@/utils/theme';
import { cn } from '@/utils/cn';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';

interface MergePreviewProps {
  expanded: boolean;
  onToggle: () => void;
}

export function MergePreview({ expanded, onToggle }: MergePreviewProps) {
  const { t } = useTerminology();
  const { treeMergeResult, treeResolutions, keepSourceNodes, keepTargetNodes, getPreviewPaths } =
    useMergeWorkspaceStore();

  if (!treeMergeResult) return null;

  const previewPaths = getPreviewPaths();
  const autoKeptCount = treeMergeResult.autoKept.length;
  const resolvedCount = treeMergeResult.conflicts.filter((c) => treeResolutions.has(c.path)).length;
  const keptSourceCount = treeMergeResult.onlyInSource.filter((path) =>
    keepSourceNodes.has(path)
  ).length;
  const keptTargetCount = treeMergeResult.onlyInTarget.filter((path) =>
    keepTargetNodes.has(path)
  ).length;

  return (
    <div className={cn(glass.panelBase, 'border-x-0 border-b-0 rounded-none')}>
      {/* Header - Always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-[var(--hover-bg)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-[var(--text-tertiary)]" />
          <span className="font-medium text-[var(--text-primary)]">Merge Preview</span>
          <span className="text-sm text-[var(--text-tertiary)]">
            {previewPaths.length} nodes will be in final {t('commit').toLowerCase()}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
            <span className="text-[var(--diff-added-line)]">{autoKeptCount} auto-kept</span>
            <span className="text-[var(--diff-modified-line)]">{resolvedCount} resolved</span>
            <span className="text-[var(--accent-commit)]">
              {keptSourceCount + keptTargetCount} unique kept
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
          ) : (
            <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" />
          )}
        </div>
      </button>

      {/* Content - Collapsible */}
      {expanded && (
        <div className="px-6 pb-4 max-h-64 overflow-auto">
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--stroke-divider)] p-[var(--space-group)] elevation-2">
            {previewPaths.length === 0 ? (
              <p className="text-center text-[var(--text-tertiary)] py-4">
                No trees selected for merge
              </p>
            ) : (
              <div className="space-y-[var(--space-item)]">
                {previewPaths.map((path, idx) => (
                  <div key={path} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 w-6 text-[var(--text-tertiary)] text-right font-mono text-xs">
                      {idx + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                        {path}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
