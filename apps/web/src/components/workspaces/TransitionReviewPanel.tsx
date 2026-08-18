import type { ChangeProjectionV1, ReviewSnapshotV1 } from '@t3x-dev/api-client';
import type {
  ActionCapabilityView,
  ClaimView,
  TransitionGraphViewV1,
  TransitionViewV1,
} from '@t3x-dev/core';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function TransitionReviewPanel({
  changeProjection,
  error,
  loading,
  reviewSnapshot,
  view,
}: {
  changeProjection?: ChangeProjectionV1 | null;
  error: string | null;
  loading: boolean;
  reviewSnapshot?: ReviewSnapshotV1 | null;
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
  return (
    <VerifiedTransitionReview
      changeProjection={changeProjection ?? null}
      reviewSnapshot={reviewSnapshot ?? null}
      view={view}
    />
  );
}

function VerifiedTransitionReview({
  changeProjection,
  reviewSnapshot,
  view,
}: {
  changeProjection: ChangeProjectionV1 | null;
  reviewSnapshot: ReviewSnapshotV1 | null;
  view: TransitionGraphViewV1;
}) {
  const pending = view.decision.observation !== 'supplied';
  const rejected = view.decision.observation === 'supplied' && view.decision.outcome === 'rejected';
  return (
    <section
      aria-label={pending ? 'Change review' : 'Saved change review'}
      className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
    >
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {pending ? 'Review change' : rejected ? 'Rejected change' : 'Saved change'}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {view.change.operations.length}{' '}
            {view.change.operations.length === 1 ? 'structured update' : 'structured updates'}{' '}
            {pending
              ? 'are ready for your decision.'
              : rejected
                ? 'were rejected and recorded without changing the branch.'
                : 'were saved with verified history.'}
          </p>
        </div>
        <Badge variant={decisionBadgeVariant(view)}>{decisionLabel(view)}</Badge>
      </header>

      {reviewSnapshot || changeProjection ? (
        <ReviewSnapshotSummary
          changeProjection={changeProjection}
          reviewSnapshot={reviewSnapshot}
        />
      ) : null}

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

      <section
        aria-label="Saved change checks"
        className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
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
          label="Environment"
          observation={view.checks.runner.observation}
          outcomes={view.checks.runner.outcomes}
        />
        <CheckCard
          label="Confirmation"
          observation={view.checks.humanConfirmation.observation}
          outcomes={view.checks.humanConfirmation.runs.map(() => 'confirmed')}
        />
      </section>

      {view.history.observation === 'committed' ? (
        <CapabilityNote capability={view.capabilities.revert} />
      ) : null}

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

function ReviewSnapshotSummary({
  changeProjection,
  reviewSnapshot,
}: {
  changeProjection: ChangeProjectionV1 | null;
  reviewSnapshot: ReviewSnapshotV1 | null;
}) {
  const snapshotId = reviewSnapshot?.snapshotId ?? changeProjection?.source.snapshotId ?? null;
  const snapshotDigest =
    reviewSnapshot?.snapshotDigest ?? changeProjection?.source.snapshotDigest ?? null;
  const reviewDigest = reviewSnapshot?.review.digest ?? changeProjection?.review.digest ?? null;
  const refName =
    reviewSnapshot?.review.precondition.refName ?? changeProjection?.review.refName ?? null;
  const workspaceRevision =
    reviewSnapshot?.review.precondition.workspaceRevision ??
    changeProjection?.review.workspaceRevision ??
    null;
  const policyDigest =
    reviewSnapshot?.review.precondition.policyDigest ??
    changeProjection?.review.policyDigest ??
    null;
  const changeHref = reviewSnapshot
    ? reviewSnapshotHref(
        reviewSnapshot.projectId,
        reviewSnapshot.workspaceId,
        reviewSnapshot.snapshotId
      )
    : null;

  return (
    <section
      aria-label="Review snapshot"
      className="mt-4 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            Review snapshot
          </h4>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            Immutable ReviewSnapshot is the audit source; Changes projection is derived and
            read-only.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {changeHref ? (
            <a
              className="text-xs font-semibold text-[var(--accent-commit)] hover:underline"
              href={changeHref}
            >
              Open Changes
            </a>
          ) : null}
          {changeProjection ? (
            <Badge variant={projectionBadgeVariant(changeProjection.status)}>
              {projectionStatusLabel(changeProjection.status)}
            </Badge>
          ) : (
            <Badge variant="outline">Immutable</Badge>
          )}
        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-2 xl:grid-cols-3">
        {snapshotId ? <SnapshotMeta label="Snapshot" value={shortToken(snapshotId)} /> : null}
        {snapshotDigest ? (
          <SnapshotMeta label="Snapshot digest" value={shortToken(snapshotDigest)} />
        ) : null}
        {reviewDigest ? (
          <SnapshotMeta label="Review digest" value={shortToken(reviewDigest)} />
        ) : null}
        {refName ? <SnapshotMeta label="Ref" value={refName} /> : null}
        {workspaceRevision !== null ? (
          <SnapshotMeta label="Workspace revision" value={String(workspaceRevision)} />
        ) : null}
        {policyDigest ? <SnapshotMeta label="Policy" value={shortToken(policyDigest)} /> : null}
      </dl>
      {changeProjection ? (
        <p className="mt-3 truncate text-xs font-medium text-[var(--text-primary)]">
          Changes projection: {changeProjection.title}
        </p>
      ) : null}
    </section>
  );
}

function SnapshotMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd className="mt-0.5 truncate font-mono font-semibold text-[var(--text-primary)]">
        {value}
      </dd>
    </div>
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

function projectionStatusLabel(status: ChangeProjectionV1['status']): string {
  if (status === 'reviewing') return 'Reviewing';
  if (status === 'accepted') return 'Accepted';
  if (status === 'overridden') return 'Overridden';
  if (status === 'rejected') return 'Rejected';
  return 'Committed';
}

function projectionBadgeVariant(
  status: ChangeProjectionV1['status']
): 'commit-subtle' | 'destructive' | 'pending-subtle' | 'success' | 'warning' {
  if (status === 'reviewing') return 'pending-subtle';
  if (status === 'committed') return 'commit-subtle';
  if (status === 'rejected') return 'destructive';
  if (status === 'overridden') return 'warning';
  return 'success';
}

function originLabel(origin: ClaimView['origin']): string {
  if (origin === 'request_source') return 'From source';
  if (origin === 'inferred') return 'Inferred';
  if (origin === 'actor_authored') return 'Added by actor';
  return 'Not provided';
}

function shortToken(value: string): string {
  const normalized = value.startsWith('sha256:') ? value.slice('sha256:'.length) : value;
  if (normalized.length <= 18) return normalized;
  return `${normalized.slice(0, 12)}…${normalized.slice(-6)}`;
}

function reviewSnapshotHref(projectId: string, workspaceId: string, snapshotId: string): string {
  return `/project/${encodeURIComponent(projectId)}/changes/${encodeURIComponent(workspaceId)}/${encodeURIComponent(snapshotId)}`;
}

function operationLabel(operation: unknown, index: number): string {
  if (!isRecord(operation)) return `Change ${index + 1}`;
  const op = typeof operation.op === 'string' ? operation.op.toUpperCase() : 'CHANGE';
  const path = Array.isArray(operation.path)
    ? operation.path.map(String).join('/')
    : typeof operation.path === 'string'
      ? operation.path
      : `#${index + 1}`;
  return `${op} ${path}`;
}

function operationDetail(operation: unknown): string {
  if (!isRecord(operation)) return JSON.stringify(operation);
  if ('expect' in operation && 'value' in operation) {
    return `${JSON.stringify(operation.expect)} → ${JSON.stringify(operation.value)}`;
  }
  if ('value' in operation) return `Value: ${JSON.stringify(operation.value)}`;
  return JSON.stringify(operation);
}

function actorLabel(actor: { kind: string; id: string }): string {
  return `${actor.kind}:${actor.id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
