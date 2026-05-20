// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMergeCommitMock = vi.fn();
const loadCommitMock = vi.fn();
const loadCanvasMock = vi.fn();

vi.mock('@t3x-dev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/core')>();
  return {
    ...actual,
    prepareMerge: vi.fn(() => ({
      autoKept: ['plan'],
      conflicts: [],
      onlyInSource: [],
      onlyInTarget: [],
      relationsOnlyInSource: [],
      relationsOnlyInTarget: [],
      relationsInBoth: [],
    })),
  };
});

vi.mock('@/hooks/commits/useCreateMergeCommit', () => ({
  useCreateMergeCommit: () => ({ create: createMergeCommitMock }),
}));

vi.mock('@/hooks/commits/useCommitByHash', () => ({
  useCommitByHash: () => ({ loadCommit: loadCommitMock }),
}));

vi.mock('@/hooks/canvas/useCanvasNodeActions', () => ({
  useCanvasNodeActions: () => ({ load: loadCanvasMock }),
}));

import { MergeWorkspace } from '@/components/merge/MergeWorkspace';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';

const commitContent = {
  trees: [{ key: 'plan', slots: { summary: 'same plan' }, children: [] }],
  relations: [],
};

describe('MergeWorkspace commit ceremony', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMergeWorkspaceStore.getState().reset();
    useMergeWorkspaceStore.setState({
      sourceHash: 'sha256:source',
      targetHash: 'sha256:target',
      sourceBranch: 'feature',
      targetBranch: 'main',
      message: 'Merge feature into main',
      saveStatus: 'idle',
    });
    loadCommitMock.mockResolvedValue({
      parents: [],
      content: commitContent,
    });
    createMergeCommitMock.mockResolvedValue({ commit: { hash: 'sha256:merge' } });
  });

  it('shows the shared commit ceremony before navigating after a merge commit', async () => {
    const onMergeCommitted = vi.fn();
    render(
      <MergeWorkspace projectId="proj_1" onClose={vi.fn()} onMergeCommitted={onMergeCommitted} />
    );

    await screen.findByText('Ready to merge');
    fireEvent.click(screen.getByRole('button', { name: 'Execute Merge' }));
    fireEvent.click(screen.getByTestId('merge-review-confirm'));

    await waitFor(() => expect(createMergeCommitMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status', { name: 'Commit sealed' })).toBeVisible();
    expect(onMergeCommitted).not.toHaveBeenCalled();
  });
});
