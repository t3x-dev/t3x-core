'use client';

/**
 * YOpsLogPanel — ledger view of the current draft's opsLog.
 *
 * Replaces the sparse YAML feel of ScriptEditor with a stack of action
 * blocks: each op gets a plain-language header, an origin badge, and an
 * expandable body showing YOps core + source meta (per §3a.6d of the
 * YOps change-request UX design doc).
 *
 * Pending vs auto-applied is not yet modeled on disk — all persisted
 * ops have either LLMSource or HumanSource. This panel renders those
 * two today; a future pass can add the pending bucket once the draft
 * state machine surfaces it.
 */

import type { LLMSource, Source, SourcedYOp } from '@t3x-dev/core';
import { ChevronDown, ChevronRight, Sparkles, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { summarizeOp, verbOf } from '@/domain/yops/opSummary';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { cn } from '@/utils/cn';

function isLLM(src: Source): src is LLMSource {
  return src.type === 'llm';
}

function relativeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d`;
}

function stripSource(op: SourcedYOp): Record<string, unknown> {
  const { source: _drop, ...rest } = op as unknown as Record<string, unknown>;
  return rest;
}

function serializeOpCore(op: SourcedYOp): string {
  return JSON.stringify(stripSource(op), null, 2);
}

function OpRow({ op, index }: { op: SourcedYOp; index: number }) {
  const [open, setOpen] = useState(false);
  const src = (op as unknown as { source: Source }).source;
  const human = src.type === 'human';
  const llm = isLLM(src) ? src : null;
  const verb = verbOf(op);

  return (
    <div
      data-testid={`yops-log-op-${index}`}
      className={cn(
        'rounded border transition-colors',
        human
          ? 'border-[var(--status-success)]/30 bg-[var(--status-success-muted)]/40'
          : 'border-[var(--stroke-default)] bg-[var(--panel-alt)]'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
        )}
        <span className="font-mono text-[10px] text-[var(--text-tertiary)] shrink-0 tabular-nums">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-tertiary)] shrink-0">
          {verb}
        </span>
        <span className="flex-1 text-[12px] text-[var(--text-primary)] truncate">
          {summarizeOp(op)}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0',
            human
              ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
              : 'bg-[var(--source)]/10 text-[var(--source)]'
          )}
        >
          {human ? (
            <>
              <User className="h-2.5 w-2.5" />
              you
            </>
          ) : (
            <>
              <Sparkles className="h-2.5 w-2.5" />
              llm
            </>
          )}
        </span>
        <span className="text-[9px] font-mono text-[var(--text-tertiary)] shrink-0 w-8 text-right">
          {relativeAgo(src.at)}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-2.5 pt-0.5 space-y-2 border-t border-[var(--stroke-default)]/40">
          <section>
            <div className="text-[9px] uppercase tracking-wide font-semibold text-[var(--text-tertiary)] mb-1">
              YOps core
            </div>
            <pre className="text-[11px] font-mono text-[var(--text-primary)] bg-[var(--panel)] border border-[var(--stroke-default)] rounded px-2 py-1.5 overflow-x-auto whitespace-pre">
              {serializeOpCore(op)}
            </pre>
          </section>

          <section>
            <div className="text-[9px] uppercase tracking-wide font-semibold text-[var(--text-tertiary)] mb-1">
              Source
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] font-mono">
              <dt className="text-[var(--text-tertiary)]">origin</dt>
              <dd className="text-[var(--text-primary)]">{src.type}</dd>
              <dt className="text-[var(--text-tertiary)]">at</dt>
              <dd className="text-[var(--text-primary)]">{src.at}</dd>
              {human && (
                <>
                  <dt className="text-[var(--text-tertiary)]">author</dt>
                  <dd className="text-[var(--text-primary)]">
                    {(src as { author: string }).author}
                  </dd>
                </>
              )}
              {llm && (
                <>
                  <dt className="text-[var(--text-tertiary)]">model</dt>
                  <dd className="text-[var(--text-primary)]">{llm.model}</dd>
                  <dt className="text-[var(--text-tertiary)]">turn</dt>
                  <dd className="text-[var(--text-primary)] truncate">
                    {llm.turn_ref.turn_hash.slice(0, 14)}…
                  </dd>
                  {llm.turn_ref.quote && (
                    <>
                      <dt className="text-[var(--text-tertiary)]">quote</dt>
                      <dd className="text-[var(--text-primary)] italic">
                        &ldquo;{llm.turn_ref.quote}&rdquo;
                      </dd>
                    </>
                  )}
                  {llm.turn_ref.start_char != null && llm.turn_ref.end_char != null && (
                    <>
                      <dt className="text-[var(--text-tertiary)]">span</dt>
                      <dd className="text-[var(--text-primary)]">
                        [{llm.turn_ref.start_char}, {llm.turn_ref.end_char})
                      </dd>
                    </>
                  )}
                </>
              )}
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * Which slice of the proposal/ledger this panel renders. Each value
 * picks a different data source from the store and tunes the empty-
 * state copy accordingly. Per the workbench plan §8 — naming + filtering
 * makes draft / applied / committed visually distinct without faking
 * counts when a tab has nothing to show.
 *
 *   - 'draft':     `workspaceStore.draftOps` (the staged proposal)
 *   - 'applied':   active `opsLog` rows where `is_committed === false`
 *   - 'committed': active `opsLog` rows where `is_committed === true`
 *
 * `archived` (rows with `superseded_at != null`) is deliberately NOT
 * surfaced here — it needs a separate fetch path and is its own panel
 * in plan PR 5.
 */
export type YOpsLogTab = 'draft' | 'applied' | 'committed';

const EMPTY_STATE_BY_TAB: Record<YOpsLogTab, { title: string; body: string }> = {
  draft: {
    title: 'No draft staged',
    body: 'Run an extraction (or edit the script directly) to stage a proposal here. The ops you see in this tab are the candidate changes Apply will commit.',
  },
  applied: {
    title: 'No applied ops',
    body: 'Applied ops are written to yops_log but not yet wrapped in a commit. They show up here once you Apply a draft. Until then, this tab stays empty.',
  },
  committed: {
    title: 'No committed ops',
    body: 'Committed ops are part of an immutable commit hash-chain. This tab fills in once you commit applied ops on this conversation.',
  },
};

interface YOpsLogPanelProps {
  /** Which slice of the proposal/ledger to render. Defaults to 'applied'. */
  tab?: YOpsLogTab;
}

/**
 * Split the active opsLog into applied (uncommitted) and committed by
 * walking the parallel `opOrigins` array and looking up each row's
 * `isCommitted` flag. Ops without row metadata (e.g. a draft that
 * hasn't been hydrated against rowsById yet) are conservatively
 * classified as applied — that mirrors `selectActiveUncommittedRowCount`'s
 * fallback so the two surfaces agree.
 *
 * Exported so the boundary test for tab data sources can pin the
 * mapping without touching the rendering code.
 */
export function splitOpsByCommittedness(
  opsLog: readonly SourcedYOp[],
  opOrigins: readonly { rowId: string | null }[],
  rowsById: Record<string, { isCommitted: boolean }>
): { applied: SourcedYOp[]; committed: SourcedYOp[] } {
  const applied: SourcedYOp[] = [];
  const committed: SourcedYOp[] = [];
  for (let i = 0; i < opsLog.length; i++) {
    const origin = opOrigins[i];
    const rowId = origin?.rowId;
    const row = rowId ? rowsById[rowId] : undefined;
    if (row?.isCommitted) {
      committed.push(opsLog[i]);
    } else {
      applied.push(opsLog[i]);
    }
  }
  return { applied, committed };
}

export function YOpsLogPanel({ tab = 'applied' }: YOpsLogPanelProps = {}) {
  const opsLog = useWorkspaceStore((s) => s.opsLog);
  const opOrigins = useWorkspaceStore((s) => s.opOrigins);
  const rowsById = useWorkspaceStore((s) => s.rowsById);
  const draftOps = useWorkspaceStore((s) => s.draftOps);

  const visibleOps = useMemo<readonly SourcedYOp[]>(() => {
    if (tab === 'draft') return draftOps;
    const { applied, committed } = splitOpsByCommittedness(opsLog, opOrigins, rowsById);
    return tab === 'committed' ? committed : applied;
  }, [tab, opsLog, opOrigins, rowsById, draftOps]);

  const stats = useMemo(() => {
    let human = 0;
    let llm = 0;
    for (const op of visibleOps) {
      const src = (op as unknown as { source: Source }).source;
      if (src.type === 'human') human++;
      else llm++;
    }
    return { total: visibleOps.length, human, llm };
  }, [visibleOps]);

  const empty = EMPTY_STATE_BY_TAB[tab];

  return (
    <div
      className="flex flex-col h-full bg-[var(--panel-alt)]"
      data-testid={`yops-log-panel-${tab}`}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--stroke-default)] bg-[var(--panel)]">
        <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              tab === 'draft'
                ? 'bg-[var(--source)]'
                : tab === 'committed'
                  ? 'bg-[var(--status-success)]'
                  : 'bg-[var(--status-warning,#facc15)]'
            )}
          />
          {tab === 'draft' ? 'Draft' : tab === 'committed' ? 'Committed' : 'Applied'}
        </span>
        <span className="flex items-center gap-3 text-[9px] font-mono text-[var(--text-tertiary)]">
          <span>
            <span className="text-[var(--text-primary)] font-semibold">{stats.total}</span> ops
          </span>
          {stats.human > 0 && (
            <span>
              <span className="text-[var(--status-success)] font-semibold">{stats.human}</span> you
            </span>
          )}
          {stats.llm > 0 && (
            <span>
              <span className="text-[var(--source)] font-semibold">{stats.llm}</span> llm
            </span>
          )}
        </span>
      </div>

      {visibleOps.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="max-w-[280px]">
            <div className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              {empty.title}
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
              {empty.body}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
          {visibleOps.map((op, i) => {
            const src = (op as unknown as { source: Source }).source;
            return <OpRow key={`${src.at}-${i}-${verbOf(op)}`} op={op} index={i} />;
          })}
        </div>
      )}
    </div>
  );
}
