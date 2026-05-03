'use client';

import { Loader2, PanelRightClose, Play, X } from 'lucide-react';
import { formatApplyTooltipForRetainedFailure } from '@/domain/draft/retainedFailureLabel';
import { useDiscardDraft } from '@/hooks/drafts/useDiscardDraft';
import { useScriptExecution } from '@/hooks/drafts/useScriptExecution';
import { selectIsInheritedBaselineOnly, useWorkspaceStore } from '@/store/workspaceStore';

export function WorkspaceTopbar() {
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const mode = useWorkspaceStore((s) => s.mode);
  // Split the count into committed vs draft so the topbar can't be
  // misread as "Concise produced 60 ops". The committed count is
  // opsLog.length (history persisted to yops_log); the draft count is
  // draftOps.length (un-applied LLM proposal staged via setDraft).
  // Without this split, an old conversation with prior committed
  // history shows "60 ops" regardless of what the current Extract
  // produced — which is exactly what confused us during E2E review.
  const committedCount = useWorkspaceStore((s) => s.opsLog.length);
  const draftCount = useWorkspaceStore((s) => s.draftOps.length);
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
        <span
          className="text-[10px] font-mono text-[var(--text-tertiary)]"
          title={
            isInheritedBaselineOnly
              ? 'Inherited from parent commit; no current conversation YOps applied'
              : hasDraft
                ? `${committedCount} committed op${committedCount === 1 ? '' : 's'} in yops_log; ${draftCount} new draft op${draftCount === 1 ? '' : 's'} staged for Apply`
                : `${committedCount} applied op${committedCount === 1 ? '' : 's'} in yops_log`
          }
        >
          {isInheritedBaselineOnly ? (
            'Inherited baseline'
          ) : (
            <>
              {committedCount} applied{hasDraft ? ` · ${draftCount} draft` : ''}
            </>
          )}
        </span>

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
          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
