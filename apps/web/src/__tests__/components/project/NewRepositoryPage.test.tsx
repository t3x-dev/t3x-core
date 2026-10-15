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
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  push: vi.fn(),
  setup: { pending: false, started: false, error: null as string | null },
}));
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
  useRepositorySetup: () => ({ create: mocks.create, ...mocks.setup }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.setup = { pending: false, started: false, error: null };
});
it('shows General and Configuration with reserved README and tags rows but no uploads', () => {
  const { container } = render(<NewRepositoryPage />);
  for (const name of ['Owner', 'Visibility'])
    expect(screen.getByRole('combobox', { name })).toBeInTheDocument();
  expect(screen.getByLabelText('Description').tagName).toBe('INPUT');
  expect(screen.getByRole('region', { name: 'General' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Configuration' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Add README' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Add tags' })).toBeInTheDocument();
  expect(container.querySelector('input[type="file"]')).toBeNull();
  expect(screen.queryByText(/Schema|\.gitignore|Add license/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create repository' })).toBeDisabled();
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
    expect(screen.getByRole('button', { name: 'Create repository' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create repository' }));
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
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('schema');
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('readme');
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('tags');
  expect(mocks.push).toHaveBeenCalledWith(
    '/another-team/Catalog/workspaces?workspace=workspace_branch%3Amain&conversation=c'
  );
});
it('keeps a partially created repository locked and allows setup retry', async () => {
  mocks.setup.started = true;
  mocks.setup.error = 'Repository created; retry to finish setup. Permission denied';
  render(<NewRepositoryPage />);
  expect(screen.getByRole('alert')).toHaveTextContent('Permission denied');
  expect(screen.getByLabelText('Repository name')).toBeDisabled();
  expect(screen.getByLabelText('Owner')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Retry setup' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry setup' }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
});
