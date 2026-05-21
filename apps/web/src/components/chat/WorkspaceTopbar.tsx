'use client';

import { Loader2, PanelRightClose } from 'lucide-react';
import { buildMaterializedOpGroups } from '@/domain/yops/opCardGroups';
import {
  selectIsInheritedBaselineOnly,
  selectScriptDirty,
  useWorkspaceStore,
} from '@/store/workspaceStore';
import { cn } from '@/utils/cn';

function getSurfaceSummaryParts(groups: ReturnType<typeof buildMaterializedOpGroups>): string[] {
  const parts: string[] = [];
  const { surfaces } = groups.user;
  if (surfaces.script > 0) parts.push(`YOps: ${surfaces.script}`);
  if (surfaces.tree > 0) parts.push(`Tree: ${surfaces.tree}`);
  if (surfaces.inline > 0) parts.push(`Inline: ${surfaces.inline}`);
  if (surfaces.unknown > 0) parts.push(`User: ${surfaces.unknown}`);
  return parts;
}

export function WorkspaceTopbar() {
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const mode = useWorkspaceStore((s) => s.mode);
  const opsLog = useWorkspaceStore((s) => s.opsLog);
  const draftOps = useWorkspaceStore((s) => s.draftOps);
  const scriptDirty = useWorkspaceStore(selectScriptDirty);
  const groups = buildMaterializedOpGroups({
    ops: opsLog,
    pendingDraftOps: draftOps,
    scriptDirty,
  });
  const hasDraft = useWorkspaceStore((s) => s.hasDraft);
  const isInheritedBaselineOnly = useWorkspaceStore(selectIsInheritedBaselineOnly);
  const dirtyCopy = 'Inline changes · Apply or discard before commit';
  const pendingCopy = 'Pending extract · Apply or discard before commit';
  const surfaceSummaryParts = getSurfaceSummaryParts(groups);
  const pendingCount = groups.pending.count;

  return (
    <div className="flex h-11 items-center gap-2 overflow-hidden border-b border-[var(--stroke-divider)] bg-[var(--workspace-panel)] px-3">
      <span className="shrink-0 text-xs font-semibold">Workspace</span>

      {mode === 'streaming' && (
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[10px] text-[var(--text-tertiary)]">
          <Loader2 className="h-3 w-3 animate-spin text-[var(--source)]" />
          Extracting...
        </span>
      )}

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <div
          className="flex min-w-0 items-center gap-1.5 overflow-hidden font-mono text-[10px]"
          aria-live="polite"
          title={
            isInheritedBaselineOnly
              ? 'Inherited from parent commit; no current conversation YOps applied'
              : scriptDirty
                ? dirtyCopy
                : hasDraft
                  ? pendingCopy
                  : `${opsLog.length} materialized op${opsLog.length === 1 ? '' : 's'} in yops_log`
          }
        >
          {isInheritedBaselineOnly ? (
            <span className="shrink-0 whitespace-nowrap rounded-full border border-[var(--stroke-divider)] bg-[var(--workspace-panel)] px-2 py-0.5 text-[var(--text-tertiary)]">
              Inherited baseline
            </span>
          ) : (
            <>
              <span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full border border-[var(--accent-commit)]/20 bg-[var(--accent-commit-soft)] px-2 text-[var(--accent-commit)]">
                Materialized {opsLog.length}
              </span>
              {surfaceSummaryParts.map((part) => (
                <span
                  key={part}
                  className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full border border-[var(--stroke-divider)] bg-[var(--workspace-panel)] px-2 text-[var(--text-tertiary)]"
                >
                  {part}
                </span>
              ))}
              <span
                className={cn(
                  'inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full border px-2',
                  pendingCount > 0
                    ? 'border-[var(--accent-pending)]/30 bg-[var(--accent-pending-soft)] text-[var(--accent-pending)]'
                    : 'border-[var(--stroke-divider)] bg-[var(--workspace-panel)] text-[var(--text-tertiary)]'
                )}
              >
                Pending {pendingCount}
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setPanelExpanded(false)}
          className="shrink-0 p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          title="Collapse panel"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
