'use client';

import { Check, GitCommitHorizontal, Play, RotateCcw, X } from 'lucide-react';
import type {
  WorkspaceActionBarState,
  WorkspaceActionId,
  WorkspaceActionState,
} from '@/domain/workspace/actionBarState';
import { cn } from '@/utils/cn';

interface WorkspaceActionBarProps {
  state: WorkspaceActionBarState;
  onRunScript: () => void;
  onApplyChanges: () => void;
  onDiscardChanges: () => void;
  onCommit: () => void;
  onContinueEditing: () => void;
  onCancelExtraction?: () => void;
}

function iconForAction(id: WorkspaceActionId) {
  switch (id) {
    case 'run_script':
      return <Play className="h-3.5 w-3.5" />;
    case 'apply_changes':
      return <Check className="h-3.5 w-3.5" />;
    case 'discard_changes':
      return <RotateCcw className="h-3.5 w-3.5" />;
    case 'commit':
      return <GitCommitHorizontal className="h-3.5 w-3.5" />;
    case 'cancel_extraction':
      return <X className="h-3.5 w-3.5" />;
    case 'continue_editing':
      return null;
  }
}

function buttonTone(action: WorkspaceActionState, primary: boolean): string {
  if (primary && action.tone === 'commit') {
    return 'border-[var(--accent-commit)] bg-[var(--accent-commit)] text-[var(--on-accent)] hover:opacity-90';
  }
  if (primary && action.tone === 'pending') {
    return 'border-[var(--accent-pending)] bg-[var(--accent-pending)] text-[var(--on-accent)] hover:opacity-90';
  }
  if (action.tone === 'danger') {
    return 'border-[var(--status-error)]/25 text-[var(--status-error)] hover:bg-[var(--status-error-muted)]';
  }
  return 'border-[var(--stroke-default)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]';
}

function introTargetForAction(id: WorkspaceActionId): string | undefined {
  if (id === 'run_script') return 'chat-run-script-action';
  if (id === 'apply_changes') return 'chat-apply-action';
  if (id === 'discard_changes') return 'chat-discard-action';
  if (id === 'commit') return 'chat-commit-action';
  return undefined;
}

export function WorkspaceActionBar({
  state,
  onRunScript,
  onApplyChanges,
  onDiscardChanges,
  onCommit,
  onContinueEditing,
  onCancelExtraction,
}: WorkspaceActionBarProps) {
  const handlers: Record<WorkspaceActionId, (() => void) | undefined> = {
    run_script: onRunScript,
    apply_changes: onApplyChanges,
    discard_changes: onDiscardChanges,
    commit: onCommit,
    continue_editing: onContinueEditing,
    cancel_extraction: onCancelExtraction,
  };

  const renderAction = (action: WorkspaceActionState, primary = false) => (
    <button
      key={action.id}
      type="button"
      disabled={!action.enabled}
      title={action.reason ?? undefined}
      onClick={handlers[action.id]}
      data-testid={`workspace-action-${action.id}`}
      data-intro-target={introTargetForAction(action.id)}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition',
        primary ? 'min-w-[120px]' : 'min-w-[92px]',
        buttonTone(action, primary),
        !action.enabled && 'cursor-not-allowed opacity-35 hover:bg-transparent hover:opacity-35'
      )}
    >
      {iconForAction(action.id)}
      <span className="truncate">{action.label}</span>
    </button>
  );

  return (
    <div
      data-testid="workspace-action-bar"
      className="flex h-full min-w-0 items-center justify-end gap-2"
    >
      {state.secondary.map((action) => renderAction(action))}
      {renderAction(state.primary, true)}
    </div>
  );
}
