'use client';

import { Loader2, PanelRightClose, Play } from 'lucide-react';
import { useScriptExecution } from '@/hooks/drafts/useScriptExecution';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function WorkspaceTopbar() {
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const mode = useWorkspaceStore((s) => s.mode);
  const opsCount = useWorkspaceStore((s) => s.opsLog.length);
  const tree = useWorkspaceStore((s) => s.tree);
  const { execute, canRun } = useScriptExecution();

  const hasResult = tree.trees.length > 0;

  return (
    <div className="flex h-11 items-center gap-2 px-3 border-b border-[var(--stroke-default)] bg-[var(--panel-alt)]">
      <span className="text-xs font-semibold">YOps Workspace</span>

      {mode === 'streaming' && (
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
          <Loader2 className="h-3 w-3 animate-spin text-[var(--source)]" />
          Extracting...
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
          {opsCount} op{opsCount === 1 ? '' : 's'}
        </span>

        <button
          type="button"
          onClick={execute}
          disabled={!canRun}
          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="h-2.5 w-2.5" />
          {hasResult ? 'Re-run' : 'Run'}
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
