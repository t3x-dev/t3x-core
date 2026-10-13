import { describe, expect, it } from 'vitest';
import { mergeWorkspaceOverride } from '@/domain/workspaces/mergeWorkspaceOverride';
import type { WorkspaceCandidate } from '@/types/workspaces';

function workspace(
  revision: number,
  operations: Array<{ id: string; path: string }>
): WorkspaceCandidate {
  return {
    id: 'workspace_branch:main',
    projectId: 'proj_1',
    title: 'Main workspace',
    summary: '',
    status: 'draft',
    updatedAt: `2026-09-17T00:00:0${revision}.000Z`,
    revision,
    baseCommitHash: null,
    targetBranch: 'main',
    sourceBundle: [],
    schemaBindings: [],
    schemaCandidate: { summary: `rev ${revision}`, fields: [] },
    schemaReview: { verdict: 'needs_review', summary: '', gaps: [] },
    yopsDraft: {
      id: 'draft:main',
      operations: operations.map((operation) => ({
        id: operation.id,
        op: 'set',
        path: operation.path,
        summary: operation.path,
      })),
    },
    outputTargets: [],
  };
}

describe('mergeWorkspaceOverride', () => {
  it('keeps server yops when the refreshed revision is newer than a stale override', () => {
    const server = workspace(8, [{ id: 'op_1', path: 'candidate/product/title' }]);
    const override = workspace(5, []);

    expect(mergeWorkspaceOverride(server, override).yopsDraft.operations).toHaveLength(1);
    expect(mergeWorkspaceOverride(server, override).revision).toBe(8);
  });

  it('keeps local yops when the override revision is newer', () => {
    const server = workspace(4, []);
    const override = workspace(6, [{ id: 'op_local', path: 'candidate/product/problem' }]);

    expect(mergeWorkspaceOverride(server, override).yopsDraft.operations[0]?.id).toBe('op_local');
    expect(mergeWorkspaceOverride(server, override).revision).toBe(6);
  });

  it('prefers server operations when both share a revision and the override was wiped', () => {
    const server = workspace(3, [{ id: 'op_1', path: 'candidate/product/title' }]);
    const override = workspace(3, []);

    expect(mergeWorkspaceOverride(server, override).yopsDraft.operations).toHaveLength(1);
  });
});
