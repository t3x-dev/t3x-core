import { describe, expect, it } from 'vitest';
import {
  listStudioDraftWorkspaces,
  resolveStudioWorkspaceId,
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
});
