import { describe, expect, it } from 'vitest';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import {
  listStudioDraftWorkspaces,
  listStudioWorkspacesForBranches,
  resolveStudioWorkspaceId,
} from '@/domain/workspaces/studioTargets';
import type { WorkspaceCandidate } from '@/types/workspaces';

function workspace(
  id: string,
  title: string,
  status: WorkspaceCandidate['status'],
  targetBranch = 'main'
): WorkspaceCandidate {
  return {
    id,
    projectId: 'proj_1',
    title,
    summary: '',
    status,
    updatedAt: '2026-09-28T00:00:00.000Z',
    baseCommitHash: null,
    targetBranch,
    sourceBundle: [],
    schemaBindings: [],
    schemaCandidate: { summary: '', fields: [] },
    schemaReview: { verdict: 'needs_review', summary: '', gaps: [] },
    yopsDraft: { id: `draft:${id}`, operations: [] },
    outputTargets: [],
  };
}

describe('Studio branch workspaces', () => {
  it('keeps only open workspaces and resolves a requested target', () => {
    const workspaces = [
      workspace('workspace_branch:main', 'Main workspace', 'draft'),
      workspace('workspace_done', 'Completed workspace', 'committed'),
    ];

    expect(listStudioDraftWorkspaces(workspaces).map((item) => item.id)).toEqual([
      'workspace_branch:main',
    ]);
    expect(resolveStudioWorkspaceId(workspaces, '')).toBe('workspace_branch:main');
    expect(resolveStudioWorkspaceId(workspaces, 'workspace_branch:main')).toBe(
      'workspace_branch:main'
    );
  });

  it('adds one starter for every branch without a saved draft', () => {
    const main = workspace('workspace_branch:main', 'Main workspace', 'draft');
    const targets = listStudioWorkspacesForBranches([main], ['main', 'feature/schema'], (branch) =>
      getProjectWorkspaceStarterCandidate('proj_1', [], branch, null)
    );

    expect(targets).toHaveLength(2);
    expect(targets[0]).toBe(main);
    expect(targets[1]).toMatchObject({
      id: 'workspace_branch:feature%2Fschema',
      targetBranch: 'feature/schema',
      title: 'feature/schema workspace',
    });
  });

  it('retains an open workspace that is not tied to the current branch inventory', () => {
    const detached = workspace('workspace_detached', 'Detached draft', 'draft', 'old-branch');
    const targets = listStudioWorkspacesForBranches([detached], ['main'], (branch) =>
      getProjectWorkspaceStarterCandidate('proj_1', [], branch, null)
    );

    expect(targets.map((item) => item.id)).toEqual(['workspace_branch:main', 'workspace_detached']);
  });
});
