'use client';

import { Loader2, PanelRightClose } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function WorkspaceTopbar() {
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const mode = useWorkspaceStore((s) => s.mode);
  const opsCount = useWorkspaceStore((s) => s.opsLog.length);

  return (
    <div className="flex h-11 items-center gap-2 px-3 border-b border-[var(--stroke-default)] bg-[var(--panel-alt)]">
      <span className="text-xs font-semibold">YOps Workspace</span>

      {mode === 'streaming' && (
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
          <Loader2 className="h-3 w-3 animate-spin text-[var(--source)]" />
          Extracting...
        </span>
      )}

      <span className="ml-auto text-[10px] font-mono text-[var(--text-tertiary)]">
        {opsCount} op{opsCount === 1 ? '' : 's'}
      </span>

      <button
        type="button"
        onClick={() => setPanelExpanded(false)}
        className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
        title="Collapse panel"
      >
        <PanelRightClose className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
