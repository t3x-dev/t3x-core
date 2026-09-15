import { describe, expect, it } from 'vitest';
import {
  buildReviewChecks,
  commitBlockedReason,
  visibleDraftChecks,
} from '@/domain/workspaces/reviewCheckPresentation';

describe('review check presentation', () => {
  it('shows replay and schema as not-run until statements pass', () => {
    const checks = buildReviewChecks({
      schemaLabel: 'Workspace schema',
    });

    expect(visibleDraftChecks(checks).map((check) => [check.label, check.status])).toEqual([
      ['Deterministic replay', 'pending'],
      ['Schema validation', 'pending'],
    ]);
    expect(visibleDraftChecks(checks).some((check) => check.id === 'integrity')).toBe(false);
    expect(commitBlockedReason(visibleDraftChecks(checks))).toBe(
      'Deterministic replay has not run.'
    );
  });

  it('uses Passed copy without inventing a T3X Action', () => {
    const checks = buildReviewChecks({
      replayOk: true,
      replayApplied: 3,
      replayStatement: { observation: 'observed', outcomes: ['verified'] },
      schemaLabel: 'Release plan v1.2',
      validationStatement: { observation: 'observed', outcomes: ['passed'] },
    });
    const visible = visibleDraftChecks(checks);

    expect(visible).toHaveLength(2);
    expect(visible[0]).toMatchObject({
      label: 'Deterministic replay',
      status: 'passed',
      detail: 'All changes can be replayed successfully.',
    });
    expect(visible[1]).toMatchObject({
      label: 'Schema validation',
      status: 'passed',
      detail: 'Draft conforms to Release plan v1.2 schema.',
    });
    expect(commitBlockedReason(visible)).toBeNull();
  });

  it('names a required action when the runner has not run', () => {
    const checks = buildReviewChecks({
      acceptReasons: [{ code: 'RUNNER_REQUIRED' }],
      replayOk: true,
      replayStatement: { observation: 'observed', outcomes: ['verified'] },
      schemaLabel: 'Workspace schema',
      validationStatement: { observation: 'observed', outcomes: ['passed'] },
    });
    const visible = visibleDraftChecks(checks);
    const action = visible.find((check) => check.id === 'runner');

    expect(action).toMatchObject({
      label: 'T3X Action',
      runnable: true,
      runLabel: 'Run T3X Action',
      status: 'pending',
    });
    expect(commitBlockedReason(visible)).toBe('Required action has not run.');
  });
});
