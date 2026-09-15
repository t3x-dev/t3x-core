export type ReviewCheckStatus = 'failed' | 'passed' | 'pending';
export type ReviewCheckRequirement = 'required' | 'system' | 'action';

export interface ReviewCheckView {
  detail: string;
  id: 'replay' | 'schema' | 'integrity' | 'runner';
  label: string;
  requirement: ReviewCheckRequirement;
  runLabel?: string;
  runnable?: boolean;
  status: ReviewCheckStatus;
}

export interface ReviewCheckSource {
  acceptReasons?: ReadonlyArray<{ code: string }>;
  objectIntegrity?: string;
  replayApplied?: number;
  replayError?: string;
  replayOk?: boolean;
  replayStatement?: { observation: string; outcomes: string[] };
  runnerDetail?: string;
  runnerStatement?: { observation: string; outcomes: string[] };
  schemaLabel?: string;
  validationStatement?: { observation: string; outcomes: string[] };
}

export function statementStatus(
  check: { observation: string; outcomes: string[] } | undefined
): ReviewCheckStatus {
  if (!check || check.observation !== 'observed' || check.outcomes.length === 0) return 'pending';
  if (check.outcomes.every((item) => item === 'passed' || item === 'verified')) return 'passed';
  return check.outcomes.some((item) =>
    ['failed', 'invalid', 'denied', 'error', 'false'].includes(item)
  )
    ? 'failed'
    : 'pending';
}

export function buildReviewChecks(source: ReviewCheckSource): ReviewCheckView[] {
  const replayStatementStatus = statementStatus(source.replayStatement);
  const replayStatus: ReviewCheckStatus =
    source.replayOk === false || replayStatementStatus === 'failed'
      ? 'failed'
      : source.replayOk === true && replayStatementStatus === 'passed'
        ? 'passed'
        : 'pending';
  const schemaStatus = statementStatus(source.validationStatement);
  const schemaLabel = source.schemaLabel?.trim() || 'the bound schema';
  const runnerRequired = isRunnerRequired(source);
  const runnerStatus = statementStatus(source.runnerStatement);
  const checks: ReviewCheckView[] = [
    {
      id: 'replay',
      label: 'Deterministic replay',
      requirement: 'required',
      status: replayStatus,
      detail:
        replayStatus === 'passed'
          ? 'All changes can be replayed successfully.'
          : source.replayOk === false
            ? (source.replayError ?? 'Replay failed.')
            : source.replayOk === true
              ? `${source.replayApplied ?? 0} operations produced the result; the immutable Replay Statement is still pending.`
              : 'Apply the YOps draft to the exact base and verify the resulting State.',
    },
    {
      id: 'schema',
      label: 'Schema validation',
      requirement: 'required',
      status: schemaStatus,
      detail:
        schemaStatus === 'passed'
          ? `Draft conforms to ${schemaLabel} schema.`
          : schemaStatus === 'failed'
            ? 'Schema validation needs attention.'
            : 'Check the projected result against the Workspace schema and bound context.',
    },
    {
      id: 'integrity',
      label: 'Object integrity',
      requirement: 'system',
      status: source.objectIntegrity === 'verified' ? 'passed' : 'pending',
      detail:
        source.objectIntegrity === 'verified'
          ? 'The exact State, Effect, Proposal, and Statements passed protocol integrity checks.'
          : 'Protocol object integrity will be checked when the review snapshot is prepared.',
    },
  ];

  if (runnerRequired) {
    checks.push({
      id: 'runner',
      label: 'T3X Action',
      requirement: 'action',
      status: runnerStatus,
      runnable: runnerStatus !== 'passed',
      runLabel: runnerStatus === 'failed' ? 'Re-run T3X Action' : 'Run T3X Action',
      detail:
        source.runnerDetail?.trim() ||
        (runnerStatus === 'passed'
          ? 'Required external statement passed.'
          : 'Required external statement for this draft.'),
    });
  }

  return checks;
}

export function visibleDraftChecks(checks: readonly ReviewCheckView[]): ReviewCheckView[] {
  return checks.filter((check) => check.id !== 'integrity');
}

export function commitBlockedReason(checks: readonly ReviewCheckView[]): string | null {
  const blockers = checks.filter(
    (check) =>
      (check.requirement === 'required' || check.requirement === 'action') &&
      check.status !== 'passed'
  );
  if (blockers.length === 0) return null;

  const action = blockers.find((check) => check.id === 'runner' || check.requirement === 'action');
  if (action) {
    if (action.status === 'failed') return `${action.label} failed.`;
    return 'Required action has not run.';
  }

  const first = blockers[0];
  if (!first) return null;
  if (first.status === 'failed') return `${first.label} failed.`;
  return `${first.label} has not run.`;
}

export function reviewCheckStatusLabel(status: ReviewCheckStatus): string {
  if (status === 'passed') return 'Passed';
  if (status === 'failed') return 'Failed';
  return 'Not run';
}

function isRunnerRequired(source: ReviewCheckSource): boolean {
  if (source.runnerStatement?.observation === 'observed') return true;
  return (source.acceptReasons ?? []).some((reason) =>
    ['RUNNER_REQUIRED', 'RUNNER_FAILED', 'RUNNER_CONFLICT'].includes(reason.code)
  );
}
