import type {
  ActionCapabilityView,
  ClaimView,
  TransitionGraphViewV1,
  TransitionViewV1,
} from '@t3x-dev/core';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function TransitionReviewPanel({
  error,
  loading,
  view,
}: {
  error: string | null;
  loading: boolean;
  view: TransitionViewV1 | null;
}) {
  if (loading) {
    return (
      <section
        aria-label="Saved change review"
        className="flex min-h-28 items-center justify-center rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-sm text-[var(--text-secondary)]"
      >
        <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
        Loading saved change review
      </section>
    );
  }

  if (error) {
    return (
      <section
        aria-label="Saved change review unavailable"
        className="rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] p-4"
        role="alert"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]"
          />
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Saved change review unavailable
            </h3>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{error}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!view) return null;
  if (view.mode === 'legacy') return <LegacyTransitionReview view={view} />;
  return <VerifiedTransitionReview view={view} />;
}

function LegacyTransitionReview({ view }: { view: Extract<TransitionViewV1, { mode: 'legacy' }> }) {
  return (
    <section
      aria-label="Saved change review"
      className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Saved version</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            This version predates verifiable change records. Its content is available, but purpose,
            checks, and approval evidence were not captured.
          </p>
        </div>
        <Badge variant="outline">Legacy history</Badge>
      </div>
      <details className="mt-3 border-t border-[var(--stroke-divider)] pt-3 text-xs">
        <summary className="cursor-pointer font-semibold text-[var(--text-secondary)]">
          Advanced audit
        </summary>
        <p className="mt-2 break-all font-mono text-[var(--text-tertiary)]">
          Version {view.audit.commitId}
        </p>
      </details>
    </section>
  );
}

function VerifiedTransitionReview({ view }: { view: TransitionGraphViewV1 }) {
  return (
    <section
      aria-label="Saved change review"
      className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
    >
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Saved change</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {view.change.operations.length}{' '}
            {view.change.operations.length === 1 ? 'structured update' : 'structured updates'} were
            saved with verified history.
          </p>
        </div>
        <Badge variant={decisionBadgeVariant(view)}>{decisionLabel(view)}</Badge>
      </header>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ClaimCard claim={view.claims.intent} label="Purpose" />
        <ClaimCard claim={view.claims.rationale} label="Reason" />
      </div>

      <section aria-label="Saved changes" className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          What changed
        </h4>
        <ol className="mt-2 grid gap-2">
          {view.change.operations.map((operation, index) => (
            <li
              className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2 text-xs"
              key={`${operationLabel(operation, index)}-${index}`}
            >
              <div className="font-semibold text-[var(--text-primary)]">
                {operationLabel(operation, index)}
              </div>
              <div className="mt-1 break-words font-mono text-[var(--text-secondary)]">
                {operationDetail(operation)}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Saved change checks" className="mt-4 grid gap-2 sm:grid-cols-3">
        <CheckCard
          label="Change integrity"
          observation={view.checks.replay.observation}
          outcomes={view.checks.replay.outcomes}
        />
        <CheckCard
          label="Validation"
          observation={view.checks.validation.observation}
          outcomes={view.checks.validation.outcomes}
        />
        <CheckCard
          label="Confirmation"
          observation={view.checks.humanConfirmation.observation}
          outcomes={view.checks.humanConfirmation.runs.map(() => 'confirmed')}
        />
      </section>

      <CapabilityNote capability={view.capabilities.revert} />

      <details className="mt-4 border-t border-[var(--stroke-divider)] pt-3 text-xs">
        <summary className="cursor-pointer font-semibold text-[var(--text-secondary)]">
          Advanced audit
        </summary>
        <dl className="mt-3 grid gap-2 text-[var(--text-secondary)]">
          <AuditRow label="Effect" value={view.audit.effect.digest} />
          <AuditRow label="Proposal" value={view.audit.proposal.digest} />
          {view.audit.decision ? (
            <AuditRow label="Decision" value={view.audit.decision.digest} />
          ) : null}
          {view.audit.commit ? <AuditRow label="Commit" value={view.audit.commit.digest} /> : null}
          <AuditRow
            label="Policy"
            value={
              view.decision.observation === 'supplied' && view.decision.policy.mode === 'evaluated'
                ? `${view.decision.policy.resource.uri} · ${view.decision.policy.resource.digest}`
                : 'Not evaluated'
            }
          />
        </dl>
        {view.audit.statements.length > 0 ? (
          <ul className="mt-3 grid gap-2">
            {view.audit.statements.map((statement) => (
              <li
                className="rounded-md bg-[var(--surface-panel)] p-2 text-[var(--text-secondary)]"
                key={statement.statement.digest}
              >
                <div className="font-mono">{statement.predicateType}</div>
                <div className="mt-1">
                  Claimed {actorLabel(statement.claimedActor)} · issued by{' '}
                  {actorLabel(statement.issuerActor)}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </section>
  );
}

function ClaimCard({ claim, label }: { claim: ClaimView; label: string }) {
  return (
    <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-[var(--text-primary)]">{label}</h4>
        <Badge variant="outline">{originLabel(claim.origin)}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
        {claim.mode === 'unspecified' ? 'Not provided.' : claim.value}
      </p>
    </section>
  );
}

function CheckCard({
  label,
  observation,
  outcomes,
}: {
  label: string;
  observation: 'observed' | 'no_statement_observed';
  outcomes: string[];
}) {
  const observed = observation === 'observed';
  const successful =
    observed &&
    outcomes.length > 0 &&
    outcomes.every((outcome) => ['confirmed', 'passed', 'verified'].includes(outcome));
  const statusLabel = !observed ? 'not observed' : successful ? 'passed' : 'attention required';
  return (
    <fieldset
      aria-label={`${label}: ${statusLabel}`}
      className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3"
    >
      <div className="flex items-center gap-2">
        {successful ? (
          <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--status-success)]" />
        ) : observed ? (
          <XCircle aria-hidden="true" className="size-4 text-[var(--status-error)]" />
        ) : (
          <AlertTriangle aria-hidden="true" className="size-4 text-[var(--status-warning)]" />
        )}
        <span className="text-xs font-semibold text-[var(--text-primary)]">{label}</span>
      </div>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">
        {observed ? outcomes.join(', ') || 'Observed' : 'No check observed'}
      </p>
    </fieldset>
  );
}

function CapabilityNote({ capability }: { capability: ActionCapabilityView }) {
  const message = capability.reasons[0]?.message;
  if (!message) return null;
  return (
    <p className="mt-4 rounded-md bg-[var(--surface-panel)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
      Next action: {message}
    </p>
  );
}

function AuditRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[88px_minmax(0,1fr)]">
      <dt className="font-semibold">{label}</dt>
      <dd className="break-all font-mono text-[var(--text-tertiary)]">{value}</dd>
    </div>
  );
}

function decisionLabel(view: TransitionGraphViewV1): string {
  if (view.decision.observation !== 'supplied') return 'Awaiting decision';
  if (view.decision.outcome === 'overridden') return 'Saved with override';
  if (view.decision.outcome === 'rejected') return 'Rejected';
  return 'Approved and saved';
}

function decisionBadgeVariant(
  view: TransitionGraphViewV1
): 'destructive' | 'outline' | 'success' | 'warning' {
  if (view.decision.observation !== 'supplied') return 'outline';
  if (view.decision.outcome === 'rejected') return 'destructive';
  return view.decision.outcome === 'overridden' ? 'warning' : 'success';
}

function originLabel(origin: ClaimView['origin']): string {
  if (origin === 'request_source') return 'From source';
  if (origin === 'inferred') return 'Inferred';
  if (origin === 'actor_authored') return 'Added by actor';
  return 'Not provided';
}

function operationLabel(operation: unknown, index: number): string {
  if (!isRecord(operation)) return `Change ${index + 1}`;
  const op = typeof operation.op === 'string' ? operation.op.toUpperCase() : 'CHANGE';
  const path = typeof operation.path === 'string' ? operation.path : `#${index + 1}`;
  return `${op} ${path}`;
}

function operationDetail(operation: unknown): string {
  if (!isRecord(operation)) return JSON.stringify(operation);
  if ('value' in operation) return `Value: ${JSON.stringify(operation.value)}`;
  return JSON.stringify(operation);
}

function actorLabel(actor: { kind: string; id: string }): string {
  return `${actor.kind}:${actor.id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
