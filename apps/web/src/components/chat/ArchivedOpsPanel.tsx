'use client';

/**
 * ArchivedOpsPanel — read-only timeline of superseded yops_log rows.
 *
 * Plan PR 5: when a re-extract replaces applied-but-uncommitted ops,
 * the prior rows stay in `yops_log` with `superseded_at` set. They're
 * not part of the live tree (replay walks active rows only) but they
 * are audit-relevant. This panel renders them as a faded timeline so
 * users can see what got replaced and when.
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

  return (
    <div className="flex flex-col h-full bg-[var(--panel-alt)]" data-testid="archived-ops-panel">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--stroke-default)] bg-[var(--panel)]">
        <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--text-quaternary,#4a4a55)] opacity-60" />
          Archived
        </span>
        <span className="text-[9px] font-mono text-[var(--text-tertiary)]">
          {state.status === 'loading'
            ? 'loading…'
            : state.status === 'ready'
              ? `${state.rows.length} entries`
              : state.status === 'error'
                ? 'error'
                : ''}
        </span>
      </div>

      {state.status === 'error' ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="max-w-[280px] text-[11px] text-[var(--text-tertiary)] leading-relaxed">
            <div className="font-semibold text-[var(--status-error,#f87171)] mb-1">
              Couldn&rsquo;t load archived ops
            </div>
            <div>{state.error}</div>
          </div>
        </div>
      ) : state.status === 'ready' && state.rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="max-w-[280px]">
            <div className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              No archived ops
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
              Re-extracting replaces prior LLM-sourced rows; replaced rows show up here as a
              read-only audit trail. Until then this tab stays empty.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5 opacity-80">
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
                <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-quaternary,#4a4a55)] shrink-0">
                  {row.source}
                </span>
                <span className="flex-1 text-[12px] text-[var(--text-tertiary)] line-through truncate">
                  {summarizeArchivedRow(row)}
                </span>
                <span className="text-[9px] font-mono text-[var(--text-tertiary)] shrink-0">
                  Archived {formatArchivedAt(row.superseded_at)}
                </span>
              </div>
              <div className="pl-7 mt-0.5 text-[10px] font-mono text-[var(--text-quaternary,#4a4a55)] truncate">
                {row.id}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
