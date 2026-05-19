import { describe, expect, it } from 'vitest';
import { buildInsightsLedger, getLedgerTimeBucket } from '@/domain/insights/groupByBranch';
import type { ApiCommit } from '@/infrastructure/commits';

function commit(overrides: Partial<ApiCommit> & { hash: string; project_id: string }): ApiCommit {
  return {
    author: { type: 'human', name: 'Tester' },
    branch: 'main',
    committed_at: '2026-05-19T08:00:00Z',
    content: { trees: [], relations: [] },
    hash: overrides.hash,
    message: null,
    parents: [],
    project_id: overrides.project_id,
    provenance: null,
    schema: 't3x/commit',
    sources: null,
    ...overrides,
  };
}

describe('buildInsightsLedger', () => {
  it('groups commits by project, branch, and deterministic time bucket', () => {
    const ledger = buildInsightsLedger(
      [
        {
          commit: commit({
            branch: 'feature',
            committed_at: '2026-05-18T10:00:00Z',
            hash: 'sha256:feature-yesterday',
            message: 'Feature checkpoint',
            project_id: 'proj_alpha',
          }),
          entry: {
            author: 'Tester',
            bridgePrompt: 'feature',
            evidenceCount: 0,
            facets: [],
            id: 'feature',
            stage: 'commit',
            status: 'validated',
            summary: '',
            tags: ['Alpha', 'feature'],
            title: 'Feature checkpoint',
            updatedAt: '1d ago',
          },
          projectName: 'Alpha',
        },
        {
          commit: commit({
            committed_at: '2026-05-19T11:00:00Z',
            hash: 'sha256:main-today',
            message: 'Main checkpoint',
            project_id: 'proj_alpha',
          }),
          entry: {
            author: 'Tester',
            bridgePrompt: 'main',
            evidenceCount: 0,
            facets: [],
            id: 'main',
            stage: 'commit',
            status: 'validated',
            summary: '',
            tags: ['Alpha', 'main'],
            title: 'Main checkpoint',
            updatedAt: 'now',
          },
          projectName: 'Alpha',
        },
        {
          commit: commit({
            branch: 'main',
            committed_at: '2026-05-10T10:00:00Z',
            hash: 'sha256:beta-earlier',
            message: 'Beta baseline',
            project_id: 'proj_beta',
          }),
          entry: {
            author: 'Tester',
            bridgePrompt: 'main',
            evidenceCount: 0,
            facets: [],
            id: 'beta',
            stage: 'commit',
            status: 'validated',
            summary: '',
            tags: ['Beta', 'main'],
            title: 'Beta baseline',
            updatedAt: '9d ago',
          },
          projectName: 'Beta',
        },
      ],
      { now: new Date('2026-05-19T12:00:00Z') }
    );

    expect(ledger.totals).toEqual({ branches: 3, commits: 3, projects: 2 });
    expect(ledger.projects.map((project) => project.projectName)).toEqual(['Alpha', 'Beta']);
    expect(ledger.projects[0].branches.map((branch) => branch.branch)).toEqual(['main', 'feature']);
    expect(ledger.projects[0].branches[0].buckets[0]).toMatchObject({
      label: 'Today',
      commits: [expect.objectContaining({ hash: 'sha256:main-today' })],
    });
    expect(ledger.projects[0].branches[1].buckets[0]).toMatchObject({
      label: 'Yesterday',
      commits: [expect.objectContaining({ hash: 'sha256:feature-yesterday' })],
    });
    expect(ledger.projects[1].branches[0].buckets[0]).toMatchObject({
      label: 'Earlier',
      commits: [expect.objectContaining({ hash: 'sha256:beta-earlier' })],
    });
  });

  it('labels previous seven days without drifting from a supplied review date', () => {
    expect(
      getLedgerTimeBucket('2026-05-15T00:00:00Z', new Date('2026-05-19T12:00:00Z')).label
    ).toBe('Previous 7 days');
  });
});
