import type { ActionCapabilityView, TransitionViewV1 } from '@t3x-dev/core';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type DecisionOutcome = 'accepted' | 'overridden' | 'rejected';

export function TransitionDecisionControls({
  busy,
  onDecide,
  onOverrideReasonChange,
  overrideReason,
  view,
}: {
  busy: boolean;
  onDecide: (outcome: DecisionOutcome, reason?: string) => void;
  onOverrideReasonChange: (reason: string) => void;
  overrideReason: string;
  view: TransitionViewV1;
}) {
  if (view.mode !== 'transition') return null;
  if (view.decision.observation === 'supplied') {
    if (view.decision.outcome !== 'rejected') return null;
    return (
      <section
        aria-label="Rejected decision"
        className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
      >
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Change rejected</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          The decision is preserved in audit history. The branch was not changed.
        </p>
      </section>
    );
  }

  const acceptAllowed = isAllowed(view.capabilities.accept);
  const overrideAllowed = isAllowed(view.capabilities.override);
  const rejectAllowed = isAllowed(view.capabilities.reject);
  const reasons = deniedReasons([
    view.capabilities.accept,
    view.capabilities.override,
    view.capabilities.reject,
  ]);

  return (
    <section
      aria-label="Decision controls"
      className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Choose what happens next
        </h3>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          Actions come from the verified review and current project policy.
        </p>
      </div>

      {overrideAllowed ? (
        <label
          className="mt-4 grid gap-1.5 text-xs font-semibold text-[var(--text-secondary)]"
          htmlFor="workspace-transition-override-reason"
        >
          Why continue despite the failed check?
          <Textarea
            disabled={busy}
            id="workspace-transition-override-reason"
            maxLength={2000}
            onChange={(event) => onOverrideReasonChange(event.target.value)}
            placeholder="Explain the accepted risk for the audit history."
            value={overrideReason}
          />
        </label>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
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
        {overrideAllowed ? (
          <Button
            disabled={busy || !overrideReason.trim()}
            onClick={() => onDecide('overridden', overrideReason)}
            type="button"
            variant="pending"
          >
            {busy ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <AlertTriangle aria-hidden="true" className="size-4" />
            )}
            Continue anyway and save
          </Button>
        ) : null}
        {acceptAllowed ? (
          <Button
            disabled={busy}
            onClick={() => onDecide('accepted')}
            type="button"
            variant="commit"
          >
            {busy ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="size-4" />
            )}
            Approve and save
          </Button>
        ) : null}
      </div>

      {!acceptAllowed && !overrideAllowed && !rejectAllowed && reasons.length > 0 ? (
        <ul className="mt-4 grid gap-1 text-xs text-[var(--text-secondary)]">
          {reasons.map((reason) => (
            <li className="rounded-md bg-[var(--surface-panel)] px-3 py-2" key={reason}>
              {reason}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function isAllowed(capability: ActionCapabilityView): boolean {
  return capability.disposition === 'allowed';
}

function deniedReasons(capabilities: ActionCapabilityView[]): string[] {
  return [
    ...new Set(
      capabilities.flatMap((capability) => capability.reasons.map((reason) => reason.message))
    ),
  ];
}
