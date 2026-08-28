import { describe, expect, it } from 'vitest';
import {
  getProjectIdCanvasCommitPath,
  getProjectIdCanvasPath,
  getProjectIdDiffPath,
  getProjectIdOutputsPath,
  getProjectIdRepoPath,
  getProjectOutputsPath,
  getProjectRepoPath,
  toRepoSlug,
} from '@/domain/project/repoPath';

describe('repoPath', () => {
  it('normalizes project names into repository slugs', () => {
    expect(toRepoSlug('Mobile Click Audit 1780972749777')).toBe('mobile-click-audit');
    expect(toRepoSlug('  PRD / Audience Handoff  ')).toBe('prd-audience-handoff');
    expect(toRepoSlug('Release 2026')).toBe('release-2026');
  });

  it('builds the display path without replacing the internal project route', () => {
    expect(getProjectRepoPath({ id: 'proj_test', name: 'Test Project' })).toBe(
      '/t3x-dev/test-project'
    );
    expect(getProjectRepoPath({ id: 'proj_audit', name: 'Mobile Click Audit 1780972749777' })).toBe(
      '/t3x-dev/mobile-click-audit'
    );
    expect(getProjectRepoPath({ id: 'proj_test', name: 'Test Project' }, 'lqw905')).toBe(
      '/lqw905/test-project'
    );
  });

  it('falls back to a stable repo slug when the name is empty', () => {
    expect(toRepoSlug('', 'proj_test')).toBe('repo-proj-test');
  });

  it('builds an Outputs deep link for a selected Leaf', () => {
    expect(
      getProjectOutputsPath({ id: 'proj_test', name: 'Test Project' }, 'leaf/audience brief')
    ).toBe('/t3x-dev/test-project/outputs?leaf=leaf%2Faudience%20brief');
  });

  it('builds project-id entry points that canonicalize in the route layer', () => {
    expect(getProjectIdRepoPath('proj/test')).toBe('/project/proj%2Ftest');
    expect(getProjectIdCanvasPath('proj/test')).toBe('/project/proj%2Ftest?view=canvas');
    expect(getProjectIdCanvasCommitPath('proj/test', 'sha256:abc/123')).toBe(
      '/project/proj%2Ftest?view=canvas&commit=sha256%3Aabc%2F123'
    );
    expect(getProjectIdDiffPath('proj/test', 'sha256:base', 'sha256:target')).toBe(
      '/project/proj%2Ftest/diff?base=sha256%3Abase&target=sha256%3Atarget'
    );
    expect(getProjectIdOutputsPath('proj/test', 'leaf/audience brief')).toBe(
      '/project/proj%2Ftest?tab=outputs&leaf=leaf%2Faudience+brief'
    );
  });
});
