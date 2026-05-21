'use client';

/**
 * ArchivedOpsPanel — read-only timeline of superseded yops_log rows.
 *
 * Rows enter `superseded_at` state when an explicit Replace
 * (active_dirty Apply with `replaceActiveScript: true`) or Repair
 * (`repairYopsLogId`) flow runs. Re-extracting a staged Extract draft
 * no longer fills this panel — the WebUI Apply path for staged drafts
 * is append-only as of the review-first mechanism flip; see
 * `docs/superpowers/specs/2026-05-04-yops-append-apply-mechanism-design.md`.
 * Superseded rows are not part of the live tree (replay walks active
 * rows only) but they are audit-relevant. This panel renders them as
 * a faded timeline so users can see what got replaced and when.
 *
 * Visually quieter than the active op cards: muted colors, no chevron,
 * no click-to-edit. The plan §11 first-iteration scope intentionally
 * avoids "Replaced by yl_…" links — that requires a durable
 * superseded-by id that the API doesn't currently expose on list
 * responses. We show `Archived at <time>` only.
 *
 * Fetching is lazy: parent component opts in by mounting the panel.
 * No store integration — archived rows are not part of the live
 * workspace state, just a separate read-only view.
 */

import type { SourcedYOp } from '@t3x-dev/core';
import { type ArchivedYOpsRow, useArchivedYopsLog } from '@/hooks/yops/useArchivedYopsLog';
import { cn } from '@/utils/cn';

interface ArchivedOpsPanelProps {
  conversationId: string | null;
  /**
   * Optional topic filter — passes through to the API. Leave null to
   * fetch all topics for the conversation.
   */
  topicId?: string | null;
}

function formatArchivedAt(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  // Compact relative time for recent rows; ISO date for older.
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

function summarizeArchivedRow(row: ArchivedYOpsRow): string {
  const ops = Array.isArray(row.yops) ? (row.yops as SourcedYOp[]) : [];
  if (ops.length === 0) return '0 ops';
  if (ops.length === 1) return '1 op';
  return `${ops.length} ops`;
}

export function ArchivedOpsPanel({ conversationId, topicId = null }: ArchivedOpsPanelProps) {
  const state = useArchivedYopsLog(conversationId, topicId);
  const isLoading =
    state.status === 'loading' || (conversationId !== null && state.status === 'idle');

  return (
    <div className="flex flex-col h-full bg-[var(--panel)]" data-testid="archived-ops-panel">
      {state.status === 'error' ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="max-w-[280px] text-[11px] text-[var(--text-tertiary)] leading-relaxed">
            <div className="font-semibold text-[var(--status-error)] mb-1">
              Couldn&rsquo;t load archived ops
            </div>
            <div>{state.error}</div>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="max-w-[280px] text-[11px] font-semibold text-[var(--text-tertiary)]">
            loading archived ops
          </div>
        </div>
      ) : state.status === 'ready' && state.rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="max-w-[280px]">
            <div className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              No archived ops
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
              Replacing the active script (after editing) or running the Repair flow archives the
              superseded rows here as a read-only audit trail. Re-extracting now appends instead of
              replacing, so it does not fill this tab. Until then this tab stays empty.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5 opacity-80">
          <div className="px-1 pb-1 text-[10px] font-mono text-[var(--text-tertiary)]">
            {state.rows.length} {state.rows.length === 1 ? 'entry' : 'entries'}
          </div>
          {state.rows.map((row, i) => (
            <div
              key={row.id}
              data-testid={`archived-op-${i}`}
              className={cn(
                'rounded border border-[var(--stroke-default)]/60 bg-[var(--panel)]/40 px-2.5 py-1.5',
                'transition-colors hover:bg-[var(--panel)]/60'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-[var(--text-tertiary)] shrink-0 tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-quaternary)] shrink-0">
                  {row.source}
                </span>
                <span className="flex-1 text-[12px] text-[var(--text-tertiary)] line-through truncate">
                  {summarizeArchivedRow(row)}
                </span>
                <span className="text-[9px] font-mono text-[var(--text-tertiary)] shrink-0">
                  Archived {formatArchivedAt(row.superseded_at)}
                </span>
              </div>
              <div className="pl-7 mt-0.5 text-[10px] font-mono text-[var(--text-quaternary)] truncate">
                {row.id}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
