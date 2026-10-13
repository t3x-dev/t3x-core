import type { TransitionViewV1 } from '@t3x-dev/core';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  GitBranch,
  Loader2,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { composeActorLabel } from '@/domain/composePresentation';
import {
  type ChangeCheckRow,
  changeCheckRows,
  changeDecisionBlockers,
  isGeneratedChange,
} from '@/domain/workspaces/changeDecision';

type DecisionOutcome = 'accepted' | 'overridden' | 'rejected';

export function ChangeDecisionPanel({
  branch,
  busy,
  onDecide,
  onOverrideReasonChange,
  overrideReason,
  view,
}: {
  branch: string | null;
  busy: boolean;
  onDecide: (outcome: DecisionOutcome, reason?: string) => void;
  onOverrideReasonChange: (reason: string) => void;
  overrideReason: string;
  view: TransitionViewV1;
}) {
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reasonError, setReasonError] = useState(false);
  const checks = changeCheckRows(view);
  const blockers = changeDecisionBlockers(view);
  const decided = view.decision.observation === 'supplied';
  const acceptAllowed = view.capabilities.accept.disposition === 'allowed';
  const overrideAllowed = !acceptAllowed && view.capabilities.override.disposition === 'allowed';
  const rejectAllowed = view.capabilities.reject.disposition === 'allowed';
  const status = panelStatus(view, acceptAllowed, overrideAllowed);

  return (
    <section
      aria-label="Decision"
      className="overflow-hidden rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-[0_1px_2px_oklch(0_0_0/4%)]"
    >
      <header className={`border-b px-4 py-3 ${STATUS_TONE[status.tone].header}`}>
        <div className="flex items-center gap-2">
          <status.icon aria-hidden="true" className={`size-4 ${STATUS_TONE[status.tone].icon}`} />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{status.title}</h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{status.detail}</p>
      </header>

      <dl className="grid gap-2 border-b border-[var(--stroke-divider)] px-4 py-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--text-tertiary)]">{decided ? 'Branch' : 'Commit to'}</dt>
          <dd className="inline-flex min-w-0 items-center gap-1 rounded bg-[var(--surface-panel)] px-1.5 py-0.5 font-mono font-semibold text-[var(--text-primary)]">
            <GitBranch aria-hidden="true" className="size-3 shrink-0" />
            <span className="truncate">{branch ?? 'main'}</span>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--text-tertiary)]">Proposed by</dt>
          <dd className="flex min-w-0 items-center gap-1.5 font-medium text-[var(--text-primary)]">
            <span className="truncate">{composeActorLabel(view.claims.actor.id)}</span>
            {isGeneratedChange(view) ? (
              <Badge className="gap-1" variant="pending-subtle">
                <Sparkles aria-hidden="true" className="size-3" />
                AI-generated
              </Badge>
            ) : null}
          </dd>
        </div>
      </dl>

      <section aria-label="Checks" className="border-b border-[var(--stroke-divider)] px-4 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          Checks
        </h3>
        <ul className="mt-2 grid gap-1">
          {checks.map((check) => (
            <CheckRow check={check} key={check.id} />
          ))}
        </ul>
      </section>

      {!decided && blockers.length > 0 ? (
        <section aria-label="Why this is blocked" className="grid gap-2 px-4 pt-3">
          {blockers.map((blocker) => (
            <div
              className="rounded-md border border-[var(--status-warning)]/25 bg-[var(--status-warning-muted)] px-3 py-2"
              key={blocker.code}
            >
              <p className="text-xs font-semibold text-[var(--text-primary)]">{blocker.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
                {blocker.detail}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {!decided ? (
        <div className="grid gap-2 px-4 py-3">
          {overrideAllowed ? (
            <label
              className="grid gap-1.5 text-xs font-semibold text-[var(--text-secondary)]"
              htmlFor="change-override-reason"
            >
              Why commit despite the failed check?
              <Textarea
                id="change-override-reason"
                aria-invalid={reasonError && !overrideReason.trim()}
                disabled={busy}
                maxLength={2000}
                onChange={(event) => {
                  if (event.target.value.trim()) setReasonError(false);
                  onOverrideReasonChange(event.target.value);
                }}
                placeholder="Recorded in the audit history."
                ref={reasonRef}
                value={overrideReason}
              />
              {reasonError && !overrideReason.trim() ? (
                <span className="font-medium text-[var(--status-error)]" role="alert">
                  Enter a reason before committing with an override.
                </span>
              ) : null}
            </label>
          ) : null}
          {overrideAllowed ? (
            <Button
              disabled={busy}
              onClick={() => {
                if (!overrideReason.trim()) {
                  setReasonError(true);
                  reasonRef.current?.focus();
                  return;
                }
                onDecide('overridden', overrideReason);
              }}
              type="button"
              variant="pending"
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <AlertTriangle aria-hidden="true" className="size-4" />
              )}
              Commit with override
            </Button>
          ) : (
            <Button
              disabled={busy || !acceptAllowed}
              onClick={() => onDecide('accepted')}
              type="button"
              variant="commit"
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 aria-hidden="true" className="size-4" />
              )}
              Approve and commit
            </Button>
          )}
          {rejectAllowed ? (
            <Button
              disabled={busy}
              onClick={() => onDecide('rejected')}
              type="button"
              variant="canvas-outline"
            >
              <XCircle aria-hidden="true" className="size-4" />
              Reject change
            </Button>
          ) : null}
          <p className="text-[11px] leading-4 text-[var(--text-tertiary)]">
            {rejectAllowed
              ? 'Rejecting keeps an audit record and leaves the branch unchanged.'
              : 'Decisions are recorded in the audit history.'}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function CheckRow({ check }: { check: ChangeCheckRow }) {
  const Icon =
    check.status === 'passed' ? CheckCircle2 : check.status === 'failed' ? XCircle : CircleDashed;
  const tone =
    check.status === 'passed'
      ? 'text-[var(--status-success)]'
      : check.status === 'failed'
        ? 'text-[var(--status-error)]'
        : 'text-[var(--text-tertiary)]';
  const label = (
    <>
      <Icon aria-hidden="true" className={`mt-0.5 size-3.5 shrink-0 ${tone}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-[var(--text-primary)]">{check.label}</span>
        <span className="block text-[11px] leading-4 text-[var(--text-secondary)]">
          {check.summary}
        </span>
      </span>
    </>
  );
  if (check.findings.length === 0) {
    return (
      <li aria-label={`${check.label}: ${check.status}`} className="flex gap-2 rounded px-1 py-1">
        {label}
      </li>
    );
  }
  return (
    <li aria-label={`${check.label}: ${check.status}`}>
      <details className="group rounded">
        <summary className="flex cursor-pointer list-none gap-2 rounded px-1 py-1 hover:bg-[var(--surface-panel)]">
          {label}
          <ChevronRight
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform group-open:rotate-90"
          />
        </summary>
        <ul className="mt-1 mb-1 ml-6 grid gap-1">
          {check.findings.map((finding) => (
            <li
              className="rounded bg-[var(--surface-panel)] px-2 py-1.5 text-[11px] leading-4 text-[var(--text-secondary)]"
              key={`${finding.code}-${finding.message}`}
            >
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {finding.code}
              </span>
              {finding.count > 1 ? (
                <span className="ml-1 text-[var(--text-tertiary)]">×{finding.count}</span>
              ) : null}
              <span className="mt-0.5 block">{finding.message}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

type Tone = 'ready' | 'blocked' | 'override' | 'done' | 'rejected';

const STATUS_TONE: Record<Tone, { header: string; icon: string }> = {
  ready: {
    header: 'border-[var(--status-success)]/20 bg-[var(--status-success-muted)]',
    icon: 'text-[var(--status-success)]',
  },
  blocked: {
    header: 'border-[var(--stroke-divider)] bg-[var(--surface-panel)]',
    icon: 'text-[var(--status-warning)]',
  },
  override: {
    header: 'border-[var(--status-warning)]/20 bg-[var(--status-warning-muted)]',
    icon: 'text-[var(--status-warning)]',
  },
  done: {
    header: 'border-[var(--accent-commit)]/15 bg-[var(--accent-commit)]/6',
    icon: 'text-[var(--accent-commit)]',
  },
  rejected: {
    header: 'border-[var(--status-error)]/15 bg-[var(--status-error-muted)]',
    icon: 'text-[var(--status-error)]',
  },
};

function panelStatus(view: TransitionViewV1, acceptAllowed: boolean, overrideAllowed: boolean) {
  if (view.decision.observation === 'supplied') {
    if (view.decision.outcome === 'rejected')
      return {
        tone: 'rejected' as const,
        icon: XCircle,
        title: 'Rejected',
        detail: 'The decision is recorded. The branch was not changed.',
      };
    return {
      tone: 'done' as const,
      icon: CheckCircle2,
      title: view.decision.outcome === 'overridden' ? 'Committed with override' : 'Committed',
      detail: 'This change is part of the branch history.',
    };
  }
  if (acceptAllowed)
    return {
      tone: 'ready' as const,
      icon: CheckCircle2,
      title: 'Ready to commit',
      detail: 'All required checks passed for this branch.',
    };
  if (overrideAllowed)
    return {
      tone: 'override' as const,
      icon: AlertTriangle,
      title: 'Commit needs an override',
      detail: 'A check failed. You can still commit with a recorded reason.',
    };
  return {
    tone: 'blocked' as const,
    icon: ShieldAlert,
    title: 'Commit blocked',
    detail: 'Resolve the items below before this change can be committed.',
  };
}
