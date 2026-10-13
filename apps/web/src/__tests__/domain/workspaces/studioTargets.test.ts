import { describe, expect, it } from 'vitest';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import {
  listStudioDraftWorkspaces,
  listStudioWorkspacesForBranches,
  resolveStudioWorkspaceId,
  studioApplyCandidateIds,
  workspaceHasSchemaBinding,
} from '@/domain/workspaces/studioTargets';
import type { WorkspaceCandidate } from '@/types/workspaces';

function workspace(
  id: string,
  title: string,
  status: WorkspaceCandidate['status']
): WorkspaceCandidate {
  return {
    id,
    projectId: 'proj_1',
    title,
    summary: '',
    status,
    updatedAt: '2026-09-17T00:00:00.000Z',
    baseCommitHash: null,
    targetBranch: 'main',
    sourceBundle: [],
    schemaBindings: [],
    schemaCandidate: { summary: '', fields: [] },
    schemaReview: { verdict: 'needs_review', summary: '', gaps: [] },
    yopsDraft: { id: `draft:${id}`, operations: [] },
    outputTargets: [],
  };
}

describe('studio workspace targets', () => {
  it('keeps one draft target and ignores a dummy empty id', () => {
    const drafts = [
      workspace('workspace_branch:main', 'Main workspace', 'draft'),
      workspace('workspace_done', 'Main workspace', 'committed'),
    ];

    expect(listStudioDraftWorkspaces(drafts).map((item) => item.id)).toEqual([
      'workspace_branch:main',
    ]);
    expect(resolveStudioWorkspaceId(drafts, '')).toBe('workspace_branch:main');
    expect(resolveStudioWorkspaceId(drafts, 'workspace_branch:main')).toBe('workspace_branch:main');
  });

  it('adds a Main workspace when the main branch has no saved draft', () => {
    const targets = listStudioWorkspacesForBranches([], ['main'], (branch) =>
      getProjectWorkspaceStarterCandidate('proj_1', [], branch, null)
    );

    expect(targets.map((item) => item.title)).toEqual(['Main workspace']);
    expect(targets[0]?.id).toBe('workspace_branch:main');
    expect(targets[0]?.targetBranch).toBe('main');
  });

  it('keeps the saved draft for a branch instead of adding another starter', () => {
    const saved = workspace('workspace_branch:main', 'Main workspace', 'draft');
    const targets = listStudioWorkspacesForBranches([saved], ['main'], (branch) =>
      getProjectWorkspaceStarterCandidate('proj_1', [], branch, null)
    );

    expect(targets).toEqual([saved]);
  });

  it('applies a schema candidate when present, otherwise every available module', () => {
    expect(
      studioApplyCandidateIds([
        { id: 'brief', available: true, kind: 'module' },
        { id: 'blocked', available: false, kind: 'module' },
      ])
    ).toEqual(['brief']);
    expect(
      studioApplyCandidateIds([
        { id: 'brief', available: true, kind: 'module' },
        { id: 'release', available: true, kind: 'schema' },
      ])
    ).toEqual(['release']);
    expect(workspaceHasSchemaBinding({ schemaBindings: [] })).toBe(false);
    expect(workspaceHasSchemaBinding({ schemaBindings: [{ schemaName: 'Any' }] })).toBe(true);
  });

  it.each([
    'product-brief',
    'care-checklist',
    'compose-services',
  ] as const)('uses the same apply-id rule for official starter %s', (id) => {
    expect(studioApplyCandidateIds([{ available: true, id, kind: 'module' }])).toEqual([id]);
    expect(
      workspaceHasSchemaBinding({
        schemaBindings: [{ schemaName: id, version: '1.0.0' }],
      })
    ).toBe(true);
  });
});
