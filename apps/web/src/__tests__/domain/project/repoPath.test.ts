import { describe, expect, it } from 'vitest';
import {
  getProjectIdCanvasCommitPath,
  getProjectIdCanvasPath,
  getProjectIdDiffPath,
  getProjectIdRepoPath,
  getProjectRepoPath,
  toRepoSlug,
} from '@/domain/project/repoPath';

describe('repoPath', () => {
  it('uses only backend-confirmed paths and preserves exact names', () => {
    expect(
      getProjectRepoPath({
        id: 'proj_test',
        name: 'HoloCure_fishing_auto',
        canonical_path: '/alice/HoloCure_fishing_auto',
      })
    ).toBe('/alice/HoloCure_fishing_auto');
    expect(getProjectRepoPath({ id: 'proj_test', name: '中文' })).toBe('/project/proj_test');
    expect(getProjectRepoPath({ id: 'proj_test', name: 'Demo' }, 'You')).toBe('/project/proj_test');
    expect(toRepoSlug('Release-2026101500000')).toBe('Release-2026101500000');
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
  });
});
