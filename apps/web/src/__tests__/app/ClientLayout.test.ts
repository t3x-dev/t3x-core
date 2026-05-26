import { describe, expect, it } from 'vitest';
import { isCommitDetailRoute } from '@/app/ClientLayout';

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
