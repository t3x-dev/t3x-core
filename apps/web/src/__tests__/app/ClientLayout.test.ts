import { describe, expect, it } from 'vitest';
import {
  isCommitDetailRoute,
  isProjectDiffRoute,
  isProjectMergeRoute,
  isSettingsRoute,
  isShelllessDetailRoute,
  resolveCanonicalRepositoryPath,
} from '@/app/ClientLayout';
import type { ProjectSummary } from '@/store/projectStore';

const PROJECT: ProjectSummary = {
  branchesCount: 1,
  commitsCount: 1,
  description: '',
  drafts: 0,
  id: 'proj_123',
  name: 'Example Project',
  nodes: 1,
  owner: 'You',
  status: 'active',
  updatedAt: 'now',
};

describe('resolveCanonicalRepositoryPath', () => {
  it('resolves the canonical shell path from both repository and legacy project params', () => {
    expect(
      resolveCanonicalRepositoryPath('/t3x-dev/example-project/outputs', null, [PROJECT])
    ).toBe('/t3x-dev/example-project');
    expect(resolveCanonicalRepositoryPath('/project/proj_123', 'proj_123', [PROJECT])).toBe(
      '/t3x-dev/example-project'
    );
  });

  it('does not invent repository context for organization pages', () => {
    expect(resolveCanonicalRepositoryPath('/t3x-dev/settings', null, [PROJECT])).toBeUndefined();
  });
});

describe('isCommitDetailRoute', () => {
  it('matches project commit detail routes that should not render the global sidebar', () => {
    expect(isCommitDetailRoute('/project/proj_123/commit/sha256%3Aabc')).toBe(true);
    expect(isCommitDetailRoute('/project/proj_123/commit/sha256%3Aabc/')).toBe(true);
  });

  it('does not match sibling project routes', () => {
    expect(isCommitDetailRoute('/project/proj_123')).toBe(false);
    expect(isCommitDetailRoute('/project/proj_123/diff')).toBe(false);
    expect(isCommitDetailRoute('/project/proj_123/leaf/leaf_1')).toBe(false);
  });
});

describe('isProjectDiffRoute', () => {
  it('matches project diff routes that should not render the global sidebar', () => {
    expect(isProjectDiffRoute('/project/proj_123/diff')).toBe(true);
    expect(isProjectDiffRoute('/project/proj_123/diff/')).toBe(true);
  });

  it('does not match sibling project routes', () => {
    expect(isProjectDiffRoute('/project/proj_123')).toBe(false);
    expect(isProjectDiffRoute('/project/proj_123/commit/sha256%3Aabc')).toBe(false);
    expect(isProjectDiffRoute('/project/proj_123/merge/merge_1')).toBe(false);
  });
});

describe('isProjectMergeRoute', () => {
  it('matches project merge routes that should not render the global sidebar', () => {
    expect(isProjectMergeRoute('/project/proj_123/merge/merge_1')).toBe(true);
    expect(isProjectMergeRoute('/project/proj_123/merge/merge_1/')).toBe(true);
  });

  it('does not match sibling project routes', () => {
    expect(isProjectMergeRoute('/project/proj_123')).toBe(false);
    expect(isProjectMergeRoute('/project/proj_123/diff')).toBe(false);
    expect(isProjectMergeRoute('/project/proj_123/commit/sha256%3Aabc')).toBe(false);
  });
});

describe('isShelllessDetailRoute', () => {
  it('matches project detail routes that own their own navigation header', () => {
    expect(isShelllessDetailRoute('/project/proj_123/commit/sha256%3Aabc')).toBe(true);
    expect(isShelllessDetailRoute('/project/proj_123/diff')).toBe(true);
    expect(isShelllessDetailRoute('/project/proj_123/merge/merge_1')).toBe(true);
  });

  it('does not match normal project workspace routes', () => {
    expect(isShelllessDetailRoute('/project/proj_123')).toBe(false);
    expect(isShelllessDetailRoute('/chat/project/proj_123/canvas')).toBe(false);
  });
});

describe('isSettingsRoute', () => {
  it('matches settings routes that should not render the global sidebar', () => {
    expect(isSettingsRoute('/settings')).toBe(true);
    expect(isSettingsRoute('/settings/profile')).toBe(true);
    expect(isSettingsRoute('/settings/preferences')).toBe(true);
  });

  it('does not match project-scoped settings routes', () => {
    expect(isSettingsRoute('/project/proj_123/settings')).toBe(false);
    expect(isSettingsRoute('/chat')).toBe(false);
  });
});
