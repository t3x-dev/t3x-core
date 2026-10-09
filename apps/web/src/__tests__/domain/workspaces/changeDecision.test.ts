import type { TransitionGraphViewV1 } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { changeCheckRows, changeDecisionBlockers } from '@/domain/workspaces/changeDecision';

const POSTURE_TOOL = '@t3x-dev/core/proposal-generation-posture';
const SOURCE_SUPPORT = {
  code: 'SOURCE_SUPPORT_REQUIRED',
  message: 'Evidence integrity alone does not prove semantic support.',
  severity: 'error',
};

function view({
  accept = { disposition: 'denied', reasons: [] },
  override = { disposition: 'denied', reasons: [] },
  runnerTool = POSTURE_TOOL,
}: {
  accept?: { disposition: string; reasons: Array<{ code: string; message: string }> };
  override?: { disposition: string; reasons: Array<{ code: string; message: string }> };
  runnerTool?: string;
} = {}): TransitionGraphViewV1 {
  return {
    change: { operations: [{}, {}, {}] },
    checks: {
      objectIntegrity: 'verified',
      replay: { observation: 'observed', outcomes: ['verified'] },
      validation: {
        observation: 'observed',
        outcomes: ['passed'],
        runs: [{ predicate: { outcome: 'passed' } }],
      },
      runner: {
        observation: 'observed',
        outcomes: ['failed'],
        runs: [
          {
            predicate: {
              tool: { name: runnerTool },
              summary: 'Verified 1 generated authoring action(s) at their exact historical inputs.',
              findings: [
                SOURCE_SUPPORT,
                SOURCE_SUPPORT,
                { code: 'NOTE', message: 'Informational.', severity: 'info' },
              ],
            },
          },
        ],
      },
      humanConfirmation: { observation: 'no_statement_observed', runs: [] },
    },
    capabilities: { accept, override, reject: { disposition: 'allowed', reasons: [] } },
  } as unknown as TransitionGraphViewV1;
}

describe('changeCheckRows', () => {
  it('summarises a failed AI source-support check by its error findings', () => {
    const rows = changeCheckRows(view());

    expect(rows.map((row) => [row.id, row.status])).toEqual([
      ['integrity', 'passed'],
      ['replay', 'passed'],
      ['validation', 'passed'],
      ['runner', 'failed'],
    ]);
    const runner = rows.find((row) => row.id === 'runner');
    expect(runner?.label).toBe('AI source support');
    expect(runner?.summary).toBe('2 source-support issues found.');
    expect(runner?.findings).toEqual([
      { code: SOURCE_SUPPORT.code, message: SOURCE_SUPPORT.message, count: 2 },
    ]);
  });

  it('labels other runner checks generically', () => {
    const runner = changeCheckRows(view({ runnerTool: 'custom/runner' })).find(
      (row) => row.id === 'runner'
    );

    expect(runner?.label).toBe('Runner check');
    expect(runner?.summary).toBe('2 issues found.');
  });
});

describe('changeDecisionBlockers', () => {
  it('merges accept and override reasons into one plain-language list', () => {
    const blockers = changeDecisionBlockers(
      view({
        accept: {
          disposition: 'denied',
          reasons: [
            { code: 'RUNNER_FAILED', message: 'runner failed' },
            { code: 'SELF_APPROVAL_FORBIDDEN', message: 'self approval' },
          ],
        },
        override: {
          disposition: 'denied',
          reasons: [
            { code: 'SELF_APPROVAL_FORBIDDEN', message: 'self approval' },
            { code: 'SOMETHING_NEW', message: 'Raw policy message.' },
          ],
        },
      })
    );

    expect(blockers.map((blocker) => blocker.title)).toEqual([
      'AI output is not backed by sources',
      'Needs another reviewer',
      'Approval is blocked',
    ]);
    expect(blockers[2]?.detail).toBe('Raw policy message.');
  });

  it('offers an override path for failed validation when the rule allows it', () => {
    const [blocker] = changeDecisionBlockers(
      view({
        accept: {
          disposition: 'denied',
          reasons: [{ code: 'VALIDATION_FAILED', message: 'validation failed' }],
        },
        override: { disposition: 'allowed', reasons: [] },
      })
    );

    expect(blocker?.detail).toBe(
      'You can still commit by recording why the failing check is acceptable.'
    );
  });

  it('has nothing to explain when accept is allowed', () => {
    expect(
      changeDecisionBlockers(view({ accept: { disposition: 'allowed', reasons: [] } }))
    ).toEqual([]);
  });
});
