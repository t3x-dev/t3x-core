import { describe, expect, it } from 'vitest';
import {
  isProjectDiffRoute,
  isProjectMergeRoute,
  isSettingsRoute,
  isShelllessDetailRoute,
} from '@/app/ClientLayout';

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
    expect(isShelllessDetailRoute('/project/proj_123/diff')).toBe(true);
    expect(isShelllessDetailRoute('/project/proj_123/merge/merge_1')).toBe(true);
  });

  it('does not match normal or retired project routes', () => {
    expect(isShelllessDetailRoute('/project/proj_123')).toBe(false);
    expect(isShelllessDetailRoute('/project/proj_123/commit/sha256%3Aabc')).toBe(false);
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
