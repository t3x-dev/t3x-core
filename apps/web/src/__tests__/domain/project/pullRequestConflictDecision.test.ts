import { describe, expect, it } from 'vitest';
import { buildPullRequestConflictDecision } from '@/domain/project/pullRequestConflictDecision';

const prepared = {
  conflicts: [{ path: 'candidate/product' }, { path: 'candidate/requirements/weekly' }],
  onlyInSource: ['candidate/requirements/weekly_pr_demo'],
  onlyInTarget: ['candidate/requirements/existing'],
};

describe('buildPullRequestConflictDecision', () => {
  it('uses the feature branch value for every prepared conflict path', () => {
    expect(buildPullRequestConflictDecision(prepared, 'feature')).toEqual({
      conflictResolutions: {
        'candidate/product': 'source',
        'candidate/requirements/weekly': 'source',
      },
      keepFromSource: ['candidate/requirements/weekly_pr_demo'],
      keepFromTarget: ['candidate/requirements/existing'],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    });
  });

  it('uses the current main value when Keep main is selected', () => {
    const decision = buildPullRequestConflictDecision(prepared, 'main');
    expect(decision.conflictResolutions['candidate/product']).toBe('target');
    expect(decision.conflictResolutions['candidate/requirements/weekly']).toBe('target');
  });
});
