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

import type { Source, SourcedYOp } from '@t3x-dev/core';
import { ChevronDown, ChevronRight, Sparkles, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buildMaterializedOpGroups } from '@/domain/yops/opCardGroups';
import {
  buildOpCardModel,
  humanEditSurfaceLabel,
  type OpCardModel,
} from '@/domain/yops/opCardModel';
import { useScrollToTurn } from '@/hooks/shared/useScrollToTurn';
import { selectScriptDirty, useWorkspaceStore } from '@/store/workspaceStore';
import { cn } from '@/utils/cn';

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

/**
 * Truncate a quote excerpt for the always-visible card header. Long
 * source quotes would push the time chip and source chip off the right
 * edge; we surface the first ~60 chars and let the disclosure body show
 * the full quote.
 */
function truncateQuote(quote: string, max = 60): string {
  if (quote.length <= max) return quote;
  return `${quote.slice(0, max - 1).trimEnd()}…`;
}

function OpRow({ model, index }: { model: OpCardModel; index: number }) {
  const [open, setOpen] = useState(false);
  const human = model.source.kind === 'human';
  const scrollToTurn = useScrollToTurn();
  const turnHash = model.provenance?.turnHash;
  const handleScrollToSource = (ev: React.MouseEvent | React.KeyboardEvent) => {
    if (!turnHash) return;
    // Stop the click from also toggling the disclosure when the user
    // clicks the inline quote excerpt — the row is wrapped in a button.
    ev.stopPropagation();
    scrollToTurn(turnHash);
  };

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
        className="w-full flex flex-col gap-0.5 px-2.5 py-1.5 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
          )}
          <span className="font-mono text-[10px] text-[var(--text-tertiary)] shrink-0 tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-tertiary)] shrink-0">
            {model.verb}
          </span>
          <span className="flex-1 text-[12px] text-[var(--text-primary)] truncate">
            {model.summary}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0',
              human
                ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
                : 'bg-[var(--source)]/10 text-[var(--source)]'
            )}
            // Surface attribution (model for LLM, author for human) as a
            // tooltip — the chip's space is shared with the verb badge so
            // we can't fit it inline without truncation noise.
            title={model.source.attribution ?? undefined}
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
          {model.source.surface && (
            <span
              data-testid={`yops-log-op-${index}-surface`}
              className="text-[9px] font-mono text-[var(--text-tertiary)] shrink-0"
            >
              via {humanEditSurfaceLabel(model.source.surface)}
            </span>
          )}
          <span className="text-[9px] font-mono text-[var(--text-tertiary)] shrink-0 w-8 text-right">
            {relativeAgo(model.source.at)}
          </span>
        </div>
        {/*
          Provenance excerpt + attribution chip surfaced into the
          collapsed card row (workbench plan §4 op-block requirements
          — "source quote" promoted out of the disclosure). For LLM
          ops with a turn quote, this lets users scan provenance
          without expanding every card.
        */}
        {model.provenance?.quote ? (
          <span
            // The excerpt acts as a click target for jumping to the
            // source turn. We can't render a nested <button> (parent
            // is already a button — invalid HTML), so this is a span
            // with a click handler. Keyboard reachability is provided
            // by tabbing into the parent button + Enter, then into
            // the disclosure where the disclosure-quote-link IS a
            // real <button> with full a11y. The collapsed-row excerpt
            // is a convenience surface; the disclosure path is the
            // canonical accessible path.
            onClick={handleScrollToSource}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                handleScrollToSource(ev);
              }
            }}
            className={cn(
              'flex items-center gap-2 pl-7 text-[10.5px] text-[var(--text-tertiary)] truncate',
              'hover:text-[var(--source)] cursor-pointer transition-colors'
            )}
            data-testid={`yops-log-op-${index}-quote-link`}
            title={`Jump to source turn ${model.provenance.turnHash.slice(0, 14)}…`}
          >
            <span className="font-mono text-[9px] uppercase tracking-wide opacity-70 shrink-0">
              from
            </span>
            <span className="italic truncate">
              &ldquo;{truncateQuote(model.provenance.quote)}&rdquo;
            </span>
            {model.source.attribution && (
              <span className="font-mono text-[9px] opacity-60 shrink-0">
                · {model.source.attribution}
              </span>
            )}
          </span>
        ) : null}
      </button>

      {open && (
        <div className="px-3 pb-2.5 pt-0.5 space-y-2 border-t border-[var(--stroke-default)]/40">
          <section>
            <div className="text-[9px] uppercase tracking-wide font-semibold text-[var(--text-tertiary)] mb-1">
              YOps core
            </div>
            {/*
              Pretty YAML (js-yaml.dump) replaces the prior JSON dump.
              Matches the wire format Apply parses, the format the
              extraction pipeline emits, and the format the YOps tab
              shows — one canonical YAML representation across every
              surface.
            */}
            <pre className="text-[11px] font-mono text-[var(--text-primary)] bg-[var(--panel)] border border-[var(--stroke-default)] rounded px-2 py-1.5 overflow-x-auto whitespace-pre">
              {model.rawYaml}
            </pre>
          </section>

          <section>
            <div className="text-[9px] uppercase tracking-wide font-semibold text-[var(--text-tertiary)] mb-1">
              Source
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] font-mono">
              <dt className="text-[var(--text-tertiary)]">origin</dt>
              <dd className="text-[var(--text-primary)]">{model.source.kind}</dd>
              <dt className="text-[var(--text-tertiary)]">at</dt>
              <dd className="text-[var(--text-primary)]">{model.source.at}</dd>
              {model.source.attribution && (
                <>
                  <dt className="text-[var(--text-tertiary)]">
                    {model.source.kind === 'llm' ? 'model' : 'author'}
                  </dt>
                  <dd className="text-[var(--text-primary)]">{model.source.attribution}</dd>
                </>
              )}
              {model.source.surface && (
                <>
                  <dt className="text-[var(--text-tertiary)]">surface</dt>
                  <dd className="text-[var(--text-primary)]">
                    {humanEditSurfaceLabel(model.source.surface)}
                  </dd>
                </>
              )}
              {model.provenance && (
                <>
                  <dt className="text-[var(--text-tertiary)]">turn</dt>
                  <dd className="truncate">
                    <button
                      type="button"
                      onClick={handleScrollToSource}
                      className="text-[var(--source)] hover:underline font-mono"
                      data-testid={`yops-log-op-${index}-turn-link`}
                    >
                      {model.provenance.turnHash.slice(0, 14)}…
                    </button>
                  </dd>
                  {model.provenance.quote && (
                    <>
                      <dt className="text-[var(--text-tertiary)]">quote</dt>
                      <dd>
                        <button
                          type="button"
                          onClick={handleScrollToSource}
                          className="text-[var(--text-primary)] italic hover:text-[var(--source)] text-left"
                          data-testid={`yops-log-op-${index}-disclosure-quote-link`}
                        >
                          &ldquo;{model.provenance.quote}&rdquo;
                        </button>
                      </dd>
                    </>
                  )}
                  {model.provenance.startChar != null && model.provenance.endChar != null && (
                    <>
                      <dt className="text-[var(--text-tertiary)]">span</dt>
                      <dd className="text-[var(--text-primary)]">
                        [{model.provenance.startChar}, {model.provenance.endChar})
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
export type YOpsLogMode = 'materialized' | 'ledger';

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
  /** Materialized OpsCards are the default; ledger preserves transition tabs. */
  mode?: YOpsLogMode;
}

function Group({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          {title}
        </h3>
        <span className="text-[9px] font-mono text-[var(--text-tertiary)]">
          <span className="font-semibold text-[var(--text-primary)]">{count}</span> ops
        </span>
      </div>
      {count === 0 ? (
        <div className="rounded border border-dashed border-[var(--stroke-default)] bg-[var(--panel)] px-3 py-2 text-[11px] text-[var(--text-tertiary)]">
          {empty}
        </div>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </section>
  );
}

function PendingRow({ label }: { label: string }) {
  return (
    <div className="rounded border border-[var(--stroke-default)] bg-[var(--panel)] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)]">
      {label}
    </div>
  );
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

export function YOpsLogPanel({ tab = 'applied', mode = 'materialized' }: YOpsLogPanelProps = {}) {
  const opsLog = useWorkspaceStore((s) => s.opsLog);
  const opOrigins = useWorkspaceStore((s) => s.opOrigins);
  const rowsById = useWorkspaceStore((s) => s.rowsById);
  const draftOps = useWorkspaceStore((s) => s.draftOps);
  const scriptDirty = useWorkspaceStore(selectScriptDirty);

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

  if (mode === 'materialized') {
    const groups = buildMaterializedOpGroups({
      ops: opsLog,
      pendingDraftOps: draftOps,
      scriptDirty,
    });
    const materializedTotal = groups.ai.count + groups.user.count;

    return (
      <div
        className="flex flex-col h-full bg-[var(--panel-alt)]"
        data-testid="yops-log-panel-materialized"
      >
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--stroke-default)] bg-[var(--panel)]">
          <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--source)]" />
            Materialized
          </span>
          <span className="flex items-center gap-3 text-[9px] font-mono text-[var(--text-tertiary)]">
            <span>
              <span className="text-[var(--text-primary)] font-semibold">{materializedTotal}</span>{' '}
              ops
            </span>
            <span>
              <span className="text-[var(--source)] font-semibold">{groups.ai.count}</span> llm
            </span>
            <span>
              <span className="text-[var(--status-success)] font-semibold">
                {groups.user.count}
              </span>{' '}
              you
            </span>
            {groups.pending.count > 0 && (
              <span>
                <span className="text-[var(--status-warning)] font-semibold">
                  {groups.pending.count}
                </span>{' '}
                pending
              </span>
            )}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
          <Group
            title="AI proposal"
            count={groups.ai.count}
            empty="No AI proposal in the current materialized YOps."
          >
            {groups.ai.ops.map((op, i) => {
              const model = buildOpCardModel(op);
              return <OpRow key={`${model.key}-ai-${i}`} model={model} index={i} />;
            })}
          </Group>

          <Group
            title="YOps editor"
            count={groups.user.bySurface.script.count}
            empty="No YOps editor changes applied yet."
          >
            {groups.user.bySurface.script.ops.map((op, i) => {
              const model = buildOpCardModel(op);
              return <OpRow key={`${model.key}-script-${i}`} model={model} index={i} />;
            })}
          </Group>

          <Group
            title="Tree edits"
            count={groups.user.bySurface.tree.count}
            empty="No YAML tree edits applied yet."
          >
            {groups.user.bySurface.tree.ops.map((op, i) => {
              const model = buildOpCardModel(op);
              return <OpRow key={`${model.key}-tree-${i}`} model={model} index={i} />;
            })}
          </Group>

          <Group
            title="Inline edits"
            count={groups.user.bySurface.inline.count}
            empty="No source include/exclude edits applied yet."
          >
            {groups.user.bySurface.inline.ops.map((op, i) => {
              const model = buildOpCardModel(op);
              return <OpRow key={`${model.key}-inline-${i}`} model={model} index={i} />;
            })}
          </Group>

          {groups.user.bySurface.unknown.count > 0 && (
            <Group
              title="User edits"
              count={groups.user.bySurface.unknown.count}
              empty="No legacy user edits applied yet."
            >
              {groups.user.bySurface.unknown.ops.map((op, i) => {
                const model = buildOpCardModel(op);
                return <OpRow key={`${model.key}-unknown-${i}`} model={model} index={i} />;
              })}
            </Group>
          )}

          <Group title="Pending" count={groups.pending.count} empty="No pending edits.">
            {groups.pending.reasons.map((reason) =>
              reason === 'staged-draft' ? (
                <PendingRow
                  key={reason}
                  label={`Staged extract: ${groups.pending.draftOps.length} ops`}
                />
              ) : (
                <PendingRow key={reason} label="Inline YOps changes" />
              )
            )}
          </Group>
        </div>
      </div>
    );
  }

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
                  : 'bg-[var(--status-warning)]'
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
          {/*
            Tab-filtered `visibleOps` (PR 2) feeds the structured
            OpCardModel (PR 3) into the OpRow renderer. Index is
            local to the rendered tab, not the global opsLog position
            — users see "01, 02, …" within the active tab.
          */}
          {visibleOps.map((op, i) => {
            const model = buildOpCardModel(op);
            return <OpRow key={`${model.key}-${i}`} model={model} index={i} />;
          })}
        </div>
      )}
    </div>
  );
}
