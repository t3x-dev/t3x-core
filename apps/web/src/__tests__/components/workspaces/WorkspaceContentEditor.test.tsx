// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceContentEditor } from '@/components/workspaces/WorkspaceContentEditor';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';

const mocks = vi.hoisted(() => ({
  review: vi.fn(),
  reset: vi.fn(),
  rootKey: '',
  content: {
    trees: [
      { key: 'Services', slots: { replicas: 2 }, children: [] },
      { key: 'Settings', slots: { enabled: false }, children: [] },
    ],
    relations: [],
  },
}));
vi.mock('@/hooks/workspaces/useWorkspaceYOps', () => ({
  useWorkspaceYOps: () => ({ rootKey: mocks.rootKey, loadDraftContent: async () => mocks.content }),
}));
vi.mock('@/hooks/workspaces/useWorkspaceTransition', () => ({
  useWorkspaceTransition: () => ({
    state: { phase: 'idle' },
    reset: mocks.reset,
    review: mocks.review,
  }),
}));
beforeEach(() => {
  mocks.rootKey = '';
  mocks.review.mockReset();
});

it('reviews edited multi-root content without introducing a definition root', async () => {
  render(<WorkspaceContentEditor candidate={getProjectWorkspaceStarterCandidate('test')} />);
  const replicas = await screen.findByRole('spinbutton', { name: 'Services/replicas' });
  fireEvent.change(replicas, { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review structured change' }));
  expect(mocks.review).toHaveBeenCalledWith(
    {
      trees: [
        { key: 'Services', slots: { replicas: 3 }, children: [] },
        { key: 'Settings', slots: { enabled: false }, children: [] },
      ],
      relations: [],
    },
    ''
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('retains the declared-root restriction for a bound editor', async () => {
  mocks.rootKey = 'prd';
  render(<WorkspaceContentEditor candidate={getProjectWorkspaceStarterCandidate('test')} />);
  await screen.findByRole('spinbutton', { name: 'Services/replicas' });
  fireEvent.click(screen.getByRole('button', { name: 'Review structured change' }));
  expect(mocks.review).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Keep one prd root');
});
