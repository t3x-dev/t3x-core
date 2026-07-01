import { describe, expect, it } from 'vitest';
import { getProjectRepoPath, toRepoSlug } from '@/domain/project/repoPath';

describe('repoPath', () => {
  it('normalizes project names into repository slugs', () => {
    expect(toRepoSlug('Mobile Click Audit 1780972749777')).toBe(
      'mobile-click-audit-1780972749777'
    );
    expect(toRepoSlug('  PRD / Audience Handoff  ')).toBe('prd-audience-handoff');
  });

  it('builds the display path without replacing the internal project route', () => {
    expect(getProjectRepoPath({ id: 'proj_test', name: 'Test Project' })).toBe(
      '/t3x-dev/test-project'
    );
  });

  it('falls back to a stable repo slug when the name is empty', () => {
    expect(toRepoSlug('', 'proj_test')).toBe('repo-proj-test');
  });
});
