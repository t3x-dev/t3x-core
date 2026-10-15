// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { NewRepositoryPage } from '@/components/project/NewRepositoryPage';

vi.mock('@/queries/projects', () => ({
  checkRepositoryName: async (namespace: string, name: string) => ({
    name,
    valid: true,
    available: Boolean(name),
    namespace,
    canonical_path: `/${namespace}/${name}`,
  }),
}));
const mocks = vi.hoisted(() => ({ create: vi.fn(), push: vi.fn(), test: vi.fn() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ owner: 't3x-dev' }),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/hooks/accounts/useNamespaceAccounts', () => ({
  useNamespaceAccounts: () => ({ accounts: [{ namespace: { slug: 'another-team' } }] }),
}));
vi.mock('@/hooks/shared/useProvidersList', () => ({
  useProvidersList: () => {
    throw new Error('Provider API unavailable; creation must not query it');
  },
}));
vi.mock('@/hooks/providers/useProviderCommands', () => ({
  useProviderCommands: () => {
    throw new Error('Creation must not test AI');
  },
}));
vi.mock('@/hooks/projects/useRepositorySetup', () => ({
  useRepositorySetup: () => ({ create: mocks.create, pending: false, started: false, error: null }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.test.mockResolvedValue({ ok: true });
});
it('uses dropdowns, single-line description, and file uploads from the reference', () => {
  render(<NewRepositoryPage />);
  for (const name of ['Owner', 'Visibility'])
    expect(screen.getByRole('combobox', { name })).toBeInTheDocument();
  expect(screen.getByLabelText('Description').tagName).toBe('INPUT');
  expect(screen.getByLabelText('Upload YAML')).toHaveAttribute('accept', '.yaml,.yml');
  expect(screen.getByRole('button', { name: 'Create and start conversation' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
  expect(screen.getByRole('button', { name: /General/ })).toHaveAttribute('aria-expanded', 'false');
});
it('creates without AI and retains the canonical D01-005 destination', async () => {
  mocks.create.mockResolvedValue({
    project: { project_id: 'p', name: 'Catalog', canonical_path: '/another-team/Catalog' },
    workspaceId: 'workspace_branch:main',
    conversationId: 'c',
  });
  render(<NewRepositoryPage />);
  fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'Catalog' } });
  fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'another-team' } });
  fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'unlisted' } });
  expect(screen.queryByLabelText('Connection')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Model')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Upload files')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Test' })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create and start conversation' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create and start conversation' }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Catalog',
        owner: 'another-team',
        visibility: 'unlisted',
      })
    )
  );
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('provider');
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('files');
  expect(mocks.push).toHaveBeenCalledWith(
    '/another-team/Catalog/workspaces?workspace=workspace_branch%3Amain&conversation=c'
  );
});
it('preserves optional Schema file validation', async () => {
  render(<NewRepositoryPage />);
  fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'Catalog' } });
  fireEvent.change(screen.getByLabelText('Upload YAML'), {
    target: { files: [new File(['x'], 'wrong.txt')] },
  });
  expect(screen.getByText('Choose a supported file, up to 5 MB each.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create and start conversation' })).toBeDisabled();
});
