'use client';

/**
 * MergePreview - Shows the final merged result before commit
 *
 * Collapsible panel at the bottom showing what the merge
 * commit will contain.
 */

import { ChevronDown, ChevronUp, FileText, Layers } from 'lucide-react';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';

interface MergePreviewProps {
  expanded: boolean;
  onToggle: () => void;
}

export function MergePreview({ expanded, onToggle }: MergePreviewProps) {
  const { getPreviewSentences, prepared, getResolutionStats } = useMergeWorkspaceStore();
  const sentences = getPreviewSentences();

  // Count stats including extended resolutions
  const identicalCount = prepared?.identical.length || 0;
  const stats = getResolutionStats();

  const keptSourceCount = prepared?.onlyInSource.filter((c) => c.keep).length || 0;
  const keptTargetCount = prepared?.onlyInTarget.filter((c) => c.keep).length || 0;

  return (
    <div className={cn(glass.panelBase, 'border-x-0 border-b-0 rounded-none')}>
      {/* Header - Always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-[var(--hover-bg)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-[var(--text-tertiary)]" />
          <span className="font-medium text-[var(--text-primary)]">Merge Preview</span>
          <span className="text-sm text-[var(--text-tertiary)]">
            {sentences.length} sentences will be in final commit
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
            <span className="text-[var(--diff-added-line)]">{identicalCount} identical</span>
            <span className="text-[var(--diff-modified-line)]">{stats.standard} resolved</span>
            {stats.both > 0 && (
              <span className="text-[var(--accent-commit)] flex items-center gap-0.5">
                <Layers className="h-3 w-3" />
                {stats.both} both
              </span>
            )}
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
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--stroke-divider)] p-4">
            {sentences.length === 0 ? (
              <p className="text-center text-[var(--text-tertiary)] py-4">
                No sentences selected for merge
              </p>
            ) : (
              <div className="space-y-2">
                {sentences.map((sentence, idx) => (
                  <div key={sentence.id || idx} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 w-6 text-[var(--text-tertiary)] text-right">
                      {idx + 1}.
                    </span>
                    <span className="flex-1">{sentence.text}</span>
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
