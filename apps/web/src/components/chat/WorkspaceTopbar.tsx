'use client';

import type { TreeNode } from '@t3x-dev/core';
import { Loader2, PanelRightClose, Play } from 'lucide-react';
import { useMemo } from 'react';
import { computeTreeDiff } from '@/lib/treeDiff';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function WorkspaceTopbar() {
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const mode = useWorkspaceStore((s) => s.mode);
  const base = useWorkspaceStore((s) => s.base);
  const result = useWorkspaceStore((s) => s.result);
  const parseErrors = useWorkspaceStore((s) => s.parseErrors);
  const scriptOps = useWorkspaceStore((s) => s.scriptOps);
  const execute = useWorkspaceStore((s) => s.execute);

  const diff = useMemo(() => {
    if (!result) return null;
    return computeTreeDiff(base.trees as TreeNode[], result.trees as TreeNode[]);
  }, [base.trees, result]);

  const quoteValidation = useWorkspaceStore((s) => s.quoteValidation);

  const canRun =
    mode !== 'streaming' &&
    mode !== 'committing' &&
    parseErrors.length === 0 &&
    scriptOps.length > 0;

  return (
    <div className="flex h-11 items-center gap-2 px-3 border-b border-[var(--stroke-default)] bg-[var(--panel-alt)]">
      <span className="text-xs font-semibold">YOps Workspace</span>

      {mode === 'streaming' && (
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
          <Loader2 className="h-3 w-3 animate-spin text-[var(--source)]" />
          Extracting...
        </span>
      )}

      {diff && (
        <div className="flex items-center gap-1 ml-2">
          {diff.summary.nodesAdded > 0 && (
            <span className="text-[8px] font-semibold font-mono px-1.5 py-0.5 rounded bg-[var(--status-success)]/15 text-[var(--status-success)]">
              +{diff.summary.nodesAdded} node{diff.summary.nodesAdded !== 1 ? 's' : ''}
            </span>
          )}
          {diff.summary.slotsAdded > 0 && (
            <span className="text-[8px] font-semibold font-mono px-1.5 py-0.5 rounded bg-[var(--status-success)]/15 text-[var(--status-success)]">
              +{diff.summary.slotsAdded} slot{diff.summary.slotsAdded !== 1 ? 's' : ''}
            </span>
          )}
          {diff.summary.slotsModified > 0 && (
            <span className="text-[8px] font-semibold font-mono px-1.5 py-0.5 rounded bg-[var(--status-warning)]/15 text-[var(--status-warning)]">
              ~{diff.summary.slotsModified}
            </span>
          )}
          {diff.summary.nodesRemoved > 0 && (
            <span className="text-[8px] font-semibold font-mono px-1.5 py-0.5 rounded bg-[var(--status-error)]/15 text-[var(--status-error)]">
              -{diff.summary.nodesRemoved}
            </span>
          )}
        </div>
      )}

      {quoteValidation && quoteValidation.total > 0 && (
        <span
          className={`text-[8px] font-semibold font-mono px-1.5 py-0.5 rounded ${
            quoteValidation.coverage === 1
              ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
              : quoteValidation.coverage >= 0.7
                ? 'bg-[var(--status-warning)]/15 text-[var(--status-warning)]'
                : 'bg-[var(--status-error)]/15 text-[var(--status-error)]'
          }`}
          title={
            quoteValidation.missing.length > 0
              ? `Missing quotes: ${quoteValidation.missing.join(', ')}`
              : 'All slots have source quotes'
          }
        >
          {quoteValidation.quoted}/{quoteValidation.total} quoted
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={execute}
          disabled={!canRun}
          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded bg-[var(--action)] text-white hover:bg-[var(--action-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="h-2.5 w-2.5" />
          Run
        </button>
        <button
          type="button"
          onClick={() => setPanelExpanded(false)}
          className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          title="Collapse panel"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
