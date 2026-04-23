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

export function YOpsLogPanel() {
  const opsLog = useWorkspaceStore((s) => s.opsLog);

  const stats = useMemo(() => {
    let human = 0;
    let llm = 0;
    for (const op of opsLog) {
      const src = (op as unknown as { source: Source }).source;
      if (src.type === 'human') human++;
      else llm++;
    }
    return { total: opsLog.length, human, llm };
  }, [opsLog]);

  return (
    <div className="flex flex-col h-full bg-[var(--panel-alt)]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--stroke-default)] bg-[var(--panel)]">
        <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--status-success)]" />
          Ops log
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

      {opsLog.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="text-[11px] text-[var(--text-tertiary)] leading-relaxed max-w-[260px]">
            The ops log is empty. Run an extraction or quote a span from chat — every action (yours
            or the LLM&rsquo;s) shows up here as a block you can inspect and audit.
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
          {opsLog.map((op, i) => {
            const src = (op as unknown as { source: Source }).source;
            return <OpRow key={`${src.at}-${i}-${verbOf(op)}`} op={op} index={i} />;
          })}
        </div>
      )}
    </div>
  );
}
