// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CreateStudioWorkspace } from '@/components/schemas/CreateStudioWorkspace';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  refresh: vi.fn(),
  branchesError: null as string | null,
  branches: ['main', 'staging'],
}));
vi.mock('@/hooks/shared/useBranches', () => ({
  useBranches: () => ({
    branches: mocks.branches,
    branchHeads: { main: null, staging: 'sha256:base' },
    loading: false,
    refresh: mocks.refresh,
    error: mocks.branchesError,
  }),
}));
vi.mock('@/hooks/workspaces/useWorkspaceFlow', () => ({
  useWorkspaceFlow: () => ({ saveDraft: mocks.save }),
}));
beforeEach(() => {
  mocks.branches = ['main', 'staging'];
  mocks.save.mockReset();
  mocks.branchesError = null;
  mocks.refresh.mockReset();
});
it('persists a fresh draft at the chosen branch head before handing it to Studio', async () => {
  const created = vi.fn();
  mocks.save.mockImplementation(async (workspace) => ({ workspace }));
  render(<CreateStudioWorkspace projectId="p" onCreated={created} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'staging' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Workspace' }));
  await waitFor(() => expect(created).toHaveBeenCalledOnce());
  const draft = mocks.save.mock.calls[0][0];
  expect(draft).toMatchObject({
    projectId: 'p',
    targetBranch: 'staging',
    baseCommitHash: 'sha256:base',
    schemaBindings: [],
    status: 'draft',
    yopsDraft: { operations: [] },
  });
  expect(draft.id).not.toBe('workspace_branch:staging');
  expect(created).toHaveBeenCalledWith(draft.id);
});
it('keeps the user in place with a retryable error when saving fails', async () => {
  const created = vi.fn();
  mocks.save.mockRejectedValue(new Error('A Workspace already exists for this branch.'));
  render(<CreateStudioWorkspace projectId="p" onCreated={created} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create Workspace' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  expect(created).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Create Workspace' })).toBeEnabled();
});
it('does not invent a branch when the branch inventory is unavailable', () => {
  mocks.branches = [];
  render(<CreateStudioWorkspace projectId="p" onCreated={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Create Workspace' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Retry branches' })).toBeEnabled();
});

it.each([
  { branches: [] },
  { branches: ['main'] },
])('blocks creation with a retryable inventory error even with cached branches $branches', ({
  branches,
}) => {
  mocks.branches = branches;
  mocks.branchesError = 'Offline';
  render(<CreateStudioWorkspace projectId="p" onCreated={vi.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Branch list unavailable');
  expect(screen.getByRole('button', { name: 'Create Workspace' })).toBeDisabled();
  expect(screen.queryByText('No branches available')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry branches' }));
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.save).not.toHaveBeenCalled();
});
