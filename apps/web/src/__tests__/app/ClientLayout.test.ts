import { describe, expect, it } from 'vitest';
import {
  isCommitDetailRoute,
  isProjectDiffRoute,
  isProjectMergeRoute,
  isShelllessDetailRoute,
} from '@/app/ClientLayout';

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
