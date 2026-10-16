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
it('shows General and Configuration with optional README and tags inputs but no uploads', () => {
  const { container } = render(<NewRepositoryPage />);
  for (const name of ['Owner', 'Visibility'])
    expect(screen.getByRole('combobox', { name })).toBeInTheDocument();
  expect(screen.getByLabelText('Description').tagName).toBe('INPUT');
  expect(screen.getByRole('region', { name: 'General' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Configuration' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Initialize README' })).not.toBeChecked();
  expect(screen.getByRole('textbox', { name: 'Tags', exact: true })).toBeInTheDocument();
  expect(container.querySelector('input[type="file"]')).toBeNull();
  expect(screen.queryByText(/Schema|\.gitignore|Add license/i)).not.toBeInTheDocument();
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
  expect(mocks.create.mock.calls[0][0]).toMatchObject({ initializeReadme: false, tags: [] });
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

it('adds and removes hashtag chips and submits unfinished input with README initialization', async () => {
  render(<NewRepositoryPage />);
  fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'Final-Name' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Initialize README' }));
  const input = screen.getByRole('textbox', { name: 'Tags', exact: true });
  for (const tag of [' 中文 ', 'Dev', '中文', 'Remove me', '#Existing']) {
    fireEvent.change(input, { target: { value: tag } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Remove tag Remove me' }));
  expect(screen.getByLabelText('Selected tags')).toHaveTextContent('#中文#Dev#Existing');
  expect(screen.getByLabelText('Selected tags')).not.toHaveTextContent('##Existing');
  expect(mocks.create).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'case' } });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create repository' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create repository' }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        initializeReadme: true,
        tags: ['中文', 'Dev', '#Existing', 'case'],
      })
    )
  );
});

it('keeps IME confirmation separate from adding tags and validates the pending tag', async () => {
  render(<NewRepositoryPage />);
  fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'Catalog' } });
  const input = screen.getByRole('textbox', { name: 'Tags', exact: true });
  fireEvent.change(input, { target: { value: '中文' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(input).toHaveValue('中文');
  expect(screen.queryByLabelText('Selected tags')).toBeNull();
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
  expect(input).toHaveValue('中文');
  fireEvent.click(screen.getByRole('button', { name: 'Add tag', exact: true }));
  expect(input).toHaveValue('');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create repository' })).toBeEnabled()
  );
  fireEvent.change(input, { target: { value: '中'.repeat(65) } });
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('button', { name: 'Add tag', exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Create repository' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '中'.repeat(64) } });
  expect(screen.getByRole('button', { name: 'Create repository' })).toBeEnabled();
});
