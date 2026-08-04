// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateMergeCommit } from '@/hooks/commits/useCreateMergeCommit';
import { cleanupRoots, renderHook } from '../renderHook';

describe('useCreateMergeCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupRoots();
  });

  it('refuses to flatten a two-parent merge into the one-parent state command', async () => {
    const { result } = renderHook(() => useCreateMergeCommit());

    let request: Promise<unknown> | undefined;
    await act(async () => {
      request = result.current.create({
        projectId: 'proj_1',
        content: { trees: [], relations: [] },
        branch: 'feature/a',
        message: 'Merge feature/a',
        parents: ['sha256:tgt', 'sha256:src'],
        author: { type: 'human', name: 'User' },
        provenance: { method: 'merge' },
      });
      await expect(request).rejects.toThrow(
        'Merge commit persistence is unavailable until the CommitV2 merge driver is installed'
      );
    });
  });
});
