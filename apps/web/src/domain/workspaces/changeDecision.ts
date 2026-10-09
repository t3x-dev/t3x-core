import type { ProjectionCapabilityReason, TransitionGraphViewV1 } from '@t3x-dev/core';

export type ChangeCheckStatus = 'passed' | 'failed' | 'missing';

export interface ChangeCheckFinding {
  code: string;
  message: string;
  count: number;
}

export interface ChangeCheckRow {
  id: 'integrity' | 'replay' | 'validation' | 'runner' | 'confirmation';
  label: string;
  status: ChangeCheckStatus;
  summary: string;
  findings: ChangeCheckFinding[];
}

export interface ChangeDecisionBlocker {
  code: string;
  title: string;
  detail: string;
}

const POSTURE_TOOL = '@t3x-dev/core/proposal-generation-posture';

export function isGeneratedChange(view: TransitionGraphViewV1): boolean {
  return view.checks.runner.runs.some((run) => run.predicate.tool.name === POSTURE_TOOL);
}

export function changeCheckRows(view: TransitionGraphViewV1): ChangeCheckRow[] {
  const { checks } = view;
  const rows: ChangeCheckRow[] = [
    {
      id: 'integrity',
      label: 'Object integrity',
      status: checks.objectIntegrity === 'verified' ? 'passed' : 'missing',
      summary:
        checks.objectIntegrity === 'verified'
          ? 'State, Effect, Proposal and Statements match their digests.'
          : 'Integrity was not checked.',
      findings: [],
    },
    {
      id: 'replay',
      label: 'Exact replay',
      status: outcomeStatus(checks.replay.observation, checks.replay.outcomes, ['verified']),
      summary:
        checks.replay.observation === 'observed'
          ? `${view.change.operations.length} operations reproduce the reviewed result.`
          : 'Replay has not run.',
      findings: [],
    },
    {
      id: 'validation',
      label: 'Schema validation',
      status: outcomeStatus(checks.validation.observation, checks.validation.outcomes, ['passed']),
      summary: validationSummary(view),
      findings: groupFindings(
        checks.validation.runs.flatMap((run) =>
          run.predicate.outcome === 'failed'
            ? [...run.predicate.errors, ...run.predicate.gaps].map((finding) => ({
                code: finding.code,
                message: finding.message,
              }))
            : []
        )
      ),
    },
  ];
  if (checks.runner.observation === 'observed') {
    const generated = isGeneratedChange(view);
    const status = outcomeStatus(checks.runner.observation, checks.runner.outcomes, ['passed']);
    const errors = checks.runner.runs.flatMap((run) =>
      run.predicate.findings
        .filter((finding) => finding.severity === 'error')
        .map((finding) => ({ code: finding.code, message: finding.message }))
    );
    rows.push({
      id: 'runner',
      label: generated ? 'AI source support' : 'Runner check',
      status,
      summary:
        status === 'failed' && errors.length > 0
          ? `${errors.length} ${generated ? 'source-support ' : ''}${errors.length === 1 ? 'issue' : 'issues'} found.`
          : checks.runner.runs.map((run) => run.predicate.summary).join(' ') ||
            'Runner check observed.',
      findings: groupFindings(errors),
    });
  }
  if (checks.humanConfirmation.observation === 'observed') {
    rows.push({
      id: 'confirmation',
      label: 'Human confirmation',
      status: 'passed',
      summary: `${checks.humanConfirmation.runs.length} confirmation recorded.`,
      findings: [],
    });
  }
  return rows;
}

/** Explain why the change cannot be approved, merging accept and override reasons. */
export function changeDecisionBlockers(view: TransitionGraphViewV1): ChangeDecisionBlocker[] {
  if (view.capabilities.accept.disposition === 'allowed') return [];
  const overrideAllowed = view.capabilities.override.disposition === 'allowed';
  const reasons = [...view.capabilities.accept.reasons, ...view.capabilities.override.reasons];
  const seen = new Set<string>();
  const blockers: ChangeDecisionBlocker[] = [];
  for (const reason of reasons) {
    if (seen.has(reason.code) || reason.code === 'OVERRIDE_NOT_REQUIRED') continue;
    seen.add(reason.code);
    blockers.push(explainReason(reason, view, overrideAllowed));
  }
  return blockers;
}

function explainReason(
  reason: ProjectionCapabilityReason,
  view: TransitionGraphViewV1,
  overrideAllowed: boolean
): ChangeDecisionBlocker {
  const generated = isGeneratedChange(view);
  switch (reason.code) {
    case 'SELF_APPROVAL_FORBIDDEN':
      return {
        code: reason.code,
        title: 'Needs another reviewer',
        detail: generated
          ? 'You proposed this AI-generated change. Someone other than the proposer must approve it.'
          : 'The branch rule does not let the proposer approve their own change.',
      };
    case 'RUNNER_FAILED':
      return {
        code: reason.code,
        title: generated ? 'AI output is not backed by sources' : 'A required check failed',
        detail: generated
          ? 'Each generated value needs a conclusive source-support assessment before it can be committed.'
          : 'Fix the failing runner check, then prepare the review again.',
      };
    case 'RUNNER_REQUIRED':
      return {
        code: reason.code,
        title: 'A required check has not run',
        detail: 'Run the required check, then prepare the review again.',
      };
    case 'VALIDATION_FAILED':
    case 'VALIDATION_CONFLICT':
      return {
        code: reason.code,
        title: 'Schema validation failed',
        detail: overrideAllowed
          ? 'You can still commit by recording why the failing check is acceptable.'
          : 'Fix the reported fields in Compose, then prepare the review again.',
      };
    case 'VALIDATION_REQUIRED':
      return {
        code: reason.code,
        title: 'Schema validation has not run',
        detail: 'Bind a schema and prepare the review again.',
      };
    case 'REPLAY_CLAIM_FALSE':
    case 'REPLAY_NOT_VERIFIED':
      return {
        code: reason.code,
        title: 'The change does not replay exactly',
        detail: 'The draft changed since it was reviewed. Prepare the review again.',
      };
    case 'UNAUTHORIZED_DECISION':
    case 'UNAUTHORIZED_OVERRIDE':
      return {
        code: reason.code,
        title: 'You cannot approve on this branch',
        detail: 'The branch rule limits who can approve changes.',
      };
    case 'HUMAN_CONFIRMATION_REQUIRED':
      return {
        code: reason.code,
        title: 'Purpose needs a human confirmation',
        detail: 'A reviewer must confirm the stated purpose and reason.',
      };
    case 'CLAIM_EVIDENCE_INSUFFICIENT':
    case 'CLAIM_MODE_NOT_ALLOWED':
      return {
        code: reason.code,
        title: 'Purpose or reason is not supported',
        detail: 'The branch rule needs more evidence for the stated purpose or reason.',
      };
    case 'POLICY_CONTEXT_REQUIRED':
      return {
        code: reason.code,
        title: 'No branch rule applies',
        detail: 'Automated actors need an explicit branch rule before they can approve.',
      };
    default:
      return { code: reason.code, title: 'Approval is blocked', detail: reason.message };
  }
}

function outcomeStatus(
  observation: 'observed' | 'no_statement_observed',
  outcomes: readonly string[],
  passing: readonly string[]
): ChangeCheckStatus {
  if (observation !== 'observed' || outcomes.length === 0) return 'missing';
  return outcomes.every((outcome) => passing.includes(outcome)) ? 'passed' : 'failed';
}

function validationSummary(view: TransitionGraphViewV1): string {
  const runs = view.checks.validation.runs;
  if (runs.length === 0) return 'Schema validation has not run.';
  const failed = runs.find((run) => run.predicate.outcome === 'failed');
  if (!failed || failed.predicate.outcome !== 'failed') return 'The result matches its schema.';
  const count = failed.predicate.errors.length + failed.predicate.gaps.length;
  return `${count} ${count === 1 ? 'issue' : 'issues'} against the bound schema.`;
}

function groupFindings(
  findings: ReadonlyArray<{ code: string; message: string }>
): ChangeCheckFinding[] {
  const grouped = new Map<string, ChangeCheckFinding>();
  for (const finding of findings) {
    const key = `${finding.code}\u0000${finding.message}`;
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key, { code: finding.code, message: finding.message, count: 1 });
  }
  return [...grouped.values()];
}
