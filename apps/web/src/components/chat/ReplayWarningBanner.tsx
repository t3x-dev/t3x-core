'use client';

import { AlertTriangle, Loader2, Trash2, Wrench, X } from 'lucide-react';
import { useReplayWarningActions } from '@/hooks/conversations/useReplayWarningActions';

/**
 * Non-fatal banner shown above the workspace when initial replay applied
 * some but not all persisted ops. Surfaces the failing op + code + message
 * and offers a one-click delete that drops the offending yops_log row and
 * re-hydrates the workspace.
 *
 * Renders nothing when there's no warning — safe to mount unconditionally.
 */
export function ReplayWarningBanner() {
  const { replayWarning, busy, dismiss, removeFailingOp, deleteFailingEntry } =
    useReplayWarningActions();

  if (!replayWarning) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-3 py-2 text-[11px] text-[var(--status-warning)]"
      data-testid="replay-warning-banner"
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold">
          Op {replayWarning.opIndex} couldn't replay — {replayWarning.code}
        </div>
        <div className="opacity-80 truncate" title={replayWarning.message}>
          {replayWarning.message}
        </div>
        <div className="mt-1 opacity-70">
          {replayWarning.appliedCount} earlier op{replayWarning.appliedCount === 1 ? '' : 's'} still
          rendered above. Subsequent ops are skipped until this one is resolved.
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={removeFailingOp}
          disabled={busy || !replayWarning.rowId}
          className="rounded border border-[var(--status-warning)]/40 bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] font-medium hover:bg-[var(--hover-bg)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? (
            <span className="flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Applying…
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Wrench size={10} /> Remove failing op
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={deleteFailingEntry}
          disabled={busy || !replayWarning.rowId}
          className="rounded border border-[var(--status-warning)]/25 px-2 py-0.5 text-[10px] font-medium opacity-80 hover:bg-[var(--hover-bg)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center gap-1">
            <Trash2 size={10} /> Delete failing entry
          </span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss warning"
          className="rounded p-1 hover:bg-[var(--hover-bg)]"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
