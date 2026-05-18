'use client';

import { Loader2, PanelRightClose, Play, X } from 'lucide-react';
import { formatApplyTooltipForRetainedFailure } from '@/domain/draft/retainedFailureLabel';
import { buildMaterializedOpGroups } from '@/domain/yops/opCardGroups';
import { useDiscardDraft } from '@/hooks/drafts/useDiscardDraft';
import { useScriptExecution } from '@/hooks/drafts/useScriptExecution';
import {
  selectIsInheritedBaselineOnly,
  selectScriptDirty,
  useWorkspaceStore,
} from '@/store/workspaceStore';
import { cn } from '@/utils/cn';

function formatSurfaceSummary(groups: ReturnType<typeof buildMaterializedOpGroups>): string {
  const parts: string[] = [];
  const { surfaces } = groups.user;
  if (surfaces.script > 0) parts.push(`YOps: ${surfaces.script}`);
  if (surfaces.tree > 0) parts.push(`Tree: ${surfaces.tree}`);
  if (surfaces.inline > 0) parts.push(`Inline: ${surfaces.inline}`);
  if (surfaces.unknown > 0) parts.push(`User: ${surfaces.unknown}`);
  return parts.length > 0 ? ` · ${parts.join(' · ')}` : '';
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
  // Drives the Apply button tooltip wording. When a re-extract failed
  // on top of a previously-staged draft, Apply still works — but it
  // applies the PREVIOUS draft, not the latest (failed) attempt. The
  // generic "Apply the script to the tree" tooltip would mislead.
  const retainedDraftFailure = useWorkspaceStore((s) => s.retainedDraftFailure);
  const isCommitting = mode === 'committing';
  const { execute, canRun, disabledReason, applyPolicy } = useScriptExecution();
  const discardDraft = useDiscardDraft();
  // Discard is offered when a draft (or retained-failure marker) is
  // staged. Mirrors the AfterPanel discard surface so users can reach
  // it from either side. Disabled while a commit is in flight to avoid
  // racing the apply path.
  const canDiscard = (hasDraft || retainedDraftFailure !== null) && !isCommitting;
  const dirtyCopy = 'Inline changes · Apply or discard before commit';
  const pendingCopy = 'Pending extract · Apply or discard before commit';
  const surfaceSummary = formatSurfaceSummary(groups);
  const pendingCount = groups.pending.count;

  return (
    <div className="flex h-11 items-center gap-2 px-3 border-b border-[var(--stroke-default)] bg-[var(--panel-alt)]">
      <span className="text-xs font-semibold">Workspace</span>

      {mode === 'streaming' && (
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
          <Loader2 className="h-3 w-3 animate-spin text-[var(--source)]" />
          Extracting...
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <div
          className="flex min-w-0 items-center gap-1.5 font-mono text-[10px]"
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
            <span className="rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 py-0.5 text-[var(--text-tertiary)]">
              Inherited baseline
            </span>
          ) : (
            <>
              <span className="inline-flex h-5 items-center rounded-full border border-[var(--accent-commit)]/20 bg-[var(--accent-commit-soft)] px-2 text-[var(--accent-commit)]">
                Materialized {opsLog.length}
              </span>
              {surfaceSummary && (
                <span className="hidden max-w-[190px] truncate text-[var(--text-tertiary)] xl:inline">
                  {surfaceSummary.replace(/^ · /, '')}
                </span>
              )}
              <span
                className={cn(
                  'inline-flex h-5 items-center rounded-full border px-2',
                  pendingCount > 0
                    ? 'border-[var(--accent-pending)]/30 bg-[var(--accent-pending-soft)] text-[var(--accent-pending)]'
                    : 'border-[var(--stroke-divider)] bg-[var(--surface-panel)] text-[var(--text-tertiary)]'
                )}
              >
                Pending {pendingCount}
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => void discardDraft()}
          disabled={!canDiscard}
          title={
            canDiscard
              ? 'Discard the staged draft and revert to the last applied state'
              : 'No draft to discard'
          }
          data-testid="workspace-topbar-discard"
          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded border border-[var(--stroke-default)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <X className="h-2.5 w-2.5" />
          Discard
        </button>

        <button
          type="button"
          onClick={execute}
          disabled={!canRun}
          title={
            disabledReason ??
            (retainedDraftFailure
              ? formatApplyTooltipForRetainedFailure(retainedDraftFailure)
              : applyPolicy.tooltip)
          }
          data-testid="workspace-topbar-apply"
          className="flex items-center gap-1 rounded bg-[var(--accent-commit)] px-2.5 py-1 text-[10px] font-semibold text-[var(--on-accent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Play className="h-2.5 w-2.5" />
          Apply
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
