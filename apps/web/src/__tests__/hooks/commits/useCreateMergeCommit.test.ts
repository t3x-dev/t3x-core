// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMIT_CREATED_EVENT } from '@/hooks/commits/commitEvents';
import { useCreateMergeCommit } from '@/hooks/commits/useCreateMergeCommit';
import { createCommit } from '@/infrastructure/commits';
import { cleanupRoots, renderHook } from '../renderHook';

vi.mock('@/infrastructure/commits', () => ({
  createCommit: vi.fn(),
}));

describe('useCreateMergeCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createCommit).mockResolvedValue({ commit: { hash: 'sha256:merge' } } as never);
  });

  afterEach(() => {
    cleanupRoots();
  });

  it('creates a merge commit and dispatches a project commit event', async () => {
    const commitCreated = vi.fn();
    window.addEventListener(COMMIT_CREATED_EVENT, commitCreated);
    const { result } = renderHook(() => useCreateMergeCommit());

    await act(async () => {
      await result.current.create({
        projectId: 'proj_1',
        content: { trees: [], relations: [] },
        branch: 'feature/a',
        message: 'Merge feature/a',
        parents: ['sha256:tgt', 'sha256:src'],
        author: { type: 'human', name: 'User' },
        provenance: { method: 'merge' },
      });
    });

    expect(createCommit).toHaveBeenCalledWith(
      'proj_1',
      { trees: [], relations: [] },
      {
        branch: 'feature/a',
        message: 'Merge feature/a',
        parents: ['sha256:tgt', 'sha256:src'],
        author: { type: 'human', name: 'User' },
        provenance: { method: 'merge' },
      }
    );
    expect(commitCreated).toHaveBeenCalledOnce();
    expect((commitCreated.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      type: 'commit.created',
      projectId: 'proj_1',
      branch: 'feature/a',
      payload: { hash: 'sha256:merge', branch: 'feature/a' },
    });

    window.removeEventListener(COMMIT_CREATED_EVENT, commitCreated);
  });
});
